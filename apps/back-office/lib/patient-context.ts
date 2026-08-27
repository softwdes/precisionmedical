/**
 * Contexto clínico del paciente — el payload del panel izquierdo de la visita.
 *
 * Existe para que la consulta del doctor y Day Admission muestren **lo mismo**
 * (Erick, 2026-08-13: "el asistente debe ver lo mismo que el doctor"). El panel
 * se armaba a mano dentro del server component del doctor, así que el asistente
 * no lo tenía; copiarlo del otro lado habría creado dos versiones que divergen
 * en la primera columna que alguien agregue.
 *
 * Acá viven las tres piezas: el tipo, los fragmentos de `select` de Prisma y el
 * armador. Los dos consumidores usan los tres, así que el payload es idéntico
 * por construcción, no por disciplina.
 */

import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { nombreProviderONull } from './provider-name';

// ─── El tipo que consume el panel ─────────────────────────────────────────────

export interface PatientContext {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  maritalStatus: string | null;
  preferredLanguage: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  guardianName: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  referredBy: string | null;
  preferredPharmacy: string | null;
  employer: string | null;
  providerName: string | null;
  insurance: {
    primaryName: string | null;
    primaryPolicy: string | null;
    primaryType: string | null;
    secondaryName: string | null;
    secondaryPolicy: string | null;
  };
  history: {
    allergies: string | null;
    problems: Array<{ condition: string; status?: string; diagnosedAt?: string }>;
    medications: Array<{
      id?: string; name: string; dose?: string; instructions?: string; status: string;
      prescribedBy?: string; externalPrescriber?: boolean;
    }>;
    surgeries: Array<{ procedure: string; date?: string }>;
    familyHistory: Array<{ relation: string; condition: string }>;
    socialHistory: { work?: string; children?: string; tobacco?: string; alcohol?: string; drugs?: string } | null;
  };
}

/** El historial clínico como lo guarda `Patient.medicalHistory` (JSON). */
interface MedicalHistoryJson {
  allergies?: string;
  problems?: PatientContext['history']['problems'];
  medications?: PatientContext['history']['medications'];
  surgeries?: PatientContext['history']['surgeries'];
  familyHistory?: PatientContext['history']['familyHistory'];
  socialHistory?: PatientContext['history']['socialHistory'];
  visitInfo?: { referredBy?: string };
}

// ─── Fragmentos de select ─────────────────────────────────────────────────────

/** Campos del paciente que necesita el panel. Va dentro de `patient: { select }`. */
export const PATIENT_CONTEXT_SELECT = {
  id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true,
  phone: true, phone2: true, email: true,
  maritalStatus: true, preferredLanguage: true,
  guardianName: true, emergencyContactName: true, emergencyContactPhone: true,
  preferredPharmacy: true, employer: true, referralSource: true,
  medicalHistory: true,
  providerReferrer: { select: { firstName: true, lastName: true } },
};

/**
 * Campos del CASO que necesita el panel (los seguros del paciente salen de acá).
 *
 * Se spreadea con cuidado: los dos callers ya traen `primaryInsurance` con más
 * columnas para sus propias vistas, y un spread después las pisaría. Poner este
 * fragmento PRIMERO y el select propio después.
 */
export const PATIENT_CONTEXT_CASE_SELECT = {
  primaryPolicyNumber: true, secondaryPolicyNumber: true,
  primaryInsurance: { select: { name: true, type: true } },
  secondaryInsurance: { select: { name: true } },
};

// ─── Armador ──────────────────────────────────────────────────────────────────

/** Lo mínimo que el armador necesita del paciente (estructural, no de Prisma). */
export interface PatientContextInput {
  id: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | string | null;
  sex: string | null;
  maritalStatus: string | null;
  preferredLanguage: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  guardianName: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferredPharmacy: string | null;
  employer: string | null;
  referralSource: string | null;
  medicalHistory: unknown;
  providerReferrer: { firstName: string; lastName: string } | null;
}

/** Lo mínimo del caso. `null` cuando la cita no tiene caso. */
export interface PatientContextCaseInput {
  primaryPolicyNumber: string | null;
  secondaryPolicyNumber: string | null;
  primaryInsurance: { name: string; type?: string | null } | null;
  secondaryInsurance: { name: string } | null;
}

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

/**
 * Arma el payload del panel.
 *
 * Los campos de PHI pasan por `dec()`: parte de la data migrada del v2 llega con
 * el prefijo de cifrado `e:` y sin esto el panel mostraría el criptograma.
 */
export function buildPatientContext(
  p: PatientContextInput,
  c: PatientContextCaseInput | null,
): PatientContext {
  const mh = (p.medicalHistory ?? {}) as MedicalHistoryJson;

  return {
    id: p.id,
    firstName: dec(p.firstName) ?? '',
    lastName: dec(p.lastName) ?? '',
    dateOfBirth: iso(p.dateOfBirth),
    sex: p.sex ?? null,
    maritalStatus: p.maritalStatus ?? null,
    preferredLanguage: p.preferredLanguage ?? null,
    phone: dec(p.phone) ?? null,
    phone2: dec(p.phone2) ?? null,
    email: p.email ?? null,
    guardianName: dec(p.guardianName) ?? null,
    emergencyContactName: dec(p.emergencyContactName) ?? null,
    emergencyContactPhone: dec(p.emergencyContactPhone) ?? null,
    // El del intake gana sobre el del alta: es lo que el paciente contestó.
    referredBy: mh.visitInfo?.referredBy ?? p.referralSource ?? null,
    preferredPharmacy: dec(p.preferredPharmacy) ?? null,
    employer: dec(p.employer) ?? null,
    providerName: nombreProviderONull(p.providerReferrer),
    insurance: {
      primaryName: c?.primaryInsurance?.name ?? null,
      primaryPolicy: c?.primaryPolicyNumber ?? null,
      primaryType: c?.primaryInsurance?.type ?? null,
      secondaryName: c?.secondaryInsurance?.name ?? null,
      secondaryPolicy: c?.secondaryPolicyNumber ?? null,
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
}
