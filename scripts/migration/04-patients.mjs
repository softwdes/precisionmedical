/**
 * Migration 04 — Patients
 * users:         id(UUID), name(enc), lastname(enc), email, phone, birthdate, type(role), status
 * users_patient: id(INT), userId(FK→users.id), state(enc), city(enc), zipCode(enc),
 *                sex, maritalStatus, employeer, ethnicity, race,
 *                emergency1Name(enc), emergency1Phone(enc), emergency1Relation,
 *                ssp (SSN in SSP format)
 *
 * ID map key = users_patient.id (INT) — because cases.patientId references this integer
 */
import { writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { decrypt, decryptSSP } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV_USERS = `${process.env.CSV_DIR}/users_202607121232.csv`
const CSV_PATIENTS = `${process.env.CSV_DIR}/users_patient_202607121235.csv`
const MAP_FILE = './id-maps/patients.json'

function mapSex(v) {
  if (!v) return null
  const l = v.toLowerCase()
  if (l === 'male' || l === 'm') return 'MALE'
  if (l === 'female' || l === 'f') return 'FEMALE'
  return 'OTHER'
}

function mapMarital(v) {
  if (!v) return null
  const l = v.toLowerCase()
  if (l.includes('single')) return 'SINGLE'
  if (l.includes('married')) return 'MARRIED'
  if (l.includes('divorced')) return 'DIVORCED'
  if (l.includes('widowed') || l.includes('widow')) return 'WIDOWED'
  if (l.includes('separated')) return 'SEPARATED'
  return null
}

function mapRace(v) {
  if (!v) return null
  const l = v.toLowerCase()
  if (l.includes('white')) return 'WHITE'
  if (l.includes('black') || l.includes('african')) return 'AFRICAN_AMERICAN'
  if (l.includes('asian')) return 'ASIAN'
  if (l.includes('native') && (l.includes('hawaii'))) return 'NATIVE_HAWAIIAN'
  if (l.includes('pacific')) return 'PACIFIC_ISLANDER'
  if (l.includes('american indian') || l.includes('alaska')) return 'AMERICAN_INDIAN_ALASKA_NATIVE'
  if (l.includes('decline') || l.includes('prefer not')) return 'PREFER_NOT_TO_SAY'
  return 'OTHER'
}

function mapEthnicity(v) {
  if (!v) return null
  const l = v.toLowerCase()
  if (l.includes('hispanic') || l.includes('latino')) return 'HISPANIC_LATINO'
  if (l.includes('not hispanic') || l.includes('non-hispanic')) return 'NOT_HISPANIC_LATINO'
  if (l.includes('decline') || l.includes('prefer not')) return 'PREFER_NOT_TO_SAY'
  return null
}

let patientCounter = 1000

async function run() {
  const users = await parseCSV(CSV_USERS)
  const patientDetails = await parseCSV(CSV_PATIENTS)
  const db = getPool()
  const idMap = {} // users_patient.id (INT string) → new cuid

  // Index users by id (UUID)
  const usersById = {}
  for (const u of users) usersById[u.id] = u

  let inserted = 0, skipped = 0

  for (const pd of patientDetails) {
    if (pd.active === 'false') { skipped++; continue }

    const u = usersById[pd.userId]
    if (!u) { console.log(`  ⚠️  No user for users_patient.userId=${pd.userId}`); skipped++; continue }

    const firstName = decrypt(u.name) || u.name
    const lastName = decrypt(u.lastname) || u.lastname
    const email = u.email || null

    if (!firstName && !lastName) { skipped++; continue }

    // Generate patient code
    const patientCode = `P-${patientCounter++}`

    const phone = u.phone ? (decrypt(u.phone) || u.phone) : null
    const dob = u.birthdate || null
    const ssn = pd.ssp ? decryptSSP(pd.ssp) : null
    const sex = mapSex(pd.sex)
    const marital = mapMarital(pd.maritalStatus)
    const city = pd.city ? (decrypt(pd.city) || pd.city) : null
    const state = pd.state ? (decrypt(pd.state) || pd.state) : null
    const zip = pd.zipCode ? (decrypt(pd.zipCode) || pd.zipCode) : null
    const emergName = pd.emergency1Name ? (decrypt(pd.emergency1Name) || pd.emergency1Name) : null
    const emergPhone = pd.emergency1Phone ? (decrypt(pd.emergency1Phone) || pd.emergency1Phone) : null
    const emergRelation = pd.emergency1Relation || null
    const race = mapRace(pd.race)
    const ethnicity = mapEthnicity(pd.ethnicity)
    const employer = pd.employeer || null

    const newId = cuid()
    idMap[pd.id] = newId  // key by users_patient.id (integer as string)

    await db.query(`
      INSERT INTO "patients" (
        id, "patientCode", "firstName", "lastName", email, phone,
        "dateOfBirth", sex, "maritalStatus",
        "addressCity", "addressState", "addressZip",
        "socialSecurityNumber",
        "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation",
        race, ethnicity, employer,
        "createdAt", "updatedAt"
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::"PatientSex",$9::"MaritalStatus",$10,$11,$12,$13,$14,$15,$16,$17::"PatientRace",$18::"PatientEthnicity",$19,NOW(),NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      newId, patientCode, firstName, lastName, email, phone,
      dob, sex, marital,
      city, state, zip,
      ssn,
      emergName, emergPhone, emergRelation,
      race, ethnicity, employer,
    ])

    console.log(`  ✅ ${firstName} ${lastName} (${patientCode})`)
    inserted++
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  console.log(`\n📊 Patients: ${inserted} inserted, ${skipped} skipped`)
  console.log(`💾 ID map saved → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })

