import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { FrontOfficeClient } from './front-office-client';

// B.1 + B.2 — Recepción primaria · Front Office workspace
// Vista de Recepción + modal de crear caso.

const PAGE_SIZE = 25;

export default async function FrontOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  // Nombre del usuario para el saludo personalizado
  let userName = 'Recepción';
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const admin = createAdminClient();
      const { data } = await admin.from('users').select('firstName').eq('email', user.email).single();
      if (data?.firstName) userName = data.firstName as string;
    }
  } catch { /* fallback a 'Recepción' */ }

  // Rango de hoy y ayer en UTC (Mountain Daylight Time = UTC-7)
  // Para Phase 1A con mock data, usamos medianoche UTC como aproximación.
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd   = new Date(todayEnd);   yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
  // Specialties + clinics + providers para los dropdowns del modal B.2
  // + samplePatients para el IncomingCallSimulator (DEV · simula Weave webhook)
  const [specialties, clinics, providers, samplePatients, citasHoy, noShowsAyer] = await Promise.all([
    db.specialtyCatalog.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true },
    }),
    db.provider.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ specialty: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, specialty: true },
    }),
    // Sample para el IncomingCallSimulator (max 10 · paciente con phone)
    db.patient.findMany({
      where: { phone: { not: null } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        _count: { select: { cases: true } },
      },
    }),
    // Citas del día (scheduled/in-progress · no canceladas)
    db.appointment.count({
      where: {
        scheduledFor: { gte: todayStart, lte: todayEnd },
        status: { notIn: ['CANCELLED'] },
      },
    }),
    // No-shows de ayer
    db.appointment.count({
      where: {
        scheduledFor: { gte: yesterdayStart, lte: yesterdayEnd },
        status: 'NO_SHOW',
      },
    }),
  ]);

  // Casos por estado relevante para Front Office
  const caseWhere = {
    deletedAt: null,
    status: { in: ['NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED'] as ('NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED')[] },
  };
  const [cases, totalCases] = await Promise.all([
    db.case.findMany({
      where: caseWhere,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
      patient: { select: { firstName: true, lastName: true, phone: true, dateOfBirth: true, email: true } },
      lawFirm: { select: { firmName: true, paymentSpeed: true } },
      attorney: { select: { firstName: true, lastName: true } },
      primaryInsurance: { select: { name: true, shortCode: true, color: true, responseSpeed: true } },
      specialty: { select: { name: true, color: true } },
      _count: { select: { appointments: true, notes: true } },
      },
    }),
    db.case.count({ where: caseWhere }),
  ]);

  // Stats agrupados por status (todos los valores del enum CaseStatus)
  const byStatus = {
    NEW_REFERRAL:     cases.filter((c) => c.status === 'NEW_REFERRAL').length,
    INTAKE_PENDING:   cases.filter((c) => c.status === 'INTAKE_PENDING').length,
    INTAKE_COMPLETED: cases.filter((c) => c.status === 'INTAKE_COMPLETED').length,
    CONFIRMED:        cases.filter((c) => c.status === 'CONFIRMED').length,
    ACTIVE:           cases.filter((c) => c.status === 'ACTIVE').length,
    MMI:              cases.filter((c) => c.status === 'MMI').length,
    CLOSED:           cases.filter((c) => c.status === 'CLOSED').length,
    SETTLED:          cases.filter((c) => c.status === 'SETTLED').length,
    ARCHIVED:         cases.filter((c) => c.status === 'ARCHIVED').length,
    CANCELLED:        cases.filter((c) => c.status === 'CANCELLED').length,
  };

  // Casos creados hoy (de los ya cargados · rango local aproximado)
  const casosHoy = cases.filter((c) => new Date(c.createdAt) >= todayStart).length;

  return (
    <FrontOfficeClient
      userName={userName}
      kpis={{ casosHoy, citasHoy, formulariosPendientes: byStatus.INTAKE_PENDING, noShowsAyer }}
      specialties={specialties}
      clinics={clinics}
      providers={providers}
      samplePatients={samplePatients.map((p) => ({
        id: p.id,
        patientCode: p.patientCode,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        casesCount: p._count.cases,
      }))}
      cases={cases.map((c) => ({
        id: c.id,
        caseCode: c.caseCode,
        status: c.status,
        source: c.source,
        accidentDate: c.accidentDate,
        accidentType: c.accidentType,
        accidentLocation: c.accidentLocation,
        patient: {
          firstName: c.patient.firstName,
          lastName: c.patient.lastName,
          phone: c.patient.phone,
          email: c.patient.email,
          dateOfBirth: c.patient.dateOfBirth,
        },
        lawFirm: c.lawFirm ? { firmName: c.lawFirm.firmName ?? '—', paymentSpeed: c.lawFirm.paymentSpeed } : null,
        attorney: c.attorney ? {
          firstName: c.attorney.firstName,
          lastName: c.attorney.lastName,
        } : null,
        primaryInsurance: c.primaryInsurance ? {
          name: c.primaryInsurance.name,
          shortCode: c.primaryInsurance.shortCode,
          color: c.primaryInsurance.color,
          responseSpeed: c.primaryInsurance.responseSpeed,
        } : null,
        specialty: c.specialty ? { name: c.specialty.name, color: c.specialty.color } : null,
        intakeFormSentAt: c.intakeFormSentAt,
        intakeFormSentVia: c.intakeFormSentVia,
        intakeFormCompletedAt: c.intakeFormCompletedAt,
        pipVerifiedAt: c.pipVerifiedAt,
        firstAppointmentConfirmedAt: c.firstAppointmentConfirmedAt,
        appointmentCount: c._count.appointments,
        noteCount: c._count.notes,
        createdAt: c.createdAt,
      }))}
      stats={byStatus}
      pagination={{ page, pageSize: PAGE_SIZE, total: totalCases }}
    />
  );
}
