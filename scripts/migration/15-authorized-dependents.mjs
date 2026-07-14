import 'dotenv/config'
import pg from 'pg'
import { parseCSV } from './utils/csv.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const CSV_FILE = 'C:/Users/Erick/Downloads/authorized_dependents_202607141003.csv'
const CASE_MAP_FILE = join(import.meta.dirname, 'id-maps/cases.json')

async function main() {
  const caseMap = JSON.parse(readFileSync(CASE_MAP_FILE, 'utf8'))
  const rows = await parseCSV(CSV_FILE)

  console.log(`👥 Total dependientes: ${rows.length}`)

  let inserted = 0, noCase = 0

  for (const row of rows) {
    const caseId = caseMap[String(row.caseId)]
    if (!caseId) { noCase++; continue }

    // Los valores en v2 ya vienen cifrados con AES-GCM (prefijo "e:")
    // Se migran tal cual — misma clave AES_GCM_KEY_B64 en ambos sistemas
    await pool.query(
      `INSERT INTO authorized_dependents
         (id, "caseId", "nameEncrypted", "relationshipEncrypted", "createdAt")
       VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        caseId,
        row.name,
        row.relationship,
        new Date(),
      ]
    )
    inserted++
  }

  console.log(`\n✅ Dependientes: ${inserted} insertados, ${noCase} sin case-map`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
