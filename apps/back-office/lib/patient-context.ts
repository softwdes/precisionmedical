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
import { conDetalleDeReceta, type MedicationConDetalle } from './medication-details';
import { fotosConRespaldo } from './fotos-identidad';

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
  /**
   * Selfie del paciente, ya firmada — la resuelve `buildPatientContextConRecetas`.
   * El provider confirma que atiende a quien cree; el builder sincrónico la deja
   * en null porque no consulta.
   */
  photoUrl: string | null;
  insurance: {
    primaryName: string | null;
    primaryPolicy: string | null;
    primaryType: string | null;
    secondaryName: string | null;
    secondaryPolicy: string | null;
  };
  history: {
    allergies: string | null;
    /**
     * Lo que el PACIENTE declaró en el formulario de intake — otra fuente, y
     * hasta hoy invisible en toda la app.
     *
     * `intake_submissions.allergies` lo escribe el paciente desde forms, y
     * medido el 2026-09-14 lo leía UN solo lugar en todo el repo: el PDF del
     * intake. Los demás hacen `select: { id: true }` — solo preguntan si el
     * formulario existe. Así que alguien podía declarar una alergia y el panel
     * de la nota seguía diciendo "sin alergias conocidas".
     *
     * NO se mezcla con `allergies` a propósito: uno es lo que el paciente dijo
     * y el otro lo que el staff registró. Pisar el segundo con el primero sería
     * dar por confirmado un dato que nadie revisó; esconderlo es lo que
     * estábamos haciendo. Se muestran los dos, cada uno con su origen.
     *
     * `null` = el caso no tiene formulario de intake.
     * `has: false` = el paciente contestó que NO tiene alergias (es una
     * confirmación, no una ausencia de dato — por eso se distingue).
     */
    allergiesDeclared: { has: boolean; text: string | null } | null;
    problems: Array<{ condition: string; status?: string; diagnosedAt?: string }>;
    /**
     * Con el detalle de la receta pegado cuando la entrada salió de ScriptSure
     * — lo arma `buildPatientContextConRecetas`. El builder sincrónico las deja
     * como están en el JSON (sin `rx`), que es lo que ve quien no hace el join.
     */
    medications: MedicationConDetalle[];
    surgeries: Array<{ procedure: string; date?: string }>;
    familyHistory: Array<{ relation: string; condition: string; notes?: string }>;
    socialHistory: {
      work?: string; children?: string; tobacco?: string; alcohol?: string; drugs?: string;
      /** Los comentarios por campo y el general — ver `socialHistory` en
       *  `medical-history-schema`. Sin esto el matiz se queda en la ficha y no
       *  llega a la consulta, que es donde se lee el historial. */
      workNote?: string; childrenNote?: string;
      tobaccoNote?: string; alcoholNote?: string; drugsNote?: string; notes?: string;
    } | null;
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
  // Las alergias que declaró el paciente — ver `allergiesDeclared` en el tipo.
  intakeSubmission: { select: { hasAllergies: true, allergies: true } },
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
  /**
   * El JSON de consentimientos del intake, de donde salen las fotos del CASO.
   * Opcional: quien no lo traiga sigue viendo la foto de la ficha, que es como
   * funcionaba antes.
   */
  consentsData?: unknown;
  /**
   * El formulario de intake del caso. Opcional: quien no lo traiga sigue viendo
   * solo lo del historial, que es como funcionaba antes.
   */
  intakeSubmission?: { hasAllergies: boolean; allergies: string | null } | null;
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
    // La resuelve la capa async; acá no se consulta nada.
    photoUrl: null,
    insurance: {
      primaryName: c?.primaryInsurance?.name ?? null,
      primaryPolicy: c?.primaryPolicyNumber ?? null,
      primaryType: c?.primaryInsurance?.type ?? null,
      secondaryName: c?.secondaryInsurance?.name ?? null,
      secondaryPolicy: c?.secondaryPolicyNumber ?? null,
    },
    history: {
      allergies: mh.allergies ?? null,
      allergiesDeclared: c?.intakeSubmission
        ? {
            has: c.intakeSubmission.hasAllergies,
            text: c.intakeSubmission.allergies?.trim() || null,
          }
        : null,
      problems: mh.problems ?? [],
      medications: mh.medications ?? [],
      surgeries: mh.surgeries ?? [],
      familyHistory: mh.familyHistory ?? [],
      socialHistory: mh.socialHistory ?? null,
    },
  };
}

/**
 * El contexto con la dosis, las indicaciones, la cantidad, la farmacia y el
 * estado de envío pegados a cada medicamento que salió de una receta
 * electrónica.
 *
 * Es una capa aparte y no parte del builder porque el builder es sincrónico y
 * puro (arma el payload con lo que ya se leyó); esto necesita una consulta más.
 * Quien muestre la lista de medicamentos tiene que usar ESTA — si no, la
 * pantalla queda con el nombre pelado, que es de donde venimos.
 */
export async function buildPatientContextConRecetas(
  p: PatientContextInput,
  c: PatientContextCaseInput | null,
): Promise<PatientContext> {
  const ctx = buildPatientContext(p, c);
  /**
   * La foto va acá por la misma razón que las recetas: necesita una consulta y
   * el builder de arriba es sincrónico.
   *
   * ─── Por qué MISMA fuente que el expediente (2026-09-14) ──────────────────
   *
   * Antes se pedía SOLO la de la persona (`patient_documents`), con el
   * argumento de que la del caso vive dentro de `consentsData` y traer ese JSON
   * entero para sacarle una URL no se pagaba. Ese argumento ya no vale: **los
   * dos callers —Day Admission y la consulta— ya seleccionan `consentsData`**
   * para sus propias vistas, así que el JSON está cargado y la foto sale gratis.
   *
   * El síntoma era visible: el mismo paciente mostraba su foto en el expediente
   * y las iniciales en la nota, porque el expediente usa `fotosConRespaldo`
   * (ficha + intake) y acá se usaba solo la ficha. Con el intake de v3 cargando
   * selfies, el caso es la única fuente para los pacientes nuevos.
   */
  const fotosDelCaso = (() => {
    const cd = (c as { consentsData?: unknown } | null)?.consentsData as Record<string, unknown> | null | undefined;
    return (cd?.photos as Record<string, string> | undefined) ?? {};
  })();

  const [medications, fotos] = await Promise.all([
    conDetalleDeReceta(p.id, ctx.history.medications),
    fotosConRespaldo(p.id, fotosDelCaso).catch(() => ({} as Record<string, string>)),
  ]);
  return {
    ...ctx,
    photoUrl: fotos.selfie ?? null,
    history: { ...ctx.history, medications },
  };
}
