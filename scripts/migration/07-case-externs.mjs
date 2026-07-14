/**
 * Migration 07 — Case Externs (signatures)
 * - Actualiza cases con lawFirmId y primaryAttorneyId usando los maps de v2
 * - Sube las firmas base64 a Supabase Storage bucket "intake-signatures"
 * - Guarda URLs en case_externs table (si existe) o en Case directamente
 *
 * NOTA: las firmas en v2 son base64 PNG (~100KB c/u). Las subimos a Storage
 * y guardamos la URL pública en la tabla case_signatures (nueva) o en un
 * campo de Case si se decide así.
 *
 * Por ahora: creamos tabla case_signatures en DB si no existe, e insertamos.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV      = `${process.env.CSV_DIR}/DBA2/case_externs_202607131834.csv`
const MAP_FILE = './id-maps/case-externs.json'

function loadMap(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

// Supabase Storage upload via REST API
async function uploadSignatureToStorage(bucket, path, base64Data) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    // Sin credenciales de Storage — skip upload, retornar null
    return null
  }

  const buffer = Buffer.from(base64Data, 'base64')
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  })

  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Storage upload failed: ${resp.status} ${txt}`)
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

async function main() {
  const pool = getPool()

  const casesMap     = loadMap('./id-maps/cases.json')
  const companiesMap = loadMap('./id-maps/companies.json')
  const attorneysMap = loadMap('./id-maps/attorneys.json')

  console.log('📋 Leyendo CSV case_externs...')
  const rows = await parseCSV(CSV)
  console.log(`   Total: ${rows.length}`)

  // Asegurar columna signatureExempt en cases (si no existe, ignoramos error)
  await pool.query(`
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS "signatureExempt" BOOLEAN DEFAULT FALSE
  `).catch(() => {})

  // Asegurar tabla case_signatures
  await pool.query(`
    CREATE TABLE IF NOT EXISTS case_signatures (
      id                  TEXT PRIMARY KEY,
      "caseId"            TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      "patientName"       TEXT,
      "patientSignatureUrl" TEXT,
      "responsibleName"   TEXT,
      "responsibleSignatureUrl" TEXT,
      "isSignatureExempt" BOOLEAN DEFAULT FALSE,
      "createdAt"         TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt"         TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})

  const hasStorage = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  if (!hasStorage) {
    console.log('   ⚠️  SUPABASE_URL / SUPABASE_SERVICE_KEY no configurados — se saltará upload de firmas')
  }

  const idMap = {}
  let done = 0, noCase = 0, sigErr = 0

  for (const row of rows) {
    const v2CaseId = String(row.caseId)
    const v3CaseId = casesMap[v2CaseId]
    if (!v3CaseId) { noCase++; continue }

    let patientSigUrl    = null
    let responsibleSigUrl = null

    if (hasStorage) {
      try {
        if (row.patientSignatureBase64 && row.patientSignatureBase64.length > 10) {
          patientSigUrl = await uploadSignatureToStorage(
            'intake-signatures',
            `cases/${v3CaseId}/patient-sig.png`,
            row.patientSignatureBase64
          )
        }
        if (row.responsibleSignatureBase64 && row.responsibleSignatureBase64.length > 10) {
          responsibleSigUrl = await uploadSignatureToStorage(
            'intake-signatures',
            `cases/${v3CaseId}/responsible-sig.png`,
            row.responsibleSignatureBase64
          )
        }
      } catch (e) {
        sigErr++
        console.warn(`   ⚠️  Upload sig error case ${v3CaseId}: ${e.message}`)
      }
    }

    const newId = cuid()
    idMap[String(row.id)] = newId

    await pool.query(`
      INSERT INTO case_signatures
        (id, "caseId", "patientName", "patientSignatureUrl",
         "responsibleName", "responsibleSignatureUrl", "isSignatureExempt",
         "createdAt", "updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
    `, [
      newId,
      v3CaseId,
      row.patientNameSignature   || null,
      patientSigUrl,
      row.responsibleNameSignature || null,
      responsibleSigUrl,
      row.isSignatureExempt === 'true' || row.isSignatureExempt === '1',
      row.createdAt ? new Date(row.createdAt) : new Date(),
      new Date(),
    ])

    done++
    if (done % 100 === 0) console.log(`   ... ${done}/${rows.length - noCase}`)
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log('\n✅ Case externs completado:')
  console.log(`   Procesados   : ${done}`)
  console.log(`   Sin case map : ${noCase}`)
  console.log(`   Errores sig  : ${sigErr}`)
  console.log(`   ID-map       : ${MAP_FILE}`)

  await closePool()
}

main().catch(e => { console.error('❌', e); process.exit(1) })
