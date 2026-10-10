/**
 * Qué consentimientos del caso faltan por firmar.
 *
 * Una sola función para los tres lugares que lo muestran (Day Admission, My Day
 * y Pacientes) y para la página de confirmación de la cita: que todos digan
 * exactamente lo mismo. Pura, sin base de datos — recibe el `consentsData` ya leído.
 *
 * Los consentimientos son del CASO, no de la cita: una cita de seguimiento hereda
 * los que ya se firmaron (decisión de Erick 2026-10-09, hasta que digan lo contrario).
 *
 * La regla de "aceptado" es la misma que usa `apps/forms/app/confirmar/[token]/page.tsx`.
 */

export const CONSENTIMIENTOS = [
  'hipaa', 'assignedParties', 'treatment', 'financial', 'medicalHistory',
] as const;

export type LlaveConsentimiento = (typeof CONSENTIMIENTOS)[number];

function aceptado(consents: Record<string, unknown> | null, llave: string): boolean {
  const v = consents?.[llave];
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().length > 0 && v !== 'false';
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return !!v;
}

/** Las llaves que NO están aceptadas, en el orden del formulario. */
export function consentimientosFaltantes(consentsData: unknown): LlaveConsentimiento[] {
  const c = consentsData && typeof consentsData === 'object' ? (consentsData as Record<string, unknown>) : null;
  return CONSENTIMIENTOS.filter((k) => !aceptado(c, k));
}
