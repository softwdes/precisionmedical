/**
 * POST /api/admin/visit-notes/[appointmentId]/med-rec
 *
 * Deja constancia de que se hizo la conciliación de medicamentos, y devuelve
 * quién y cuándo para que la pantalla escriba la línea en el HPI.
 *
 * Pedido de Devin (2026-09-17): *"Add a medication reconciliation click button…
 * When clicked this should insert statement saying 'Medication reconciliation
 * performed on DATE by WHOEVER CLICKED IT'"*, y el 21 aclaró que la lista activa
 * se muestra ANTES de atestiguar y que la línea va en el HPI.
 *
 * ── Por qué además de la línea hay un registro ──────────────────────────────
 *
 * Porque una línea de texto se edita y se borra como cualquier otra frase, y no
 * se puede contar: nadie podría contestar "¿cuántas conciliaciones hubo este
 * mes?" ni demostrar que en ESTA visita se hizo, si el párrafo desapareció.
 *
 * ── Y por qué en el audit log y no en una tabla ─────────────────────────────
 *
 * Porque es exactamente lo que el audit log es: un hecho con actor, fecha y
 * contexto. Una tabla nueva para una fila por visita es infraestructura que hay
 * que migrar, mantener y respaldar, para guardar menos de lo que ya guardamos.
 * Se consulta por `action = 'MED_RECONCILIATION'`.
 *
 * El conteo de medicamentos va en la metadata a propósito: "se conciliaron 0
 * medicamentos" y "se conciliaron 7" son afirmaciones clínicas distintas, y sin
 * el número la constancia no dice cuál de las dos fue.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { nombreProvider } from '@/lib/provider-name';

type Ctx = { params: Promise<{ appointmentId: string }> };

const BodySchema = z.object({
  /** Cuántos medicamentos activos se le mostraron a quien atestiguó. */
  medicamentos: z.number().int().min(0).max(500),
});

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let parsed;
  try { parsed = BodySchema.parse(await req.json()); }
  catch { return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 }); }

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      provider: { select: { firstName: true, lastName: true } },
      patient: { select: { firstName: true, lastName: true } },
      visitNote: { select: { id: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });

  /**
   * El nombre es el de QUIEN HACE CLIC, no el del provider de la cita.
   *
   * Devin fue textual: "by WHOEVER CLICKED IT". Si el asistente la hace y la
   * línea dijera el nombre del médico, la constancia estaría atribuida a alguien
   * que no revisó nada — que es justo lo contrario de para qué existe.
   */
  const nombre = `${dbUser?.firstName ?? ''} ${dbUser?.lastName ?? ''}`.trim()
    || nombreProvider(appt.provider)
    || user.email;

  const fecha = new Date();

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: dbUser?.id ?? actor.actorUserId,
    action: 'MED_RECONCILIATION',
    entityType: 'visit_notes',
    // Puede no haber nota todavía: la conciliación es de la VISITA, y el
    // asistente puede hacerla antes de que el editor cree la fila.
    entityId: appt.visitNote?.id ?? appointmentId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      appointmentId,
      patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
      medicamentos: parsed.medicamentos,
      porNombre: nombre,
      fecha: fecha.toISOString(),
    },
  });

  return NextResponse.json({ ok: true, nombre, fecha: fecha.toISOString() });
}
