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
import { resolveCoverage, serializeCoverage } from '@/lib/coverage';
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

  // Las tres queries en paralelo — antes iban en cadena y cada round-trip a la
  // base cuesta ~150 ms.
  const [a, tplRows, doneRows] = await Promise.all([
    db.appointment.findFirst({
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
      checkedOutAt: true,
      attendanceSignedAt: true,
      notes: true,
      plannedServiceCodes: true,
      patient: {
        select: {
          id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true,
          phone: true, phone2: true, email: true,
          maritalStatus: true, preferredLanguage: true,
          guardianName: true, emergencyContactName: true, emergencyContactPhone: true,
          preferredPharmacy: true, employer: true, referralSource: true,
          medicalHistory: true,
          providerReferrer: { select: { firstName: true, lastName: true } },
        },
      },
      case: {
        select: {
          id: true, caseCode: true, caseType: true, accidentType: true, accidentDate: true,
          pipVerifiedAt: true, intakeFormCompletedAt: true, consentsData: true,
          // Cobertura. Las columnas van explícitas y no con COVERAGE_LIST_SELECT
          // porque este select ya trae `primaryInsurance` con más campos y el
          // spread lo pisaría.
          coverageType: true, coverageVerifyMethod: true, coverageVerifiedAt: true,
          coverageVerifiedByName: true, coverageCarrierName: true,
          primaryPolicyNumber: true, secondaryPolicyNumber: true,
          primaryInsurance: { select: { id: true, name: true, type: true } },
          secondaryInsurance: { select: { id: true, name: true } },
        },
      },
      provider: { select: { id: true, firstName: true, lastName: true, specialty: true } },
      clinic: { select: { id: true, name: true } },
      triageRecord: true,
      visitNote: {
        include: { diagnoses: { orderBy: { sortOrder: 'asc' } } },
      },
    },
    }),
    // Plantillas globales disponibles + favoritas del doctor (autollenan la nota)
    db.template.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true, title: true, description: true, encounterType: true,
        sections: { select: { sectionKey: true, content: true }, orderBy: { orderIndex: 'asc' } },
        favorites: provider.userId ? { where: { userId: provider.userId }, select: { id: true } } : false,
      },
      orderBy: { title: 'asc' },
    }),
    // `doctorDoneAt` con SQL directo: la columna existe (db push aplicado) pero el
    // cliente de Prisma no se pudo regenerar (otro dev server tenía tomado el
    // motor en Windows). Pasar a `select` cuando se regenere.
    db.$queryRaw<Array<{ doctorDoneAt: Date | null }>>`
      SELECT "doctorDoneAt" FROM appointments WHERE id = ${appointmentId}
    `,
  ]);

  if (!a) notFound();

  const doctorDoneAt = doneRows[0]?.doctorDoneAt ?? null;

  const templates = tplRows.map((tpl) => ({
    id: tpl.id,
    title: tpl.title,
    description: tpl.description,
    encounterType: tpl.encounterType,
    isFavorite: Array.isArray(tpl.favorites) ? tpl.favorites.length > 0 : false,
    sections: tpl.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
  }));

  // ── Contexto clínico del paciente (N2) — historial en Patient.medicalHistory ──
  type MH = {
    allergies?: string;
    problems?: Array<{ condition: string; status?: string; diagnosedAt?: string }>;
    medications?: Array<{
      id?: string; name: string; dose?: string; instructions?: string; status: string;
      prescribedBy?: string; externalPrescriber?: boolean;
    }>;
    surgeries?: Array<{ procedure: string; date?: string }>;
    familyHistory?: Array<{ relation: string; condition: string }>;
    socialHistory?: { work?: string; children?: string; tobacco?: string; alcohol?: string; drugs?: string };
    visitInfo?: { referredBy?: string };
  };
  const mh = (a.patient.medicalHistory ?? {}) as MH;

  const patientContext = {
    id: a.patient.id,
    firstName: dec(a.patient.firstName) ?? '',
    lastName: dec(a.patient.lastName) ?? '',
    dateOfBirth: a.patient.dateOfBirth?.toISOString() ?? null,
    sex: a.patient.sex ?? null,
    maritalStatus: a.patient.maritalStatus ?? null,
    preferredLanguage: a.patient.preferredLanguage ?? null,
    phone: dec(a.patient.phone) ?? null,
    phone2: dec(a.patient.phone2) ?? null,
    email: a.patient.email ?? null,
    guardianName: a.patient.guardianName ?? null,
    emergencyContactName: a.patient.emergencyContactName ?? null,
    emergencyContactPhone: a.patient.emergencyContactPhone ?? null,
    referredBy: mh.visitInfo?.referredBy ?? a.patient.referralSource ?? null,
    preferredPharmacy: a.patient.preferredPharmacy ?? null,
    employer: a.patient.employer ?? null,
    providerName: a.patient.providerReferrer
      ? `Dr. ${a.patient.providerReferrer.firstName} ${a.patient.providerReferrer.lastName}`
      : null,
    insurance: {
      primaryName: a.case?.primaryInsurance?.name ?? null,
      primaryPolicy: a.case?.primaryPolicyNumber ?? null,
      primaryType: a.case?.primaryInsurance?.type ?? null,
      secondaryName: a.case?.secondaryInsurance?.name ?? null,
      secondaryPolicy: a.case?.secondaryPolicyNumber ?? null,
    },
    history: {
      allergies: mh.allergies ?? null,
      problems: mh.problems ?? [],
      medications: mh.medications ?? [],
      surgeries: mh.surgeries ?? [],
      familyHistory: mh.familyHistory ?? [],
      socialHistory: mh.socialHistory ?? null,
    },
  };

  const n = a.visitNote;
  const note = n
    ? {
        status: n.status,
        signedAt: n.signedAt?.toISOString() ?? null,
        signedByName: n.signedByName,
        templateId: n.templateId,
        chiefComplaint: n.chiefComplaint,
        hpi: n.hpi,
        ros: n.ros,
        physicalExam: n.physicalExam,
        assessment: n.assessment,
        plan: n.plan,
        diagnoses: n.diagnoses.map((d) => ({
          icd10Code: d.icd10Code,
          icd10Label: d.icd10Label,
          snomedCode: d.snomedCode,
          snomedLabel: d.snomedLabel,
          diagnosisId: d.diagnosisId,
        })),
      }
    : null;

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
        doctorDoneAt: doctorDoneAt?.toISOString() ?? null,
        checkedOutAt: a.checkedOutAt?.toISOString() ?? null,
        clinicName: a.clinic.name,
        caseId: a.case?.id ?? null,
        caseCode: a.case?.caseCode ?? null,
        // Vista de detalle: se pasa `consentsData` para que, si nadie respondió,
        // el diálogo pueda sugerir lo que ya trae el formulario de admisión.
        coverage: serializeCoverage(resolveCoverage(a.case ?? {})),
        verification,
        // Payload para el panel de servicios compartido (mismo de Day Admission)
        servicesPanel: {
          id: a.id,
          scheduledFor: a.scheduledFor.toISOString(),
          durationMinutes: a.durationMinutes,
          type: a.type,
          status: a.status,
          notes: a.notes,
          visitNumber: 0,
          plannedServiceCodes: (a.plannedServiceCodes ?? []) as Array<{ id: string; code: string; description: string; fee: number; category: string }>,
          patient: {
            id: a.patient.id,
            firstName: dec(a.patient.firstName) ?? '',
            lastName: dec(a.patient.lastName) ?? '',
            phone: dec(a.patient.phone) ?? null,
            email: a.patient.email ?? null,
            dateOfBirth: a.patient.dateOfBirth?.toISOString() ?? null,
          },
          case: a.case
            ? {
                id: a.case.id,
                caseCode: a.case.caseCode,
                accidentType: a.case.accidentType ?? null,
                accidentDate: a.case.accidentDate?.toISOString() ?? null,
                status: 'ACTIVE',
                intakeFormCompletedAt: a.case.intakeFormCompletedAt?.toISOString() ?? null,
                attorney: null,
                primaryInsurance: a.case.primaryInsurance ?? null,
              }
            : null,
          clinic: { id: a.clinic.id, name: a.clinic.name },
          provider: a.provider
            ? { id: a.provider.id, firstName: a.provider.firstName, lastName: a.provider.lastName, specialty: a.provider.specialty ?? null }
            : null,
        },
        patient: {
          firstName: dec(a.patient.firstName) ?? '',
          lastName: dec(a.patient.lastName) ?? '',
          dateOfBirth: a.patient.dateOfBirth?.toISOString() ?? null,
          sex: a.patient.sex ?? null,
          phone: dec(a.patient.phone) ?? null,
        },
        triage: tr
          ? {
              heightFt: tr.heightFt, heightIn: tr.heightIn, heightCm: tr.heightCm,
              weightLbs: tr.weightLbs, weightOz: tr.weightOz, weightKg: tr.weightKg,
              systolicMmhg: tr.systolicMmhg, diastolicMmhg: tr.diastolicMmhg,
              systolicMmhg2: tr.systolicMmhg2, diastolicMmhg2: tr.diastolicMmhg2,
              pulseBpm: tr.pulseBpm, pulseBpm2: tr.pulseBpm2,
              respiratoryRate: tr.respiratoryRate, respiratoryRate2: tr.respiratoryRate2,
              tempFahrenheit: tr.tempFahrenheit, tempFahrenheit2: tr.tempFahrenheit2,
              tempCelsius: tr.tempCelsius, tempCelsius2: tr.tempCelsius2,
              painScale: tr.painScale,
              o2Saturation: tr.o2Saturation, onRoomAir: tr.onRoomAir, o2Comment: tr.o2Comment,
              visualAcuityRight: tr.visualAcuityRight, visualAcuityLeft: tr.visualAcuityLeft,
              visualAcuityBoth: tr.visualAcuityBoth, visionCorrected: tr.visionCorrected,
              chiefComplaint: tr.chiefComplaint,
            }
          : null,
      }}
      note={note}
      templates={templates}
      userId={provider.userId}
      patientContext={patientContext}
    />
  );
}
