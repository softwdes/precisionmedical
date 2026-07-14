/**
 * Migration 05b — Services Catalog
 * Importa los 329 servicios de LM v2 → v3 service_codes.
 * - Hace match por `code` con los 25 existentes (UPDATE fee si difiere)
 * - Inserta los restantes como nuevos
 * - Genera id-maps/services.json (v2_id → v3_cuid)
 * - Omite INACTIVE y registros de prueba
 */
import 'dotenv/config'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV      = `${process.env.CSV_DIR}/services_202607121237.csv`
const MAP_FILE = './id-maps/services.json'

// ── Clasificación ──────────────────────────────────────────────────────────

function classifyType(code) {
  const c = (code || '').trim().toUpperCase()
  // HCPCS Level II: empieza con letra A-V excepto E
  if (/^[ABCDEFGHJKLMNPQRSTUVW]/i.test(c) && !/^\d/.test(c)) {
    // Codigos internos conocidos → CUSTOM_PM
    const customs = ['PMDC','RTNCHK','LABS','INT','M.I.A','SI&R','RTNCHK']
    if (customs.some(x => c.startsWith(x)) || c.includes('COPY') || c.includes('PRUEBA')) {
      return 'CUSTOM_PM'
    }
    return 'HCPCS'
  }
  // Numérico puro o con modificador → CPT
  if (/^\d/.test(c)) return 'CPT'
  return 'CUSTOM_PM'
}

function classifyCategory(code) {
  const c = (code || '').replace(/\s+/g,'').replace(/-.*/, '').toUpperCase()
  const n = parseInt(c.replace(/[^0-9]/g,''), 10)

  // Rangos CPT estándar
  if (n >= 10000 && n <= 69999) return 'SURGERY'
  if (n >= 70000 && n <= 79999) return 'IMAGING'
  if (n >= 80000 && n <= 89999) return 'LAB'
  if (n >= 90281 && n <= 90399) return 'OTHER'   // vacunas/immune globulins
  if (n >= 90460 && n <= 90749) return 'OTHER'   // inmunizaciones
  if (n >= 93000 && n <= 93299) return 'OTHER'   // cardiology ECG
  if (n >= 94000 && n <= 94799) return 'OTHER'   // pulmonary
  if (n >= 95000 && n <= 95999) return 'OTHER'   // allergy/neurology
  if (n >= 96000 && n <= 96999) return 'OTHER'   // psychology/neurobeh
  if (n >= 97000 && n <= 97799) return 'PHYSICAL_THERAPY'
  if (n >= 97800 && n <= 97999) return 'OTHER'
  if (n >= 98000 && n <= 98999) return 'CHIROPRACTIC'
  if (n >= 99000 && n <= 99999) return 'EM'

  // HCPCS por prefijo
  if (c.startsWith('J') || c.startsWith('Q') || c.startsWith('S')) return 'DRUGS'
  if (c.startsWith('A') || c.startsWith('L'))  return 'DME'
  if (c.startsWith('G')) return 'EM'

  return 'CUSTOM'
}

function cleanDescription(raw) {
  if (!raw) return ''
  // Elimina artefactos como "CH", números incrustados tipo "4L9A.0T" etc.
  return raw
    .replace(/\s+CH\s*/g, ' ')   // artefacto "CH" al final de palabras
    .replace(/CH$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
}

const SKIP_CODES = new Set([
  '99999','PRUEBA','SISTEMA','PRUEBA-COPY','SISTEMA-COPY'
])

function shouldSkip(row) {
  if ((row.status || '').toUpperCase() === 'INACTIVE') return true
  const code = (row.code || '').toUpperCase()
  if (SKIP_CODES.has(code)) return true
  const desc = (row.description || '').toLowerCase()
  if (desc.startsWith('prueba') || desc === 'sistema') return true
  return false
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const pool = getPool()
  const idMap = {}

  console.log('📋 Leyendo CSV de servicios v2...')
  const rows = await parseCSV(CSV)
  const active = rows.filter(r => !shouldSkip(r))
  console.log(`   Total rows: ${rows.length} | Active a migrar: ${active.length}`)

  // Cargar service_codes existentes en v3 (indexados por code)
  const { rows: existing } = await pool.query(
    `SELECT id, code FROM service_codes WHERE "deletedAt" IS NULL`
  )
  const existingByCode = {}
  for (const r of existing) existingByCode[r.code.toUpperCase()] = r.id
  console.log(`   Existentes en v3: ${existing.length}`)

  let inserted = 0
  let matched  = 0
  let skipped  = 0

  for (const row of active) {
    const v2Id   = String(row.id)
    const code   = (row.code || '').trim()
    const codeUC = code.toUpperCase()
    const desc   = cleanDescription(row.description)
    const fee    = parseFloat(row.cost) || 0
    const type   = classifyType(code)
    const cat    = classifyCategory(code)

    if (!code || code.length > 50) { skipped++; continue }

    if (existingByCode[codeUC]) {
      // Ya existe — solo actualizar el fee si cambió
      const v3Id = existingByCode[codeUC]
      idMap[v2Id] = v3Id
      await pool.query(
        `UPDATE service_codes SET "currentFee" = $1, "updatedAt" = NOW()
         WHERE id = $2 AND "currentFee" <> $1`,
        [fee, v3Id]
      )
      matched++
    } else {
      // Insertar nuevo
      const newId = cuid()
      idMap[v2Id] = newId
      await pool.query(
        `INSERT INTO service_codes
           (id, code, type, "shortDescription", "longDescription", category,
            "currentFee", "fiscalYear", "isActive", "isInternalOnly",
            "sortOrder", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
         ON CONFLICT (code, "fiscalYear") DO UPDATE
           SET "shortDescription" = EXCLUDED."shortDescription",
               "currentFee"       = EXCLUDED."currentFee",
               "updatedAt"        = NOW()
         RETURNING id`,
        [
          newId,
          code,
          type,
          desc.substring(0, 100) || code,
          desc || null,
          cat,
          fee,
          2026,
          true,
          type === 'CUSTOM_PM',
          0,
        ]
      )
      existingByCode[codeUC] = newId
      inserted++
    }
  }

  // Guardar id-map
  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ Services catalog completado:')
  console.log(`   Nuevos insertados : ${inserted}`)
  console.log(`   Matched existentes: ${matched}`)
  console.log(`   Saltados          : ${skipped}`)
  console.log(`   ID-map guardado   : ${MAP_FILE} (${Object.keys(idMap).length} entradas)`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
