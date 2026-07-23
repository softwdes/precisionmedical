/**
 * Migration 02 — Providers (Doctors from users_clinic)
 * users_clinic: id(UUID), role, userId(FK→users.id), npi, area
 * users:        id(UUID), name(encrypted), lastname(encrypted), email, phone
 * LM v3 Provider: firstName, lastName, email, specialty, licenseNumber, status
 */
import { writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV_USERS = `${process.env.CSV_DIR}/users_202607121232.csv`
const CSV_CLINIC_USERS = `${process.env.CSV_DIR}/users_clinic_202607121235.csv`
const MAP_FILE = './id-maps/providers.json'

const SPECIALTY_MAP = {
  'general medicine': 'GENERAL',
  'general': 'GENERAL',
  'orthopedics': 'ORTHOPEDICS',
  'orthopedic': 'ORTHOPEDICS',
  'neurology': 'NEUROLOGY',
  'pain management': 'PAIN_MANAGEMENT',
  'pain': 'PAIN_MANAGEMENT',
  'chiropractic': 'CHIROPRACTIC',
  'chiropractor': 'CHIROPRACTIC',
  'physical therapy': 'PHYSICAL_THERAPY',
  'pt': 'PHYSICAL_THERAPY',
  'radiology': 'RADIOLOGY',
  'psychology': 'PSYCHOLOGY',
  'psychiatry': 'PSYCHOLOGY',
  'cardiology': 'OTHER',
  'internal medicine': 'GENERAL',
}

function mapSpecialty(area) {
  if (!area) return 'GENERAL'
  const l = area.toLowerCase().trim()
  return SPECIALTY_MAP[l] || 'GENERAL'
}

async function run() {
  const users = await parseCSV(CSV_USERS)
  const clinicUsers = await parseCSV(CSV_CLINIC_USERS)
  const db = getPool()
  const idMap = {} // users_clinic.id (UUID) → new cuid

  // Index users by id
  const usersById = {}
  for (const u of users) usersById[u.id] = u

  // Find all doctors — deduplicated by userId (same person, multiple clinic rows)
  const doctorRows = clinicUsers.filter(cu => cu.role?.toLowerCase() === 'doctor')

  let inserted = 0, skipped = 0

  for (const cu of doctorRows) {
    const u = usersById[cu.userId]
    if (!u) { console.log(`  ⚠️  No user for users_clinic.userId=${cu.userId}`); skipped++; continue }

    const firstName = decrypt(u.name) || u.name
    const lastName = decrypt(u.lastname) || u.lastname
    const email = u.email || null
    const phone = u.phone ? (decrypt(u.phone) || u.phone) : null

    if (!email) { console.log(`  ⚠️  Skipping doctor ${firstName} ${lastName} — no email`); skipped++; continue }

    const newId = cuid()
    idMap[cu.id] = newId // key by users_clinic.id (UUID) — appointments.doctorId references this

    await db.query(`
      INSERT INTO "providers" (id, "firstName", "lastName", email, phone, specialty, "licenseNumber", status, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6::"Specialty", $7, 'ACTIVE'::"ExternalStatus", NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        "firstName" = EXCLUDED."firstName",
        "lastName" = EXCLUDED."lastName",
        specialty = EXCLUDED.specialty,
        status = 'ACTIVE'::"ExternalStatus",
        "updatedAt" = NOW()
      RETURNING id
    `, [
      newId,
      firstName,
      lastName,
      email,
      phone,
      mapSpecialty(cu.area),
      cu.npi || null,
    ])

    console.log(`  ✅ Dr. ${firstName} ${lastName} (${email})`)
    inserted++
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  console.log(`\n📊 Providers: ${inserted} inserted, ${skipped} skipped`)
  console.log(`💾 ID map saved → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })


