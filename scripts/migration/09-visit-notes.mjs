/**
 * Migration 09 — Visit Notes + Vitals
 * v2 tables: notes (336), vitals (336, ~30 con data real)
 * v3 model: VisitNote + inline vitals fields
 *
 * Cada nota se asocia a un appointmentId y caseId.
 * Solo migramos filas cuyo appointmentId tenga map en v3.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const NOTES_CSV  = `${process.env.CSV_DIR}/DBA2/notes_202607131802.csv`
const VITALS_CSV = `${process.env.CSV_DIR}/DBA2/vitals_202607131802.csv`
const MAP_FILE   = './id-maps/notes.json'

function loadMap(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

function parseNum(s) {
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function parseDate(s) {
  if (!s || s === 'null') return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function hasVitalData(v) {
  if (!v) return false
  const fields = [
    v.heightFeet, v.heightInches, v.weightLbs, v.bpSystolic, v.bpDiastolic,
    v.pulse, v.respiratoryRate, v.tempF, v.pain, v.O2,
  ]
  return fields.some(f => f && f !== 'null' && f !== '0' && f !== '')
}

async function main() {
  const pool = getPool()

  const apptMap  = loadMap('./id-maps/appointments.json')
  const casesMap = loadMap('./id-maps/cases.json')

  console.log('📋 Leyendo CSVs notes + vitals...')
  const [notesRows, vitalsRows] = await Promise.all([
    parseCSV(NOTES_CSV),
    parseCSV(VITALS_CSV),
  ])
  console.log(`   Notes: ${notesRows.length} | Vitals: ${vitalsRows.length}`)

  // Indexar vitals por id_vital
  const vitalsByIdVital = {}
  for (const v of vitalsRows) {
    if (v.id_vital) vitalsByIdVital[String(v.id_vital)] = v
  }

  // Verificar columnas de visit_notes disponibles
  const { rows: cols } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'visit_notes' AND table_schema = 'public'
  `)
  const colNames = new Set(cols.map(c => c.column_name))
  console.log(`   visit_notes columnas: ${[...colNames].slice(0, 12).join(', ')}...`)

  const idMap = {}
  let inserted = 0, noAppt = 0

  for (const row of notesRows) {
    const v2ApptId = String(row.appointmentId)
    const v3ApptId = apptMap[v2ApptId]
    if (!v3ApptId) { noAppt++; continue }

    const v2CaseId = String(row.caseId)
    const v3CaseId = casesMap[v2CaseId] || null

    // Obtener vitals correspondientes
    const v = vitalsByIdVital[String(row.id_vital)] || null
    const hasVitals = hasVitalData(v)

    const newId = cuid()
    idMap[String(row.id)] = newId

    // Status: isClosed=true → SIGNED, else DRAFT
    const status = (row.isClosed === 'true' || row.isClosed === '1') ? 'SIGNED' : 'DRAFT'

    try {
      // Construir SQL dinámico según columnas existentes
      const fields  = ['id', '"appointmentId"', '"status"', '"createdAt"', '"updatedAt"']
      const vals    = [newId, v3ApptId, status, parseDate(row.createdAt) || new Date(), new Date()]
      let p = vals.length + 1

      if (colNames.has('caseId') && v3CaseId) {
        fields.push('"caseId"'); vals.push(v3CaseId)
      }
      if (colNames.has('chiefComplaint') && row.complaint) {
        fields.push('"chiefComplaint"'); vals.push(row.complaint.substring(0, 2000))
      }
      if (colNames.has('historyOfPresentIllness') && row.history) {
        fields.push('"historyOfPresentIllness"'); vals.push(row.history.substring(0, 5000))
      }
      if (colNames.has('reviewOfSystems') && row.reviewsystem) {
        fields.push('"reviewOfSystems"'); vals.push(row.reviewsystem.substring(0, 5000))
      }
      if (colNames.has('physicalExamination') && row.physical) {
        fields.push('"physicalExamination"'); vals.push(row.physical.substring(0, 5000))
      }
      if (colNames.has('assessment') && row.assessments) {
        fields.push('"assessment"'); vals.push(row.assessments.substring(0, 5000))
      }
      if (colNames.has('plan') && row.plan) {
        fields.push('"plan"'); vals.push(row.plan.substring(0, 5000))
      }
      if (colNames.has('transcription') && row.transcription) {
        fields.push('"transcription"'); vals.push(row.transcription.substring(0, 10000))
      }

      // Vitals (si hay data y columnas existen)
      if (hasVitals && v) {
        const vitalFieldMap = {
          heightFeet: 'heightFt', heightInches: 'heightIn',
          weightLbs: 'weightLbs', bpSystolic: 'systolicMmhg', bpDiastolic: 'diastolicMmhg',
          pulse: 'pulseBpm', pain: 'painScore', O2: 'o2Pct',
        }
        for (const [v2Field, v3Field] of Object.entries(vitalFieldMap)) {
          if (colNames.has(v3Field) && v[v2Field]) {
            const n = parseNum(v[v2Field])
            if (n !== null) { fields.push(`"${v3Field}"`); vals.push(n) }
          }
        }
      }

      const placeholders = fields.map((_, i) => `$${i + 1}`).join(',')
      await pool.query(`
        INSERT INTO visit_notes (${fields.join(',')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO NOTHING
      `, vals)

      inserted++
    } catch (e) {
      console.warn(`   ⚠️  Row ${row.id}: ${e.message.substring(0, 100)}`)
    }
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ Visit notes completado:')
  console.log(`   Insertados      : ${inserted}`)
  console.log(`   Sin appt map    : ${noAppt}`)
  console.log(`   ID-map          : ${MAP_FILE}`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
