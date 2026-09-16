/**
 * Backfill: el seguro que declaró el paciente en el intake → el campo del caso.
 *
 * Desde hoy el paso 6 promueve el seguro apenas se guarda (ver
 * `packages/database/src/seguro-declarado.ts`). Este script hace lo mismo con
 * los casos que ya venían cargados y quedaron con la portada vacía.
 *
 * Reglas, las mismas que el helper:
 *   · Solo seguros MÉDICOS (el de auto vive en `case_auto_insurances`).
 *   · **Gana el staff**: si el caso ya tiene aseguradora, no se toca.
 *   · La aseguradora se enlaza solo con coincidencia EXACTA de nombre en el
 *     catálogo. Sin coincidencia no se crea nada — se reporta y queda para que
 *     el staff la enlace.
 *   · El número de póliza se completa aunque la aseguradora no se enlace.
 *
 * Uso:
 *   node scripts/backfill-seguro-declarado.cjs            → simulacro
 *   node scripts/backfill-seguro-declarado.cjs --aplicar  → escribe
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

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { rows: casos } = await db.query(`
    SELECT c.id, c."caseCode", c."primaryInsuranceId", c."primaryPolicyNumber",
           c."consentsData" -> 'insurances' AS seguros
      FROM cases c
     WHERE jsonb_typeof(c."consentsData" -> 'insurances') = 'array'
       AND jsonb_array_length(c."consentsData" -> 'insurances') > 0
       AND c."deletedAt" IS NULL
     ORDER BY c."createdAt"`);

  console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (nada se escribe)'} — ${casos.length} caso(s) con seguro declarado\n`);

  let enlazados = 0, soloPoliza = 0, sinCatalogo = 0, intactos = 0, sinMedico = 0;
  const paraEnlazarAMano = [];

  for (const caso of casos) {
    const medicos = (caso.seguros || []).filter((s) => (s.insType ?? 'MEDICAL') === 'MEDICAL');
    // La marcada por el paciente gana; si no hay marca, manda el orden.
    const marcada = medicos.findIndex((s) => s.isPrimary === true);
    const principal = marcada > 0 ? medicos[marcada] : medicos[0];

    if (!principal) {
      console.log(`· ${caso.caseCode}  — solo seguro de auto, no aplica`);
      sinMedico++; continue;
    }
    if (caso.primaryInsuranceId) {
      console.log(`· ${caso.caseCode}  — el caso ya tiene aseguradora, se respeta (declarado: "${principal.carrier ?? '—'}")`);
      intactos++; continue;
    }

    const nombre = (principal.carrier ?? '').trim();
    const poliza = (principal.policyId ?? '').trim();

    const { rows: match } = await db.query(
      `SELECT id, name FROM insurance_carriers
        WHERE lower(name) = lower($1) AND "deletedAt" IS NULL AND "isActive" = true LIMIT 1`,
      [nombre],
    );
    const carrier = match[0] || null;

    const sets = [];
    const vals = [];
    if (carrier) { vals.push(carrier.id); sets.push(`"primaryInsuranceId" = $${vals.length}`); }
    if (poliza && !caso.primaryPolicyNumber) { vals.push(poliza); sets.push(`"primaryPolicyNumber" = $${vals.length}`); }

    if (sets.length === 0) {
      console.log(`· ${caso.caseCode}  ✗ "${nombre}" no está en el catálogo y no hay póliza que completar`);
      sinCatalogo++; paraEnlazarAMano.push(`${caso.caseCode} → "${nombre}"`);
      continue;
    }

    if (APLICAR) {
      vals.push(caso.id);
      await db.query(`UPDATE cases SET ${sets.join(', ')}, "updatedAt" = now() WHERE id = $${vals.length}`, vals);
    }

    if (carrier) {
      console.log(`· ${caso.caseCode}  ${APLICAR ? '✓' : '·'} "${nombre}" → ${carrier.name}${poliza ? `  póliza ${poliza}` : ''}`);
      enlazados++;
    } else {
      console.log(`· ${caso.caseCode}  ${APLICAR ? '✓' : '·'} póliza ${poliza} (aseguradora "${nombre}" NO está en el catálogo)`);
      soloPoliza++; paraEnlazarAMano.push(`${caso.caseCode} → "${nombre}"`);
    }
  }

  console.log(`\nresumen — enlazados: ${enlazados}  solo póliza: ${soloPoliza}  sin catálogo: ${sinCatalogo}  ya tenían: ${intactos}  sin seguro médico: ${sinMedico}`);
  if (paraEnlazarAMano.length) {
    console.log('\nAseguradoras que hay que enlazar a mano (no están en el catálogo):');
    for (const l of paraEnlazarAMano) console.log('  ·', l);
  }
  if (!APLICAR) console.log('\nfue un simulacro. Para escribir de verdad: --aplicar');
  await db.end();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
