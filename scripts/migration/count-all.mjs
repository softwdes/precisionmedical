import { getPool, closePool } from './utils/db.mjs'
const db = getPool()
const tables = ['clinics','providers','lawyers','patients','cases','appointments']
for (const t of tables) {
  const r = await db.query(`SELECT COUNT(*) FROM "${t}"`)
  console.log(`${t}: ${r.rows[0].count}`)
}
await closePool()
