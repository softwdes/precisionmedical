import fs from 'fs'
import path from 'path'
import { parseCSV } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool } from './utils/db.mjs'

const CSV_DIR = process.env.CSV_DIR
// Users-related CSVs live in a sub-folder "LM DBA 1" of CSV_DIR
const CSV_DIR_USERS = path.join(CSV_DIR, 'LM DBA 1')
const USERS_EXTERN_CSV = path.join(CSV_DIR_USERS, 'users_extern_202607121236.csv')
const USERS_CSV = path.join(CSV_DIR_USERS, 'users_202607121232.csv')
const COMPANIES_CSV = path.join(CSV_DIR, 'companies_202607141002.csv')
const ATTORNEYS_MAP = path.join('./id-maps/attorneys.json')

// Load id map: v2 externId (string) -> v3 id
const attorneysMap = JSON.parse(fs.readFileSync(ATTORNEYS_MAP, 'utf8'))
// Invert: v3 id -> v2 externId
const v3ToV2 = Object.fromEntries(Object.entries(attorneysMap).map(([v2, v3]) => [v3, v2]))

// Load users CSV and decrypt names
console.log('Loading users CSV...')
const usersRaw = await parseCSV(USERS_CSV)
const usersById = {}
for (const u of usersRaw) {
  usersById[u.id] = {
    id: u.id,
    name: decrypt(u.name),
    lastname: decrypt(u.lastname),
    email: u.email,
  }
}
console.log(`  Loaded ${usersRaw.length} users`)

// Load companies CSV
console.log('Loading companies CSV...')
const companiesRaw = await parseCSV(COMPANIES_CSV)
const companiesById = {}
for (const c of companiesRaw) {
  companiesById[c.id] = c
}
console.log(`  Loaded ${companiesRaw.length} companies`)

// Load users_extern CSV
console.log('Loading users_extern CSV...')
const externsRaw = await parseCSV(USERS_EXTERN_CSV)
console.log(`  Loaded ${externsRaw.length} extern records`)
console.log(`  Sample columns: ${Object.keys(externsRaw[0] || {}).join(', ')}`)

// Group externs by companyId
const externsByCompany = {}
for (const ext of externsRaw) {
  const cid = ext.companyId
  if (!cid) continue
  if (!externsByCompany[cid]) externsByCompany[cid] = []
  const user = usersById[ext.userId] || {}
  externsByCompany[cid].push({
    externId: ext.id,
    userId: ext.userId,
    role: ext.role,
    active: ext.active,
    name: user.name || '?',
    lastname: user.lastname || '',
    email: user.email || '',
  })
}

// Query v3 DB
const pool = getPool()

console.log('\nQuerying v3 DB for firms...')
const firmsRes = await pool.query(`
  SELECT id, "firmName" FROM lawyers WHERE "entityType" = 'FIRM' AND "deletedAt" IS NULL ORDER BY "firmName"
`)
const firms = firmsRes.rows
console.log(`  Found ${firms.length} active firms`)

console.log('Querying v3 DB for all members (including soft-deleted)...')
const membersRes = await pool.query(`
  SELECT l.id, l."firstName", l."lastName", l."memberRole", l."deletedAt",
         f.id as "firmId", f."firmName" as firm
  FROM lawyers l
  JOIN lawyers f ON f.id = l."parentFirmId"
  WHERE f."entityType" = 'FIRM'
  ORDER BY f."firmName", l."memberRole"
`)
const allMembers = membersRes.rows

// Group members by firmId
const membersByFirm = {}
for (const m of allMembers) {
  if (!membersByFirm[m.firmId]) membersByFirm[m.firmId] = []
  membersByFirm[m.firmId].push(m)
}

await closePool()

// Also build a set of all v3 ids that have a v2 mapping
const mappedV3Ids = new Set(Object.values(attorneysMap))

console.log('\n' + '='.repeat(80))
console.log('ANALYSIS: V2 vs V3 Members per Firm')
console.log('='.repeat(80))

