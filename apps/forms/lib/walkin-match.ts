/**
 * Reglas de /api/walkin que no tocan la base: se prueban solas.
 *
 * El kiosco es PÚBLICO y solo puede unirse a una ficha existente si quien lo usa
 * prueba que es esa persona: teléfono (ya filtrado por la consulta) + apellido +
 * fecha de nacimiento. Ver el comentario largo de la ruta.
 */

/** ¿Es una fecha de calendario real, entre 1900 y hoy? */
export function fechaNacimientoValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return false;
  return y >= 1900 && t.getTime() <= Date.now();
}

/** Compara apellidos sin mayúsculas, acentos ni espacios ("García" = "garcia"). */
export function normalizarApellido(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');
}

export interface Candidato { id: string; lastName: string | null; dateOfBirth: Date | null }

/**
 * La ficha que se puede reutilizar, o null.
 *
 * Exige AMBAS cosas: mismo día de nacimiento y mismo apellido. El nacimiento se
 * guarda como instante UTC, así que el día de calendario es el de `toISOString()`
 * sin zona (con `America/Denver` un nacido el 1-ene saldría 31-dic).
 *
 * `descifrar` va por parámetro para que este módulo no importe nada de la app:
 * parte de los apellidos migrados del v2 llegan cifrados (`e:…`).
 */
export function elegirFichaReutilizable(
  candidatos: Candidato[],
  dob: string,
  apellido: string,
  descifrar: (v: string | null) => string | null = v => v,
): { id: string } | null {
  const objetivo = normalizarApellido(apellido);
  const hit = candidatos.find(p =>
    p.dateOfBirth?.toISOString().slice(0, 10) === dob
    && normalizarApellido(descifrar(p.lastName)) === objetivo,
  );
  return hit ? { id: hit.id } : null;
}
