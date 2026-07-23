import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const queries = [
  ['specialty_catalog',   'SELECT COUNT(*) FROM specialty_catalog WHERE "deletedAt" IS NULL'],
  ['insurance_carriers',  'SELECT COUNT(*) FROM insurance_carriers WHERE "deletedAt" IS NULL'],
  ['service_codes',       'SELECT COUNT(*) FROM service_codes WHERE "deletedAt" IS NULL'],
  ['diagnoses',           'SELECT COUNT(*) FROM diagnoses'],
  ['templates',           'SELECT COUNT(*) FROM templates WHERE "deletedAt" IS NULL'],
  ['providers',           'SELECT COUNT(*) FROM providers WHERE "deletedAt" IS NULL'],
];

for (const [name, q] of queries) {
  try {
    const r = await client.query(q);
    console.log(`${name}: ${r.rows[0].count}`);
  } catch (e) {
    console.log(`${name}: ERROR — ${e.message}`);
  }
}

await client.end();
