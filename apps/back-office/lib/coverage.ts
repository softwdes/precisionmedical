/**
 * Cobertura de un caso: ¿quién paga esta visita?
 *
 * Dato OPERATIVO para el staff clínico — recepción, asistentes y doctores lo
 * necesitan en el punto de atención para saber qué precio cotizar. No es una
 * feature de facturación.
 *
 * Antes de esto había tres fuentes que podían contradecirse y ninguna era
 * autoridad:
 *   1. `Case.consentsData.insurances` — el JSON del intake / diálogo "Seguros".
 *      Carrier en texto libre, entradas a medio llenar, sin noción de verificado.
 *   2. `Case.primaryInsuranceId` → `InsuranceCarrier` — el carrier normalizado.
 *   3. Las fotos de la tarjeta.
 * Un paciente podía tener Aetna cargado en el JSON y el caso sin
 * `primaryInsuranceId`, y el sistema "no sabía" que tenía seguro.
 *
 * `Case.coverageType` es ahora la respuesta, y este módulo la lee junto con las
 * otras dos fuentes para poder SUGERIR cuando nadie la respondió todavía.
 *
 * `resolveCoverage` es una función PURA sobre campos ya traídos — no hace
 * queries. Mi Día pinta 20 filas y cada round-trip a la base cuesta ~150 ms
 * (ver perf-auth-getuser-network): el costo tiene que ser cero.
 */

import type { Prisma } from '@precision-medical/database';

export type CoverageType = 'UNKNOWN' | 'INSURANCE' | 'SELF_PAY' | 'LIEN';
export type CoverageVerifyMethod = 'DECLARED' | 'VERIFIED';

/**
 * `select` de Prisma para las vistas de LISTA (Mi Día, cola, tablas).
 *
 * Deliberadamente sin `consentsData`: ese JSON trae todos los consentimientos y
 * multiplicado por 20 filas es payload que no se usa. La sugerencia derivada del
 * intake solo hace falta en el diálogo, que trae un caso solo.
 */
/**
 * Las columnas de cobertura SOLAS, sin `primaryInsurance`.
 *
 * Existe por una trampa concreta: cuatro pantallas —la consulta del doctor, Day
 * Admission, el listado de citas y el detalle del caso— NO podían usar
 * `COVERAGE_LIST_SELECT` porque ya traen `primaryInsurance` con más campos y el
 * spread lo pisaba. Así que copiaban las columnas a mano, y cuando se agregó
 * `coverageNote` se olvidó en las cuatro. `tsc` no lo delata: los campos de
 * `CoverageInput` son todos opcionales, así que compila limpio y el dato
 * simplemente no aparece.
 *
 * Con las columnas separadas del `include` cualquiera puede hacer
 * `...COVERAGE_FIELDS` y agregar su propio `primaryInsurance`. El próximo campo
 * de cobertura se agrega en UN lugar.
 */
export const COVERAGE_FIELDS = {
  coverageType: true,
  coverageVerifyMethod: true,
  coverageVerifiedAt: true,
  coverageVerifiedByName: true,
  coverageCarrierName: true,
  coverageNote: true,
} as const;

export const COVERAGE_LIST_SELECT = {
  ...COVERAGE_FIELDS,
  primaryInsurance: { select: { name: true } },
} as const;

/** Entrada de seguro del wizard de intake (`consentsData.insurances`). */
interface IntakeInsurance {
  insType?: string;
  carrier?: string;
  policyId?: string;
  fullLien?: boolean;
}

export interface CoverageInput {
  coverageType?: CoverageType | null;
  coverageVerifyMethod?: CoverageVerifyMethod | null;
  coverageVerifiedAt?: Date | null;
  coverageVerifiedByName?: string | null;
  coverageCarrierName?: string | null;
  coverageNote?: string | null;
  primaryInsurance?: { name: string } | null;
  /** Solo en vistas de detalle — habilita la sugerencia desde el intake. */
  consentsData?: Prisma.JsonValue | null;
  caseType?: string | null;
}

