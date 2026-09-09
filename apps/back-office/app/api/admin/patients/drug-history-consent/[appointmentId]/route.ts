/**
 * Consentimiento del paciente para descargar su historial de farmacia.
 *
 * POST /api/admin/patients/drug-history-consent/[appointmentId]
 *   Marca `Patient.consentToDrugHistory`. Es la precondición del widget
 *   `medicationdownload` (Pharmacy history), que trae por Surescripts 12 meses
 *   de lo que el paciente retiró en CUALQUIER farmacia — dato de otros médicos
 *   y de otras clínicas. ScriptSure exige el consentimiento y es requisito de
 *   su certificación; la columna existía en el schema desde que se diseñó la
 *   integración y **no la escribía nadie**, así que la descarga nunca se pudo
 *   habilitar de verdad.
 *
 * **Por qué un booleano y no una fecha + autor**: el CUÁNDO y el QUIÉN salen del
 * audit log, que es la fuente de historial del proyecto y ya guarda las dos
 * cosas con el actor resuelto. Una columna más sería un segundo registro del
 * mismo hecho, que además habría que aplicar como DDL a mano.
 *
 * **Escaneado por CITA, no por patientId suelto**: así el guard de siempre
 * valida que quien escribe atiende a ese paciente. Mismo motivo que la
 * conciliación de medicamentos de al lado — sin eso, cualquier doctor podría
 * marcar el consentimiento de un paciente ajeno adivinando su id.
 *
 * **Lo toma el asistente, no solo el doctor** (guard sin `requireProvider`): la
 * MA es quien se lo pregunta al paciente en la admisión. Abrir la descarga sí
 * es del prescriptor —sale con SU identidad hacia Surescripts— y eso lo exige
 * la ruta del widget, no esta.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';

type Ctx = { params: Promise<{ appointmentId: string }> };

/**
 * `granted` va explícito en el cuerpo (no es un "toggle") para que revocar sea
 * una acción deliberada y quede como tal en la auditoría: un consentimiento
 * que se apaga por accidente no se nota hasta que la descarga deja de andar.
 */
const BodySchema = z.object({ granted: z.boolean() });

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patient: { select: { id: true, consentToDrugHistory: true } } },
  });
  if (!appt?.patient) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const anterior = appt.patient.consentToDrugHistory;

  await db.patient.update({
    where: { id: appt.patient.id },
    data: { consentToDrugHistory: body.granted },
  });

  await writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: body.granted ? 'DRUG_HISTORY_CONSENT_GRANTED' : 'DRUG_HISTORY_CONSENT_REVOKED',
    entityType: 'Patient',
    entityId: appt.patient.id,
    metadata: {
      appointmentId,
      // `null` = nunca se había preguntado. Distinto de un "no" anterior, y es
      // la diferencia entre "se le pidió y aceptó" y "cambió de opinión".
      anterior: anterior === null || anterior === undefined ? 'sin registro' : String(anterior),
      registradoPor: actor.name,
    },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ ok: true, consent: body.granted });
}
