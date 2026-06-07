import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import { CaseDetailClient } from './case-detail-client';

// Front Office · Detalle del caso
// Server component: carga case + relations + notes cronológicas + audit log
// para construir el timeline.

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CaseDetailPage({ params }: PageProps) {
  const { id } = await params;

  const caseRecord = await db.case.findFirst({
    where: { id, deletedAt: null },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          dateOfBirth: true,
          patientCode: true,
        },
      },
      lawFirm: {
        select: {
          id: true,
          firmName: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          paymentSpeed: true,
          caseflowFlags: true,
        },
      },
      attorney: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          memberRole: true,
        },
      },
      primaryInsurance: {
        select: {
          id: true,
          name: true,
          shortCode: true,
          color: true,
          type: true,
          responseSpeed: true,
          claimsPhone: true,
          hcfaChannel: true,
          preauthRequired: true,
        },
      },
      secondaryInsurance: {
        select: {
          id: true,
          name: true,
          shortCode: true,
          color: true,
          type: true,
        },
      },
      specialty: {
        select: { id: true, name: true, color: true, workflowType: true },
      },
      notes: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          isPrivate: true,
          authorName: true,
          authorUserId: true,
          createdAt: true,
        },
      },
      appointments: {
        orderBy: { scheduledFor: 'asc' },
        take: 20,
        select: {
          id: true,
          scheduledFor: true,
          durationMinutes: true,
          status: true,
          type: true,
        },
      },
    },
  });

  if (!caseRecord) {
    notFound();
  }

  // Audit log eventos del caso para el timeline (created, portal sent, intake complete, confirmed, etc)
  const auditEvents = await db.auditLog.findMany({
    where: { entityType: 'cases', entityId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true,
      action: true,
      actorType: true,
      actorUserId: true,
      createdAt: true,
      metadata: true,
    },
  });

  return (
    <CaseDetailClient
      caseInfo={{
        id: caseRecord.id,
        caseCode: caseRecord.caseCode,
        status: caseRecord.status,
        caseType: caseRecord.caseType,
        source: caseRecord.source,
        accidentDate: caseRecord.accidentDate,
        accidentType: caseRecord.accidentType,
        accidentLocation: caseRecord.accidentLocation,
        accidentNotes: caseRecord.accidentNotes,
        primaryPolicyNumber: caseRecord.primaryPolicyNumber,
        secondaryPolicyNumber: caseRecord.secondaryPolicyNumber,
        intakeFormSentAt: caseRecord.intakeFormSentAt,
        intakeFormSentVia: caseRecord.intakeFormSentVia,
        intakeFormCompletedAt: caseRecord.intakeFormCompletedAt,
        pipVerifiedAt: caseRecord.pipVerifiedAt,
        firstAppointmentConfirmedAt: caseRecord.firstAppointmentConfirmedAt,
        createdAt: caseRecord.createdAt,
        updatedAt: caseRecord.updatedAt,
        patient: caseRecord.patient,
        lawFirm: caseRecord.lawFirm,
        attorney: caseRecord.attorney,
        primaryInsurance: caseRecord.primaryInsurance,
        secondaryInsurance: caseRecord.secondaryInsurance,
        specialty: caseRecord.specialty,
        notes: caseRecord.notes,
        appointments: caseRecord.appointments,
      }}
      auditEvents={auditEvents.map((e) => ({
        id: e.id,
        action: e.action,
        actorType: e.actorType,
        actorUserId: e.actorUserId,
        createdAt: e.createdAt,
        metadata: e.metadata as Record<string, unknown> | null,
      }))}
    />
  );
}
