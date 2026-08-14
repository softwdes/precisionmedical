/**
 * Órdenes de laboratorio / imagen / cardiología de una cita (B.20 · L2)
 *
 * GET  /api/admin/lab-orders/[appointmentId]
 *   → { orders, history }
 *     orders  = órdenes de ESTA cita
 *     history = órdenes previas del mismo paciente (para leer resultados anteriores)
 *
 * POST /api/admin/lab-orders/[appointmentId]
 *   Crea una orden con N estudios. Se guarda UNA FILA POR ESTUDIO con un
 *   `groupId` común: se imprimen juntos, pero cada estudio sigue su propio
 *   estado y resultado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { syncLabBilling } from '@/lib/lab-billing';

type Ctx = { params: Promise<{ appointmentId: string }> };

const StudySchema = z.object({
  name: z.string().min(1).max(300),
  code: z.string().max(50).nullable().optional(),
  loinc: z.string().max(50).nullable().optional(),
  category: z.enum(['LABORATORY', 'IMAGING', 'CARDIOLOGY', 'OTHER']).default('LABORATORY'),
});

const OrderSchema = z.object({
  studies: z.array(StudySchema).min(1).max(30),
  /**
   * 500, no 4000. Esto se IMPRIME en la hoja que va al laboratorio: 4000
   * caracteres no los lee nadie y rompen la hoja. Verificado antes de bajarlo:
   * el maximo real en las 26 ordenes existentes es 59 caracteres.
   */
  clinicalIndication: z.string().max(500).default(''),
  urgency: z.enum(['STAT', 'URGENT', 'ROUTINE']).default('ROUTINE'),
  billingType: z.enum(['CLIENT', 'PATIENT', 'PRIVATE', 'MEDICAID', 'MEDICARE', 'WORKERS_COMP']).nullable().optional(),
  collectionSite: z.enum(['IN_HOUSE', 'EXTERNAL']).default('EXTERNAL'),
  sampleDate: z.string().nullable().optional(),   // YYYY-MM-DD
  preferredCenter: z.string().max(200).nullable().optional(),
  icd10Codes: z.array(z.string().max(300)).max(20).default([]),
  /**
   * Médico solicitante. Por defecto es el de la cita, pero se puede elegir
   * otro: si el paciente vuelve otro día a que le saquen la muestra y ese
   * doctor no está, la orden la firma quien esté (Erick 2026-08-08).
   * Se manda el ID y el nombre lo resuelve el server — nunca un texto libre
   * del cliente en un documento que va al laboratorio.
   */
  providerId: z.string().nullable().optional(),
});

