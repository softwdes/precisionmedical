/**
 * Migration 05d — Lab Catalog
 * Importa 77 labs del v2 → v3 lab_catalog.
 * - ON CONFLICT (code) DO UPDATE (idempotente)
 * - CSV: C:\Users\Erick\Downloads\DBA2\labs_202607131825.csv
 *
 * Schema: id (serial), code (unique), name, loinc?, category
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
import { getPool, closePool } from './utils/db.mjs'

const CSV = `${process.env.CSV_DIR}/DBA2/labs_202607131825.csv`

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim())
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '') })
    return obj
  })
}

function dedupeByCode(rows) {
  const seen = new Map()
  for (const row of rows) {
    const code = row.code?.trim()
    if (code && !seen.has(code)) seen.set(code, row)
  }
  return [...seen.values()]
}

async function main() {
  const pool = getPool()

  console.log('📋 Leyendo CSV labs...')
  const content = readFileSync(CSV, 'utf8')
  const raw = parseCSV(content)
  console.log(`   Total rows: ${raw.length}`)

  const rows = dedupeByCode(raw.filter(r => (r.status ?? '').toUpperCase() !== 'INACTIVE'))
  console.log(`   Únicos ACTIVE: ${rows.length}`)

  let inserted = 0
  let updated = 0

  for (const row of rows) {
    const code = row.code?.trim() ?? ''
    const name = row.name?.trim() ?? ''

    if (!code || !name) {
      console.warn(`   ⚠  Fila sin code/name, skip`)
      continue
    }

    const res = await pool.query(
      `INSERT INTO lab_catalog (code, name, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             category = EXCLUDED.category
       RETURNING (xmax = 0) AS inserted`,
      [code, name, 'LABORATORY']
    )

    if (res.rows[0]?.inserted) inserted++
    else updated++
  }

  console.log(`\n✅ Lab catalog migrado:`)
  console.log(`   Insertados: ${inserted}`)
  console.log(`   Actualizados: ${updated}`)

  await closePool()
}

main().catch(err => { console.error(err); process.exit(1) })
