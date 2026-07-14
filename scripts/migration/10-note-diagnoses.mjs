/**
 * Migration 10 — Note Diagnoses
 * v2 table: note_diagnosic (22 records)
 * v3 model: VisitNoteDiagnosis
 * Depende de: id-maps/notes.json + id-maps/diagnostics.json
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV      = `${process.env.CSV_DIR}/DBA2/note_diagnosic_202607131802.csv`
const MAP_FILE = './id-maps/note-diagnoses.json'

function loadMap(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

async function main() {
  const pool = getPool()

  const notesMap = loadMap('./id-maps/notes.json')
  const diagMap  = loadMap('./id-maps/diagnostics.json')

  console.log('📋 Leyendo CSV note_diagnosic...')
  const rows = await parseCSV(CSV)
  console.log(`   Total: ${rows.length}`)

  // Verificar columnas de visit_note_diagnoses
  const { rows: cols } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'visit_note_diagnoses' AND table_schema = 'public'
  `)
  const colNames = new Set(cols.map(c => c.column_name))
  if (colNames.size === 0) {
    console.log('   ⚠️  Tabla visit_note_diagnoses no existe — skip')
    await closePool(); return
  }

  const idMap = {}
  let inserted = 0, noNote = 0, noDiag = 0

  for (const row of rows) {
    const v2NoteId = String(row.noteId)
    const v2DiagId = String(row.diagnosticId)

    const v3NoteId = notesMap[v2NoteId]
    const v3DiagId = diagMap[v2DiagId]

    if (!v3NoteId) { noNote++; continue }
    if (!v3DiagId) { noDiag++; continue }

    const newId = cuid()
    idMap[String(row.id)] = newId

    try {
      await pool.query(`
        INSERT INTO visit_note_diagnoses (id, "visitNoteId", "diagnosisId", "createdAt", "updatedAt")
        VALUES ($1,$2,$3,NOW(),NOW())
        ON CONFLICT DO NOTHING
      `, [newId, v3NoteId, v3DiagId])
      inserted++
    } catch (e) {
      console.warn(`   ⚠️  Row ${row.id}: ${e.message.substring(0,80)}`)
    }
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ Note diagnoses completado:')
  console.log(`   Insertados   : ${inserted}`)
  console.log(`   Sin note map : ${noNote}`)
  console.log(`   Sin diag map : ${noDiag}`)
  console.log(`   ID-map       : ${MAP_FILE}`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
