/**
 * Migración 12 — Facturación: cargos (`costs`) y pagos (`payments`)
 *
 *   costs    6.995 → `appointment_billing`  (una cuenta por cita)
 *   payments   591 → `billing_payments`     (los pagos de esa cuenta)
 *
 * ── Detalles que importan ───────────────────────────────────────────────────
 *
 * · `appointment_billing.appointmentId` es obligatorio: un cargo cuya cita no se
 *   importó (borrada, sin caso, de la clínica de prueba) no tiene dónde ir.
 * · El pago cuelga del CARGO (`costId` → `billingId`), así que primero los
 *   cargos y después los pagos, con el id-map en el medio.
 * · `source` y `method` del v2 mapean casi 1:1; el método viene a veces en
 *   español ("Tarjeta", "Efectivo", "Cheque") y se normaliza.
 * · Los tres `paymentType*` del v2 —uno por origen— se funden en la única
 *   columna `paymentType` de v3, que es texto libre justamente para esto
 *   (`copay`, `direct_insurance`, `contractual_obligation`, `deductible`…).
 * · `status = cancelled` entra como CANCELLED, no se descarta: un pago anulado
 *   es parte del historial de la cuenta.
 *
 * Uso:  node 12-billing.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'billing.json')

const leerMapa = n => {
  const f = join(MAPS, n)
  if (!existsSync(f)) throw new Error(`Falta id-maps/${n}`)
  return JSON.parse(readFileSync(f, 'utf8'))
}

const num = v => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const origen = v => {
  const s = String(v ?? '').toLowerCase()
  if (s === 'insurance') return 'INSURANCE'
  if (s === 'lawyer') return 'LAWYER'
  return 'PATIENT'
}

const metodo = v => {
  const s = String(v ?? '').toLowerCase()
  if (/check|cheque/.test(s)) return 'CHECK'
  if (/card|tarjeta/.test(s)) return 'CARD'
  if (/cash|efectivo/.test(s)) return 'CASH'
  if (/transfer|transferencia/.test(s)) return 'TRANSFER'
  return 'NONE'
}

const estadoPago = v => {
  const s = String(v ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  if (s === 'pending') return 'PENDING'
  return 'COMPLETED'
}

async function leerTodo(prefijo) {
  const filas = []
  for await (const r of leerRegistros(buscarCsv(prefijo))) filas.push(r)
  return filas
}

async function run() {
  const mapaCitas = leerMapa('appointments.json')
  const mapaCasos = leerMapa('cases.json')

  const [costos, pagos] = await Promise.all([leerTodo('costs'), leerTodo('payments')])
  const db = getPool()

  // ─── 1. Cargos ────────────────────────────────────────────────────────────
  const idMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}
  let cargos = 0, sinCita = 0, repetidos = 0, fallidos = 0
  let totalFacturado = 0, totalCobrado = 0

  for (const c of costos) {
    const appointmentId = c.appointmentId ? mapaCitas[c.appointmentId] : null
    if (!appointmentId) { sinCita++; continue }
    // Re-corrida: lo que ya se insertó no se repite. `appointment_billing` NO
    // tiene unique sobre `appointmentId` en la base (aunque el modelo lo sugiera),
    // así que el `ON CONFLICT` no existe y el que cuida es el id-map.
    if (idMap[c.id]) { repetidos++; continue }

    totalFacturado += num(c.totalCost)
    totalCobrado += num(c.amountPaid)
    if (DRY) { cargos++; continue }

    const nuevoId = cuid()
    try {
      const { rows } = await db.query(
        `INSERT INTO appointment_billing
           (id, "appointmentId", "caseId", "totalCost", discount, "insuranceCovered",
            "amountPaid", "balanceDue", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamp,NOW()),NOW())
         RETURNING id`,
        [nuevoId, appointmentId, c.caseId ? (mapaCasos[c.caseId] ?? null) : null,
         num(c.totalCost), num(c.discount), num(c.insuranceCovered),
         num(c.amountPaid), num(c.balanceDue), c.createdAt || null],
      )
      if (rows[0]) { idMap[c.id] = rows[0].id; cargos++ } else { repetidos++ }
    } catch (e) {
      console.log(`  ⚠️  cargo ${c.id}: ${e.message.split('\n')[0]}`)
      fallidos++
    }
    if (cargos % 250 === 0) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  }

  if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  // ─── 2. Pagos ─────────────────────────────────────────────────────────────
  const mapaSeguros = existsSync(join(MAPS, 'insurances.json'))
    ? JSON.parse(readFileSync(join(MAPS, 'insurances.json'), 'utf8'))
    : {}
  let pagados = 0, sinCargo = 0, fallidosPago = 0, montoPagos = 0

  for (const p of pagos) {
    const billingId = p.costId ? idMap[p.costId] : null
    if (!billingId) { sinCargo++; continue }

    montoPagos += num(p.amount)
    if (DRY) { pagados++; continue }

    try {
      await db.query(
        `INSERT INTO billing_payments
           (id, "billingId", source, "paymentType", amount, method, status,
            notes, "paidAt", "createdAt", "updatedAt")
         VALUES ($1,$2,$3::"billing_payment_source",$4,$5,$6::"billing_payment_method",
                 $7::"billing_payment_status",$8,COALESCE($9::timestamp,NOW()),
                 COALESCE($9::timestamp,NOW()),NOW())`,
        [cuid(), billingId, origen(p.source),
         // Los tres campos del v2 son excluyentes: se toma el que venga.
         p.paymentTypeInsurance || p.paymentTypeLawyer || p.paymentTypePatient || null,
         num(p.amount), metodo(p.method), estadoPago(p.status),
         p.notes || null, p.createdAt || null],
      )
      pagados++
    } catch (e) {
      console.log(`  ⚠️  pago ${p.id}: ${e.message.split('\n')[0]}`)
      fallidosPago++
    }
  }

  const usd = n => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  console.log(`\n📊 Facturación${DRY ? ' (dry)' : ''}`)
  console.log(`   cargos  : ${cargos} · ${sinCita} sin cita importada · ${repetidos} ya estaban · ${fallidos} fallidos`)
  console.log(`   pagos   : ${pagados} · ${sinCargo} sin cargo · ${fallidosPago} fallidos`)
  console.log(`   facturado ${usd(totalFacturado)} · cobrado ${usd(totalCobrado)} · en pagos ${usd(montoPagos)}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
