import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { mapRawRx, persistPrescription, asStr, pick } from '@/lib/scriptsure-prescriptions';

/**
 * POST /api/scriptsure/webhook — receptor de notificaciones de ScriptSure/DAW.
 *
 * Cuando el doctor envía una receta a la farmacia, ScriptSure hace POST acá con
 * los datos (push de ellos — polling prohibido por sus reglas de uso). Auth:
 * Basic con credenciales que definimos nosotros y se registran en la plataforma
 * de DAW. Sus webhooks salen desde la IP 34.234.106.180 — se loguea el origen
 * pero el gate es el Basic Auth (si cambian de IP, no queremos perder recetas
 * en silencio).
 *
 * Estrategia defensiva: el payload SIEMPRE queda crudo en el audit log antes de
 * intentar mapearlo. Se responde 200 salvo auth inválida, para que DAW no
 * deshabilite el webhook por errores nuestros.
 *
 * El mapeo y la persistencia viven en `lib/scriptsure-prescriptions.ts`,
 * compartidos con el sync on-demand — dedupe por `dawRxId` entre ambas vías.
 */

export const dynamic = 'force-dynamic';

/**
 * Resultado del chequeo de auth, con el motivo.
 *
 * El motivo NO es un lujo: un 401 acá se devolvía antes de escribir cualquier
 * registro, así que un webhook rechazado no dejaba **ninguna** huella. El
 * 2026-08-19 la plataforma de ScriptSure decía "notification sent successfully"
 * y de nuestro lado no había nada — y no había forma de distinguir "no lo
 * mandaron" de "lo mandamos rebotar". Ahora el rechazo se registra igual.
 */
interface ResultadoAuth {
  ok: boolean;
  /** Por qué falló, para el registro. Nunca incluye la contraseña. */
  motivo?: 'sin-credenciales-configuradas' | 'sin-header' | 'header-invalido' | 'usuario-o-clave-no-coincide';
  /** Usuario que presentaron. Sirve para ver un espacio de más o un typo. */
  usuarioPresentado?: string;
  esquema?: string;
}

function checkBasicAuth(req: NextRequest): ResultadoAuth {
  const user = process.env.SCRIPTSURE_WEBHOOK_USER;
  const pass = process.env.SCRIPTSURE_WEBHOOK_PASS;
  const header = req.headers.get('authorization') ?? '';
  const esquema = header.split(' ')[0] || '(ninguno)';

  if (!user || !pass) return { ok: false, motivo: 'sin-credenciales-configuradas', esquema };
  if (!header) return { ok: false, motivo: 'sin-header', esquema };
  if (!header.startsWith('Basic ')) return { ok: false, motivo: 'header-invalido', esquema };

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return { ok: false, motivo: 'header-invalido', esquema };
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (u === user && p === pass) return { ok: true };
    return { ok: false, motivo: 'usuario-o-clave-no-coincide', usuarioPresentado: u, esquema };
  } catch {
    return { ok: false, motivo: 'header-invalido', esquema };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sourceIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';

  const auth = checkBasicAuth(req);
  if (!auth.ok) {
    // Se registra el RECHAZO. Sin esto, un webhook mal autenticado es
    // indistinguible de un webhook que nunca llegó.
    await writeAuditLog(db, {
      actorType: 'SYSTEM',
      action: 'SCRIPTSURE_WEBHOOK_REJECTED',
      entityType: 'prescriptions',
      entityId: 'incoming',
      ipAddress: sourceIp,
      metadata: {
        motivo: auth.motivo ?? 'desconocido',
        esquemaAuth: auth.esquema ?? '(ninguno)',
        usuarioPresentado: auth.usuarioPresentado ?? '(no vino)',
        largoUsuarioEsperado: String((process.env.SCRIPTSURE_WEBHOOK_USER ?? '').length),
      },
    }).catch(() => undefined);
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // 1. Persistir SIEMPRE el payload crudo — nada se pierde aunque el mapeo falle
  await writeAuditLog(db, {
    actorType: 'SYSTEM',
    action: 'SCRIPTSURE_WEBHOOK',
    entityType: 'prescriptions',
    entityId: 'incoming',
    ipAddress: sourceIp,
    // JSON round-trip: garantiza JsonValue (sin undefined) para el audit log
    metadata: JSON.parse(JSON.stringify({ raw: payload })) as Record<string, string>,
  });

  // 2. Mapear. El estado suele venir en el sobre, no en la receta.
  const outerStatus = asStr(pick(payload, 'messageType', 'status', 'messageStatus', 'event'));
  const mapped = mapRawRx(payload, outerStatus);
  if (!mapped) {
    // Payload que no es de prescripción (otros tipos de webhook) — quedó en el
    // audit log, respondemos ok y seguimos.
    return NextResponse.json({ ok: true, mapped: false });
  }

  const ssPatientId =
    asStr(pick((payload.prescription ?? payload.rx ?? payload.data ?? payload) as Record<string, unknown>,
      'patientId', 'patient_id')) ??
    asStr(pick(payload, 'patientId', 'patient_id'));

  if (!ssPatientId) {
    return NextResponse.json({ ok: true, mapped: false, reason: 'NO_PATIENT_ID' });
  }

  const patient = await db.patient.findFirst({
    where: { scriptsurePatientId: ssPatientId },
    select: { id: true, medicalHistory: true },
  });
  if (!patient) {
    return NextResponse.json({ ok: true, mapped: false, reason: 'PATIENT_NOT_FOUND' });
  }

  // Resolver la cita: la más reciente del paciente, priorizando la del
  // prescriptor que viene en el payload.
  const appointment = await db.appointment.findFirst({
    where: {
      patientId: patient.id,
      ...(mapped.doctorId ? { provider: { scriptsureUserId: mapped.doctorId } } : {}),
    },
    orderBy: { scheduledFor: 'desc' },
    select: {
      id: true,
      visitNote: { select: { id: true } },
      provider: { select: { firstName: true, lastName: true } },
    },
  });
  if (!appointment) {
    return NextResponse.json({ ok: true, mapped: false, reason: 'APPOINTMENT_NOT_FOUND' });
  }

  const saved = await persistPrescription({
    appointmentId: appointment.id,
    visitNoteId: appointment.visitNote?.id ?? null,
    patientId: patient.id,
    medicalHistory: patient.medicalHistory,
    prescriberName: appointment.provider
      ? `${appointment.provider.firstName ?? ''} ${appointment.provider.lastName ?? ''}`.trim() || null
      : null,
    mapped,
    source: 'WEBHOOK',
    ipAddress: sourceIp,
  });

  return NextResponse.json({ ok: true, mapped: true, prescriptionId: saved.id });
}
