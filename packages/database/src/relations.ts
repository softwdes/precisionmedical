/**
 * Normalización de la relación del contacto de emergencia / apoderado.
 *
 * El problema que resuelve: la data del v2 guardaba la relación como **texto
 * libre**, y al migrarla quedaron 167 valores distintos en 1.180 filas — con
 * mayúsculas mezcladas, espacios al final, español, typos (`"Spuse"`,
 * `"Btother"`, `"Brofher"`, `"Eaposo"`), descripciones (`"Girlfriends dad"`) y
 * basura de pruebas (`"jkjk"`). Los desplegables de las dos apps solo aceptan
 * un catálogo cerrado, así que **ninguno de esos 167 valores matcheaba** y todos
 * caían en "Otro" + texto libre, incluidos los 145 `"Mother"` y los 124
 * `"Spouse"` que son perfectamente mapeables.
 *
 * Vive en el paquete compartido, no en cada app, por la misma razón que
 * `age.ts`: `apps/forms/.../intake-wizard.tsx` y
 * `apps/back-office/.../patient-edit-dialog.tsx` ya tenían **catálogos
 * distintos** (9 valores contra 6) y de las copias es de donde salen las
 * divergencias.
 *
 * SIN DEPENDENCIAS a propósito — se importa desde client components vía el
 * subpath `@precision-medical/database/relations`. Importarlo del barrel `.`
 * metería PrismaClient en el bundle del browser.
 */

/** Catálogo canónico. `EMPLOYER`/`NEIGHBOR` solo los ofrece el wizard de forms. */
export const RELATION_CODES = [
  'SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'FRIEND', 'EMPLOYER', 'NEIGHBOR', 'OTHER',
] as const;

export type RelationCode = typeof RELATION_CODES[number];

/**
 * Sinónimos observados en la data real (es/en, typos incluidos).
 *
 * Las claves se comparan ya normalizadas: minúsculas, sin espacios en los
 * extremos y sin puntuación. Se listan los typos que **existen** en la base, no
 * todos los imaginables — si aparece uno nuevo cae en `OTHER` conservando su
 * texto, que es el comportamiento seguro.
 *
 * Deliberadamente NO se mapean pareja/novio/novia/prometido a `SPOUSE`: no son
 * cónyuges, y en un contacto de emergencia o un documento legal afirmar un
 * vínculo matrimonial que no existe es peor que dejarlo como "Otro" con el
 * texto original a la vista.
 */
const SINONIMOS: Record<string, RelationCode> = {
  // ── SPOUSE ────────────────────────────────────────────────────────────────
  spouse: 'SPOUSE', wife: 'SPOUSE', husband: 'SPOUSE',
  esposa: 'SPOUSE', esposo: 'SPOUSE', conyuge: 'SPOUSE', cónyuge: 'SPOUSE',
  marido: 'SPOUSE', mujer: 'SPOUSE', casado: 'SPOUSE', casada: 'SPOUSE',
  spuse: 'SPOUSE', spouce: 'SPOUSE', eaposo: 'SPOUSE',
  'my husband': 'SPOUSE', 'my wife': 'SPOUSE',

  // ── PARENT ────────────────────────────────────────────────────────────────
  parent: 'PARENT', mother: 'PARENT', father: 'PARENT',
  mom: 'PARENT', mum: 'PARENT', dad: 'PARENT', papa: 'PARENT', papá: 'PARENT',
  mama: 'PARENT', mamá: 'PARENT', madre: 'PARENT', padre: 'PARENT',
  'my mother': 'PARENT', 'my father': 'PARENT',
  // OJO: las claves van en su forma YA normalizada por `clave()` — la barra y el
  // guion bajo se convierten en espacio antes de buscar, así que escribirlas
  // como "parent / father" o "legal_guardian" no matchea nunca.
  'parent father': 'PARENT', 'parent mother': 'PARENT',
  stepmother: 'PARENT', stepfather: 'PARENT',

  // ── CHILD ─────────────────────────────────────────────────────────────────
  child: 'CHILD', son: 'CHILD', daughter: 'CHILD',
  hijo: 'CHILD', hija: 'CHILD',

  // ── SIBLING ───────────────────────────────────────────────────────────────
  sibling: 'SIBLING', brother: 'SIBLING', sister: 'SIBLING',
  hermano: 'SIBLING', hermana: 'SIBLING',
  btother: 'SIBLING', brofher: 'SIBLING',

  // ── FRIEND ────────────────────────────────────────────────────────────────
  friend: 'FRIEND', friends: 'FRIEND',
  amigo: 'FRIEND', amiga: 'FRIEND', amigos: 'FRIEND',

  // ── EMPLOYER ──────────────────────────────────────────────────────────────
  employer: 'EMPLOYER', boss: 'EMPLOYER', work: 'EMPLOYER',
  jefe: 'EMPLOYER', trabajo: 'EMPLOYER',

  // ── NEIGHBOR ──────────────────────────────────────────────────────────────
  neighbor: 'NEIGHBOR', neighbour: 'NEIGHBOR', vecino: 'NEIGHBOR', vecina: 'NEIGHBOR',

  // Valores que ya vienen del catálogo (incluye el LEGAL_GUARDIAN del apoderado)
  other: 'OTHER', otro: 'OTHER', 'legal guardian': 'OTHER',
};

/** minúsculas, sin espacios en los extremos, sin puntuación ni espacios repetidos. */
function clave(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.,;:_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resultado del mapeo, listo para alimentar un desplegable + su campo "Otro".
 *
 * - `code`: opción del catálogo a seleccionar. `''` si no había nada.
 * - `other`: texto a mostrar en el campo libre. **Solo** se llena cuando
 *   `code === 'OTHER'`, y conserva el valor original tal como lo escribió la
 *   persona (sin el trim, para no alterar el dato que ya está guardado).
 */
export type RelationNormalized = { code: RelationCode | ''; other: string };

/**
 * Mapea un valor de relación de texto libre al catálogo canónico.
 *
 * Nunca pierde información: lo que no reconoce vuelve como
 * `{ code: 'OTHER', other: <valor original> }`, que es exactamente lo que las
 * dos apps ya hacían con todo. La mejora es que los ~700 valores reconocibles
 * de las 1.180 filas ahora aterrizan en su opción correcta.
 *
 * También sirve para valores que ya son códigos (`"SPOUSE"`, `"PARENT"`): se
 * reconocen por el mismo camino, así que es idempotente.
 */
export function normalizeRelation(
  raw: string | null | undefined,
  /**
   * Códigos que el desplegable de esa pantalla realmente ofrece. Por defecto
   * los 8. Hace falta porque los dos catálogos no son iguales: el editor de
   * pacientes del back-office no tiene `EMPLOYER` ni `NEIGHBOR` (no existen sus
   * claves de i18n), y devolverle un código que su `<select>` no lista lo
   * dejaría **en blanco sin avisar**. Un código no ofrecido cae en `OTHER`
   * conservando el texto original, así que no se pierde nada.
   */
  ofrecidos: readonly RelationCode[] = RELATION_CODES,
): RelationNormalized {
  if (!raw || !raw.trim()) return { code: '', other: '' };

  const k = clave(raw);
  const code = SINONIMOS[k];

  if (code && code !== 'OTHER') {
    if (ofrecidos.includes(code)) return { code, other: '' };
    return { code: 'OTHER', other: raw };
  }

  // `OTHER` explícito no arrastra texto: no hay nada que preservar.
  if (code === 'OTHER') return { code: 'OTHER', other: '' };

  return { code: 'OTHER', other: raw };
}
