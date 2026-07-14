import 'dotenv/config'
import pg from 'pg'
import { parseCSV } from './utils/csv.mjs'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const CSV_FILE = 'C:/Users/Erick/Downloads/documents_202607141004.csv'
const CASE_MAP_FILE = join(import.meta.dirname, 'id-maps/cases.json')
const PATIENT_MAP_FILE = join(import.meta.dirname, 'id-maps/patients.json')
const OUT_FILE = join(import.meta.dirname, 'id-maps/patient-documents.json')

const BATCH_SIZE = 200

async function main() {
  const caseMap = JSON.parse(readFileSync(CASE_MAP_FILE, 'utf8'))
  const patientMap = JSON.parse(readFileSync(PATIENT_MAP_FILE, 'utf8'))
  const rows = await parseCSV(CSV_FILE)

  console.log(`📂 Total filas: ${rows.length}`)

  // Separar carpetas de archivos — las carpetas van primero para que existan
  // como parentId cuando se insertan los archivos hijos
  const folders = rows.filter(r => r.isFolder === 'true')
  const files   = rows.filter(r => r.isFolder !== 'true')

  const docIdMap = {}

  let inserted = 0, skipped = 0

  // Procesar carpetas en orden (depth-first: sin parent primero)
  const toProcess = [...folders, ...files]

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      const v2Id = String(row.id)
      const caseId = caseMap[String(row.caseId)] ?? null
      const patientId = patientMap[String(row.patientId)] ?? null

      // Resolver parentId usando el mapa construido en esta misma ejecución
      const parentId = row.parentId ? (docIdMap[String(row.parentId)] ?? null) : null

      const isFolder = row.isFolder === 'true'

      try {
        const newId = randomUUID()
        await pool.query(
          `INSERT INTO patient_documents
             (id, name, "s3Key", "isFolder", size, "mimeType", "patientId", "caseId", "parentId", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
          [
            newId,
            row.name,
            isFolder ? null : row.minioKey,
            isFolder,
            row.size ? parseInt(row.size) : null,
            row.mimeType || null,
            patientId,
            caseId,
            parentId,
            new Date(row.createdAt),
          ]
        )
        docIdMap[v2Id] = newId
        inserted++
      } catch (e) {
        console.warn(`  ⚠ doc ${v2Id} skip: ${e.message}`)
        skipped++
      }
    }

    console.log(`  lote ${i + BATCH_SIZE}/${toProcess.length} — insertados: ${inserted} skip: ${skipped}`)
  }

  writeFileSync(OUT_FILE, JSON.stringify(docIdMap, null, 2))
  console.log(`\n✅ Documentos: ${inserted} insertados, ${skipped} omitidos`)
  console.log(`   id-map → ${OUT_FILE}`)

  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
