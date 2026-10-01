/**
 * "Revisado": la diferencia entre "no tiene" y "nadie preguntó".
 *
 * Una lista vacía de alergias o de medicinas dice dos cosas opuestas según
 * quién la mire: que el paciente no tiene nada, o que nadie le preguntó. En
 * Medusa lo resolvían con una casilla (NKA / "No medication records") y el
 * personal la marca delante del paciente. Acá es lo mismo, con el sello de quién
 * y cuándo, guardado en la ficha (`medicalHistory.noKnownAllergies` /
 * `noCurrentMedications`) para que lo vean todas las pantallas.
 *
 * Es un módulo PURO a propósito (sin imports de servidor): lo usan el servidor,
 * Pacientes, Day Admission y Mi Día, y tener una sola función es lo que evita que
 * dos pantallas respondan distinto a la misma pregunta.
 */

/** El sello. `by` lo pone el SERVIDOR con la sesión; lo que mande el cliente se ignora. */
export interface SelloRevision { at: string; by?: string }

export interface HistorialRevisable {
  allergies?: string | null;
  medications?: Array<{ status?: string }> | null;
  noKnownAllergies?: SelloRevision | null;
  noCurrentMedications?: SelloRevision | null;
  /** Donde vivía la casilla antes de que existiera el sello. Se sigue leyendo. */
  visitInfo?: { noCurrentMeds?: boolean } | null;
}

export type EstadoRevision =
  /** Hay datos cargados: la casilla "no tiene" no aplica. */
  | 'TIENE'
  /** El personal confirmó que no tiene (con sello, o la casilla vieja sin él). */
  | 'CONFIRMADO_NO_TIENE'
  /** Solo el paciente lo dijo en su formulario; el personal no lo confirmó. */
  | 'DECLARADO_NO_TIENE'
  /** Nadie lo preguntó. */
  | 'SIN_REVISAR';

export function estadoAlergias(
  h: HistorialRevisable | null | undefined,
  declaradas?: { has: boolean; text: string | null } | null,
): EstadoRevision {
  if ((h?.allergies ?? '').trim()) return 'TIENE';
  if (h?.noKnownAllergies) return 'CONFIRMADO_NO_TIENE';
  // Si dijo que SÍ tiene en el formulario, no es "sin revisar": hay un dato, y
  // vive en el formulario. Que el personal lo pase a la ficha es otro paso.
  if (declaradas?.has && (declaradas.text ?? '').trim()) return 'TIENE';
  if (declaradas && !declaradas.has) return 'DECLARADO_NO_TIENE';
  return 'SIN_REVISAR';
}

export function estadoMedicinas(h: HistorialRevisable | null | undefined): EstadoRevision {
  if ((h?.medications ?? []).some(m => m.status !== 'HISTORY')) return 'TIENE';
  if (h?.noCurrentMedications || h?.visitInfo?.noCurrentMeds) return 'CONFIRMADO_NO_TIENE';
  return 'SIN_REVISAR';
}

/** ¿Cuenta como resuelto para no mostrar el aviso de "sin revisar"? */
export const estaRevisado = (e: EstadoRevision): boolean => e !== 'SIN_REVISAR';
