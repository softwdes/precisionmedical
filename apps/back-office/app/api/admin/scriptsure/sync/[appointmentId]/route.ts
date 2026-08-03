import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { fetchScriptSureDrugHistory } from '@/lib/scriptsure-client';
import { mapRawRx, persistPrescription } from '@/lib/scriptsure-prescriptions';

/**
 * POST /api/admin/scriptsure/sync/[appointmentId]
 *
 * Trae de ScriptSure las recetas del paciente y las guarda en nuestro historial.
 * Se dispara al CERRAR el widget de prescripción — acción del usuario, nunca en
 * bucle ni por temporizador (DAW prohíbe el polling).
 *
 * Es la vía que hace visible el historial mientras el webhook no está registrado
 * con DAW, y después queda como red de seguridad si algún webhook se pierde.
 * El dedupe por `dawRxId` garantiza que ambas vías no dupliquen nada.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> },
): Promise<NextResponse> {
  const { appointmentId } = await params;

  const access = await checkAppointmentAccess(appointmentId);
  if (access.deny) return access.deny;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      visitNote: { select: { id: true } },
      patient: { select: { id: true, scriptsurePatientId: true, medicalHistory: true } },
      provider: { select: { email: true, firstName: true, lastName: true, scriptsureUserId: true } },
    },
  });
  if (!appt?.patient || !appt.provider) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  // Sin paciente en ScriptSure no hay nada que traer (no se creó todavía)
  if (!appt.patient.scriptsurePatientId || !appt.provider.scriptsureUserId) {
    return NextResponse.json({ ok: true, synced: 0, reason: 'NOT_ONBOARDED' });
  }

  let raws: Array<Record<string, unknown>>;
  try {
    raws = await fetchScriptSureDrugHistory(
      appt.provider.email,
      Number(appt.patient.scriptsurePatientId),
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'SCRIPTSURE_ERROR', message: (err as Error).message },
      { status: 502 },
    );
  }

  if (raws.length === 0) return NextResponse.json({ ok: true, synced: 0 });

  // El crudo queda registrado: la forma real del payload de ScriptSure todavía
  // no se vio con datos, así que si el mapeo falla se ajusta sin perder nada.
  await writeAuditLog(db, {
    actorType: 'SYSTEM',
    action: 'SCRIPTSURE_DRUG_HISTORY_SYNC',
    entityType: 'prescriptions',
    entityId: appointmentId,
    metadata: JSON.parse(JSON.stringify({ count: raws.length, raw: raws.slice(0, 5) })) as Record<string, string>,
  });

  const prescriberName =
    `${appt.provider.firstName ?? ''} ${appt.provider.lastName ?? ''}`.trim() || null;

  let synced = 0;
  let created = 0;
  // medicalHistory se relee en cada iteración: persistPrescription lo muta y
  // pasarle el valor viejo pisaría la entrada anterior.
  for (const raw of raws) {
    const mapped = mapRawRx(raw);
    if (!mapped) continue;

    const fresh = await db.patient.findUnique({
      where: { id: appt.patient.id },
      select: { medicalHistory: true },
    });

    const res = await persistPrescription({
      appointmentId: appt.id,
      visitNoteId: appt.visitNote?.id ?? null,
      patientId: appt.patient.id,
      medicalHistory: fresh?.medicalHistory ?? null,
      prescriberName,
      mapped,
      source: 'SYNC',
    });

    synced += 1;
    if (res.created) created += 1;
  }

  return NextResponse.json({ ok: true, synced, created });
}
