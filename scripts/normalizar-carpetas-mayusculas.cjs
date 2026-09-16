/**
 * Normaliza SOLO las diferencias de mayúsculas y espacios en los nombres de
 * carpeta migrados del v2.
 *
 * ── Qué hace y qué NO hace ──────────────────────────────────────────────────
 *
 * Toca únicamente carpetas cuyo nombre es idéntico salvo mayúsculas/espacios:
 * `HCFA BILLS` → `HCFA Bills`, `LIEN` → `Lien`, `MISC` → `Misc`. Son 10 grupos
 * y no hay nada que interpretar.
 *
 * **NO toca plurales** (`Progress Note` vs `Progress Notes`) ni sinónimos
 * (`Driving License` vs `Drivers License`). Ahí hace falta una persona: al
 * medirlo el 2026-09-15 estuve a punto de fusionar `Insurance Card` con
 * `Identification Card` creyendo que era la misma mal escrita, y son cosas
 * distintas — la segunda tiene 57 de 58 archivos llamados `…-id…`. Fusionarlas
 * habría metido licencias de conducir en la carpeta del seguro, y de ahí al
 * portal del bufete hay un paso.
 *
 * ── Por qué es seguro ───────────────────────────────────────────────────────
 *
 * Cambia `name` y nada más. No mueve archivos (el `parentId` de los hijos no se
 * toca), no borra, no fusiona carpetas: dos carpetas con el mismo nombre en el
 * mismo caso siguen siendo dos. Y se puede deshacer — el simulacro imprime el
 * nombre viejo de cada una.
 *
 * ── El nombre que gana ──────────────────────────────────────────────────────
 *
 * El más frecuente del grupo. Se imprime siempre cuál eligió y con qué ventaja,
 * para poder objetarlo antes de aplicar.
 *
 * Uso:
 *   node scripts/normalizar-carpetas-mayusculas.cjs            → simulacro
 *   node scripts/normalizar-carpetas-mayusculas.cjs --aplicar  → escribe
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

for (const line of fs.readFileSync(path.join(RAIZ, 'apps/back-office/.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { Client } = require(path.join(RAIZ, 'packages/database/node_modules/pg'));
const APLICAR = process.argv.includes('--aplicar');

/** Mayúsculas y espacios, nada más. El plural y los sinónimos quedan afuera. */
const clave = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { rows: carpetas } = await db.query(
    `SELECT id, name FROM patient_documents WHERE "isFolder" = true AND "deletedAt" IS NULL`,
  );

  const grupos = new Map();
  for (const f of carpetas) {
    const k = clave(f.name);
    if (!grupos.has(k)) grupos.set(k, new Map());
    const porNombre = grupos.get(k);
    if (!porNombre.has(f.name)) porNombre.set(f.name, []);
    porNombre.get(f.name).push(f.id);
  }

  const sucios = [...grupos.values()].filter((porNombre) => porNombre.size > 1);
  console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (nada se escribe)'} — ${carpetas.length} carpetas, ${sucios.length} grupo(s) escritos de varias formas\n`);

  let renombradas = 0;

  for (const porNombre of sucios) {
    const variantes = [...porNombre.entries()].sort((a, b) => b[1].length - a[1].length);
    const [ganador, idsGanador] = variantes[0];
    const perdedoras = variantes.slice(1);
    const segundo = perdedoras[0][1].length;

    console.log(`· "${ganador}" (${idsGanador.length}) gana sobre ${perdedoras.map(([n, ids]) => `"${n}" (${ids.length})`).join(', ')}` +
      (idsGanador.length === segundo ? '   ⚠ EMPATE, revisalo' : ''));

    for (const [nombre, ids] of perdedoras) {
      if (APLICAR) {
        await db.query(
          `UPDATE patient_documents SET name = $1, "updatedAt" = now() WHERE id = ANY($2::text[])`,
          [ganador, ids],
        );
      }
      console.log(`    ${APLICAR ? '✓' : '·'} ${ids.length} × "${nombre}" → "${ganador}"`);
      renombradas += ids.length;
    }
  }

  console.log(`\nresumen — carpetas renombradas: ${renombradas}`);
  if (!APLICAR) console.log('fue un simulacro. Para escribir de verdad: --aplicar');
  await db.end();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
