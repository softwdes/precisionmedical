/**
 * Migración 11 — Servicios por cita (`appointment_service`, 8.633 filas)
 *
 * ── Dónde van, y por qué NO a `visit_service_codes` ─────────────────────────
 *
 * `visit_service_codes` cuelga de la NOTA (`visitNoteId` es obligatorio), y solo
 * 163 citas tienen nota: mandarlos ahí tira el 98 % —es lo que pasó en julio,
 * que entraron 349 de 6.969 y el resto quedó "sin note (esperado)"—.
 *
 * El lugar correcto es **`Appointment.plannedServiceCodes`**, el JSON de la cita
 * donde v3 guarda los servicios del circuito de seguro (ver `lib/charges.ts`).
 * De ahí los lee el tab Servicios del panel de la cita, y `sync-billing` es
 * quien después arma la fila de facturación.
 *
 * ⚠️ Por eso mismo este script **no toca la plata**: los importes ya entraron
 * con `12-billing` desde `costs`. Crear además una fila de facturación por
 * servicio duplicaría la deuda de cada cita.
 *
 * Y cuando la cita SÍ tiene nota, el servicio se anota también en
 * `visit_service_codes`, que es el registro clínico de lo facturado en esa nota.
 *
 * Uso:  node 11-appt-services.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')

const leerMapa = n => {
  const f = join(MAPS, n)
  if (!existsSync(f)) throw new Error(`Falta id-maps/${n}`)
  return JSON.parse(readFileSync(f, 'utf8'))
}

const num = v => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

async function leerTodo(prefijo) {
  const filas = []
  for await (const r of leerRegistros(buscarCsv(prefijo))) filas.push(r)
  return filas
}

async function run() {
  const mapaCitas = leerMapa('appointments.json')
  const mapaNotas = leerMapa('notes.json')

  const [servicios, catalogoV2, notas] = await Promise.all([
    leerTodo('appointment_service'), leerTodo('services'), leerTodo('notes'),
  ])

  // v2 serviceId → {code, description, cost}
  const catPorId = new Map(catalogoV2.map(s => [s.id, s]))

  // cita v2 → nota v3 (para el registro clínico)
  const notaDeCita = new Map()
  for (const n of notas) if (n.appointmentId && mapaNotas[n.id]) notaDeCita.set(n.appointmentId, mapaNotas[n.id])

  const db = getPool()
  const { rows: catalogoV3 } = await db.query(
    `SELECT id, code, "shortDescription", category, "currentFee" FROM service_codes WHERE "deletedAt" IS NULL`,
  )
  const v3PorCodigo = new Map(catalogoV3.map(s => [String(s.code).toUpperCase(), s]))

  // ─── Agrupar por cita ─────────────────────────────────────────────────────
  const porCita = new Map()
  let sinCita = 0, sinCatalogo = 0
  for (const s of servicios) {
    const appointmentId = s.appointmentId ? mapaCitas[s.appointmentId] : null
    if (!appointmentId) { sinCita++; continue }
    const cat = catPorId.get(s.serviceId)
    if (!cat) { sinCatalogo++; continue }
    if (!porCita.has(appointmentId)) porCita.set(appointmentId, { v2: s.appointmentId, lineas: [] })
    porCita.get(appointmentId).lineas.push({ s, cat })
  }

  let citas = 0, lineas = 0, enNota = 0, fallidas = 0, sinCodigoV3 = 0

  for (const [appointmentId, { v2, lineas: ls }] of porCita) {
    const planned = ls.map(({ s, cat }) => {
      const enV3 = v3PorCodigo.get(String(cat.code ?? '').toUpperCase())
      if (!enV3) sinCodigoV3++
      return {
        // El id de la línea es el del v2: si algún día hay que rastrear un
        // cargo hasta MedUSA, el número está acá.
        id: `v2-${s.id}`,
        code: cat.code ?? '',
        description: cat.description ?? enV3?.shortDescription ?? '',
        fee: num(s.cost) || num(cat.cost),
        category: enV3?.category ?? 'OTHER',
      }
    })

    lineas += planned.length
    citas++
    if (DRY) continue

    try {
      await db.query(
        `UPDATE appointments SET "plannedServiceCodes" = $2::jsonb WHERE id = $1`,
        [appointmentId, JSON.stringify(planned)],
      )

      const noteId = notaDeCita.get(v2)
      if (noteId) {
        for (const { s, cat } of ls) {
          const enV3 = v3PorCodigo.get(String(cat.code ?? '').toUpperCase())
          await db.query(
            `INSERT INTO visit_service_codes
               (id, "visitNoteId", "serviceCodeId", "cptCode", description,
                "feeCatalog", "feeOverride", units, "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,1,NOW(),NOW())`,
            [cuid(), noteId, enV3?.id ?? null, cat.code ?? null,
             cat.description ?? null, num(cat.cost), num(s.cost) || null],
          )
          enNota++
        }
      }
    } catch (e) {
      console.log(`  ⚠️  cita ${v2}: ${e.message.split('\n')[0]}`)
      fallidas++
    }
  }

  console.log(`\n📊 Servicios por cita${DRY ? ' (dry)' : ''}`)
  console.log(`   ${lineas} servicios en ${citas} citas (JSON de la cita)`)
  console.log(`   ${enNota} anotados además en la nota clínica`)
  console.log(`   ${sinCita} sin cita importada · ${sinCatalogo} sin servicio en el catálogo v2 · ${sinCodigoV3} sin código equivalente en v3 · ${fallidas} fallidas`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
