/**
 * GET /api/admin/appointments
 *
 * Endpoint del Calendario B.10-B.11.
 * Devuelve citas en un rango de fechas con toda la info necesaria para
 * renderizar el grid semanal y el panel de detalle.
 *
 * Query params:
 *   from      — ISO datetime (inicio del rango)
 *   to        — ISO datetime (fin del rango)
 *   clinicId  — filtrar por clínica (opcional)
 *   providerId — filtrar por doctor (opcional)
 *   type      — AppointmentType (opcional)
 *   status    — AppointmentStatus (opcional, si no se pasa excluye CANCELLED)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, Prisma, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

// ─── Include shape (typed via satisfies para que Prisma infiera GetPayload) ──
const APPT_INCLUDE = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      dateOfBirth: true,
    },
  },
  // 'case' es palabra reservada en JS pero Prisma lo maneja bien como key de objeto
  case: {
    select: {
      id: true,
      caseCode: true,
      accidentType: true,
      accidentDate: true,
      status: true,
      intakeFormCompletedAt: true,
      // En el modelo Case la relación al attorney es "attorney" (no lawyerReferrer)
      attorney: {
        select: {
          id: true,
          firmName: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
      // El seguro primario (PIP) es "primaryInsurance" (no insurance)
      primaryInsurance: {
        select: { id: true, name: true },
      },
    },
  },
  clinic: { select: { id: true, name: true } },
  provider: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialty: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

type ApptRow = Prisma.AppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const from      = searchParams.get('from');
  const to        = searchParams.get('to');
  const clinicId   = searchParams.get('clinicId')   ?? undefined;
  const providerId = searchParams.get('providerId') ?? undefined;
  const type       = searchParams.get('type')       ?? undefined;
  const status     = searchParams.get('status')     ?? undefined;

  // Rango por defecto: semana actual (lunes–domingo)
  const fromDate = from ? new Date(from) : (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + 1); // lunes
    return d;
  })();
  const toDate = to ? new Date(to) : (() => {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  })();

  // ─── Build where clause (sin duplicate keys) ─────────────────────────────
  const where: Prisma.AppointmentWhereInput = {
    scheduledFor: { gte: fromDate, lte: toDate },
    // Si pasan un status específico, úsalo; si no, excluir CANCELLED
    status: status
      ? (status as Prisma.EnumAppointmentStatusFilter)
      : { not: 'CANCELLED' },
  };
  if (clinicId)   where.clinicId   = clinicId;
  if (providerId) where.providerId = providerId;
  if (type)       where.type       = type as Prisma.EnumAppointmentTypeFilter;

  try {
    const appointments: ApptRow[] = await db.appointment.findMany({
      where,
      include: APPT_INCLUDE,
      orderBy: { scheduledFor: 'asc' },
    });

    // ─── Calcular visitNumber ────────────────────────────────────────────────
    // 0 = primera visita del paciente para este caso
    const caseIds = [...new Set(appointments.map(a => a.caseId).filter(Boolean))] as string[];
    const visitCountsByCaseAndAppt: Record<string, number> = {};

    if (caseIds.length > 0) {
      const priorCounts = await db.appointment.groupBy({
        by: ['caseId'],
        where: {
          caseId:       { in: caseIds },
          status:       { not: 'CANCELLED' },
          scheduledFor: { lt: fromDate },
        },
        _count: { id: true },
      });
      const priorByCase: Record<string, number> = {};
      for (const r of priorCounts) {
        if (r.caseId) priorByCase[r.caseId] = r._count.id;
      }
      for (let i = 0; i < appointments.length; i++) {
        const appt = appointments[i];
        if (!appt.caseId) { visitCountsByCaseAndAppt[appt.id] = 0; continue; }
        const priorInPeriod = appointments.slice(0, i).filter(a => a.caseId === appt.caseId).length;
        visitCountsByCaseAndAppt[appt.id] = (priorByCase[appt.caseId] ?? 0) + priorInPeriod;
      }
    }

    // ─── Map to response ─────────────────────────────────────────────────────
    const result = appointments.map(appt => ({
      id:              appt.id,
      scheduledFor:    appt.scheduledFor.toISOString(),
      durationMinutes: appt.durationMinutes,
      type:            appt.type,
      status:          appt.status,
      notes:           appt.notes,
      visitNumber:     visitCountsByCaseAndAppt[appt.id] ?? 0,
      patient: {
        id:          appt.patient.id,
        firstName:   appt.patient.firstName,
        lastName:    appt.patient.lastName,
        phone:       appt.patient.phone,
        email:       appt.patient.email,
        dateOfBirth: appt.patient.dateOfBirth?.toISOString() ?? null,
      },
      case: appt.case ? {
        id:                     appt.case.id,
        caseCode:               appt.case.caseCode,
        accidentType:           appt.case.accidentType,
        accidentDate:           appt.case.accidentDate?.toISOString() ?? null,
        status:                 appt.case.status,
        intakeFormCompletedAt:  appt.case.intakeFormCompletedAt?.toISOString() ?? null,
        attorney: appt.case.attorney ? {
          id:        appt.case.attorney.id,
          firmName:  appt.case.attorney.firmName,
          firstName: appt.case.attorney.firstName,
          lastName:  appt.case.attorney.lastName,
          phone:     appt.case.attorney.phone,
          email:     appt.case.attorney.email,
        } : null,
        primaryInsurance: appt.case.primaryInsurance ? {
          id:   appt.case.primaryInsurance.id,
          name: appt.case.primaryInsurance.name,
        } : null,
      } : null,
      clinic: {
        id:   appt.clinic.id,
        name: appt.clinic.name,
      },
      provider: appt.provider ? {
        id:        appt.provider.id,
        firstName: appt.provider.firstName,
        lastName:  appt.provider.lastName,
        specialty: appt.provider.specialty,
      } : null,
    }));

    return NextResponse.json({ ok: true, appointments: result, count: result.length });
  } catch (err) {
    console.error('[GET /api/admin/appointments]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── POST — Crear cita (uso general desde calendario) ────────────────────────
const CreateSchema = z.object({
  caseId:          z.string(),
  clinicId:        z.string(),
  providerId:      z.string(),
  scheduledFor:    z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  type:            z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP']).default('AUTO_ACCIDENT'),
  notes:           z.string().max(2000).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);

  let parsed: z.infer<typeof CreateSchema>;
  try {
    parsed = CreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  if (new Date(parsed.scheduledFor) <= new Date()) {
    return NextResponse.json({ error: 'DATE_IN_PAST', message: 'La fecha debe ser futura' }, { status: 400 });
  }

  const [caseRecord, clinic, provider] = await Promise.all([
    db.case.findUnique({ where: { id: parsed.caseId }, select: { id: true, patientId: true, status: true } }),
    db.clinic.findUnique({ where: { id: parsed.clinicId }, select: { id: true } }),
    db.provider.findUnique({ where: { id: parsed.providerId }, select: { id: true } }),
  ]);

  if (!caseRecord) return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  if (!clinic)     return NextResponse.json({ error: 'CLINIC_NOT_FOUND' }, { status: 404 });
  if (!provider)   return NextResponse.json({ error: 'PROVIDER_NOT_FOUND' }, { status: 404 });

  const SCHEDULABLE = ['CONFIRMED', 'ACTIVE', 'INTAKE_COMPLETED'];
  if (!SCHEDULABLE.includes(caseRecord.status)) {
    return NextResponse.json(
      { error: 'INVALID_CASE_STATUS', message: `El caso está en status ${caseRecord.status} y no permite agendar` },
      { status: 422 },
    );
  }

  const shouldActivate = caseRecord.status === 'CONFIRMED';

  const apptData = {
    patientId:       caseRecord.patientId,
    caseId:          parsed.caseId,
    clinicId:        parsed.clinicId,
    providerId:      parsed.providerId,
    scheduledFor:    new Date(parsed.scheduledFor),
    durationMinutes: parsed.durationMinutes,
    type:            parsed.type,
    notes:           parsed.notes ?? null,
    status:          'SCHEDULED' as const,
  };

  let appointment;
  if (shouldActivate) {
    const [appt] = await db.$transaction([
      db.appointment.create({ data: apptData, include: { clinic: { select: { name: true } }, provider: { select: { firstName: true, lastName: true } } } }),
      db.case.update({ where: { id: parsed.caseId }, data: { status: 'ACTIVE' } }),
    ]);
    appointment = appt;
  } else {
    appointment = await db.appointment.create({
      data: apptData,
      include: { clinic: { select: { name: true } }, provider: { select: { firstName: true, lastName: true } } },
    });
  }

  await writeAuditLog(db, {
    actorType:    actor.actorType,
    actorUserId:  actor.actorUserId,
    action:       'CREATE_APPOINTMENT',
    entityType:   'appointments',
    entityId:     appointment.id,
    ipAddress:    actor.ipAddress,
    userAgent:    actor.userAgent,
    after:        appointment as unknown as Prisma.JsonValue,
    metadata:     { caseId: parsed.caseId, caseActivated: shouldActivate },
  });

  return NextResponse.json({ ok: true, appointment }, { status: 201 });
}
