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

type Ctx = { params: Promise<{ appointmentId: string }> };

const StudySchema = z.object({
  name: z.string().min(1).max(300),
  code: z.string().max(50).nullable().optional(),
  loinc: z.string().max(50).nullable().optional(),
  category: z.enum(['LABORATORY', 'IMAGING', 'CARDIOLOGY', 'OTHER']).default('LABORATORY'),
});

const OrderSchema = z.object({
  studies: z.array(StudySchema).min(1).max(30),
  clinicalIndication: z.string().max(4000).default(''),
  urgency: z.enum(['STAT', 'URGENT', 'ROUTINE']).default('ROUTINE'),
  billingType: z.enum(['CLIENT', 'PATIENT', 'PRIVATE', 'MEDICAID', 'MEDICARE', 'WORKERS_COMP']).nullable().optional(),
  collectionSite: z.enum(['IN_HOUSE', 'EXTERNAL']).default('EXTERNAL'),
  sampleDate: z.string().nullable().optional(),   // YYYY-MM-DD
  preferredCenter: z.string().max(200).nullable().optional(),
  icd10Codes: z.array(z.string().max(300)).max(20).default([]),
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

  const [orders, history] = await Promise.all([
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
  ]);

  return NextResponse.json({ orders, history });
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
  const orderedByName = appt?.provider
    ? `Dr. ${appt.provider.firstName} ${appt.provider.lastName}`.trim()
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
