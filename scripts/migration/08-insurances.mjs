/**
 * Migration 08 — Insurances
 * v2: insurances.patientId (liga al paciente)
 * v3: InsuranceCarrier liga al Case vía Case.primaryInsuranceId / secondaryInsuranceId
 *
 * Estrategia:
 * 1. Por cada insurance v2, buscar el case del paciente (puede haber N cases → tomamos el más reciente)
 * 2. Insertar en insurance_carriers
 * 3. UPDATE cases SET primaryInsuranceId/secondaryInsuranceId según priority (primary=1, secondary=2)
 * 4. Genera id-maps/insurances.json
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV      = `${process.env.CSV_DIR}/DBA2/insurances_202607131826.csv`
const MAP_FILE = './id-maps/insurances.json'

function loadMap(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

function parseDate(s) {
  if (!s || s === 'null') return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function parseDecimal(s) {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// v2 type: "auto" | "general" → v3 InsuranceType enum
function mapType(type) {
  const t = (type || '').toLowerCase()
  if (t === 'auto') return 'PIP'
  return 'OTHER'
}

function shortCode(name) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase().substring(0, 4)
  return name.substring(0, 4).toUpperCase()
}

async function main() {
  const pool = getPool()

  const patientsMap = loadMap('./id-maps/patients.json')
  const casesMap    = loadMap('./id-maps/cases.json')

  console.log('📋 Leyendo CSV insurances v2...')
  const rows = await parseCSV(CSV)
  console.log(`   Total: ${rows.length}`)

  // Construir lookup: v3PatientId → [v3CaseId, ...] (ordenados por fecha DESC)
  // Necesitamos saber a qué case asignar. Consultamos la DB.
  console.log('   Cargando cases de DB...')
  const { rows: dbCases } = await pool.query(
    `SELECT id, "patientId", "createdAt" FROM cases ORDER BY "createdAt" DESC`
  )
  // patientId → array de caseIds (más reciente primero)
  const casesByPatient = {}
  for (const c of dbCases) {
    if (!casesByPatient[c.patientId]) casesByPatient[c.patientId] = []
    casesByPatient[c.patientId].push(c.id)
  }

  // También necesitamos saber qué tipo de insurance_carriers acepta v3
  // Verificamos si la tabla existe con el schema esperado
  const { rows: cols } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'insurance_carriers' AND table_schema = 'public'
  `)
  const colNames = new Set(cols.map(c => c.column_name))
  console.log(`   Columnas insurance_carriers: ${[...colNames].join(', ')}`)

  const idMap = {}
  let inserted = 0, noPatient = 0, noCase = 0, caseUpdated = 0

  for (const row of rows) {
    const v2PatientId = String(row.patientId)
    const v3PatientId = patientsMap[v2PatientId]
    if (!v3PatientId) { noPatient++; continue }

    const v3Cases = casesByPatient[v3PatientId] || []
    if (v3Cases.length === 0) { noCase++; continue }

    const newId = cuid()
    const isPrimary = (row.priority === '1' || row.priority === 'primary' || !row.priority)
    const insType   = mapType(row.type)

    // Insertar en insurance_carriers
    // Solo usamos columnas que sabemos que existen
    // insurance_carriers en v3 es catálogo (deduplicado por nombre)
    const companyName = (row.companyName || 'Unknown').trim().substring(0, 200)
    let realV3Id = newId
    try {
      const sc = shortCode(companyName)
      const { rows: upserted } = await pool.query(`
        INSERT INTO insurance_carriers
          (id, name, "legalName", "shortCode", type, "isActive", "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
        ON CONFLICT (name) DO UPDATE SET "updatedAt" = NOW()
        RETURNING id
      `, [newId, companyName, companyName, sc, insType, true])
      realV3Id = upserted[0]?.id || newId
      inserted++
    } catch (e) {
      console.warn(`   ⚠️  Insert error row ${row.id}: ${e.message.substring(0,80)}`)
      continue
    }

    idMap[String(row.id)] = realV3Id

    // Asignar al case más reciente del paciente
    const targetCaseId = v3Cases[0]
    const field = isPrimary ? 'primaryInsuranceId' : 'secondaryInsuranceId'

    await pool.query(
      `UPDATE cases SET "${field}" = $1, "updatedAt" = NOW() WHERE id = $2 AND "${field}" IS NULL`,
      [realV3Id, targetCaseId]
    )
    caseUpdated++
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ Insurances completado:')
  console.log(`   Insertados      : ${inserted}`)
  console.log(`   Cases actualizados: ${caseUpdated}`)
  console.log(`   Sin patient map : ${noPatient}`)
  console.log(`   Sin cases       : ${noCase}`)
  console.log(`   ID-map          : ${MAP_FILE}`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
