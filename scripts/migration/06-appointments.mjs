/**
 * Migración 06 — Citas (`appointments` del v2 → `appointments`)
 *
 * ── Los cuatro errores de julio, corregidos ─────────────────────────────────
 *
 * 1. **ZONA HORARIA.** La versión vieja armaba `${date}T${time}` sin offset.
 *    Postgres lo tomó como UTC, pero era hora MOUNTAIN: las citas quedaron 6-7 h
 *    corridas. Acá se arma con el offset real de esa fecha —`-06:00` en verano,
 *    `-07:00` en invierno— calculado con `America/Denver`, así el horario de una
 *    cita de enero y una de julio caen bien las dos.
 *
 * 2. **ESTADO.** Antes todo caía en PENDING/SCHEDULED. El v2 SÍ trae estado:
 *        PENDING 8.270 · DELETE 805 · CONFIRMED 319 · CANCELED 241 ·
 *        NO_SHOW 84 · RESCHEDULED 50 · CANCEL_SAME_DAY 8 · COMPLETED 7
 *    Ojo con `CANCELED` (una L) y con `CANCEL_SAME_DAY`, que en v3 es
 *    CANCELLED + `cancelledSameDay = true` — la marca que cobra penalidad.
 *    `RESCHEDULED` es el turno VIEJO de una cita movida: entra CANCELLED.
 *
 * 3. **IDEMPOTENCIA.** El índice `appointments_llave_natural_tmp` está puesto y
 *    el INSERT va con `ON CONFLICT DO NOTHING`: los 407 duplicados del origen
 *    rebotan solos. Al id-map solo va lo que el `RETURNING` devuelve.
 *
 * 4. **`type`.** Antes entraban todas como FOLLOW_UP. Sale del tipo de caso:
 *    MVA → AUTO_ACCIDENT, GM → FAMILY_PRACTICE.
 *
 * Además trae lo que la versión vieja tiraba: las **544 firmas de asistencia**,
 * las notas de recepción, el check-in y el check-out.
 *
 * Uso:  node 06-appointments.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'appointments.json')

const leerMapa = n => {
  const f = join(MAPS, n)
  if (!existsSync(f)) throw new Error(`Falta id-maps/${n}`)
  return JSON.parse(readFileSync(f, 'utf8'))
}

/**
 * Offset de Mountain para ESA fecha (DST incluido).
 *
 * No se puede usar un `-07:00` fijo: la mitad del año es `-06:00` y las citas de
 * verano quedarían una hora corridas. `Intl` sabe cuándo cambia.
 */
const zonaCorta = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Denver', timeZoneName: 'shortOffset',
})
function offsetMountain(fecha) {
  const partes = zonaCorta.formatToParts(new Date(`${fecha}T12:00:00Z`))
  const txt = partes.find(p => p.type === 'timeZoneName')?.value ?? 'GMT-7'
  const m = /GMT([+-])(\d{1,2})/.exec(txt)
  if (!m) return '-07:00'
  return `${m[1]}${String(m[2]).padStart(2, '0')}:00`
}

function cuando(fecha, hora) {
  if (!fecha) return null
  const f = String(fecha).slice(0, 10)
  const h = (hora && String(hora).slice(0, 8)) || '09:00:00'
  return `${f}T${h}${offsetMountain(f)}`
}

function duracion(inicio, fin) {
  if (!inicio || !fin) return 30
  const [hi, mi] = String(inicio).split(':').map(Number)
  const [hf, mf] = String(fin).split(':').map(Number)
  const d = (hf * 60 + mf) - (hi * 60 + mi)
  return d > 0 && d <= 480 ? d : 30
}

/** v2 → `AppointmentStatus`. `DELETE` no llega acá: se filtra antes. */
function estado(v) {
  switch (String(v ?? '').toUpperCase()) {
    case 'CONFIRMED': return 'CONFIRMED'
    case 'COMPLETED': return 'COMPLETED'
    case 'NO_SHOW': return 'NO_SHOW'
    case 'CANCELED':
    case 'CANCELLED':
    case 'CANCEL_SAME_DAY':
    case 'RESCHEDULED': return 'CANCELLED'
    default: return 'PENDING'
  }
}

