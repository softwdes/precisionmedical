/**
 * Rebuild patients.json ID map from actual DB records.
 * Uses email as the bridge: users_patient.id → users.email → patients.id (cuid in DB)
 */
import { writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool } from './utils/db.mjs'

const CSV_USERS = `${process.env.CSV_DIR}/users_202607121232.csv`
const CSV_PATIENTS = `${process.env.CSV_DIR}/users_patient_202607121235.csv`
const MAP_FILE = './id-maps/patients.json'

async function run() {
  const users = await parseCSV(CSV_USERS)
  const patientDetails = await parseCSV(CSV_PATIENTS)
  const db = getPool()
  const idMap = {}

  const usersById = {}
  for (const u of users) usersById[u.id] = u

  // Fetch all patients from DB indexed by email
  const dbRes = await db.query(`SELECT id, email FROM patients`)
  const dbByEmail = {}
  for (const row of dbRes.rows) {
    if (row.email) dbByEmail[row.email.toLowerCase()] = row.id
  }
  console.log(`DB has ${dbRes.rows.length} patients`)

  let mapped = 0, missing = 0

  for (const pd of patientDetails) {
    const u = usersById[pd.userId]
    if (!u) continue
    const email = u.email?.toLowerCase()
    if (!email) { missing++; continue }

    const dbId = dbByEmail[email]
    if (!dbId) { console.log(`  ⚠️  Not in DB: ${email}`); missing++; continue }

    idMap[pd.id] = dbId
    mapped++
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  console.log(`\n✅ Rebuilt map: ${mapped} entries, ${missing} missing`)
  console.log(`💾 Saved → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
