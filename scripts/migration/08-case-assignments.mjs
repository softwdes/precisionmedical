/**
 * Migration 08 — Case Assignments (attorneyId, paralegalId)
 * Source: case_externs CSV
 *   responsibleExternId → cases.attorneyId
 *   assistantExternId   → cases.paralegalId
 *
 * Chain: v2 externId (int) → attorneys.json → v3 lawyer CUID
 *        v2 caseId (int)   → cases.json     → v3 case UUID
 */
import { readFileSync, existsSync } from 'fs'
import { getPool, closePool } from './utils/db.mjs'

const CASE_EXTERNS_CSV = `${process.env.CSV_DIR}/case_externs_202607131834.csv`
const ATTORNEYS_MAP    = './id-maps/attorneys.json'
const CASES_MAP        = './id-maps/cases.json'

function loadMap(file) {
  if (!existsSync(file)) throw new Error(`ID map not found: ${file}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function parseLine(line) {
  const cols = []
  let cur = '', inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue }
    if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cols.push(cur.trim())
  return cols
}

async function run() {
  const db = getPool()
  const attorneysMap = loadMap(ATTORNEYS_MAP)
  const casesMap     = loadMap(CASES_MAP)

  const content = readFileSync(CASE_EXTERNS_CSV, 'utf8')
  const lines   = content.trim().split('\n')

  // cols: 0=id 1=patientNameSig 2=patientSigB64 3=responsibleNameSig 4=responsibleSigB64
  //       5=createdAt 6=caseId 7=responsibleExternId 8=assistantExternId 9=companyId 10=isSignatureExempt

  let updatedAtty = 0, updatedParalegal = 0
  let skippedNoCase = 0, skippedNoAtty = 0, skippedNoParalegal = 0

  for (let i = 1; i < lines.length; i++) {
    const cols        = parseLine(lines[i])
    const v2CaseId    = cols[6]
    const respId      = cols[7]  // → attorneyId
    const asstId      = cols[8]  // → paralegalId

    if (!respId && !asstId) continue

    const v3CaseId = casesMap[v2CaseId]
    if (!v3CaseId) { skippedNoCase++; continue }

    if (respId) {
      const v3LawyerId = attorneysMap[respId]
      if (!v3LawyerId) { skippedNoAtty++; continue }
      await db.query(
        `UPDATE cases SET "attorneyId" = $1 WHERE id = $2 AND "attorneyId" IS NULL`,
        [v3LawyerId, v3CaseId],
      )
      updatedAtty++
    }

    if (asstId) {
      const v3LawyerId = attorneysMap[asstId]
      if (!v3LawyerId) { skippedNoParalegal++; continue }
      await db.query(
        `UPDATE cases SET "paralegalId" = $1 WHERE id = $2 AND "paralegalId" IS NULL`,
        [v3LawyerId, v3CaseId],
      )
      updatedParalegal++
    }
  }

  console.log('\n=== Migration 08 — Case Assignments ===')
  console.log(`✅ attorneyId   poblado: ${updatedAtty} casos`)
  console.log(`✅ paralegalId  poblado: ${updatedParalegal} casos`)
  console.log(`⚠️  Saltados — caso no migrado: ${skippedNoCase}`)
  console.log(`⚠️  Saltados — abogado sin mapeo: ${skippedNoAtty}`)
  console.log(`⚠️  Saltados — paralegal sin mapeo: ${skippedNoParalegal}`)

  await closePool()
}

run().catch(err => { console.error(err); process.exit(1) })
