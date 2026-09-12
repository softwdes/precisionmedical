/**
 * Rebuild all ID maps from actual DB records.
 * Run this after migrations to ensure maps reflect real DB IDs.
 */
import { writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool } from './utils/db.mjs'

const DIR = process.env.CSV_DIR

async function run() {
  const db = getPool()

  // --- Clinics ---
  {
    const rows = await parseCSV(`${DIR}/clinics_202607121236.csv`)
    const dbRes = await db.query(`SELECT id, name FROM clinics`)
    const dbByName = {}
    for (const r of dbRes.rows) dbByName[r.name.toLowerCase().trim()] = r.id
    const map = {}
    for (const row of rows) {
      const name = row.name?.toLowerCase().trim()
      if (name && dbByName[name]) map[row.id] = dbByName[name]
    }
    writeFileSync('./id-maps/clinics.json', JSON.stringify(map, null, 2))
    console.log(`✅ clinics: ${Object.keys(map).length} mapped`)
  }

  // --- Providers ---
  {
    const users = await parseCSV(`${DIR}/users_202607121232.csv`)
    const clinicUsers = await parseCSV(`${DIR}/users_clinic_202607121235.csv`)
    const usersById = {}
    for (const u of users) usersById[u.id] = u
    const dbRes = await db.query(`SELECT id, email FROM providers`)
    const dbByEmail = {}
    for (const r of dbRes.rows) if (r.email) dbByEmail[r.email.toLowerCase()] = r.id
    const map = {}
    for (const cu of clinicUsers) {
      if (cu.role?.toLowerCase() !== 'doctor') continue
      const u = usersById[cu.userId]
      if (!u?.email) continue
      const dbId = dbByEmail[u.email.toLowerCase()]
      if (dbId) map[cu.id] = dbId
    }
    writeFileSync('./id-maps/providers.json', JSON.stringify(map, null, 2))
    console.log(`✅ providers: ${Object.keys(map).length} mapped`)
  }

  // --- Attorneys ---
  {
    const users = await parseCSV(`${DIR}/users_202607121232.csv`)
    const externRows = await parseCSV(`${DIR}/users_extern_202607121236.csv`)
    const usersById = {}
    for (const u of users) usersById[u.id] = u
    const dbRes = await db.query(`SELECT id, email FROM lawyers`)
    const dbByEmail = {}
    for (const r of dbRes.rows) if (r.email) dbByEmail[r.email.toLowerCase()] = r.id
    const map = {}
    for (const ext of externRows) {
      const u = usersById[ext.userId]
      if (!u?.email) continue
      const dbId = dbByEmail[u.email.toLowerCase()]
      if (dbId) map[ext.id] = dbId
    }
    writeFileSync('./id-maps/attorneys.json', JSON.stringify(map, null, 2))
    console.log(`✅ attorneys: ${Object.keys(map).length} mapped`)
  }

  // --- Patients ---
  {
    const users = await parseCSV(`${DIR}/users_202607121232.csv`)
    const patientDetails = await parseCSV(`${DIR}/users_patient_202607121235.csv`)
    const usersById = {}
    for (const u of users) usersById[u.id] = u
    const dbRes = await db.query(`SELECT id, email FROM patients`)
    const dbByEmail = {}
    for (const r of dbRes.rows) if (r.email) dbByEmail[r.email.toLowerCase()] = r.id
    const map = {}
    for (const pd of patientDetails) {
      const u = usersById[pd.userId]
      if (!u?.email) continue
      const dbId = dbByEmail[u.email.toLowerCase()]
      if (dbId) map[pd.id] = dbId
    }
    writeFileSync('./id-maps/patients.json', JSON.stringify(map, null, 2))
    console.log(`✅ patients: ${Object.keys(map).length} mapped`)
  }

  // --- Cases ---
  {
    const rows = await parseCSV(`${DIR}/cases_202607121236.csv`)
    const dbRes = await db.query(`SELECT id, "caseCode" FROM cases`)
    const dbByCode = {}
    for (const r of dbRes.rows) dbByCode[r.caseCode] = r.id
    const map = {}
    for (const row of rows) {
      let rawRef = row.reference?.trim()
      if (rawRef?.startsWith('e:') || rawRef?.includes('|e:')) rawRef = null
      const code = rawRef || `CASE-${row.id}`
      if (dbByCode[code]) map[row.id] = dbByCode[code]
    }
    writeFileSync('./id-maps/cases.json', JSON.stringify(map, null, 2))
    console.log(`✅ cases: ${Object.keys(map).length} mapped`)
  }

  await closePool()
  console.log('\n✅ All ID maps rebuilt from DB')
}

run().catch(e => { console.error(e); process.exit(1) })
