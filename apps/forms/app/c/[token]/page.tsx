/**
 * B.5 — Portal del Paciente · Landing con portalToken
 *
 * Ruta: /c/[token]
 * El paciente llega aquí desde el SMS / correo magic link.
 * Server component: valida token en DB, pasa data pre-cargada al wizard.
 */

import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal } from '@/lib/decrypt';
import { IntakeWizard } from './intake-wizard';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ reopen?: string }> };

export default async function PatientPortalPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { reopen } = await searchParams;

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      status: true,
      caseType: true,
      accidentDate: true,
      accidentType: true,
      accidentNotes: true,
      accidentLocation: true,
      primaryPolicyNumber: true,
      intakeFormCompletedAt: true,
      consentsData: true,
      // Próxima cita para mostrar en el landing (B.5)
      appointments: {
        where: { scheduledFor: { gte: new Date() } },
        orderBy: { scheduledFor: 'asc' },
        take: 1,
        select: {
          scheduledFor: true,
          provider: { select: { firstName: true, lastName: true } },
        },
      },
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          phone2: true,
          email: true,
          addressLine1: true,
          addressCity: true,
          addressState: true,
          addressZip: true,
          referralSource: true,
          referralSourceOther: true,
          communicationPreference: true,
          preferredPharmacy: true,
          employer: true,
          race: true,
          ethnicity: true,
          sex: true,
          maritalStatus: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          emergencyContactRelation: true,
          emergency2Name: true,
          emergency2Phone: true,
          emergency2Relation: true,
          guardianName: true,
          guardianPhone: true,
          guardianRelation: true,
          // Apoderado como ficha real, cargado por la clínica al crear el caso
          // de un menor. Es la fuente buena: las columnas guardianName/Phone de
          // arriba son texto suelto de la data migrada del v2.
          guardianPatient: {
            select: {
              id: true, firstName: true, lastName: true,
              email: true, phone: true, phone2: true,
              dateOfBirth: true, addressLine1: true,
            },
          },
          insuranceCarrier: true,
          policyNumber: true,
        },
      },
      intakeSubmission: {
        select: {
          healthStatus: true, hasMedications: true, medications: true,
          hasAllergies: true, allergies: true,
          hasPreviousInjuries: true, previousInjuries: true,
        },
      },
      lienSignatures: {
        where: { signerType: 'PATIENT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { signatureSvg: true, signerName: true, signerEmail: true },
      },
    },
  });

  if (!rec) return <InvalidToken />;

  if (rec.intakeFormCompletedAt && reopen !== '1') {
    return (
      <AlreadyCompleted
        firstName={rec.patient.firstName}
        caseCode={rec.caseCode}
        token={token}
      />
    );
  }

  const appt = rec.appointments[0] ?? null;
  const cd = (rec.consentsData ?? {}) as Record<string, unknown>;

  // ─── Apoderado ──────────────────────────────────────────────────────────
  // Si la clínica ya vinculó un apoderado al crear el caso, esos datos manan
  // de su ficha y tienen prioridad sobre lo que haya en las columnas legacy o
  // en consentsData. El paciente no debería tener que volver a escribirlos.
  const gp = rec.patient.guardianPatient;
  const guardianFromClinic = !!gp;

  return (
    <IntakeWizard
      token={token}
      caseId={rec.id}
      caseCode={rec.caseCode}
      patient={{
        id:                       rec.patient.id,
        firstName:                rec.patient.firstName,
        lastName:                 rec.patient.lastName,
        dateOfBirth:              rec.patient.dateOfBirth?.toISOString() ?? null,
        phone:                    decryptFieldOrOriginal(rec.patient.phone),
        cellPhone:                rec.patient.phone2 ?? null,
        email:                    rec.patient.email ?? null,
        addressLine1:             rec.patient.addressLine1 ?? null,
        addressCity:              decryptFieldOrOriginal(rec.patient.addressCity),
        addressState:             decryptFieldOrOriginal(rec.patient.addressState),
        addressZip:               decryptFieldOrOriginal(rec.patient.addressZip),
        referralSource:           rec.patient.referralSource ?? null,
        referralSourceOther:      rec.patient.referralSourceOther ?? null,
        communicationPreference:  rec.patient.communicationPreference ?? null,
        preferredPharmacy:        decryptFieldOrOriginal(rec.patient.preferredPharmacy),
        employer:                 decryptFieldOrOriginal(rec.patient.employer),
        race:                     rec.patient.race ?? null,
        ethnicity:                rec.patient.ethnicity ?? null,
        sex:                      rec.patient.sex ?? null,
        maritalStatus:            rec.patient.maritalStatus ?? null,
        emergencyContactName:     decryptFieldOrOriginal(rec.patient.emergencyContactName),
        emergencyContactPhone:    decryptFieldOrOriginal(rec.patient.emergencyContactPhone),
        emergencyContactRelation: decryptFieldOrOriginal(rec.patient.emergencyContactRelation),
        emergency2Name:           rec.patient.emergency2Name ?? null,
        emergency2Phone:          rec.patient.emergency2Phone ?? null,
        emergency2Relation:       decryptFieldOrOriginal(rec.patient.emergency2Relation),
        guardianName:             gp ? gp.firstName : (rec.patient.guardianName ?? null),
        guardianPhone:            gp ? (gp.phone ?? gp.phone2 ?? null) : (rec.patient.guardianPhone ?? null),
        guardianRelation:         decryptFieldOrOriginal(rec.patient.guardianRelation),
        insuranceCarrier:         rec.patient.insuranceCarrier ?? null,
        policyNumber:             rec.patient.policyNumber ?? null,
      }}
      accident={{
        date:         rec.accidentDate?.toISOString() ?? null,
        // Para el wizard `type` es el TIPO DE CASO (MVA | GM), no el mecanismo
        // del accidente. Se lee de `caseType`, que es donde lo guarda el POST
        // del step 5. Antes se pasaba `accidentType` (AUTO/FALL/...) y por eso
        // un caso GM arrancaba como MVA y al guardar sobreescribia su caseType.
        type:         rec.caseType === 'GENERAL' ? 'GM' : 'MVA',
        notes:        rec.accidentNotes ?? null,
        location:     rec.accidentLocation ?? null,
        lawFirm:      (cd.lawFirm as string) ?? null,
        attorney:     (cd.attorney as string) ?? null,
        chiropractor: (cd.chiropractor as string) ?? null,
      }}
      savedInsurances={(Array.isArray(cd.insurances) ? cd.insurances : []) as object[]}
      savedHealth={rec.intakeSubmission ?? null}
      savedConsents={{
        hipaa:                 (cd.hipaa as boolean) ?? null,
        assignedParties:       (cd.assignedParties as boolean) ?? null,
        authRecords:           (cd.authRecords as boolean) ?? null,
        authVoicemail:         (cd.authVoicemail as boolean) ?? null,
        authNotifications:     (cd.authNotifications as boolean) ?? null,
        treatment:             (cd.treatment as boolean) ?? null,
        financial:             (cd.financial as boolean) ?? null,
        medicalHistory:        (cd.medicalHistory as boolean) ?? null,
        financialSignatureSvg: (cd.financialSignatureSvg as string) ?? null,
        authorizedPersons:     (Array.isArray(cd.authorizedPersons) ? cd.authorizedPersons : []) as { name: string; relation: string }[],
      }}
      savedExtra={{
        referredBy:        (cd.referredBy as string) ?? null,
        // La ficha del apoderado gana sobre consentsData cuando existe
        guardianLastName:  gp ? gp.lastName : ((cd.guardianLastName as string) ?? null),
        guardianEmail:     gp ? (gp.email ?? null) : ((cd.guardianEmail as string) ?? null),
        guardianDOB:       gp ? (gp.dateOfBirth ? gp.dateOfBirth.toISOString().slice(0, 10) : null)
                              : ((cd.guardianDOB as string) ?? null),
        guardianCellPhone: gp ? (gp.phone2 ?? gp.phone ?? null) : ((cd.guardianCellPhone as string) ?? null),
        guardianAddress:   gp ? (gp.addressLine1 ?? null) : ((cd.guardianAddress as string) ?? null),
      }}
      /* Cargado por la clínica → el step 4 se muestra en solo lectura */
      guardianFromClinic={guardianFromClinic}
      savedPhotos={(cd.photos ?? null) as {
        selfie?: string; insuranceCardFront?: string;
        insuranceCardBack?: string; dlFront?: string;
      } | null}
      savedLienSignature={rec.lienSignatures[0] ? {
        signatureSvg: rec.lienSignatures[0].signatureSvg ?? null,
        signerName:   rec.lienSignatures[0].signerName,
        signerEmail:  rec.lienSignatures[0].signerEmail ?? null,
      } : null}
      casePolicyNumber={rec.primaryPolicyNumber ?? null}
      nextAppointment={
        appt
          ? {
              scheduledFor: appt.scheduledFor.toISOString(),
              providerName: appt.provider
                ? `${appt.provider.firstName} ${appt.provider.lastName}`
                : null,
            }
          : null
      }
    />
  );
}

