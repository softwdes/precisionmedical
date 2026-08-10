import { db } from '@precision-medical/database';
import type { ComponentProps } from 'react';
import type { CaseDetailClient } from '@/app/(admin)/front-office/[id]/case-detail-client';

/**
 * Carga del detalle de caso — compartida por las CUATRO superficies que lo
 * muestran: la página completa de admin (/front-office/[id]), su versión modal
 * interceptada desde Pacientes, la página del doctor (/doctor/case/[id]) y su
 * modal desde Mis Pacientes. Una sola query: si el detalle gana un campo, lo
 * ganan las cuatro a la vez.
 */

type CaseDetailClientProps = ComponentProps<typeof CaseDetailClient>;

export interface CaseDetailData {
  caseInfo: CaseDetailClientProps['caseInfo'];
  auditEvents: CaseDetailClientProps['auditEvents'];
}

/**
 * ¿Este doctor puede ver este caso? La regla es la misma de "Mis Pacientes":
 * el caso es suyo si tiene al menos una cita con su Provider. Sin esto,
 * cualquier doctor podría abrir cualquier caso de la clínica por URL.
 */
export async function providerHasCase(providerId: string, caseId: string): Promise<boolean> {
  const appt = await db.appointment.findFirst({
    where: { caseId, providerId },
    select: { id: true },
  });
  return !!appt;
}

export async function getCaseDetailData(id: string): Promise<CaseDetailData | null> {
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
          addressLine1: true,
          addressCity: true,
          addressState: true,
          addressZip: true,
          socialSecurityNumber: true,
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
      lienSignatures: {
        orderBy: { signedAt: 'asc' },
        select: {
          id: true,
          signerType: true,
          signerName: true,
          signerEmail: true,
          signatureSvg: true,
          signedAt: true,
        },
      },
    },
  });

  if (!caseRecord) return null;

  // Audit log del caso para el timeline (created, portal sent, intake complete…)
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

  return {
    caseInfo: {
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
      patient: {
        ...caseRecord.patient,
        photoUrl: (() => {
          const cd = caseRecord.consentsData as Record<string, unknown> | null;
          const photos = cd?.photos as Record<string, string> | undefined;
          return photos?.selfie ?? null;
        })(),
      },
      lawFirm: caseRecord.lawFirm,
      attorney: caseRecord.attorney,
      primaryInsurance: caseRecord.primaryInsurance,
      secondaryInsurance: caseRecord.secondaryInsurance,
      specialty: caseRecord.specialty,
      notes: caseRecord.notes,
      appointments: caseRecord.appointments,
      // La tabla es append-only por diseño (documento legal, nunca se actualiza
      // ni borra). Re-firmar crea una fila nueva, así que un caso reabierto
      // varias veces acumula firmas del mismo tipo. Se reduce a la ÚLTIMA por
      // signerType para la vista — el historial completo sigue en la DB.
      lienSignatures: (() => {
        const porTipo = new Map<string, (typeof caseRecord.lienSignatures)[number]>();
        const conteoPorTipo = new Map<string, number>();
        // El query ya viene ordenado por signedAt asc → la última iteración de
        // cada tipo es la más reciente.
        for (const s of caseRecord.lienSignatures) {
          porTipo.set(s.signerType, s);
          conteoPorTipo.set(s.signerType, (conteoPorTipo.get(s.signerType) ?? 0) + 1);
        }
        return [...porTipo.values()].map((s) => ({
          id: s.id,
          signerType: s.signerType,
          signerName: s.signerName,
          signerEmail: s.signerEmail,
          signatureSvg: s.signatureSvg,
          signedAt: s.signedAt,
          previousCount: (conteoPorTipo.get(s.signerType) ?? 1) - 1,
        }));
      })(),
    },
    auditEvents: auditEvents.map((e) => ({
      id: e.id,
      action: e.action,
      actorType: e.actorType,
      actorUserId: e.actorUserId,
      createdAt: e.createdAt,
      metadata: e.metadata as Record<string, unknown> | null,
    })),
  };
}
