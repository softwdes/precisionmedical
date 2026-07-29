/**
 * Edad y detección de menor de edad.
 *
 * Vive en el paquete compartido porque el cálculo estaba duplicado en dos
 * lugares con implementaciones distintas —
 * `apps/back-office/.../patient-create-dialog.tsx` y
 * `apps/forms/app/c/[token]/intake-wizard.tsx` — y de esas copias es de donde
 * salen las divergencias (mismo problema que tuvimos con los 5 generadores de
 * códigos antes de unificarlos en codes.ts).
 *
 * La mayoría de edad define quién puede firmar los consentimientos y el lien:
 * si el paciente es menor, firma su padre o apoderado. O sea que este cálculo
 * tiene consecuencias legales, no solo de UI.
 *
 * SIN DEPENDENCIAS a propósito — se importa desde client components vía el
 * subpath `@precision-medical/database/age`. Importarlo del barrel `.` metería
 * PrismaClient en el bundle del browser, porque index.ts lo instancia.
 */

/** Edad legal a partir de la cual una persona puede firmar por sí misma (Utah). */
export const EDAD_ADULTO = 18;

/**
 * Edad en años cumplidos. `null` si no hay fecha o es inválida.
 *
 * Parsea `YYYY-MM-DD` a mano en lugar de `new Date(str)` a propósito: el
 * constructor interpreta esa forma como UTC medianoche, y en Mountain Time
 * (UTC-6/-7) eso cae el día anterior — un cumpleaños del día 1 se leería como
 * el último día del mes previo. Es la misma clase de bug de zona horaria que
 * ya nos rompió las horas de las citas.
 */
export function calcAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;

  let y: number, m: number, d: number;
  if (dob instanceof Date) {
    if (Number.isNaN(dob.getTime())) return null;
    y = dob.getUTCFullYear();
    m = dob.getUTCMonth() + 1;
    d = dob.getUTCDate();
  } else {
    const parts = dob.slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
    [y, m, d] = parts as [number, number, number];
  }

  if (!y || !m || !d) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  const difMes = hoy.getMonth() + 1 - m;
  if (difMes < 0 || (difMes === 0 && hoy.getDate() < d)) edad--;

  // Fecha futura o absurda → tratarla como inválida en vez de devolver negativos
  if (edad < 0 || edad > 130) return null;
  return edad;
}

/**
 * `true` solo si hay fecha válida Y la edad es menor a 18.
 *
 * Sin fecha devuelve `false`, no `true`: no se puede afirmar que alguien es
 * menor por falta de dato. Por eso la fecha de nacimiento es obligatoria al
 * crear un paciente — es la única forma de que esto sea confiable.
 */
export function isMinor(dob: string | Date | null | undefined): boolean {
  const edad = calcAge(dob);
  return edad !== null && edad < EDAD_ADULTO;
}