const ORDER_SELECT = {
  id: true, groupId: true, orderType: true, studyName: true, studyCode: true, loincCode: true,
  clinicalIndication: true, urgency: true, billingType: true, collectionSite: true,
  sampleDate: true, preferredCenter: true, icd10Codes: true,
  status: true, orderedAt: true, orderedByName: true,
  resultFileName: true, resultUploadedAt: true, resultUploadedByName: true, resultNotes: true,
} as const;

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const [orders, history, billed] = await Promise.all([
    db.labOrder.findMany({
      where: { appointmentId },
      orderBy: [{ orderedAt: 'desc' }, { studyName: 'asc' }],
      select: ORDER_SELECT,
    }),
    // Historial: mismas órdenes del paciente en otras citas — el doctor necesita
    // leer resultados de visitas anteriores durante la consulta.
    db.labOrder.findMany({
      where: {
        appointmentId: { not: appointmentId },
        appointment: { patientId: appt.patientId },
      },
      orderBy: { orderedAt: 'desc' },
      take: 40,
      select: { ...ORDER_SELECT, appointment: { select: { id: true, scheduledFor: true } } },
    }),
    /**
     * Cuánto cuesta cada estudio DE ESTA VISITA.
     *
     * Sale de la facturación y no del catálogo a propósito: la fila de
     * `appointment_billing` es lo que el paciente va a pagar de verdad (y un
     * estudio sin precio cargado no genera fila, así que tampoco muestra monto
     * — ver lib/lab-billing.ts). Volver a leer `catalog_items` acá sería una
     * segunda fuente que puede decir otro número que la caja.
     *
     * El historial no lo lleva: son estudios de otras visitas y su cobro se ve
     * en el caso, no acá.
     */
    db.appointmentBilling.findMany({
      where: { appointmentId, labOrderId: { not: null } },
      select: { labOrderId: true, totalCost: true, balanceDue: true },
    }),
  ]);

  const cobroPorEstudio = new Map(billed.map(b => [b.labOrderId!, b]));

  return NextResponse.json({
    orders: orders.map(o => {
      const cobro = cobroPorEstudio.get(o.id);
      return {
        ...o,
        // `null` = sin precio en el catálogo, que NO es lo mismo que $0.
        price:   cobro ? Number(cobro.totalCost)  : null,
        balance: cobro ? Number(cobro.balanceDue) : null,
      };
    }),
    history,
  });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny, actor } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  let body;
  try { body = OrderSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // La orden se cuelga de la nota de la visita si ya existe (no la crea:
  // el doctor puede pedir estudios sin haber empezado a escribir).
  const [note, appt] = await Promise.all([
    db.visitNote.findUnique({ where: { appointmentId }, select: { id: true } }),
    db.appointment.findUnique({
      where: { id: appointmentId },
      select: { provider: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  // La orden es del MÉDICO aunque la cargue el asistente desde admisión: ese es
  // el nombre que se imprime y va al laboratorio. Quién la tecleó queda en el
  // audit log, no en el documento.
  //
  // Si vino un `providerId`, manda ese (el usuario eligió otro solicitante);
  // si no, el doctor de la cita.
  const chosen = body.providerId
    ? await db.provider.findFirst({
        where: { id: body.providerId, deletedAt: null },
        select: { firstName: true, lastName: true },
      })
    : null;
  const signer = chosen ?? appt?.provider ?? null;
  const orderedByName = signer
    ? `Dr. ${signer.firstName} ${signer.lastName}`.trim()
    : actor.name;

  const groupId = randomUUID();
  const sampleDate = body.sampleDate ? new Date(`${body.sampleDate}T12:00:00-06:00`) : null;

  await db.labOrder.createMany({
    data: body.studies.map((s) => ({
      appointmentId,
      visitNoteId: note?.id ?? null,
      groupId,
      orderType: s.category,
      studyName: s.name,
      studyCode: s.code ?? null,
      loincCode: s.loinc ?? null,
      clinicalIndication: body.clinicalIndication,
      urgency: body.urgency,
      billingType: body.billingType ?? null,
      collectionSite: body.collectionSite,
      sampleDate,
      preferredCenter: body.preferredCenter ?? null,
      icd10Codes: body.icd10Codes,
      orderedByName,
    })),
  });

  // La clínica cobra el estudio: cada uno genera su cobro con el precio
  // público del catálogo (ver lib/lab-billing.ts).
  await syncLabBilling(appointmentId);

  const orders = await db.labOrder.findMany({
    where: { groupId },
    orderBy: { studyName: 'asc' },
    select: ORDER_SELECT,
  });

  writeAuditLog(db, {
    ...(await resolveActor(req.headers)),
    action: 'CREATE_LAB_ORDER',
    entityType: 'Appointment',
    entityId: appointmentId,
    metadata: {
      groupId,
      studies: body.studies.length,
      urgency: body.urgency,
      collectionSite: body.collectionSite,
      orderedFor: orderedByName,
      // Quien la cargó (puede ser el asistente desde admisión)
      enteredBy: actor.email,
      enteredByRole: actor.role,
    },
  }).catch(() => undefined);

  return NextResponse.json({ groupId, orders }, { status: 201 });
}
