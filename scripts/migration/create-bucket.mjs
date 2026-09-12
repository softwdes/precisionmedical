/**
 * Crea los buckets privados de Phoenix (kiqlhw…): `case-documents` e
 * `intake-signatures`. Idempotente — si ya existen, lo dice y sigue.
 *
 * ── Las credenciales salen del entorno ─────────────────────────────────────
 * Hasta el 2026-09-11 estaban escritas acá adentro. Las de ese literal ya están
 * rotadas y no sirven, pero el problema nunca fue la clave: era que el archivo
 * enseñaba a poner la clave en el archivo. Estuvieron siete semanas en el
 * historial público de GitHub (`605154f7` las subió, `80884567` las sacó de
 * HEAD — un revert agrega un commit, no borra el anterior).
 *
 * ── Ojo con el par: se toman JUNTOS, nunca cruzados ────────────────────────
 * `SUPABASE_STORAGE_URL` + `SUPABASE_STORAGE_SERVICE_KEY` es el par de Phoenix,
 * y es el que define `scripts/migration/.env`. El par sin prefijo
 * (`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`) se acepta como alternativa para
 * quien tenga el entorno viejo.
 *
 * Se eligen COMO PAR y no variable por variable a propósito: mezclar la URL de
 * un proyecto con la key del otro da `401 Invalid API key`, que se lee como "la
 * key está mal" y no como "estás cruzando dos proyectos" — la trampa ya costó
 * una sesión entera una vez.
 */

import { createClient } from '@supabase/supabase-js';

const PARES = [
  ['SUPABASE_STORAGE_URL', 'SUPABASE_STORAGE_SERVICE_KEY'],
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
];

const par = PARES.find(([u, k]) => process.env[u] && process.env[k]);
if (!par) {
  throw new Error(
    'Faltan las credenciales de Phoenix. Poné en scripts/migration/.env:\n' +
    '  SUPABASE_STORAGE_URL=https://<ref>.supabase.co\n' +
    '  SUPABASE_STORAGE_SERVICE_KEY=<service_role>\n' +
    '(o el par SUPABASE_URL / SUPABASE_SERVICE_KEY, pero los DOS del mismo proyecto).',
  );
}
const [nombreUrl, nombreKey] = par;

// Se dice CON CUÁL par se conectó: si alguien tiene los dos configurados,
// enterarse después de escribir en el proyecto equivocado es tarde.
console.log(`→ usando ${nombreUrl} / ${nombreKey}`);

const supabase = createClient(process.env[nombreUrl], process.env[nombreKey]);

for (const bucket of ['case-documents', 'intake-signatures']) {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 52428800,
  });
  if (error?.message?.includes('already exists')) {
    console.log(`✅ ${bucket} ya existe`);
  } else if (error) {
    console.error(`❌ ${bucket}:`, error.message);
  } else {
    console.log(`✅ ${bucket} creado`);
  }
}
