/**
 * Migration 05 — Cases
 * cases: id(INT), type(GM|MVA), description(enc), accidentDate, accidentType,
 *        createdAt, patientId(INT→users_patient.id), reference, status
 * LM v3 Case: caseCode, patientId, caseType, status, accidentDate, accidentType
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV = `${process.env.CSV_DIR}/cases_202607121236.csv`
const MAP_FILE = './id-maps/cases.json'

function loadMap(file) {
  if (!existsSync(file)) throw new Error(`ID map not found: ${file}. Run prerequisite scripts first.`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function mapCaseType(v) {
  if (!v) return 'GENERAL'
  const l = v.toLowerCase()
  if (l === 'mva' || l.includes('auto') || l.includes('vehicle')) return 'MVA'
  if (l === 'gm' || l.includes('general')) return 'GENERAL'
  if (l.includes('worker') || l.includes('comp')) return 'WORKERS_COMP'
  if (l.includes('nursing') || l.includes('home')) return 'NURSING_HOME'
  return 'GENERAL'
}

function mapStatus(v) {
  if (!v) return 'ACTIVE'
  const l = v.toLowerCase()
  if (l === 'active' || l === 'open') return 'ACTIVE'
  if (l === 'closed' || l === 'completed') return 'CLOSED'
  if (l === 'pending') return 'INTAKE_PENDING'
  if (l === 'archived') return 'ARCHIVED'
  return 'ACTIVE'
}

async function run() {
  const rows = await parseCSV(CSV)
  const db = getPool()
  const idMap = {} // cases.id (INT string) → new cuid

  const patientMap = loadMap('./id-maps/patients.json')

  let inserted = 0, skipped = 0

  for (const row of rows) {
    const patientId = patientMap[row.patientId]
    if (!patientId) {
      console.log(`  ⚠️  Skipping case ${row.id} — patientId ${row.patientId} not migrated`)
      skipped++; continue
    }

    const newId = cuid()
    idMap[row.id] = newId

    // Build case code — reference may be encrypted or empty, fallback to CASE-{id}
    let rawRef = row.reference?.trim()
    if (rawRef?.startsWith('e:') || rawRef?.includes('|e:')) rawRef = null
    const caseCode = rawRef || `CASE-${row.id}`

    // accidentType may be encrypted
    let accidentType = row.accidentType || null
    if (accidentType?.startsWith('e:') || accidentType?.includes('|e:')) {
      accidentType = decrypt(accidentType)
    }
    // Only keep valid AccidentType enum values
    const VALID_ACCIDENT_TYPES = ['MOTOR_VEHICLE','SLIP_AND_FALL','WORKPLACE','OTHER']
    if (!accidentType || !VALID_ACCIDENT_TYPES.includes(accidentType.toUpperCase())) {
      accidentType = null
    } else {
      accidentType = accidentType.toUpperCase()
    }

    await db.query(`
      INSERT INTO "cases" (
        id, "caseCode", "patientId", "caseType", status,
        "accidentDate", "accidentType",
        "createdAt", "updatedAt"
      )
      VALUES ($1,$2,$3,$4::"CaseTypeWorkflow",$5::"CaseStatus",$6,$7::"AccidentType",
              COALESCE($8::timestamp, NOW()), NOW())
      ON CONFLICT ("caseCode") DO UPDATE SET
        "patientId" = EXCLUDED."patientId",
        "caseType" = EXCLUDED."caseType",
        status = EXCLUDED.status,
        "updatedAt" = NOW()
      RETURNING id
    `, [
      newId,
      caseCode,
      patientId,
      mapCaseType(row.type),
      mapStatus(row.status),
      row.accidentDate || null,
      accidentType,
      row.createdAt || null,
    ])

    console.log(`  ✅ ${caseCode} (${row.type} → ${mapCaseType(row.type)})`)
    inserted++
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  console.log(`\n📊 Cases: ${inserted} inserted, ${skipped} skipped`)
  console.log(`💾 ID map saved → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })


