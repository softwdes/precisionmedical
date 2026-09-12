/**
 * Migration 07b — Link cases to law firms and attorneys
 *
 * Uses case_externs CSV to populate:
 *   - Case.lawFirmId   (from companyId → companies → v3 Lawyer)
 *   - Case.attorneyId  (from responsibleExternId → users_extern → v3 Lawyer)
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool } from './utils/db.mjs'

const CSV_EXTERNS   = `${process.env.CSV_DIR}/DBA2/case_externs_202607131834.csv`
const CSV_COMPANIES = `${process.env.CSV_DIR}/companies_202607141002.csv`
const CSV_USERS_EXT = `${process.env.CSV_DIR}/LM DBA 1/users_extern_202607121236.csv`
const CASES_MAP     = './id-maps/cases.json'
const ATTORNEYS_MAP = './id-maps/attorneys.json'

async function run() {
  const pool = getPool()

  // Load id-maps
  const casesMap     = JSON.parse(readFileSync(CASES_MAP, 'utf8'))
  const attorneysMap = JSON.parse(readFileSync(ATTORNEYS_MAP, 'utf8'))

  // Load CSVs
  const externs   = await parseCSV(CSV_EXTERNS)
  const companies = await parseCSV(CSV_COMPANIES)
  const usersExt  = await parseCSV(CSV_USERS_EXT)

  console.log(`📋 case_externs: ${externs.length} filas`)
  console.log(`📋 companies: ${companies.length} filas`)
  console.log(`📋 users_extern: ${usersExt.length} filas`)

  // Build company UUID → v3 Lawyer.id map
  // Companies are stored as Lawyers with entityType = LAW_FIRM in v3
  // Query DB to match by name since we don't have a companies id-map
  console.log('\n🔍 Construyendo mapa companies v2 UUID → v3 Lawyer.id...')
  const companyMap = {}
  for (const co of companies) {
    const { rows } = await pool.query(
      `SELECT id FROM lawyers WHERE "firmName" ILIKE $1 AND "deletedAt" IS NULL LIMIT 1`,
      [co.name.trim()]
    )
    if (rows.length > 0) {
      companyMap[co.id] = rows[0].id
    } else {
      console.log(`  ⚠️  No encontrado en v3: "${co.name}" (${co.id})`)
    }
  }
  console.log(`  ✅ ${Object.keys(companyMap).length}/${companies.length} companies mapeadas`)

  // Save company map for future use
  writeFileSync('./id-maps/companies.json', JSON.stringify(companyMap, null, 2))

  // Build users_extern numeric ID → v3 Lawyer.id map (individual attorneys)
  // attorneys.json keys are numeric strings from users_extern.id
  // usersExt has id (numeric) and userId (UUID from users table)
  const externPersonMap = {}
  for (const u of usersExt) {
    const v3Id = attorneysMap[String(u.id)]
    if (v3Id) externPersonMap[String(u.id)] = v3Id
  }
  console.log(`\n🔍 Attorneys mapeados: ${Object.keys(externPersonMap).length}/${usersExt.length}`)

  // Process case_externs — update Case.lawFirmId and Case.attorneyId
  let updated = 0, noCase = 0, noFirm = 0, noAttorney = 0, skipped = 0

  for (const row of externs) {
    const v3CaseId = casesMap[String(row.caseId)]
    if (!v3CaseId) { noCase++; continue }

    const v3FirmId     = row.companyId         ? companyMap[row.companyId]                     : null
    const v3AttorneyId = row.responsibleExternId ? externPersonMap[String(row.responsibleExternId)] : null

    if (!v3FirmId && !v3AttorneyId) { skipped++; continue }
    if (row.companyId && !v3FirmId) noFirm++
    if (row.responsibleExternId && !v3AttorneyId) noAttorney++

    // Only update fields that have values — don't overwrite existing data
    const updates = []
    const values  = []
    let idx = 1

    if (v3FirmId) {
      updates.push(`"lawFirmId" = $${idx++}`)
      values.push(v3FirmId)
    }
    if (v3AttorneyId) {
      updates.push(`"attorneyId" = $${idx++}`)
      values.push(v3AttorneyId)
    }

    values.push(v3CaseId)
    await pool.query(
      `UPDATE cases SET ${updates.join(', ')} WHERE id = $${idx} AND "deletedAt" IS NULL`,
      values
    )
    updated++
  }

  console.log('\n✅ Vinculación completada:')
  console.log(`   Casos actualizados : ${updated}`)
  console.log(`   Sin case map        : ${noCase}`)
  console.log(`   Sin firma/abogado   : ${skipped}`)
  console.log(`   Firm no encontrada  : ${noFirm}`)
  console.log(`   Attorney no mapeado : ${noAttorney}`)
  console.log(`   id-map companies   → ./id-maps/companies.json`)

  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
