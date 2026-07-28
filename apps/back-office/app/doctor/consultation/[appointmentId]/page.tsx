/**
 * Portal Médico · Consulta (D3 — B.17.5/B.18 shell)
 *
 * Vista de trabajo del doctor sobre UNA cita: nodos de flujo (como Day
 * Admission) + contexto del paciente + tabs Triaje · Notas · Labs · Rx ·
 * Servicios. El triaje se lee del MISMO TriageRecord que captura el MA.
 * Seguridad: solo citas del Provider de la sesión.
 */

import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { getSessionProvider } from '@/lib/get-session-provider';
import { ConsultationClient } from './consultation-client';

export const metadata = { title: 'Consulta · Portal Médico' };

export default async function DoctorConsultationPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { appointmentId } = await params;

  const a = await db.appointment.findFirst({
    where: { id: appointmentId, providerId: provider.id },
    select: {
      id: true,
      scheduledFor: true,
      durationMinutes: true,
      status: true,
      type: true,
      isOnline: true,
      meetingUrl: true,
      checkedInAt: true,
      attendanceSignedAt: true,
      patient: {
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true },
      },
      case: {
        select: {
          id: true, caseCode: true, caseType: true,
          pipVerifiedAt: true, intakeFormCompletedAt: true, consentsData: true,
          primaryInsurance: { select: { name: true } },
        },
      },
      clinic: { select: { name: true } },
      triageRecord: true,
      visitNote: { select: { status: true } },
    },
  });

  if (!a) notFound();

  const tr = a.triageRecord;
  // Misma fórmula que Day Admission: consentimientos completos = tratamiento +
  // financiero + firma en archivo (case.consentsData)
  const cd = (a.case?.consentsData ?? {}) as { treatment?: unknown; financial?: unknown; financialSignatureSvg?: unknown };
  const verification = {
    healthForm: !!a.case?.intakeFormCompletedAt,
    consents: !!(cd.treatment && cd.financial && cd.financialSignatureSvg),
    pip: !!a.case?.pipVerifiedAt,
    insuranceName: a.case?.primaryInsurance?.name ?? null,
  };

  return (
    <ConsultationClient
      appointment={{
        id: a.id,
        scheduledFor: a.scheduledFor.toISOString(),
        durationMinutes: a.durationMinutes,
        status: a.status,
        type: a.type,
        isOnline: a.isOnline,
        meetingUrl: a.meetingUrl,
        checkedInAt: a.checkedInAt?.toISOString() ?? null,
        attendanceSignedAt: a.attendanceSignedAt?.toISOString() ?? null,
        noteStatus: a.visitNote?.status ?? null,
        clinicName: a.clinic.name,
        caseCode: a.case?.caseCode ?? null,
        verification,
        patient: {
          firstName: dec(a.patient.firstName) ?? '',
          lastName: dec(a.patient.lastName) ?? '',
          dateOfBirth: a.patient.dateOfBirth?.toISOString() ?? null,
          sex: a.patient.sex ?? null,
          phone: dec(a.patient.phone) ?? null,
        },
        triage: tr
          ? {
              heightFt: tr.heightFt, heightIn: tr.heightIn,
              weightLbs: tr.weightLbs, weightOz: tr.weightOz,
              systolicMmhg: tr.systolicMmhg, diastolicMmhg: tr.diastolicMmhg,
              systolicMmhg2: tr.systolicMmhg2, diastolicMmhg2: tr.diastolicMmhg2,
              pulseBpm: tr.pulseBpm, pulseBpm2: tr.pulseBpm2,
              respiratoryRate: tr.respiratoryRate, respiratoryRate2: tr.respiratoryRate2,
              tempFahrenheit: tr.tempFahrenheit, tempFahrenheit2: tr.tempFahrenheit2,
              painScale: tr.painScale,
              o2Saturation: tr.o2Saturation, onRoomAir: tr.onRoomAir, o2Comment: tr.o2Comment,
              visualAcuityRight: tr.visualAcuityRight, visualAcuityLeft: tr.visualAcuityLeft,
              visualAcuityBoth: tr.visualAcuityBoth, visionCorrected: tr.visionCorrected,
              chiefComplaint: tr.chiefComplaint,
            }
          : null,
      }}
    />
  );
}
