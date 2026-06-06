import { db } from '@precision-medical/database';
import { FrontOfficeClient } from './front-office-client';

// B.1 — Recepción primaria · Front Office workspace
// Vista de Recepción al iniciar el día / contestar llamada.
// Muestra cola de casos pendientes confirmación + acceso rápido a crear nuevo caso.

export default async function FrontOfficePage() {
  // Casos por estado relevante para Front Office
  const cases = await db.case.findMany({
    where: {
      deletedAt: null,
      status: { in: ['NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED'] },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    include: {
      patient: { select: { firstName: true, lastName: true, phone: true, dateOfBirth: true, email: true } },
      lawFirm: { select: { firmName: true, paymentSpeed: true } },
      attorney: { select: { firstName: true, lastName: true } },
      primaryInsurance: { select: { name: true, shortCode: true, color: true, responseSpeed: true } },
      specialty: { select: { name: true, color: true } },
      _count: { select: { appointments: true, notes: true } },
    },
  });

  // Stats agrupados por status
  const byStatus = {
    NEW_REFERRAL: cases.filter((c) => c.status === 'NEW_REFERRAL').length,
    INTAKE_PENDING: cases.filter((c) => c.status === 'INTAKE_PENDING').length,
    INTAKE_COMPLETED: cases.filter((c) => c.status === 'INTAKE_COMPLETED').length,
    CONFIRMED: cases.filter((c) => c.status === 'CONFIRMED').length,
  };

  return (
    <FrontOfficeClient
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
    />
  );
}
