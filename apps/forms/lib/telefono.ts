/**
 * Teléfonos norteamericanos (NANP): validar, formatear y precargar.
 *
 * ⚠️ `intake-wizard.tsx` tiene su propia copia de estas cuatro funciones. NO se
 * unificó ahora a propósito: ese archivo es el formulario de admisión completo
 * y acaba de costar pacientes en producción esta semana, así que no se toca
 * para un refactor sin cambio de comportamiento. Cuando haya que editarlo por
 * una razón de verdad, que importe de acá y borre su copia.
 */

/**
 * Dígitos aprovechables de un teléfono NANP.
 *
 * Un `+1` o un `1` inicial es el código de país de Norteamérica, no parte del
 * número: `+1-801-555-2944` son 11 dígitos pero es un teléfono válido. La
 * clínica tiene varios pacientes guardados en ese formato, y rechazarlos por
 * longitud les mostraba "teléfono inválido" sobre un dato que nunca tocaron.
 */
export function nanpDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
}

export function isValidNANP(raw: string): boolean {
  const digits = nanpDigits(raw);
  if (digits.length !== 10) return false;
  const area = digits[0];
  const exchange = digits[3];
  return area >= '2' && exchange >= '2';
}

export function formatPhone(raw: string): string {
  const digits = nanpDigits(raw).slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Teléfono venido de la DB, listo para precargar en un formulario.
 *
 * La data migrada del v2 tiene el campo teléfono con cosas que no son números:
 * `NONE`, `N/A`, `NA`, `GERENTE DE PISO`, y el `0000000000` que dejaba el
 * placeholder viejo del back-office. Precargar eso deja al paciente trabado con
 * un error de validación sobre un valor que él no escribió.
 *
 * Si no hay 10 dígitos aprovechables, el campo arranca VACÍO — es opcional, así
 * que vacío es un estado válido y el paciente puede escribir el suyo.
 */
export function phoneFromDb(raw: string | null | undefined): string {
  if (!raw) return '';
  // Se valida con isValidNANP, no solo la longitud: `0000000000` tiene 10
  // dígitos y pasaría un chequeo de largo, pero un área code que empieza en 0
  // es inválido y volvería a trabar al paciente.
  if (!isValidNANP(raw)) return '';
  return formatPhone(raw);
}
