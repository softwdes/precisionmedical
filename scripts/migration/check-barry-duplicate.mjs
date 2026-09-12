import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('.env', import.meta.url).pathname.slice(1) });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query(`
  SELECT p.id, p."firstName", p."lastName", p.status, p."employeeId",
         COUNT(a.id) as appointment_count
  FROM providers p
  LEFT JOIN appointments a ON a."providerId" = p.id
  WHERE p."firstName" = 'Barry' AND p."lastName" = 'Clanton'
  GROUP BY p.id, p."firstName", p."lastName", p.status, p."employeeId"
  ORDER BY appointment_count DESC
`);

console.log(JSON.stringify(rows, null, 2));
await pool.end();
