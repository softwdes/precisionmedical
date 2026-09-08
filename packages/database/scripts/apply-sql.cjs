#!/usr/bin/env node
/**
 * Aplica un archivo de `prisma/sql/*.sql` contra la base de Phoenix.
 *
 *   node scripts/apply-sql.cjs prisma/sql/20260907-message-desks.sql
 *
 * Existe porque `prisma db execute` NO funciona acá: la única conexión que
 * responde es el pooler de transacciones (:6543, `DATABASE_URL`), y el motor de
 * schema de Prisma se cae al arrancar contra pgbouncer ("Error in Schema
 * engine"), mientras que `DIRECT_URL` (:5432) está muerto desde agosto. El
 * driver `pg` pelado sí habla con el pooler y acepta DDL.
 *
 * Y `db push` está PROHIBIDO para esto: arrastra la deriva de modelos a medio
 * hacer de otras sesiones (ver la memoria del proyecto). Cada cambio de base va
 * en su .sql idempotente y se aplica con este script.
 *
 * El archivo se manda ENTERO en una sola query (protocolo simple, sin
 * parámetros): así los bloques `DO $$ ... $$` con `;` adentro viajan intactos.
 * Ojo con `ALTER TYPE ... ADD VALUE`: no puede compartir transacción con una
 * sentencia que USE el valor nuevo — en ese caso, partir el .sql en dos.
 *
 * Al final avisa a PostgREST para que recargue el schema: sin eso la REST API
 * de Supabase sigue respondiendo 404 para una tabla recién creada.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const pkgRoot = path.resolve(__dirname, '..');
const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/apply-sql.cjs prisma/sql/<archivo>.sql');
  process.exit(2);
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.join(pkgRoot, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('DATABASE_URL no está ni en el entorno ni en packages/database/.env');
  return m[1].trim().replace(/^"|"$/g, '');
}

(async () => {
  const sql = fs.readFileSync(path.resolve(pkgRoot, file), 'utf8');
  const client = new Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log(`OK · ${path.basename(file)} aplicado`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(`ERROR aplicando ${file}: ${e.message}`);
  process.exit(1);
});
