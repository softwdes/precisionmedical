/**
 * Migration 01 — Clinics
 * Original: clinics (id int, name, phone, cellphone, email, address, zipCode, state, city, color, status)
 * LM v3:    clinics (id cuid, name unique, phone, cellPhone, email, address, zipCode, state, city, color)
 */
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV = `${process.env.CSV_DIR}/clinics_202607121236.csv`
const MAP_FILE = './id-maps/clinics.json'

const SKIP = ['prueba', 'central prueba'] // test entries to skip

async function run() {
  const rows = await parseCSV(CSV)
  const db = getPool()
  const idMap = {} // originalId (int) → new cuid

  let inserted = 0, skipped = 0

  for (const row of rows) {
    if (row.status === 'INACTIVE') { skipped++; continue }
    if (SKIP.some(s => row.name?.toLowerCase().includes(s))) { skipped++; continue }

    const newId = cuid()
    idMap[row.id] = newId

    await db.query(`
      INSERT INTO clinics (id, name, phone, "cellPhone", email, address, "zipCode", state, city, color)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (name) DO UPDATE SET
        phone = EXCLUDED.phone,
        "cellPhone" = EXCLUDED."cellPhone",
        email = EXCLUDED.email,
        address = EXCLUDED.address,
        "zipCode" = EXCLUDED."zipCode",
        state = EXCLUDED.state,
        city = EXCLUDED.city,
        color = EXCLUDED.color
      RETURNING id
    `, [
      newId,
      row.name,
      row.phone || null,
      row.cellphone || null,
      row.email || null,
      row.address || null,
      row.zipCode || null,
      row.state || null,
      row.city || null,
      row.color || '#6366F1',
    ])

    console.log(`  ✅ ${row.name} (${row.city})`)
    inserted++
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  console.log(`\n📊 Clinics: ${inserted} inserted, ${skipped} skipped`)
  console.log(`💾 ID map saved → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
