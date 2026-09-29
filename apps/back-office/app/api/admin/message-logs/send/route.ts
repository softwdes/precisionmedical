/**
 * POST /api/admin/message-logs/send — escribirle un SMS a un paciente.
 *
 * Hasta el 2026-09-28 el sistema solo mandaba textos que armaba él: el link del
 * formulario y los avisos de cita. **Ninguna ruta aceptaba texto de una
 * persona.** Con la bandeja de entrantes encendida eso quedó a la vista: se
 * podía leer "no puedo el martes" y no había cómo contestarlo.
 *
 * ── Quién puede ────────────────────────────────────────────────────────────
 *
 * Staff administrativo, no cualquiera con sesión. El middleware gobierna esta
 * ruta con el módulo `patients`, y ese módulo lo consume TAMBIÉN el portal
 * médico (`DOCTOR_PORTAL_MODULES`): sin el chequeo de adentro, un provider
 * podría mandarle mensajes a pacientes desde su portal. Mismo razonamiento que
 * `lawyers/quick-create`, que pisó este mismo charco.
 *
 * ── Los dos frenos, y por qué no son opcionales ────────────────────────────
 *
 * `21610` — el paciente respondió STOP. Twilio ya lo bloqueó de su lado y
 * devuelve ese código. Se chequea ANTES de escribir: la pantalla tiene que
 * decir "este paciente se dio de baja" mientras se escribe, no después de
 * mandar. Que el envío falle igual no alcanza — quien escribió cree que llegó.
 *
 * Horario — un SMS de la clínica a las 11 de la noche es un problema, y no hay
 * ninguna razón operativa para mandarlo: la clínica atiende de 08 a 18
 * ([[regla-horario-de-atencion]]). Se bloquea fuera de esa franja y se deja
 * forzar explícitamente, porque "urgente de verdad" existe y no lo decide el
 * código.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, isMinor, writeAuditLog, type Prisma } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import { resolveActor } from '@/lib/actor';
import { sendSms } from '@/lib/sms';
import { horaLocalClinica } from '@/lib/fechas';

export const dynamic = 'force-dynamic';

/** La franja en que la clínica le escribe a un paciente. */
const HORA_DESDE = 8;
const HORA_HASTA = 18;

const Entrada = z.object({
  patientId: z.string().min(1),
  /**
   * 800 caracteres ≈ 6 segmentos. No es un límite técnico —Twilio parte solo—
   * sino el punto donde un SMS dejó de ser un SMS: si hace falta más, es una
   * llamada.
   */
  body: z.string().trim().min(1).max(800),
  /** Mandar fuera del horario de atención, a sabiendas. */
  forzarHorario: z.boolean().default(false),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  let datos;
  try {
    datos = Entrada.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const paciente = await db.patient.findUnique({
    where: { id: datos.patientId },
    select: {
      id: true, firstName: true, lastName: true, phone: true, dateOfBirth: true,
      guardianPatient: { select: { firstName: true, lastName: true, phone: true } },
    },
  });
  if (!paciente) return NextResponse.json({ error: 'PACIENTE_NO_ENCONTRADO' }, { status: 404 });

  /**
   * A quién se le escribe. Misma regla que los avisos de cita: si es menor y
   * tiene apoderado, el mensaje va al apoderado — al menor no le sirve de nada
   * y además no es quien decide.
   */
  const apoderado = isMinor(paciente.dateOfBirth) ? paciente.guardianPatient : null;
  const telefono  = (apoderado?.phone ?? paciente.phone)?.trim();
  if (!telefono) return NextResponse.json({ error: 'SIN_TELEFONO' }, { status: 409 });

  // Se dio de baja: Twilio lo rechazaría igual, pero un 21610 después de
  // escribir es peor que un aviso antes.
  const baja = await db.messageLog.findFirst({
    where: { toAddress: telefono, errorCode: 21610 },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (baja) {
    return NextResponse.json(
      { error: 'DADO_DE_BAJA', desde: baja.createdAt },
      { status: 409 },
    );
  }

  const hora = horaLocalClinica();
  if (!datos.forzarHorario && (hora < HORA_DESDE || hora >= HORA_HASTA)) {
    return NextResponse.json(
      { error: 'FUERA_DE_HORARIO', hora, desde: HORA_DESDE, hasta: HORA_HASTA },
      { status: 409 },
    );
  }

  const actor = await resolveActor(req.headers);

  const res = await sendSms({
    to: telefono,
    body: datos.body,
    patientId:    paciente.id,
    sentByUserId: actor.actorUserId ?? null,
    sentByName:   actor.actorName ?? null,
  });

  /**
   * Queda en la auditoría aunque `message_logs` ya lo registre.
   *
   * Son dos preguntas distintas: el registro de mensajes contesta "qué se le
   * mandó a este paciente" y el audit log contesta "qué hizo esta persona". Un
   * texto libre a un paciente es una acción de alguien, no un aviso del
   * sistema, y es la única de esta pantalla que no se puede deshacer.
   */
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'SEND_PATIENT_SMS',
    entityType:  'patients',
    entityId:    paciente.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    {
      messageLogId: res.messageLogId,
      enviado: res.ok,
      // El TEXTO no va acá: ya está en `message_logs`, y duplicar PHI en una
      // segunda tabla es duplicar la superficie que hay que proteger.
      caracteres: datos.body.length,
      fueraDeHorario: datos.forzarHorario,
      aApoderado: apoderado !== null,
    } as Prisma.JsonValue,
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? 'ERROR_ENVIO', detalle: res.errorDetail, messageLogId: res.messageLogId },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, messageLogId: res.messageLogId, aApoderado: apoderado !== null });
}
