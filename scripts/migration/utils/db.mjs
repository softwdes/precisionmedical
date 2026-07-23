import pg from 'pg'
const { Pool } = pg

let pool = null

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    })
  }
  return pool
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null }
}

export function cuid() {
  // Simple cuid2-compatible ID generator
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12).padEnd(10, '0')
  return 'c' + timestamp + random
}