// ─── Error states ──────────────────────────────────────────────────────────────

function InvalidToken() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a1224', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>🔗</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#F43F5E', marginBottom: 12 }}>
          Enlace no válido
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
          Este enlace no es válido o ya expiró. Comunícate con Precision Medical para recibir uno nuevo.
        </p>
        <a
          href="tel:+18013752207"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 22px', borderRadius: 10,
            background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.30)',
            color: '#06B6D4', fontSize: 15, fontWeight: 700, textDecoration: 'none',
          }}
        >
          📞 (801) 375-2207
        </a>
      </div>
    </div>
  );
}

function AlreadyCompleted({ firstName, caseCode, token }: { firstName: string; caseCode: string; token: string }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a1224', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg,#10B981,#06B6D4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, margin: '0 auto 20px',
          boxShadow: '0 0 40px rgba(16,185,129,0.35)',
        }}>✓</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#10B981', marginBottom: 12 }}>
          ¡Ya registrado, {firstName}!
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
          Tu formulario para el caso{' '}
          <strong style={{ color: '#A5B4FC', fontFamily: 'monospace' }}>{caseCode}</strong>{' '}
          ya fue completado. El equipo de Precision Medical se comunicará contigo pronto.
        </p>
        <a
          href={`/c/${token}?reopen=1`}
          style={{
            display: 'block', width: '100%', padding: '13px',
            background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.30)',
            borderRadius: 12, color: '#06B6D4', fontSize: 15, fontWeight: 700,
            textDecoration: 'none', marginBottom: 12, boxSizing: 'border-box',
          }}
        >
          📋 Ver / actualizar mi información
        </a>
        <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: 12 }}>
          ¿Preguntas? (801) 375-2207
        </p>
      </div>
    </div>
  );
}
