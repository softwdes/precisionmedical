/**
 * Audiencias de las notas de release.
 *
 * OJO: la audiencia NO es la app. `apps/back-office` sirve tres audiencias
 * distintas desde tres route groups — `(admin)`, `doctor` y `attorney` — y al
 * revés, la misma audiencia vive en varias apps: `doctor` esta en
 * `back-office/app/doctor` y tambien en `clinical/app/doctor`.
 *
 * Por eso quien monta el banner declara su audiencia explicitamente, y el
 * filtrado se resuelve en el render por ruta, no por deployment.
 */
export const AUDIENCES = [
  'admin',
  'doctor',
  'attorney',
  'clinic',
  'timeclock',
  'patient',
] as const;

export type Audience = (typeof AUDIENCES)[number];

export function isAudience(value: string): value is Audience {
  return (AUDIENCES as readonly string[]).includes(value);
}

/**
 * Audiencias que NUNCA reciben notas de release.
 *
 * A un paciente llenando su intake no le decimos que se corrigio un cargo
 * CPT duplicado. El banner igual aparece para que reciba el bundle nuevo,
 * pero sin lista de cambios.
 */
export const SILENT_AUDIENCES: readonly Audience[] = ['patient'];

export function audienceGetsNotes(audience: Audience): boolean {
  return !SILENT_AUDIENCES.includes(audience);
}
