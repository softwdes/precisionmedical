/**
 * Normalización de teléfonos — fuente única para todo el módulo de llamadas.
 *
 * El sistema guarda los números en TRES formatos distintos según de dónde
 * vengan, y compararlos crudos nunca matchea:
 *
 *   - `Patient.phone`        → `(801) 555-1121`  (lo que escribe recepción)
 *   - `CallLog.toNumber`     → `+18015551121`    (E.164, lo que exige Twilio)
 *   - `CallLog.fromNumber`   → `+18015551121` en entrantes reales, pero
 *                              `client:user-<uuid>` cuando la llamada la
 *                              inicia el Device del navegador
 *
 * `phoneKey()` es la clave canónica para comparar: los últimos 10 dígitos
 * (número nacional NANP), que sobrevive al `+1`, a los paréntesis y al guión.
 */

/** Solo los dígitos de un número, sin formato. */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}

/**
 * Clave canónica de comparación: los últimos 10 dígitos.
 *
 * Devuelve '' cuando no hay suficientes dígitos para identificar un número
 * (extensiones internas, `client:...`, vacíos) — así dos claves vacías nunca
 * se consideran "el mismo número".
 */
export function phoneKey(raw: string | null | undefined): string {
  const digits = phoneDigits(raw);
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/** Formato E.164 para marcar por Twilio. */
export function toE164(raw: string): string {
  const digits = phoneDigits(raw);
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/**
 * Formato de lectura `(801) 555-1121`.
 * Si el número no es un NANP de 10 dígitos se devuelve tal cual — es preferible
 * mostrar un internacional crudo que recortarlo mal.
 */
export function formatUsPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const key = phoneKey(raw);
  if (!key) return raw;
  return `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}`;
}
