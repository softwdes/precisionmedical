import { readFileSync } from 'fs'
import { decrypt } from './utils/decrypt.mjs'

const CSV_DIR = process.env.CSV_DIR || 'C:/Users/Erick/Downloads'

function parseCSV(filepath) {
  const text = readFileSync(filepath, 'utf8')
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const fields = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { fields.push(cur); cur = '' }
      else cur += ch
    }
    fields.push(cur)
    const obj = {}
    headers.forEach((h, i) => obj[h] = (fields[i] || '').trim().replace(/^"|"$/g, ''))
    return obj
  })
}

const externUsers = parseCSV(`${CSV_DIR}/LM DBA 1/users_extern_202607121236.csv`)
const companies   = parseCSV(`${CSV_DIR}/companies_202607141002.csv`)
const users       = parseCSV(`${CSV_DIR}/LM DBA 1/users_202607121232.csv`)
const attorneysMap = JSON.parse(readFileSync('./id-maps/attorneys.json', 'utf8'))

// Build lookups
const userById = {}
for (const u of users) userById[u.id] = u

const companyById = {}
for (const c of companies) companyById[c.id] = c

// Group extern users by companyId
const byCompany = {}
for (const ext of externUsers) {
  const cid = ext.companyId
  if (!byCompany[cid]) byCompany[cid] = []
  byCompany[cid].push(ext)
}

const GENERIC_PATTERNS = /^(test|prueba|demo|manager|paralegal|assistant|admin|legal|user|staff|example|sample|placeholder|abogado|attorney|secretary|secretaria|recepcion|recepcionista)\s*\d*$/i

function isGeneric(name) {
  if (!name) return false
  return GENERIC_PATTERNS.test(name.trim())
}

const results = []

for (const [companyId, members] of Object.entries(byCompany)) {
  const company = companyById[companyId]
  const companyName = company ? (company.name || `[Company ${companyId}]`) : `[Company ${companyId}]`

  // Count password frequencies within this firm
  const pwdCount = {}
  for (const m of members) {
    const pwd = (m.password || '').trim()
    if (pwd) pwdCount[pwd] = (pwdCount[pwd] || 0) + 1
  }

  const firmResult = { companyId, companyName, members: [] }

  for (const ext of members) {
    const user = userById[ext.userId]
    let nameDecrypted = null
    let lastnameDecrypted = null

    if (user) {
      try { nameDecrypted = user.name ? decrypt(user.name) : null } catch { nameDecrypted = user.name }
      try { lastnameDecrypted = user.lastname ? decrypt(user.lastname) : null } catch { lastnameDecrypted = user.lastname }
    }

    const fullName = [nameDecrypted, lastnameDecrypted].filter(Boolean).join(' ') || '[no name]'
    const pwd = (ext.password || '').trim()
    const pwdLabel = !pwd ? 'SIN_PASSWORD' : (pwdCount[pwd] > 1 ? 'PRUEBA' : 'ÚNICA')

    const inMap = (attorneysMap[ext.id] !== undefined) || (attorneysMap[String(parseInt(ext.id))] !== undefined)

    const genericName = isGeneric(nameDecrypted) || isGeneric(lastnameDecrypted)
    const suspect = pwdLabel === 'PRUEBA' || pwdLabel === 'SIN_PASSWORD' || genericName

    firmResult.members.push({
      externId: ext.id,
      userId: ext.userId,
      fullName,
      role: ext.role,
      pwdLabel,
      inMap,
      suspect,
      active: ext.active
    })
  }

  results.push(firmResult)
}

results.sort((a, b) => a.companyName.localeCompare(b.companyName))

let totalReal = 0, totalPrueba = 0

for (const firm of results) {
  const realCount = firm.members.filter(m => !m.suspect).length
  const pruebaCount = firm.members.filter(m => m.suspect).length
  totalReal += realCount
  totalPrueba += pruebaCount

  console.log(`\n${'='.repeat(72)}`)
  console.log(`FIRMA: ${firm.companyName}  (companyId=${firm.companyId})`)
  console.log(`  Miembros: ${firm.members.length}  |  Reales: ${realCount}  |  Sospechosos: ${pruebaCount}`)
  console.log(`${'─'.repeat(72)}`)

  for (const m of firm.members) {
    const tag = m.suspect ? '  [SOSPECHOSO]' : ''
    const mapTag = m.inMap ? '  [EN MAPA v3]' : ''
    const inactiveTag = (m.active === 'false' || m.active === '0') ? '  [INACTIVO]' : ''
    console.log(`  externId=${m.externId}  userId=${m.userId}  rol=${m.role}  pass=${m.pwdLabel}  mapa=${m.inMap?'SÍ':'NO'}`)
    console.log(`    Nombre: ${m.fullName}${tag}${mapTag}${inactiveTag}`)
  }
}

console.log(`\n${'='.repeat(72)}`)
console.log(`RESUMEN GLOBAL`)
console.log(`  Firmas analizadas      : ${results.length}`)
console.log(`  Miembros reales        : ${totalReal}`)
console.log(`  Miembros sospechosos   : ${totalPrueba}`)
console.log(`  Total                  : ${totalReal + totalPrueba}`)
console.log(`${'='.repeat(72)}`)
