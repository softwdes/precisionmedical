/**
 * ¿Está completo y firmado el intake de un caso?
 *
 * Vive acá porque lo pregunta más de una pantalla:
 *   · la lista de pacientes, en la barra de progreso de cada fila (hoy);
 *   · el centinela del dashboard, que va a armar la cola de los que llegan sin
 *     firmar — todavía no está en el repo;
 *   · el reporte, el día que se quiera medir la conversión.
 *
 * Es la misma razón por la que `lib/vigia/queue.ts` no vive en su pantalla: si
 * cada una define "incompleto" por su lado, el número de la fila y el de la cola
 * se contradicen en cuanto alguien toque un chequeo, y el staff deja de creerle
 * a los dos. Acá está la definición y nada más — **los colores no**, que son
 * decisión de cada pantalla.
 *
 * Nació dentro de `patients-client.tsx` como `calcIntakeProgress`, un componente
 * de cliente de 2.900 líneas al que el servidor no puede llamar.
 *
 * Las formas de entrada son a propósito laxas en las fechas (`string | Date`):
 * del lado del cliente llegan como ISO desde la API y del lado del servidor como
 * `Date` de Prisma, y acá solo se mira si hay algo o no.
 */

/** Las siete secciones del intake. El orden es el del formulario. */
export type MissingKey =
  | 'missingPersonal'
  | 'missingEmergency'
  | 'missingDemographics'
  | 'missingAccident'
  | 'missingInsurance'
  | 'missingMedicalHistory'
  | 'missingConsents';

/** Cuántas secciones tiene el intake — el denominador del porcentaje. */
export const SECCIONES_INTAKE = 7;

type Fecha = string | Date | null | undefined;

export interface CasoIntake {
  /** Sellado cuando el paciente termina el formulario. Atajo a 100%. */
  intakeFormCompletedAt: Fecha;
  /** El blob del portal: consentimientos, firma y los seguros médicos. */
  consentsData: Record<string, unknown> | null | undefined;
  accidentDate: Fecha;
  accidentType?: string | null;
  /**
   * `!!case.intakeSubmission` — la historia médica existe.
   *
   * Opcional porque la fila de la lista de pacientes lo trae así, y ausente
   * cuenta como que FALTA: es exactamente lo que hacía el `!c.hasIntakeSubmission`
   * de antes. Si algún día hay una pantalla que no puede resolverlo, tiene que
   * mandar `false` a conciencia y no omitirlo por descuido.
   */
  hasIntakeSubmission?: boolean;
  /** `!!case.autoInsurance` — el de auto vive en su propia tabla. */
  hasAutoInsurance?: boolean;
}

export interface PacienteIntake {
  addressLine1: string | null | undefined;
  addressCity: string | null | undefined;
  dateOfBirth: Fecha;
  emergencyContactName: string | null | undefined;
  race: string | null | undefined;
  sex: string | null | undefined;
  maritalStatus: string | null | undefined;
}

/**
 * ¿Los consentimientos están aceptados Y firmados?
 *
 * Las tres casillas sin la firma no valen: el `financialSignatureSvg` es lo
 * único que convierte un checkbox en un documento.
 */
export function consentimientosFirmados(consentsData: CasoIntake['consentsData']): boolean {
  const cd = consentsData ?? {};
  return !!(cd.hipaa && cd.treatment && cd.financial && cd.financialSignatureSvg);
}

/**
 * La pregunta del centinela: ¿este caso está listo para que el paciente llegue?
 *
 * Dos caminos válidos, y cualquiera alcanza: el formulario cerrado de una
 * (`intakeFormCompletedAt`) o los consentimientos firmados. No se exigen los
 * dos porque hay casos viejos con la firma y sin el sello, y exigir ambos los
 * metería a la cola para siempre sin que nadie pueda hacer nada.
 */
export function intakeFirmado(c: CasoIntake): boolean {
  return !!c.intakeFormCompletedAt || consentimientosFirmados(c.consentsData);
}

export interface ProgresoIntake {
  /** 0 a 100, redondeado. */
  pct: number;
  /** Las secciones que faltan, en el orden del formulario. */
  faltan: MissingKey[];
}

/** Qué le falta al intake de un caso, y cuánto lleva hecho. */
export function progresoIntake(c: CasoIntake, p: PacienteIntake): ProgresoIntake {
  // El formulario cerrado gana: si el paciente lo terminó, no se audita campo
  // por campo. Un dato vacío ahí es un dato que el formulario no pedía.
  if (c.intakeFormCompletedAt) return { pct: 100, faltan: [] };

  const cd = c.consentsData ?? {};
  const faltan: MissingKey[] = [];

  // 1 · Info personal — dirección + fecha de nacimiento
  if (!p.addressLine1 || !p.addressCity || !p.dateOfBirth) faltan.push('missingPersonal');
  // 2 · Contacto de emergencia
  if (!p.emergencyContactName) faltan.push('missingEmergency');
  // 3 · Demografía — raza, sexo, estado civil
  if (!p.race || !p.sex || !p.maritalStatus) faltan.push('missingDemographics');
  // 4 · Info del accidente — la fecha registrada en el caso
  if (!c.accidentDate && !c.accidentType) faltan.push('missingAccident');
  // 5 · Seguros — los MEDICAL siguen en `consentsData`, el de auto vive en su
  //     propia tabla (`case_auto_insurances`). Cuenta cualquiera de los dos.
  const ins = cd.insurances;
  const tieneMedical = Array.isArray(ins) && ins.length > 0;
  if (!tieneMedical && !c.hasAutoInsurance) faltan.push('missingInsurance');
  // 6 · Historia médica — el IntakeSubmission existe
  if (!c.hasIntakeSubmission) faltan.push('missingMedicalHistory');
  // 7 · Consentimientos + firma
  if (!consentimientosFirmados(c.consentsData)) faltan.push('missingConsents');

  const hechas = SECCIONES_INTAKE - faltan.length;
  return { pct: Math.round((hechas / SECCIONES_INTAKE) * 100), faltan };
}