async function run() {
  const mapaCasos = leerMapa('cases.json')
  const mapaClinicas = leerMapa('clinics.json')
  const mapaProviders = leerMapa('providers.json')

  const citas = []
  for await (const a of leerRegistros(buscarCsv('appointments'))) citas.push(a)

  const db = getPool()
  const { rows: pacientes } = await db.query(`SELECT id, "patientId" FROM cases`)
  const pacienteDeCaso = new Map(pacientes.map(r => [r.id, r.patientId]))
  const { rows: tipos } = await db.query(`SELECT id, "caseType" FROM cases`)
  const tipoDeCaso = new Map(tipos.map(r => [r.id, r.caseType]))

  const idMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}
  let insertados = 0, borradas = 0, sinCaso = 0, sinClinica = 0, sinFecha = 0, repetidas = 0, fallidas = 0
  let sinProvider = 0, conFirma = 0

  for (const a of citas) {
    if (a.status === 'DELETE') { borradas++; continue }

    // Re-corrida: lo ya importado se saltea por el id-map, sin ir a la base.
    if (idMap[a.id]) continue
    const caseId = mapaCasos[a.caseId]
    if (!caseId) { sinCaso++; continue }

    const patientId = pacienteDeCaso.get(caseId)
    if (!patientId) { sinCaso++; continue }

    // `clinicId` es NOT NULL en v3. La clínica 7 del v2 es "Central prueba", que
    // no existe acá: esas 17 citas no entran, y está bien que no entren.
    const clinicId = a.clinicId ? mapaClinicas[a.clinicId] : null
    if (!clinicId) { sinClinica++; continue }

    const scheduledFor = cuando(a.date, a.timeStart)
    if (!scheduledFor) { sinFecha++; continue }

    const providerId = a.doctorId ? (mapaProviders[a.doctorId] ?? null) : null
    if (!providerId) sinProvider++

    if (DRY) { insertados++; continue }

    const nuevoId = cuid()
    try {
      const { rows } = await db.query(
        `INSERT INTO appointments (
           id, "patientId", "caseId", "clinicId", "providerId",
           "scheduledFor", "durationMinutes", type, status,
           notes, "checkedInAt", "checkedOutAt",
           "attendanceSignatureSvg", "attendanceSignedAt",
           "cancelledSameDay", "isOnline", "plannedServiceCodes",
           "createdAt", "updatedAt"
         ) VALUES (
           $1,$2,$3,$4,$5,
           $6::timestamptz,$7,$8::"AppointmentType",$9::"AppointmentStatus",
           $10,$11::timestamp,$12::timestamp,
           $13,$14::timestamp,
           $15,$16,'{}',
           COALESCE($17::timestamp, NOW()), NOW()
         )
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          nuevoId, patientId, caseId, clinicId, providerId,
          scheduledFor, duracion(a.timeStart, a.timeEnd),
          tipoDeCaso.get(caseId) === 'MVA' ? 'AUTO_ACCIDENT' : 'FAMILY_PRACTICE',
          estado(a.status),
          a.notes || null, a.checkedInAt || null, a.checkOutAt || null,
          a.signatureBase64 || null, a.signatureBase64 ? (a.checkedInAt || a.date) : null,
          a.status === 'CANCEL_SAME_DAY', a.telemedicineEnabled === 'true',
          a.createdAt || null,
        ],
      )
      // Sin fila devuelta, el índice anti-duplicados la rebotó: NO se mapea.
      if (rows[0]) {
        idMap[a.id] = rows[0].id
        insertados++
        if (a.signatureBase64) conFirma++
      } else {
        repetidas++
      }
    } catch (e) {
      console.log(`  ⚠️  cita ${a.id}: ${e.message.split('\n')[0]}`)
      fallidas++
    }

    if ((insertados + repetidas) % 250 === 0) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  }

  if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log(`\n📊 Citas: ${insertados} insertadas${DRY ? ' (dry)' : ''}`)
  console.log(`   ${borradas} borradas · ${repetidas} duplicadas rebotadas · ${sinCaso} sin caso · ${sinClinica} sin clínica (la 7 es "Central prueba") · ${sinFecha} sin fecha · ${fallidas} fallidas`)
  console.log(`   ${sinProvider} sin doctor (el origen no lo tenía, o era una cuenta de prueba) · ${conFirma} con firma de asistencia`)
  console.log(`💾 id-map (${Object.keys(idMap).length}) → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