for (const firm of firms) {
  const v3Members = membersByFirm[firm.id] || []
  const v3Active = v3Members.filter(m => !m.deletedAt)
  const v3Deleted = v3Members.filter(m => m.deletedAt)

  // Find corresponding v2 company by matching firm name (or by attorneys map)
  // We identify which externs map to this firm via attorneys.json:
  // attorneys.json maps externId -> v3MemberId; check if those members belong to this firm
  const firmV2ExternIds = new Set()
  for (const [v2id, v3id] of Object.entries(attorneysMap)) {
    const member = allMembers.find(m => m.id === v3id && m.firmId === firm.id)
    if (member) firmV2ExternIds.add(v2id)
  }

  // Get v2 company for this firm by looking at extern records
  // Find a company whose externs map to this firm
  let v2CompanyId = null
  let v2CompanyName = null
  for (const [compId, externs] of Object.entries(externsByCompany)) {
    const hasMatch = externs.some(e => firmV2ExternIds.has(e.externId))
    if (hasMatch) {
      v2CompanyId = compId
      const co = companiesById[compId]
      v2CompanyName = co ? (co.name || co.companyName || compId) : compId
      break
    }
  }

  const v2Members = v2CompanyId ? (externsByCompany[v2CompanyId] || []) : []

  // Extras in v3 (active) with no v2 mapping
  const extrasV3 = v3Active.filter(m => !mappedV3Ids.has(m.id))

  // In v2 but soft-deleted in v3
  const deletedInV3 = []
  for (const v2id of firmV2ExternIds) {
    const v3id = attorneysMap[v2id]
    const deleted = v3Deleted.find(m => m.id === v3id)
    if (deleted) {
      const ext = externsRaw.find(e => String(e.id) === String(v2id))
      const user = ext ? usersById[ext.userId] : null
      deletedInV3.push({
        v2ExternId: v2id,
        v3Id: v3id,
        name: user ? `${user.name} ${user.lastname}` : '?',
        role: ext?.role,
        deletedAt: deleted.deletedAt,
      })
    }
  }

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`FIRMA: ${firm.firmName} (v3 id: ${firm.id})`)
  if (v2CompanyName) console.log(`  V2 Company: ${v2CompanyName} (id: ${v2CompanyId})`)
  else console.log(`  V2 Company: (no match encontrado)`)

  console.log(`\n  MIEMBROS V2 (${v2Members.length} total):`)
  if (v2Members.length === 0) {
    console.log('    (ninguno)')
  } else {
    for (const m of v2Members) {
      const mapped = attorneysMap[m.externId] ? `→ v3:${attorneysMap[m.externId]}` : '(sin mapeo)'
      console.log(`    [${m.externId}] ${m.name} ${m.lastname} | role: ${m.role} | active: ${m.active} ${mapped}`)
    }
  }

  console.log(`\n  MIEMBROS V3 ACTIVOS (${v3Active.length} total):`)
  if (v3Active.length === 0) {
    console.log('    (ninguno)')
  } else {
    for (const m of v3Active) {
      const v2id = v3ToV2[m.id]
      const tag = v2id ? `← v2:${v2id}` : '(SIN MAPEO V2)'
      console.log(`    [${m.id}] ${m.firstName} ${m.lastName} | role: ${m.memberRole} ${tag}`)
    }
  }

  if (extrasV3.length > 0) {
    console.log(`\n  *** EXTRAS EN V3 SIN MAPEO V2 (${extrasV3.length}): ***`)
    for (const m of extrasV3) {
      console.log(`    [${m.id}] ${m.firstName} ${m.lastName} | role: ${m.memberRole}`)
    }
  } else {
    console.log(`\n  Extras en v3 sin mapeo v2: ninguno`)
  }

  if (deletedInV3.length > 0) {
    console.log(`\n  *** EN V2 PERO SOFT-DELETED EN V3 (${deletedInV3.length}): ***`)
    for (const d of deletedInV3) {
      console.log(`    v2:[${d.v2ExternId}] ${d.name} | role: ${d.role} → v3:[${d.v3Id}] deletedAt: ${d.deletedAt}`)
    }
  } else {
    console.log(`  En v2 pero soft-deleted en v3: ninguno`)
  }
}

console.log('\n' + '='.repeat(80))
console.log('FIN DEL ANÁLISIS')
console.log('='.repeat(80))
