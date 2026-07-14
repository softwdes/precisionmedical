/**
 * Migration 11 — Appointment Services
 * v2 table: appointment_service (7,582 records)
 * v3 model: VisitServiceCode
 *
 * NOTA: VisitServiceCode requiere visitNoteId, pero en v2 los servicios se
 * asignan a appointmentId directamente. Solo migramos los appointments que
 * tienen una nota asociada en v3. Los que no tienen nota: skip (se perdería
 * el vínculo de todos modos).
 *
 * Depende de: id-maps/appointments.json + id-maps/services.json + id-maps/notes.json
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV      = `${process.env.CSV_DIR}/DBA2/appointment_service_202607131824.csv`
const MAP_FILE = './id-maps/appt-services.json'

function loadMap(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

async function main() {
  const pool = getPool()

  const apptMap     = loadMap('./id-maps/appointments.json')
  const servicesMap = loadMap('./id-maps/services.json')
  const notesMap    = loadMap('./id-maps/notes.json')

  console.log('📋 Leyendo CSV appointment_service...')
  const rows = await parseCSV(CSV)
  console.log(`   Total: ${rows.length}`)

  // Construir lookup: v3AppointmentId → v3NoteId (inverso del notes map)
  // El notes map es v2NoteId → v3NoteId; necesitamos apptId → noteId
  // Consultamos visit_notes directamente
  const { rows: notes } = await pool.query(
    `SELECT id, "appointmentId" FROM visit_notes`
  )
  const noteByAppt = {}
  for (const n of notes) noteByAppt[n.appointmentId] = n.id

  // Obtener info de service_codes para snapshot
  const { rows: scRows } = await pool.query(
    `SELECT id, code, "shortDescription", "currentFee" FROM service_codes`
  )
  const scById = {}
  for (const s of scRows) scById[s.id] = s

  // Verificar columnas visit_service_codes
  const { rows: cols } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'visit_service_codes' AND table_schema = 'public'
  `)
  const colNames = new Set(cols.map(c => c.column_name))
  if (colNames.size === 0) {
    console.log('   ⚠️  Tabla visit_service_codes no existe — skip')
    await closePool(); return
  }
  console.log(`   visit_service_codes columnas: ${[...colNames].join(', ')}`)

  const idMap = {}
  let inserted = 0, noAppt = 0, noNote = 0, noService = 0, dupSkip = 0
  const seenKey = new Set() // prevent (visitNoteId, cptCode) duplicates

  for (const row of rows) {
    const v2ApptId = String(row.appointmentId)
    const v2SvcId  = String(row.serviceId)

    const v3ApptId = apptMap[v2ApptId]
    if (!v3ApptId) { noAppt++; continue }

    const v3NoteId = noteByAppt[v3ApptId]
    if (!v3NoteId) { noNote++; continue }

    const v3SvcId = servicesMap[v2SvcId]
    if (!v3SvcId) { noService++; continue }

    const sc = scById[v3SvcId]
    if (!sc) { noService++; continue }

    const dupKey = `${v3NoteId}:${sc.code}`
    if (seenKey.has(dupKey)) { dupSkip++; continue }
    seenKey.add(dupKey)

    const newId    = cuid()
    const feeOverride = parseFloat(row.cost) || null
    idMap[String(row.id)] = newId

    try {
      await pool.query(`
        INSERT INTO visit_service_codes
          (id, "visitNoteId", "serviceCodeId", "cptCode", description,
           "feeCatalog", "feeOverride", "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        ON CONFLICT ("visitNoteId", "cptCode") DO NOTHING
      `, [
        newId,
        v3NoteId,
        v3SvcId,
        sc.code,
        sc.shortDescription || sc.code,
        sc.currentFee,
        feeOverride !== sc.currentFee ? feeOverride : null,
      ])
      inserted++
    } catch (e) {
      console.warn(`   ⚠️  Row ${row.id}: ${e.message.substring(0,100)}`)
    }
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ Appt services completado:')
  console.log(`   Insertados      : ${inserted}`)
  console.log(`   Sin appt map    : ${noAppt}`)
  console.log(`   Sin note (skip) : ${noNote}`)
  console.log(`   Sin service map : ${noService}`)
  console.log(`   Duplicados skip : ${dupSkip}`)
  console.log(`   ID-map          : ${MAP_FILE}`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
