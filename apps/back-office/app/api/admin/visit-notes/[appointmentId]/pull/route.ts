/**
 * POST /api/admin/visit-notes/[appointmentId]/pull
 *
 * Deja constancia de que esta nota trajo texto de una visita anterior.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * El traído viene con TODAS las secciones pre-tildadas, porque así funciona
 * Medusa y porque Devin lo pidió expresamente: *"very easy, user friendly and
 * very practical"*. O sea que el gesto por defecto es traer la nota anterior
 * entera en dos clics.
 *
 * Eso es exactamente lo que en una auditoría se llama **nota clonada**: un
 * documento que se lee como el anterior, firmado por alguien que no volvió a
 * examinar. La respuesta NO es agregarle fricción —se la quitaríamos a la
 * persona equivocada— sino dejar registro:
 *
 *   **de qué visita salió, qué secciones, quién lo hizo y cuándo.**
 *
 * Si algún día preguntan si esta nota es copia de la de marzo, la respuesta
 * existe y tiene fecha y autor. Es lo que Medusa no tiene y nosotros sí.
 *
 * El texto NO se escribe acá: lo inserta la pantalla en el editor y viaja al
 * servidor por el guardado normal de la nota, con su control de versión. Esta
 * ruta solo registra el hecho — si escribiera también el contenido habría dos
 * caminos para lo mismo y tarde o temprano dirían cosas distintas.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';

type Ctx = { params: Promise<{ appointmentId: string }> };

const BodySchema = z.object({
  /** La cita de la que se trajo el texto. */
  desdeAppointmentId: z.string().min(1),
  /** Las claves de sección que se trajeron, más `DIAGNOSTICOS` si vinieron. */
  secciones: z.array(z.string().max(40)).max(20),
  /** Cuántos diagnósticos se agregaron (0 si no se tildó esa casilla). */
  diagnosticos: z.number().int().min(0).max(100).default(0),
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

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true },
  });

  /**
   * Se lee la visita de ORIGEN para guardar su fecha y su provider en la
   * constancia. Guardar solo el id dejaría un registro que hay que ir a
   * resolver a otra tabla — y si esa cita se borra, el rastro queda mudo.
   */
  const origen = await db.appointment.findUnique({
    where: { id: parsed.desdeAppointmentId },
    select: {
      scheduledFor: true,
      patientId: true,
      provider: { select: { firstName: true, lastName: true } },
      visitNote: { select: { id: true, status: true } },
    },
  });
  if (!origen) return NextResponse.json({ error: 'SOURCE_NOT_FOUND' }, { status: 404 });

  const destino = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, visitNote: { select: { id: true } } },
  });
  if (!destino) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  /**
   * Origen y destino tienen que ser del MISMO paciente.
   *
   * La pantalla ya solo ofrece visitas de este paciente, así que esto no debería
   * pasar nunca — y por eso mismo se chequea: un `fetch` a mano podría traer
   * texto clínico de otra persona a esta nota, y eso no es un bug de interfaz.
   */
  if (origen.patientId !== destino.patientId) {
    return NextResponse.json({ error: 'PATIENT_MISMATCH' }, { status: 403 });
  }

  const quien = `${dbUser?.firstName ?? ''} ${dbUser?.lastName ?? ''}`.trim() || user.email;
  const p = origen.provider;

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: dbUser?.id ?? actor.actorUserId,
    action: 'PULL_FROM_PRIOR_VISIT',
    entityType: 'visit_notes',
    entityId: destino.visitNote?.id ?? appointmentId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      appointmentId,
      desdeAppointmentId: parsed.desdeAppointmentId,
      desdeNoteId: origen.visitNote?.id ?? null,
      desdeFecha: origen.scheduledFor.toISOString(),
      desdeEstado: origen.visitNote?.status ?? null,
      desdeProvider: p ? `${p.firstName} ${p.lastName}`.trim() : null,
      secciones: parsed.secciones,
      diagnosticos: parsed.diagnosticos,
      porNombre: quien,
    },
  });

  return NextResponse.json({ ok: true });
}
