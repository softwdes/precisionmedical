/**
 * Migración 07c — Enganchar casos a bufetes que YA están, escritos distinto
 *
 * El `reference` del v2 es texto libre y la recepción escribía como podía:
 *
 *     "Good Guys" · "The Good Guys Injury Law" · "Good Guys Injury Lawers"
 *          → las tres son `Good Guys Injury Law`, que ya está en el catálogo
 *     "Hart & Hart Law Office" → `Hart and Hart`
 *     "Schriever Law firm"     → `The Schriever Law Firm`
 *
 * `07b` compara con una normalización conservadora (minúsculas, sin puntuación)
 * y estos no enganchan. Acá se usa una normalización AGRESIVA que además saca
 * artículos y palabras de relleno del rubro —the, law, office(s) of, firm,
 * group, injury, attorneys, y los sufijos LLC/PC/PLLC— y se queda solo con el
 * nombre propio.
 *
 * ⚠️ **Solo vincula con bufetes que ya existen; no crea ninguno.** Y si el
 * nombre normalizado matchea con DOS fichas distintas, no toca nada: en un
 * expediente legal, colgarlo del bufete equivocado es peor que dejarlo vacío.
 * Nunca pisa un `lawFirmId` ya puesto.
 *
 * Uso:  node 07c-bufetes-nombre-flexible.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')

/** Normalización agresiva: se queda con el nombre propio del bufete. */
const RELLENO = /\b(the|law|laws|office|offices|of|firm|group|injury|attorney|attorneys|at|lawer|lawers|lawyer|lawyers|associates|pllc|llc|llp|pc|pa|inc|utah)\b/g
const nn = s => (s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[.,'"]/g, '').replace(/&/g, ' and ')
  .replace(RELLENO, ' ').replace(/\s+/g, ' ').trim()

const val = v => {
  if (!v) return null
  const t = decrypt(String(v))
  if (t === null) return null
  const s = String(t).trim()
  return s === '' || /^e:/.test(s) ? null : s
}

async function run() {
  const f = join(import.meta.dirname, 'id-maps/cases.json')
  if (!existsSync(f)) throw new Error('Falta id-maps/cases.json')
  const mapaCasos = JSON.parse(readFileSync(f, 'utf8'))

  const db = getPool()
  const { rows: bufetes } = await db.query(
    `SELECT id, "firmName" FROM lawyers WHERE "entityType" = 'FIRM' AND "deletedAt" IS NULL`,
  )

  // nombre normalizado → id, y null cuando es ambiguo.
  const porNombre = new Map()
  for (const b of bufetes) {
    const k = nn(b.firmName)
    if (!k) continue
    porNombre.set(k, porNombre.has(k) ? null : b.id)
  }

  // Los casos que hoy NO tienen bufete.
  const { rows: sinBufete } = await db.query(
    `SELECT id FROM cases WHERE "lawFirmId" IS NULL AND "deletedAt" IS NULL`,
  )
  const pendientes = new Set(sinBufete.map(r => r.id))

  let vinculados = 0, ambiguos = 0, sinMatch = 0, yaTenian = 0
  const porBufete = new Map()

  for await (const c of leerRegistros(buscarCsv('cases'))) {
    const caseId = mapaCasos[c.id]
    if (!caseId) continue
    if (!pendientes.has(caseId)) { yaTenian++; continue }

    const ref = val(c.reference)
    if (!ref) continue

    const k = nn(ref)
    if (!porNombre.has(k)) { sinMatch++; continue }

    const firmId = porNombre.get(k)
    if (!firmId) { ambiguos++; continue }

    if (!DRY) {
      await db.query(
        `UPDATE cases SET "lawFirmId" = $2 WHERE id = $1 AND "lawFirmId" IS NULL`,
        [caseId, firmId],
      )
    }
    const nombre = bufetes.find(b => b.id === firmId).firmName
    porBufete.set(nombre, (porBufete.get(nombre) ?? 0) + 1)
    vinculados++
  }

  console.log(`\n📊 Vinculados por nombre flexible: ${vinculados}${DRY ? ' (dry)' : ''}`)
  for (const [n, cuantos] of [...porBufete].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(cuantos).padStart(3)}  ${n}`)
  }
  console.log(`   ${ambiguos} ambiguos (dos bufetes con el mismo nombre normalizado) · ${sinMatch} sin equivalente en el catálogo`)

  if (!DRY) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FILTER (WHERE "lawFirmId" IS NOT NULL)::int AS con, COUNT(*)::int AS total
         FROM cases WHERE "deletedAt" IS NULL`,
    )
    console.log(`\n👉 Casos con bufete: ${rows[0].con} de ${rows[0].total}`)
  }
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
