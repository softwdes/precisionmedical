import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('.env', import.meta.url).pathname.slice(1) });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(`SELECT id, code, name FROM countries WHERE code IN ('US','USA') LIMIT 5`);
console.log(JSON.stringify(rows, null, 2));
await pool.end();
