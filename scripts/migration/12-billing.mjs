/**
 * Migration 12 — Billing (costs + payments)
 * v2: costs (6,159) + payments (323)
 * v3: AppointmentBilling (1:1 con Appointment) + BillingPayment
 *
 * Depende de:
 *   id-maps/appointments.json
 *   id-maps/insurances.json (para payments con source=insurance)
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const COSTS_CSV    = `${process.env.CSV_DIR}/DBA2/costs_202607131826.csv`
const PAYMENTS_CSV = `${process.env.CSV_DIR}/DBA2/payments_202607131829.csv`
const MAP_FILE     = './id-maps/billing.json'

function loadMap(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

function parseDecimal(s) {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parseDate(s) {
  if (!s || s === 'null') return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function mapPaymentSource(src) {
  const s = (src || '').toLowerCase()
  if (s === 'insurance') return 'INSURANCE'
  if (s === 'patient')   return 'PATIENT'
  if (s === 'lawyer')    return 'LAWYER'
  return 'PATIENT'
}

function mapPaymentMethod(m) {
  const s = (m || '').toLowerCase()
  if (s === 'check')    return 'CHECK'
  if (s === 'card')     return 'CARD'
  if (s === 'cash')     return 'CASH'
  if (s.includes('transfer') || s.includes('wire')) return 'TRANSFER'
  return 'NONE'
}

function mapPaymentStatus(s) {
  const st = (s || '').toUpperCase()
  if (st === 'CANCELLED' || st === 'CANCELED') return 'CANCELLED'
  if (st === 'PENDING')  return 'PENDING'
  return 'COMPLETED'
}

async function main() {
  const pool = getPool()

  const apptMap  = loadMap('./id-maps/appointments.json')
  const insMap   = loadMap('./id-maps/insurances.json')

  console.log('📋 Leyendo CSVs costs + payments...')
  const [costsRows, paymentsRows] = await Promise.all([
    parseCSV(COSTS_CSV),
    parseCSV(PAYMENTS_CSV),
  ])
  console.log(`   Costs: ${costsRows.length} | Payments: ${paymentsRows.length}`)

  // Indexar payments por costId (v2)
  const paymentsByCost = {}
  for (const p of paymentsRows) {
    const cid = String(p.costId)
    if (!paymentsByCost[cid]) paymentsByCost[cid] = []
    paymentsByCost[cid].push(p)
  }

  const idMap = {}   // v2 cost id → v3 billing id
  let billingInserted = 0, payInserted = 0, noAppt = 0

  const BATCH = 50  // smaller batch due to payments sub-loop
  const allCosts = costsRows

  for (let i = 0; i < allCosts.length; i++) {
    const row = allCosts[i]
    const v2ApptId = String(row.appointmentId)
    const v3ApptId = apptMap[v2ApptId]

    if (!v3ApptId) { noAppt++; continue }

    const billingId = cuid()
    idMap[String(row.id)] = billingId

    const v2CaseId = row.caseId || null

    try {
      await pool.query(`
        INSERT INTO appointment_billing
          (id, "appointmentId", "totalCost", discount, "insuranceCovered",
           "amountPaid", "balanceDue", "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT ("appointmentId") DO NOTHING
      `, [
        billingId,
        v3ApptId,
        parseDecimal(row.totalCost),
        parseDecimal(row.discount),
        parseDecimal(row.insuranceCovered),
        parseDecimal(row.amountPaid),
        parseDecimal(row.balanceDue),
        parseDate(row.createdAt) || new Date(),
        new Date(),
      ])
      billingInserted++
    } catch (e) {
      console.warn(`   ⚠️  Billing row ${row.id}: ${e.message.substring(0,80)}`)
      continue
    }

    // Migrar payments de este cost
    const payments = paymentsByCost[String(row.id)] || []
    for (const p of payments) {
      const v3InsId = insMap[String(p.insuranceId || '')] || null
      const payId   = cuid()
      try {
        await pool.query(`
          INSERT INTO billing_payments
            (id, "billingId", source, "paymentType", amount, method, status,
             "insuranceCarrierId", notes, "paidAt", "createdAt", "updatedAt")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (id) DO NOTHING
        `, [
          payId,
          billingId,
          mapPaymentSource(p.source),
          p.paymentTypeInsurance || p.paymentTypePatient || p.paymentTypeLawyer || null,
          parseDecimal(p.amount),
          mapPaymentMethod(p.method),
          mapPaymentStatus(p.status),
          v3InsId,
          p.notes || null,
          parseDate(p.createdAt),
          parseDate(p.createdAt) || new Date(),
          new Date(),
        ])
        payInserted++
      } catch (e) {
        console.warn(`   ⚠️  Payment row ${p.id}: ${e.message.substring(0,80)}`)
      }
    }

    if (i > 0 && i % 1000 === 0) {
      console.log(`   ... ${i}/${allCosts.length} costs procesados`)
    }
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ Billing completado:')
  console.log(`   Billing insertados : ${billingInserted}`)
  console.log(`   Payments insertados: ${payInserted}`)
  console.log(`   Sin appt map       : ${noAppt}`)
  console.log(`   ID-map             : ${MAP_FILE}`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
