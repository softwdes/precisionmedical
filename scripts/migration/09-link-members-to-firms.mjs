/**
 * Migration 09 — Link members to their parent firm
 *
 * Problem: 03-attorneys.mjs migrated all externs as standalone lawyers (parentFirmId = NULL).
 * This script sets parentFirmId using:
 *   users_extern.companyId (v2 UUID) → companies CSV → firmName → v3 lawyer (FIRM) ID
 *
 * Sources:
 *   - users_extern CSV:  id(int), userId(uuid), companyId(v2 uuid), role
 *   - companies CSV:     id(v2 uuid), name
 *   - attorneys.json:   extern int id → v3 lawyer CUID
 */
import { readFileSync, existsSync } from 'fs'
import { getPool, closePool } from './utils/db.mjs'

const USERS_EXTERN_CSV = `${process.env.CSV_DIR}/users_extern_202607121236.csv`
const COMPANIES_CSV    = `${process.env.CSV_DIR}/companies_202607141002.csv`
const ATTORNEYS_MAP    = './id-maps/attorneys.json'

function loadMap(file) {
  if (!existsSync(file)) throw new Error(`ID map not found: ${file}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function parseCsv(content) {
  const lines = content.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  return lines.slice(1).map(line => {
    const cols = []
    let cur = '', inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cols.push(cur.trim())
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  })
}

async function run() {
  const db = getPool()
  const attorneysMap = loadMap(ATTORNEYS_MAP)

  const companies = parseCsv(readFileSync(COMPANIES_CSV, 'utf8'))
  const usersExtern = parseCsv(readFileSync(USERS_EXTERN_CSV, 'utf8'))

  // Build: v2 company UUID → firm name
  const companyNameMap = {}
  for (const c of companies) {
    companyNameMap[c.id] = c.name
  }

  // Build: firm name (lowercase) → v3 lawyer (FIRM) ID
  const firmsResult = await db.query(
    `SELECT id, "firmName" FROM lawyers WHERE "entityType" = 'FIRM' AND "deletedAt" IS NULL`
  )
  const firmByName = {}
  for (const f of firmsResult.rows) {
    firmByName[f.firmName.toLowerCase().trim()] = f.id
  }

  console.log('Firmas v3 encontradas:', firmsResult.rows.length)
  console.log('Companies v2:', companies.length)
  console.log('Users extern:', usersExtern.length)
  console.log('')

  let updated = 0, skippedNoFirmMatch = 0, skippedNoAttorneyMap = 0, alreadyLinked = 0

  for (const user of usersExtern) {
    const externIntId = user.id
    const companyId   = user.companyId

    // Map extern int ID → v3 lawyer CUID
    const v3LawyerId = attorneysMap[externIntId]
    if (!v3LawyerId) {
      skippedNoAttorneyMap++
      continue
    }

    // Map v2 companyId → firm name → v3 firm ID
    const firmName = companyNameMap[companyId]
    if (!firmName) {
      console.log(`  ⚠️  companyId ${companyId} no encontrado en companies CSV (extern ID ${externIntId})`)
      skippedNoFirmMatch++
      continue
    }

    const v3FirmId = firmByName[firmName.toLowerCase().trim()]
    if (!v3FirmId) {
      console.log(`  ⚠️  Firma "${firmName}" no encontrada en v3 lawyers (extern ID ${externIntId})`)
      skippedNoFirmMatch++
      continue
    }

    // Update parentFirmId
    const result = await db.query(
      `UPDATE lawyers SET "parentFirmId" = $1 WHERE id = $2 AND ("parentFirmId" IS NULL OR "parentFirmId" != $1)`,
      [v3FirmId, v3LawyerId]
    )

    if (result.rowCount > 0) {
      updated++
    } else {
      alreadyLinked++
    }
  }

  console.log('=== Migration 09 — Link members to firms ===')
  console.log(`✅ Members vinculados a su firma: ${updated}`)
  console.log(`⚠️  Ya estaban vinculados: ${alreadyLinked}`)
  console.log(`❌ Sin mapeo en attorneys.json: ${skippedNoAttorneyMap}`)
  console.log(`❌ Firma no encontrada en v3: ${skippedNoFirmMatch}`)

  // Show result per firm
  console.log('\n--- Members por firma ---')
  const check = await db.query(`
    SELECT l.id, l."firmName", COUNT(m.id) as members
    FROM lawyers l
    LEFT JOIN lawyers m ON m."parentFirmId" = l.id AND m."deletedAt" IS NULL
    WHERE l."entityType" = 'FIRM'
    GROUP BY l.id, l."firmName"
    ORDER BY COUNT(m.id) DESC
  `)
  check.rows.forEach(r => console.log(` ${r.firmName}: ${r.members} members`))

  await closePool()
}

run().catch(err => { console.error(err); process.exit(1) })
