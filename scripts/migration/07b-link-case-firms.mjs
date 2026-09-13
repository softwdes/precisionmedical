/**
 * Migración 07b — Vincular cada caso con su bufete y su abogado
 *
 * Reemplaza a la versión de julio, que buscaba el bufete con `firmName ILIKE` y
 * por eso el id-map de companies terminó con 15 entradas. Ahora:
 *
 * ── Pasada 1 · `case_externs` (el vínculo explícito del v2) ─────────────────
 *   companyId            → `Case.lawFirmId`     (261 filas / 256 casos)
 *   responsibleExternId  → `Case.attorneyId`    (161)
 *   assistantExternId    → `Case.paralegalId`   (148)
 * Todo por id-map, no por nombre.
 *
 * ── Pasada 2 · los campos cifrados de `cases` (el hallazgo) ────────────────
 * El v2 guarda además, cifrado en el propio caso, `reference` = el BUFETE que
 * refirió (522 casos) y `preferredLawyer` = el abogado (423). Son MÁS del doble
 * de los que tienen vínculo explícito. Se descifran y se emparejan por nombre
 * **exacto y sin ambigüedad** contra lo ya importado; si el nombre coincide con
 * dos fichas, no se asigna.
 *
 * La pasada 2 **no pisa nunca** lo que puso la 1: el vínculo explícito manda.
 *
 * Uso:  node 07b-link-case-firms.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')

const leerMapa = n => {
  const f = join(MAPS, n)
  if (!existsSync(f)) throw new Error(`Falta id-maps/${n}`)
  return JSON.parse(readFileSync(f, 'utf8'))
}

const norm = s => (s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[.,]/g, '').replace(/\s*&\s*/g, ' and ')
  .replace(/\b(llc|llp|pc|pllc|pa|inc)\b/g, '')
  .replace(/\s+/g, ' ').trim()

const val = v => {
  if (!v) return null
  const t = decrypt(String(v))
  if (t === null) return null
  const s = String(t).trim()
  return s === '' || /^e:/.test(s) ? null : s
}

async function leerTodo(prefijo) {
  const filas = []
  for await (const r of leerRegistros(buscarCsv(prefijo))) filas.push(r)
  return filas
}

/** nombre normalizado → id, pero SOLO si es único. Los repetidos se descartan. */
function indicePorNombre(filas, nombreDe) {
  const m = new Map()
  for (const f of filas) {
    const k = norm(nombreDe(f))
    if (!k) continue
    if (m.has(k)) m.set(k, null)        // ambiguo: se anula
    else m.set(k, f.id)
  }
  return m
}

async function run() {
  const mapaCasos = leerMapa('cases.json')
  const mapaBufetes = leerMapa('companies.json')
  const mapaAbogados = leerMapa('attorneys.json')

  const [externs, casos] = await Promise.all([leerTodo('case_externs'), leerTodo('cases')])
  const db = getPool()

  // ─── Pasada 1 ─────────────────────────────────────────────────────────────
  let p1Bufete = 0, p1Abogado = 0, p1Paralegal = 0, sinCaso = 0
  for (const r of externs) {
    const caseId = mapaCasos[r.caseId]
    if (!caseId) { sinCaso++; continue }

    const lawFirmId = r.companyId ? (mapaBufetes[r.companyId] ?? null) : null
    const attorneyId = r.responsibleExternId ? (mapaAbogados[r.responsibleExternId] ?? null) : null
    const paralegalId = r.assistantExternId ? (mapaAbogados[r.assistantExternId] ?? null) : null
    if (!lawFirmId && !attorneyId && !paralegalId) continue

    if (!DRY) {
      // COALESCE en la COLUMNA: si el caso ya tiene bufete de otra fila de
      // case_externs, no se pisa.
      await db.query(
        `UPDATE cases SET
           "lawFirmId"   = COALESCE("lawFirmId", $2),
           "attorneyId"  = COALESCE("attorneyId", $3),
           "paralegalId" = COALESCE("paralegalId", $4)
         WHERE id = $1`,
        [caseId, lawFirmId, attorneyId, paralegalId],
      )
    }
    if (lawFirmId) p1Bufete++
    if (attorneyId) p1Abogado++
    if (paralegalId) p1Paralegal++
  }

  // ─── Pasada 2 ─────────────────────────────────────────────────────────────
  const { rows: bufetes } = await db.query(
    `SELECT id, "firmName" AS nombre FROM lawyers WHERE "entityType" = 'FIRM' AND "deletedAt" IS NULL`,
  )
  const { rows: personas } = await db.query(
    `SELECT id, COALESCE("firstName",'') || ' ' || COALESCE("lastName",'') AS nombre
       FROM lawyers WHERE "entityType" <> 'FIRM' AND "deletedAt" IS NULL`,
  )
  const porBufete = indicePorNombre(bufetes, f => f.nombre)
  const porPersona = indicePorNombre(personas, f => f.nombre)

  let p2Bufete = 0, p2Abogado = 0, sinMatchBufete = new Set(), sinMatchAbogado = new Set()

  for (const c of casos) {
    const caseId = mapaCasos[c.id]
    if (!caseId) continue

    const refBufete = val(c.reference)
    const refAbogado = val(c.preferredLawyer)
    if (!refBufete && !refAbogado) continue

    const idBufete = refBufete ? porBufete.get(norm(refBufete)) : null
    const idAbogado = refAbogado ? porPersona.get(norm(refAbogado)) : null
    if (refBufete && !idBufete) sinMatchBufete.add(refBufete)
    if (refAbogado && !idAbogado) sinMatchAbogado.add(refAbogado)
    if (!idBufete && !idAbogado) continue

    if (!DRY) {
      const { rowCount } = await db.query(
        `UPDATE cases SET
           "lawFirmId"  = COALESCE("lawFirmId", $2),
           "attorneyId" = COALESCE("attorneyId", $3)
         WHERE id = $1
           AND ("lawFirmId" IS NULL OR "attorneyId" IS NULL)`,
        [caseId, idBufete, idAbogado],
      )
      if (rowCount === 0) continue
    }
    if (idBufete) p2Bufete++
    if (idAbogado) p2Abogado++
  }

  // ─── Resultado ────────────────────────────────────────────────────────────
  console.log(`\n📊 Pasada 1 — vínculo explícito de case_externs${DRY ? ' (dry)' : ''}`)
  console.log(`   bufete ${p1Bufete} · abogado ${p1Abogado} · paralegal ${p1Paralegal} · ${sinCaso} filas sin caso importado`)
  console.log(`\n📊 Pasada 2 — nombres descifrados del propio caso`)
  console.log(`   bufete ${p2Bufete} · abogado ${p2Abogado}`)
  console.log(`   sin match: ${sinMatchBufete.size} nombres de bufete y ${sinMatchAbogado.size} de abogado que no están en el catálogo`)
  if (sinMatchBufete.size) {
    console.log(`   ej. bufetes: ${[...sinMatchBufete].slice(0, 6).join(' · ')}`)
  }

  if (!DRY) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FILTER (WHERE "lawFirmId" IS NOT NULL)::int AS bufete,
              COUNT(*) FILTER (WHERE "attorneyId" IS NOT NULL)::int AS abogado,
              COUNT(*) FILTER (WHERE "paralegalId" IS NOT NULL)::int AS paralegal,
              COUNT(*)::int AS total
         FROM cases WHERE "deletedAt" IS NULL`,
    )
    const r = rows[0]
    console.log(`\n👉 De ${r.total} casos: ${r.bufete} con bufete · ${r.abogado} con abogado · ${r.paralegal} con paralegal`)
  }
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