export interface CoverageState {
  type: CoverageType;
  /** Alguien la respondió explícitamente (o el backfill la derivó del carrier). */
  answered: boolean;
  /**
   * `null` mientras nadie respondió · `DECLARED` = lo dijo el paciente o vino
   * del intake · `VERIFIED` = alguien llamó y la aseguradora confirmó que está
   * activa. La clínica a veces llama y a veces no; el sistema no debe fingir
   * que siempre lo hizo.
   */
  verifyMethod: CoverageVerifyMethod | null;
  verifiedAt: Date | null;
  verifiedByName: string | null;
  /** Normalizado > texto libre > lo que haya en el intake. */
  carrierName: string | null;
  /**
   * Nota libre que dejó quien respondió: "no trajo la tarjeta", "el hijo paga".
   * Viaja hasta el chip a propósito — una nota que hay que abrir un diálogo para
   * leer no la lee nadie, y el doctor la necesita con el paciente delante.
   */
  note: string | null;
  /**
   * Qué responder si nadie respondió. Se usa para PRE-SELECCIONAR la opción del
   * diálogo, nunca para dar la pregunta por contestada.
   */
  suggestion: CoverageType | null;
  /** De dónde salió la sugerencia, para poder explicarla en el UI. */
  suggestionSource: 'INTAKE_MEDICAL' | 'INTAKE_LIEN' | 'CASE_TYPE_MVA' | null;
}

/** Las entradas de seguro del intake, si el JSON las trae en forma usable. */
export function intakeInsurances(consentsData: Prisma.JsonValue | null | undefined): IntakeInsurance[] {
  if (!consentsData || typeof consentsData !== 'object' || Array.isArray(consentsData)) return [];
  const raw = (consentsData as Record<string, unknown>).insurances;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is IntakeInsurance => !!e && typeof e === 'object' && !Array.isArray(e));
}

/**
 * Una entrada del intake cuenta como seguro médico solo con carrier Y póliza.
 * Con el carrier suelto no alcanza: el wizard guarda la fila en cuanto se
 * escribe algo, así que hay entradas con solo un nombre a medio tipear.
 */
function isUsableMedical(e: IntakeInsurance): boolean {
  return (e.insType ?? '').toUpperCase() === 'MEDICAL'
    && !!e.carrier?.trim()
    && !!e.policyId?.trim();
}

export function resolveCoverage(input: CoverageInput): CoverageState {
  const stored = input.coverageType ?? 'UNKNOWN';
  const entries = intakeInsurances(input.consentsData);
  const medical = entries.find(isUsableMedical);

  const carrierName =
    input.primaryInsurance?.name?.trim()
    || input.coverageCarrierName?.trim()
    || medical?.carrier?.trim()
    || null;

  if (stored !== 'UNKNOWN') {
    return {
      type: stored,
      answered: true,
      verifyMethod: input.coverageVerifyMethod ?? null,
      verifiedAt: input.coverageVerifiedAt ?? null,
      verifiedByName: input.coverageVerifiedByName?.trim() || null,
      carrierName,
      note: input.coverageNote?.trim() || null,
      suggestion: null,
      suggestionSource: null,
    };
  }

  // Nadie respondió: se sugiere, no se decide. Un caso MVA con lien declarado no
  // es lo mismo que un MVA cualquiera — el lien se firma, no se asume por tipo
  // de caso, así que el tipo solo sugiere en último lugar.
  let suggestion: CoverageType | null = null;
  let source: CoverageState['suggestionSource'] = null;
  if (medical) {
    suggestion = 'INSURANCE';
    source = 'INTAKE_MEDICAL';
  } else if (entries.some((e) => e.fullLien)) {
    suggestion = 'LIEN';
    source = 'INTAKE_LIEN';
  } else if ((input.caseType ?? '') === 'MVA') {
    suggestion = 'LIEN';
    source = 'CASE_TYPE_MVA';
  }

  return {
    type: 'UNKNOWN',
    answered: false,
    verifyMethod: null,
    verifiedAt: null,
    verifiedByName: null,
    carrierName,
    note: input.coverageNote?.trim() || null,
    suggestion,
    suggestionSource: source,
  };
}

/**
 * Qué catálogo abre primero el picker de cargos.
 *
 * ORDENA, no filtra: las dos listas se muestran siempre (decisión de Erick
 * 2026-08-04). Un asegurado compra cosas de bolsillo — labs send-out, férulas, a
 * veces una inyección — y con la lista escondida el asistente no podría cobrarla.
 */
export function preferredCatalog(type: CoverageType): 'INSURANCE' | 'CASH' {
  return type === 'INSURANCE' ? 'INSURANCE' : 'CASH';
}

/** Payload serializable para cruzar de server component a client component. */
export interface CoverageDTO {
  type: CoverageType;
  answered: boolean;
  verifyMethod: CoverageVerifyMethod | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  carrierName: string | null;
  note: string | null;
  suggestion: CoverageType | null;
  suggestionSource: CoverageState['suggestionSource'];
}

export function serializeCoverage(state: CoverageState): CoverageDTO {
  return { ...state, verifiedAt: state.verifiedAt?.toISOString() ?? null };
}
