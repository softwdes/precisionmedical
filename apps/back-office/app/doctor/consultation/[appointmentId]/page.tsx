/**
 * Portal Médico · Consulta (D3 — B.17.5/B.18 shell)
 *
 * Vista de trabajo del doctor sobre UNA cita: nodos de flujo (como Day
 * Admission) + contexto del paciente + tabs Triaje · Notas · Labs · Rx ·
 * Servicios. El triaje se lee del MISMO TriageRecord que captura el MA.
 * Seguridad: solo citas del Provider de la sesión.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { getSessionProvider } from '@/lib/get-session-provider';
import { COVERAGE_FIELDS, resolveCoverage, serializeCoverage } from '@/lib/coverage';
import { buildPatientContext, PATIENT_CONTEXT_SELECT } from '@/lib/patient-context';
import { ConsultationClient } from './consultation-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('consultation') };
}

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
      // Los campos del panel de contexto salen del fragmento compartido, el mismo
      // que usa la API de Day Admission.
      patient: { select: PATIENT_CONTEXT_SELECT },
      case: {
        select: {
          id: true, caseCode: true, caseType: true, accidentType: true, accidentDate: true,
          pipVerifiedAt: true, intakeFormCompletedAt: true, consentsData: true,
          // Cobertura: las columnas del helper, sin su `primaryInsurance` —
          // este select trae el suyo con más campos. Ver COVERAGE_FIELDS.
          ...COVERAGE_FIELDS,
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

  // ── Contexto clínico del paciente (N2) ──
  // El armado vive en lib/patient-context.ts porque Day Admission muestra el
  // MISMO panel: dos copias de estas 40 líneas divergirían en la primera columna
  // que alguien agregue.
  const patientContext = buildPatientContext(a.patient, a.case);

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
        // La versión con la que abrió esta pantalla. Sin ella el editor guarda a
        // ciegas y podría pisar lo que el asistente escribió mientras el doctor
        // tenía la nota abierta (ver el PUT de visit-notes).
        updatedAt: n.updatedAt.toISOString(),
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
