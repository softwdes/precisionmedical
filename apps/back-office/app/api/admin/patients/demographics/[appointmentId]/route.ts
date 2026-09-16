/**
 * Los datos de contacto del paciente de UNA cita — leer y completar.
 *
 * GET   /api/admin/patients/demographics/[appointmentId]
 * PATCH /api/admin/patients/demographics/[appointmentId]
 *
 * Existe para desatascar la prescripción sin salir de la consulta: ScriptSure
 * no crea al paciente sin dirección y teléfono, y hasta ahora el aviso era un
 * callejón sin salida — "completá la dirección en la ficha" sin decir dónde.
 * Un provider no pudo mostrar el módulo de medicamentos por esto (queja de
 * Devin vía Erick, 2026-09-16).
 *
 * ── Por qué va por CITA y no por `patientId` ───────────────────────────────
 *
 * **El cliente no puede nombrar al paciente.** La ficha se resuelve acá desde
 * la cita, así que el diálogo no tiene forma de escribirle a otro aunque se le
 * mande cualquier cosa: el `id` no viaja en la petición. Es el mismo patrón que
 * la conciliación de medicamentos y el consentimiento de al lado, y la garantía
 * que pidió Erick — que no se guarde información donde no corresponde.
 *
 * El GET existe por lo mismo: el formulario se precarga con lo que la ficha
 * tiene DE VERDAD, no con lo que la pantalla anterior creía tener. Devuelve
 * además el nombre, para que quien edita vea a quién le está editando.
 *
 * ── Qué se puede tocar ─────────────────────────────────────────────────────
 *
 * Solo los cinco campos de contacto. Nada de nombre, fecha de nacimiento, sexo,
 * SSN ni seguro: para eso está la ficha completa, con su propio permiso. Un
 * atajo puesto para destrabar una receta no es lugar para reescribir identidad.
 *
 * El guard es el de siempre (`checkAppointmentAccess`, sin `requireProvider`):
 * corregir un teléfono es tarea de recepción tanto como del provider, y el
 * audit log guarda quién lo hizo.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';

type Ctx = { params: Promise<{ appointmentId: string }> };

/**
 * Todos opcionales y todos texto. **Un campo vacío NO borra lo que hay**: se
 * ignora. Este diálogo sirve para COMPLETAR lo que falta, y parte de la data
 * migrada del v2 llega cifrada — si la clave no está en el entorno el campo se
 * pinta en blanco, y guardar ese blanco borraría el dato sin que nadie lo haya
 * visto ni decidido (la misma trampa que ya documenta el PATCH de la ficha).
 * Para cambiar un valor se escribe el nuevo, que es lo que se quiere hacer acá.
 */
const PatchSchema = z.object({
  addressLine1: z.string().max(200).optional(),
  addressCity: z.string().max(120).optional(),
  addressState: z.string().max(120).optional(),
  addressZip: z.string().max(20).optional(),
  phone: z.string().max(40).optional(),
});

/**
 * La lista blanca. Nada que no esté acá puede llegar al `update`.
 *
 * `phone2` NO está: no tiene campo en el diálogo, y ScriptSure se conforma con
 * CUALQUIERA de los dos (el cliente usa `phone ?? phone2`), así que un paciente
 * que solo tenga el segundo nunca llega a este formulario. Mandarlo de vuelta
 * sin que nadie lo edite solo ensuciaría el audit log con un cambio que no fue.
 */
const CAMPOS = ['addressLine1', 'addressCity', 'addressState', 'addressZip', 'phone'] as const;

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      patient: {
        select: {
          firstName: true, lastName: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          phone: true,
        },
      },
    },
  });
  if (!appt?.patient) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const p = appt.patient;
  // `dec()` por lo mismo que el panel de contexto: parte de la data migrada del
  // v2 viene con el prefijo `e:` y sin esto el formulario mostraría el cifrado.
  return NextResponse.json({
    patientName: `${dec(p.firstName) ?? ''} ${dec(p.lastName) ?? ''}`.trim(),
    addressLine1: dec(p.addressLine1) ?? '',
    addressCity: dec(p.addressCity) ?? '',
    addressState: dec(p.addressState) ?? '',
    addressZip: dec(p.addressZip) ?? '',
    phone: dec(p.phone) ?? '',
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patient: { select: { id: true } } },
  });
  if (!appt?.patient) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Solo lo que vino con contenido. Se arma campo por campo desde la lista
  // blanca: nada que no esté en `CAMPOS` puede llegar al `update`.
  const data: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const valor = body[campo]?.trim();
    if (valor) data[campo] = valor;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  await db.patient.update({ where: { id: appt.patient.id }, data });

  await writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'UPDATE_PATIENT',
    entityType: 'Patient',
    entityId: appt.patient.id,
    metadata: {
      // QUÉ campos, nunca sus valores: son datos de contacto del paciente y el
      // audit log lo lee más gente que la ficha.
      campos: Object.keys(data).join(', '),
      origen: 'consulta · datos para prescribir',
      appointmentId,
      registradoPor: actor.name,
    },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({ ok: true, actualizados: Object.keys(data) });
}
