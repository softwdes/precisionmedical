/**
 * D0-01 · Limpieza de providers antes del portal doctor.
 *
 * 1. Sincroniza email/firstName/lastName del Provider desde su Employee vinculado
 *    (corrige emails viejos de v2 y el typo "Andrew f Nielsenf").
 * 2. Desactiva providers de prueba (sin vínculo HR) → status INACTIVE.
 *
 * Uso:  node d0-01-cleanup-providers.mjs           (dry-run, no escribe)
 *       node d0-01-cleanup-providers.mjs --apply   (aplica cambios)
 */
import pg from 'pg';
import { config } from 'dotenv';

config();

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

console.log(`\n${APPLY ? '⚡ APPLY' : '🔍 DRY-RUN'} — d0-01 cleanup providers\n`);

// ── 1. Sync desde Employee vinculado ─────────────────────────────────────────
const { rows: linked } = await pool.query(`
  SELECT p.id, p."firstName" AS pfn, p."lastName" AS pln, p.email AS pemail,
         e."firstName" AS efn, e."lastName" AS eln, e.email AS eemail
  FROM providers p JOIN employees e ON e.id = p."employeeId"
  WHERE p."deletedAt" IS NULL
  ORDER BY e."lastName"`);

for (const r of linked) {
  const changes = [];
  if (r.pemail !== r.eemail) changes.push(`email: ${r.pemail} → ${r.eemail}`);
  if (r.pfn !== r.efn) changes.push(`firstName: "${r.pfn}" → "${r.efn}"`);
  if (r.pln !== r.eln) changes.push(`lastName: "${r.pln}" → "${r.eln}"`);
  if (changes.length === 0) { console.log(`= ${r.efn} ${r.eln} — sin cambios`); continue; }

  console.log(`~ ${r.efn} ${r.eln}:\n    ${changes.join('\n    ')}`);
  if (APPLY) {
    await pool.query(
      `UPDATE providers SET email=$1, "firstName"=$2, "lastName"=$3, "updatedAt"=now() WHERE id=$4`,
      [r.eemail, r.efn, r.eln, r.id],
    );
  }
}

// ── 2. Desactivar providers de prueba (sin vínculo HR ni user) ───────────────
const { rows: tests } = await pool.query(`
  SELECT id, "firstName", "lastName", email, status
  FROM providers
  WHERE "deletedAt" IS NULL AND "employeeId" IS NULL AND "userId" IS NULL
  ORDER BY "lastName"`);

console.log(`\nProviders sin vínculo HR (candidatos a INACTIVE): ${tests.length}`);
for (const t of tests) {
  console.log(`  ✗ ${t.firstName} ${t.lastName} <${t.email}> [${t.status}] → INACTIVE`);
  if (APPLY && t.status === 'ACTIVE') {
    await pool.query(`UPDATE providers SET status='INACTIVE', "updatedAt"=now() WHERE id=$1`, [t.id]);
  }
}

if (APPLY) {
  const { rows: after } = await pool.query(`
    SELECT status, COUNT(*)::int AS n FROM providers WHERE "deletedAt" IS NULL GROUP BY status`);
  console.log('\nEstado final:', after);
}
console.log(`\n${APPLY ? '✅ Aplicado' : 'ℹ Dry-run — nada escrito. Correr con --apply para ejecutar.'}\n`);
await pool.end();
