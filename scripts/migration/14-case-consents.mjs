import 'dotenv/config'
import pg from 'pg'
import { parseCSV } from './utils/csv.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const CSV_FILE = 'C:/Users/Erick/Downloads/case_consents_202607141002.csv'
const CASE_MAP_FILE = join(import.meta.dirname, 'id-maps/cases.json')

// Mapeo de códigos v2 → enum ConsentCode de v3
const CODE_MAP = {
  CONSENT_FOR_TREATMENT:                              'CONSENT_FOR_TREATMENT',
  MEDICAL_INFORMATION_RELEASE_TO_ASSIGNED_PARTIES:    'MEDICAL_INFORMATION_RELEASE_TO_ASSIGNED_PARTIES',
  MEDICAL_INFORMATION_RELEASE:                        'MEDICAL_INFORMATION_RELEASE_TO_ASSIGNED_PARTIES',
  CREDIT_AND_FINANCE_CHARGE_POLICY_AND_AGREEMENT:     'CREDIT_AND_FINANCE_CHARGE_POLICY_AND_AGREEMENT',
  MEDICATION_HISTORY_AUTHORITY:                       'MEDICATION_HISTORY_AUTHORITY',
  HIPAA_NOTICE_OF_PRIVACY_PRACTICES:                  'HIPAA_NOTICE_OF_PRIVACY_PRACTICES',
  ASSIGNMENT_OF_BENEFITS:                             'ASSIGNMENT_OF_BENEFITS',
}

const BATCH_SIZE = 500

async function main() {
  const caseMap = JSON.parse(readFileSync(CASE_MAP_FILE, 'utf8'))
  const rows = await parseCSV(CSV_FILE)

  console.log(`📋 Total consentimientos: ${rows.length}`)

  let inserted = 0, skipped = 0, noCase = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      const caseId = caseMap[String(row.caseId)]
      if (!caseId) { noCase++; continue }

      const code = CODE_MAP[row.code]
      if (!code) {
        console.warn(`  ⚠ código desconocido: ${row.code}`)
        skipped++
        continue
      }

      // Las firmas en v2 son blobs cifrados AES-GCM — se guardan como legacy
      const signatureLegacy = row.signatureBase64 && row.signatureBase64.startsWith('e:')
        ? row.signatureBase64
        : null

      try {
        await pool.query(
          `INSERT INTO case_consents
             (id, "caseId", code, accepted, "signatureLegacy", "signedAt", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT ("caseId", code) DO NOTHING`,
          [
            randomUUID(),
            caseId,
            code,
            row.accepted === 'true',
            signatureLegacy,
            row.createdAt ? new Date(row.createdAt) : null,
            row.createdAt ? new Date(row.createdAt) : new Date(),
          ]
        )
        inserted++
      } catch (e) {
        console.warn(`  ⚠ consent ${row.id} skip: ${e.message}`)
        skipped++
      }
    }

    console.log(`  lote ${i + BATCH_SIZE}/${rows.length} — insertados: ${inserted}, sin case: ${noCase}, skip: ${skipped}`)
  }

  console.log(`\n✅ Consentimientos: ${inserted} insertados, ${noCase} sin case-map, ${skipped} skip`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
