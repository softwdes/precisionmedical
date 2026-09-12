/**
 * Migration 03 — Attorneys
 * users_extern: id(UUID), state, city, zipCode, active, userId(FK→users.id), companyId, role
 * users:        id(UUID), name(encrypted), lastname(encrypted), email, phone
 * LM v3 Lawyer: entityType=ATTORNEY, firstName, lastName, email, phone, city, state, zip
 *
 * Note: firm/company info (companyId) not available as CSV — attorneys inserted without firm link.
 */
import { writeFileSync } from 'fs'
import { parseCSV } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const CSV_USERS = `${process.env.CSV_DIR}/users_202607121232.csv`
const CSV_EXTERN = `${process.env.CSV_DIR}/users_extern_202607121236.csv`
const MAP_FILE = './id-maps/attorneys.json'

async function run() {
  const users = await parseCSV(CSV_USERS)
  const externRows = await parseCSV(CSV_EXTERN)
  const db = getPool()
  const idMap = {} // users_extern.id (UUID) → new cuid

  // Index users by id
  const usersById = {}
  for (const u of users) usersById[u.id] = u

  let inserted = 0, skipped = 0

  for (const ext of externRows) {
    if (ext.active === 'false') { skipped++; continue }

    const u = usersById[ext.userId]
    const firstName = u ? (decrypt(u.name) || u.name) : null
    const lastName = u ? (decrypt(u.lastname) || u.lastname) : null
    const email = u?.email || null
    const phone = u?.phone ? (decrypt(u.phone) || u.phone) : null

    if (!email && !firstName) { skipped++; continue }

    const newId = cuid()
    idMap[ext.id] = newId

    await db.query(`
      INSERT INTO "lawyers" (id, "entityType", "firstName", "lastName", email, phone, city, state, zip, "memberRole", "createdAt", "updatedAt")
      VALUES ($1, 'FIRM_MEMBER'::"LawyerEntityType", $2, $3, $4, $5, $6, $7, $8, 'ATTORNEY'::"LawyerMemberRole", NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        "firstName" = EXCLUDED."firstName",
        "lastName" = EXCLUDED."lastName",
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        "updatedAt" = NOW()
      RETURNING id
    `, [
      newId,
      firstName || null,
      lastName || null,
      email,
      phone,
      ext.city || null,
      ext.state || null,
      ext.zipCode || null,
    ])

    console.log(`  ✅ ${firstName} ${lastName} (${email || 'no-email'})`)
    inserted++
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  console.log(`\n📊 Attorneys: ${inserted} inserted, ${skipped} skipped`)
  console.log(`💾 ID map saved → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })


