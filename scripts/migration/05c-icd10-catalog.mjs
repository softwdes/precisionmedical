/**
 * Migration 05c — ICD-10 CM Catalog
 * Importa los 98,187 diagnósticos del catálogo v2 → v3 diagnoses.
 * - ON CONFLICT DO NOTHING (idempotente)
 * - Batch 500 rows por INSERT para velocidad
 * - Genera id-maps/diagnostics.json (v2_id → v3_cuid)
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV      = `${process.env.CSV_DIR}/DBA2/diagnostics_202607131802.csv`
const MAP_FILE = './id-maps/diagnostics.json'
const BATCH    = 500

function classifyCategory(icdCode) {
  if (!icdCode) return 'OTHER'
  const ch = icdCode[0].toUpperCase()
  if (ch === 'S') return 'S'
  if (ch === 'T') return 'T'
  if (ch === 'M') return 'M'
  if (ch === 'R') return 'R'
  if (ch === 'G') return 'G'
  if (ch === 'F') return 'F'
  if (ch === 'V' || ch === 'W') return 'V_W'
  if (ch === 'Z') return 'Z'
  return 'OTHER'
}

async function main() {
  const pool = getPool()
  const idMap = {}

  console.log('📋 Leyendo CSV ICD-10...')
  const rows = await parseCSV(CSV)
  console.log(`   Total rows: ${rows.length}`)

  // Solo ACTIVE
  const active = rows.filter(r => (r.status || '').toUpperCase() !== 'INACTIVE')
  console.log(`   Activos a migrar: ${active.length}`)

  // Asignar CUIDs anticipados (necesitamos el map completo al final)
  const prepared = active.map(r => ({
    v2Id : String(r.id),
    newId: cuid(),
    code : (r.icdCode || '').trim().toUpperCase(),
    desc : (r.name || r.description || '').substring(0, 500),
    cat  : classifyCategory((r.icdCode || '').trim()),
  })).filter(r => r.code.length > 0)

  console.log(`   Preparados: ${prepared.length} | Iniciando batches de ${BATCH}...`)

  let inserted = 0
  let skipped  = 0

  for (let i = 0; i < prepared.length; i += BATCH) {
    const batch = prepared.slice(i, i + BATCH)

    // Construir multi-row INSERT
    const values = []
    const params = []
    let p = 1
    for (const row of batch) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},NOW(),NOW())`)
      params.push(row.newId, row.code, row.desc, row.cat, true)
    }

    const sql = `
      INSERT INTO diagnoses (id, "icd10Code", "icd10Description", category, "isActive", "createdAt", "updatedAt")
      VALUES ${values.join(',')}
      ON CONFLICT ("icd10Code") DO NOTHING
    `
    const result = await pool.query(sql, params)
    inserted += result.rowCount ?? 0

    // Registrar en map independientemente (si existía antes, igual guardamos el nuevo id
    // pero luego lo corregimos con el SELECT abajo)
    for (const row of batch) idMap[row.v2Id] = row.newId

    if ((i / BATCH) % 20 === 0) {
      console.log(`   ... ${i + batch.length}/${prepared.length}`)
    }
  }

  // Para los que ya existían (DO NOTHING), sobreescribir el map con el id real de v3
  console.log('   Reconciliando id-map con registros pre-existentes...')
  const { rows: existing } = await pool.query(`SELECT id, "icd10Code" FROM diagnoses`)
  const byCode = {}
  for (const r of existing) byCode[r.icd10Code] = r.id

  for (const row of prepared) {
    if (byCode[row.code]) idMap[row.v2Id] = byCode[row.code]
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ ICD-10 catalog completado:')
  console.log(`   Nuevos insertados : ${inserted}`)
  console.log(`   Ya existían (skip): ${prepared.length - inserted}`)
  console.log(`   ID-map guardado   : ${MAP_FILE} (${Object.keys(idMap).length} entradas)`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
