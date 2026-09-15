/**
 * Migración 12b — Marcar qué cargos vinieron del v2.
 *
 * Pone `appointment_billing.migratedFromV2 = true` en las filas que creó el
 * script 12, y en ninguna otra. La lista NO sale de un patrón: sale de
 * `id-maps/billing.json`, que es el registro de qué fila `costs` del v2 se
 * convirtió en qué fila de v3.
 *
 * Es lo que le permite a Finanzas mostrar el historial del v2 aparte —de solo
 * lectura, con sus pagos— sin mezclarlo con lo que hay que cobrar hoy. Ver el
 * encabezado de `prisma/sql/20260915-cargos-del-v2.sql` para el porqué.
 *
 * Idempotente: se puede correr las veces que haga falta.
 *
 * Uso:
 *   node 12b-marcar-cargos-del-v2.mjs --dry
 *   node 12b-marcar-cargos-del-v2.mjs
 */
import './utils/env.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getPool, closePool } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')

async function run() {
  const db = getPool()

  const mapa = JSON.parse(readFileSync(join(import.meta.dirname, 'id-maps/billing.json'), 'utf8'))
  const ids = [...new Set(Object.values(mapa))]
  console.log(`${ids.length} cargos registrados como migrados del v2`)

  const { rows: antes } = await db.query(
    `SELECT count(*)::int AS existen FROM appointment_billing WHERE id = ANY($1)`, [ids])
  console.log(`  de esos, existen en la base: ${antes[0].existen}`)

  if (DRY) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS ya FROM appointment_billing
        WHERE id = ANY($1) AND "migratedFromV2"`, [ids])
    console.log(`  ya marcados: ${rows[0].ya}  (DRY — no se escribió)`)
    await closePool()
    return
  }

  const { rowCount } = await db.query(
    `UPDATE appointment_billing SET "migratedFromV2" = true, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ANY($1) AND NOT "migratedFromV2"`, [ids])
  console.log(`marcados ahora: ${rowCount}`)

  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE "migratedFromV2")::int AS del_v2,
            count(*) FILTER (WHERE NOT "migratedFromV2")::int AS de_v3,
            count(*)::int AS total,
            round(sum("balanceDue") FILTER (WHERE "migratedFromV2")::numeric, 2) AS saldo_del_v2
       FROM appointment_billing`)
  console.log('\nen la base:', rows[0])

  await closePool()
}

run().catch((e) => { console.error(e); process.exit(1) })
