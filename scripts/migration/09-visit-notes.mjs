/**
 * Migración 09 — Notas clínicas, vitales y diagnósticos
 *
 *   notes           354 → `visit_notes`
 *   vitals          354 → las columnas de signos de la misma nota
 *   note_diagnosic   79 → `visit_note_diagnoses`
 *
 * ── Por qué "354" y no "1.864" ──────────────────────────────────────────────
 * El lector de CSV viejo cortaba por línea y las notas son HTML con saltos
 * adentro: cada nota larga se partía en varias filas falsas. Con el parser
 * arreglado son 354 — exactamente las mismas que `vitals`, una toma de signos
 * por nota, que es la prueba de que ahora está bien contado.
 *
 * ── El join de los vitales ──────────────────────────────────────────────────
 * Es `notes.id_vital` → `vitals.id_vital`, NO la cita. Por eso en julio no entró
 * ni un signo vital. Ojo igual: en el v2 casi no hay datos —cada columna viene
 * 94-97 % vacía, hay unas 20 presiones en toda la base—. Que entren pocos no es
 * un error del script.
 *
 * ── Nombres de columna ──────────────────────────────────────────────────────
 *   v2 heightFeet/bpSystolic/pulse/tempF   →   v3 heightFt/systolicMmhg/pulseBpm/tempFahrenheit
 *
 * Uso:  node 09-visit-notes.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'notes.json')

const leerMapa = n => {
  const f = join(MAPS, n)
  if (!existsSync(f)) throw new Error(`Falta id-maps/${n}`)
  return JSON.parse(readFileSync(f, 'utf8'))
}

const txt = v => {
  const s = (v ?? '').trim()
  return s === '' || s === '<p></p>' || s === '<p><br></p>' ? null : s
}
const nro = v => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const entero = v => {
  const n = nro(v)
  return n === null ? null : Math.round(n)
}

async function leerTodo(prefijo) {
  const filas = []
  for await (const r of leerRegistros(buscarCsv(prefijo))) filas.push(r)
  return filas
}

async function run() {
  const mapaCitas = leerMapa('appointments.json')

  const [notas, vitales, diagnosticos] = await Promise.all([
    leerTodo('notes'), leerTodo('vitals'), leerTodo('note_diagnosic'),
  ])
  const vitalPorId = new Map(vitales.map(v => [v.id_vital, v]))

  const db = getPool()
  const idMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}
  let insertadas = 0, sinCita = 0, vacias = 0, conVitales = 0, fallidas = 0

  for (const n of notas) {
    const appointmentId = n.appointmentId ? mapaCitas[n.appointmentId] : null
    if (!appointmentId) { sinCita++; continue }
    if (idMap[n.id]) continue

    const v = n.id_vital ? (vitalPorId.get(n.id_vital) ?? {}) : {}
    const tieneVitales = Object.entries(v).some(([k, x]) => k !== 'id_vital' && nro(x) !== null)
    const tieneTexto = [n.complaint, n.history, n.reviewsystem, n.physical, n.assessments, n.plan]
      .some(x => txt(x) !== null)
    if (!tieneTexto && !tieneVitales) { vacias++; continue }

    if (DRY) { insertadas++; if (tieneVitales) conVitales++; continue }

    try {
      const { rows } = await db.query(
        `INSERT INTO visit_notes (
           id, "appointmentId",
           "chiefComplaint", hpi, ros, "physicalExam", assessment, plan,
           "heightFt","heightIn","heightCm","weightLbs","weightOz","weightKg",
           "systolicMmhg","diastolicMmhg","pulseBpm","respRate",
           "tempFahrenheit","tempCelsius","painScale","o2Saturation","onRoomAir",
           status, "signedAt", "signedByName", "createdAt", "updatedAt"
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,
           $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
           $24::"VisitNoteStatus",$25::timestamp,$26,
           COALESCE($27::timestamp,NOW()),NOW()
         )
         RETURNING id`,
        [
          cuid(), appointmentId,
          txt(n.complaint), txt(n.history), txt(n.reviewsystem),
          txt(n.physical), txt(n.assessments),
          // La transcripción del v2 no tiene columna propia en v3: se anexa al
          // plan rotulada, que es donde un provider la va a buscar.
          [txt(n.plan), txt(n.transcription) && `\n\n— Transcripción (v2) —\n${txt(n.transcription)}`]
            .filter(Boolean).join('') || null,
          entero(v.heightFeet), entero(v.heightInches), nro(v.heightCms),
          nro(v.weightLbs), nro(v.weightOz), nro(v.weightKgs),
          entero(v.bpSystolic), entero(v.bpDiastolic), entero(v.pulse), entero(v.respiratoryRate),
          nro(v.tempF), nro(v.tempC), entero(v.pain), entero(v.O2),
          v.onRoomAir === 'true' ? true : (v.onRoomAir === 'false' ? false : null),
          n.isClosed === 'true' ? 'SIGNED' : 'DRAFT',
          n.isClosed === 'true' ? (n.updatedAt || n.createdAt || null) : null,
          txt(n.doctorSignature),
          n.createdAt || null,
        ],
      )
      idMap[n.id] = rows[0].id
      insertadas++
      if (tieneVitales) conVitales++
    } catch (e) {
      console.log(`  ⚠️  nota ${n.id}: ${e.message.split('\n')[0]}`)
      fallidas++
    }
  }

  if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  // ─── Diagnósticos de la nota ──────────────────────────────────────────────
  // `note_diagnosic.diagnosticId` apunta al catálogo ICD del v2. En v3 el
  // catálogo YA está (98.252 filas de `diagnoses`) y no se re-migró, así que el
  // puente es el CÓDIGO, no el id: se busca el ICD-10 del v2 y se resuelve
  // contra el catálogo de acá.
  let dx = 0, dxSinNota = 0, dxSinCodigo = 0
  if (!DRY && diagnosticos.length) {
    const catalogo = await leerTodo('_diagnostics_')
    const icdPorId = new Map(catalogo.map(d => [d.id, d.icdCode ?? null]))
    const { rows: v3dx } = await db.query(`SELECT id, "icd10Code", "icd10Description" FROM diagnoses`)
    const porCodigo = new Map(v3dx.map(r => [String(r.icd10Code).toUpperCase(), r]))

    for (const d of diagnosticos) {
      const noteId = idMap[d.noteId]
      if (!noteId) { dxSinNota++; continue }
      const codigo = icdPorId.get(d.diagnosticId)
      const enV3 = codigo ? porCodigo.get(String(codigo).toUpperCase()) : null
      if (!enV3) { dxSinCodigo++; continue }
      try {
        await db.query(
          `INSERT INTO visit_note_diagnoses (id, "noteId", "icd10Code", "icd10Label", "diagnosisId", "sortOrder")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [cuid(), noteId, enV3.icd10Code, enV3.icd10Description, enV3.id, dx],
        )
        dx++
      } catch { dxSinCodigo++ }
    }
  }

  console.log(`\n📊 Notas${DRY ? ' (dry)' : ''}: ${insertadas} · ${conVitales} con signos vitales`)
  console.log(`   ${sinCita} sin cita importada · ${vacias} vacías (sin texto ni signos) · ${fallidas} fallidas`)
  console.log(`   diagnósticos: ${dx} · ${dxSinNota} sin nota · ${dxSinCodigo} sin código en el catálogo`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
