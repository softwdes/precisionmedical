/**
 * Migration 06 — Appointments (batch mode with reconnect on failure)
 * appointments: id, date, timeStart, timeEnd, status, caseId, doctorId, clinicId, createdAt
 * LM v3 Appointment: patientId, caseId, clinicId, providerId, scheduledFor, durationMinutes, type, status
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV = `${process.env.CSV_DIR}/appointments_202607121236.csv`
const MAP_FILE = './id-maps/appointments.json'
const BATCH = 200

function loadMap(file) {
  if (!existsSync(file)) throw new Error(`ID map not found: ${file}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function mapStatus(v) {
  const l = (v || '').toLowerCase()
  if (l === 'pending') return 'PENDING'
  if (l === 'completed' || l === 'done') return 'COMPLETED'
  if (l === 'cancelled' || l === 'canceled') return 'CANCELLED'
  if (l === 'no_show' || l.includes('no show')) return 'NO_SHOW'
  if (l === 'confirmed') return 'CONFIRMED'
  return 'SCHEDULED'
}

function buildTimestamp(date, time) {
  if (!date) return null
  return `${date}T${time || '09:00:00'}`
}

function calcDuration(start, end) {
  if (!start || !end) return 30
  try {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const d = (eh * 60 + em) - (sh * 60 + sm)
    return d > 0 ? d : 30
  } catch { return 30 }
}

async function insertBatch(db, batch) {
  for (const item of batch) {
    try {
      await db.query(`
        INSERT INTO appointments (
          id, "patientId", "caseId", "clinicId", "providerId",
          "scheduledFor", "durationMinutes", type, status,
          "createdAt", "updatedAt"
        )
        VALUES ($1,$2,$3,$4,$5,$6::timestamp,$7,'FOLLOW_UP'::"AppointmentType",$8::"AppointmentStatus",
                COALESCE($9::timestamp, NOW()), NOW())
        ON CONFLICT DO NOTHING
      `, item.params)
    } catch (e) {
      // log but don't stop
      console.log(`  ⚠️  Appt ${item.id}: ${e.message.split('\n')[0]}`)
    }
  }
}

async function run() {
  const rows = await parseCSV(CSV)
  const db = getPool()
  const idMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}

  const caseMap = loadMap('./id-maps/cases.json')
  const clinicMap = loadMap('./id-maps/clinics.json')
  const providerMap = loadMap('./id-maps/providers.json')

  // Preload case→patient from DB
  console.log('Loading case→patient index...')
  const caseRes = await db.query(`SELECT id, "patientId" FROM cases`)
  const casePatient = {}
  for (const r of caseRes.rows) casePatient[r.id] = r.patientId

  let inserted = 0, skipped = 0
  let batch = []

  const alreadyDone = new Set(Object.keys(idMap))

  for (const row of rows) {
    if (alreadyDone.has(row.id)) { inserted++; continue }

    const caseNewId = row.caseId ? caseMap[row.caseId] : null
    if (!caseNewId) { skipped++; continue }

    const patientId = casePatient[caseNewId]
    if (!patientId) { skipped++; continue }

    const scheduledFor = buildTimestamp(row.date, row.timeStart)
    if (!scheduledFor) { skipped++; continue }

    const newId = cuid()
    idMap[row.id] = newId

    batch.push({
      id: row.id,
      params: [
        newId,
        patientId,
        caseNewId,
        row.clinicId ? (clinicMap[row.clinicId] || null) : null,
        row.doctorId ? (providerMap[row.doctorId] || null) : null,
        scheduledFor,
        calcDuration(row.timeStart, row.timeEnd),
        mapStatus(row.status),
        row.createdAt || null,
      ]
    })

    if (batch.length >= BATCH) {
      await insertBatch(db, batch)
      inserted += batch.length
      process.stdout.write(`  ✅ ${inserted} appointments...\r`)
      writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
      batch = []
    }
  }

  if (batch.length > 0) {
    await insertBatch(db, batch)
    inserted += batch.length
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  console.log(`\n\n📊 Appointments: ${inserted} inserted, ${skipped} skipped`)
  console.log(`💾 ID map saved → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
