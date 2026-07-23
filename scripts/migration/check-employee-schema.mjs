import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('.env', import.meta.url).pathname.slice(1) });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'employees' AND table_schema = 'public'
  ORDER BY ordinal_position
`);
console.log(rows.filter(r => r.is_nullable === 'NO').map(r => `${r.column_name} (${r.data_type}) default=${r.column_default}`).join('\n'));
await pool.end();
