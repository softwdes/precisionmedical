import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('.env', import.meta.url).pathname.slice(1) });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Ver max employeeCode actual
const { rows: maxRow } = await pool.query(
  `SELECT "employeeCode" FROM employees ORDER BY "createdAt" DESC LIMIT 20`
);
console.log('Códigos existentes:', maxRow.map(r => r.employeeCode));

// Ver los doctores que creamos
const { rows: docs } = await pool.query(
  `SELECT id, "employeeCode", "firstName", "lastName" FROM employees WHERE "departmentId" = 'cmrjoxlz30005apc6vzgyaa3x' ORDER BY "createdAt"`
);
console.log('\nDoctores en DB:', JSON.stringify(docs, null, 2));

await pool.end();
