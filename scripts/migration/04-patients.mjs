/**
 * Migración 04 — Pacientes (`users` + `users_patient` → `patients`)
 *
 * ── Lo que cambió respecto de la versión de julio ───────────────────────────
 *
 * 1. **CSV por prefijo** (el nombre del dump trae el timestamp).
 * 2. **`patientCode` = `P-<id del v2>`**, no un contador nuevo. Conserva la
 *    referencia cruzada con MedUSA, y el generador de v3 sigue desde el máximo
 *    porque lee `MAX(split_part(patientCode,'-',2))`.
 * 3. **No entran los borrados**: `users.status` DELETED/INACTIVE (398 filas).
 * 4. **No entran las fichas CÁSCARA**: de los 155 grupos de la misma persona
 *    (nombre+apellido+nacimiento), 61 tienen todos los datos en UNA ficha y el
 *    resto vacías. Se importa la que tiene los datos. Los 64 grupos con datos
 *    REPARTIDOS entran completos — descartar uno perdería historia clínica— y
 *    se listan en `pacientes-a-fusionar.json` para resolverlos a mano.
 * 5. **Se descifra TODO**: son 19 columnas cifradas en `users_patient` y 5 en
 *    `users`. Guardar `e:…` en la base es lo que dejó 2.669 `employer` ilegibles.
 * 6. **Campos que la versión vieja tiraba**: dirección, celular (`phone2`),
 *    farmacia, idioma, cómo nos conoció, contacto de emergencia 2 y el TUTOR.
 * 7. **Los teléfonos se normalizan** (sin `+1`, `N/A` → null) y **nunca** se
 *    inventa un placeholder: un área que empieza en 0 traba el intake.
 *
 * Uso:  node 04-patients.mjs [--dry]
 */
import './utils/env.mjs'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { decrypt, decryptSSP } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'patients.json')
const FUSIONAR = join(import.meta.dirname, 'pacientes-a-fusionar.json')
const LOTE = 200

// ─── Normalizadores ─────────────────────────────────────────────────────────
const val = v => {
  if (v === null || v === undefined) return null
  const t = decrypt(String(v))
  if (t === null) return null
  const s = String(t).trim()
  // Un valor que sigue empezando con `e:` es cifrado que no abrió (hay 1 en
  // `sex`). Guardarlo sería meter basura ilegible en una columna de enum.
  return s === '' || /^e:/.test(s) ? null : s
}

const norm = s => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[\s_-]+/g, ' ').trim()

const NO_ES_TELEFONO = new Set(['n/a', 'na', 'none', 'null', '-', '.', '0'])
function telefono(raw) {
  if (!raw) return null
  const t = String(raw).trim()
  if (NO_ES_TELEFONO.has(t.toLowerCase())) return null
  const d = t.replace(/\D/g, '')
  if (/^0+$/.test(d)) return null                       // 0000000000 no es un teléfono
  if (d.length === 11 && d.startsWith('1')) {
    const n = d.slice(1)
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return t
}

function sexo(v) {
  const s = norm(v)
  if (!s) return null
  if (/^(f|female|mujer|femenino)/.test(s)) return 'FEMALE'
  if (/^(m|male|varon|hombre|masculino)/.test(s)) return 'MALE'
  if (s.includes('decline') || s.includes('no responder')) return 'PREFER_NOT_TO_SAY'
  if (s.includes('non binary') || s.includes('no binario')) return 'NON_BINARY'
  return 'OTHER'
}

function civil(v) {
  const s = norm(v)
  if (s.includes('single') || s.includes('soltero')) return 'SINGLE'
  if (s.includes('married') || s.includes('casado')) return 'MARRIED'
  if (s.includes('divorced') || s.includes('divorciado')) return 'DIVORCED'
  if (s.includes('widow') || s.includes('viudo')) return 'WIDOWED'
  if (s.includes('separated') || s.includes('separado')) return 'SEPARATED'
  if (s.includes('decline')) return 'OTHER'
  return null
}

function raza(v) {
  const s = norm(v)
  if (!s) return null
  if (s.includes('white') || s.includes('blanc')) return 'WHITE'
  if (s.includes('african') || s.includes('black')) return 'AFRICAN_AMERICAN'
  if (s.includes('asian')) return 'ASIAN'
  if (s.includes('hawaii')) return 'NATIVE_HAWAIIAN'
  if (s.includes('pacific')) return 'PACIFIC_ISLANDER'
  if (s.includes('american indian') || s.includes('alaska')) return 'AMERICAN_INDIAN_ALASKA_NATIVE'
  if (s.includes('decline') || s.includes('no responder')) return 'PREFER_NOT_TO_SAY'
  return 'OTHER'
}

function etnia(v) {
  const s = norm(v)
  if (!s) return null
  if (s.includes('not hispanic') || s.includes('no hispano')) return 'NOT_HISPANIC_LATINO'
  if (s.includes('hispan') || s.includes('latino')) return 'HISPANIC_LATINO'
  if (s.includes('decline') || s.includes('no responder')) return 'PREFER_NOT_TO_SAY'
  return null
}

function idioma(v) {
  const s = norm(v)
  if (!s) return null
  if (s.startsWith('en')) return 'en'
  if (s.startsWith('es')) return 'es'
  if (s.startsWith('port')) return 'pt'
  if (s.startsWith('fren') || s.startsWith('fran')) return 'fr'
  if (s.startsWith('ital')) return 'it'
  return null
}

function comoAvisar(v) {
  const s = norm(v)
  if (!s) return null
  if (s.includes('text') || s.includes('sms') || s.includes('mensaje')) return 'TEXT'
  if (s.includes('mail') || s.includes('correo')) return 'EMAIL'
  if (s.includes('phone') || s.includes('call') || s.includes('tel')) return 'PHONE'
  if (s.includes('any') || s.includes('cualquier')) return 'ANY'
  return null
}

/**
 * `heardFrom` → `ReferralSource`.
 *
 * El enum de v3 se armó a partir de estos mismos valores, así que casi todos
 * coinciden en mayúsculas. Los 241 valores distintos son la cola de texto libre:
 * lo que no matchea va a OTHER y el texto original se guarda en
 * `referralSourceOther`, que existe justamente para eso.
 */
const FUENTES = new Set([
  'PHONE_CALL', 'WALK_IN', 'LAW_FIRM_REFERRAL', 'PATIENT_REFERRAL', 'WEB_FORM',
  'AI_AGENT', 'OTHER', 'LAW_FIRM', 'WEB_SEARCH', 'ACCIDENT_CENTER', 'FACEBOOK',
  'FAMILY', 'GOOGLE', 'GOOGLE_MAPS', 'INSTAGRAM', 'WEBSITE', 'CLINIC_STAFF',
  'CHIROPRACTOR', 'REFERRAL', 'INSURANCE', 'MEDICAL_INSURANCE', 'TIKTOK',
])
function fuente(v) {
  if (!v) return { enumv: null, otro: null }
  const s = norm(v).replace(/ /g, '_').toUpperCase()
  if (s === 'LAWYER') return { enumv: 'LAW_FIRM', otro: null }
  if (s === 'LAWYER_LAW_FIRM') return { enumv: 'LAW_FIRM_REFERRAL', otro: null }
  if (FUENTES.has(s)) return { enumv: s, otro: null }
  return { enumv: 'OTHER', otro: String(v).slice(0, 120) }
}

async function leerTodo(prefijo) {
  const filas = []
  for await (const r of leerRegistros(buscarCsv(prefijo))) filas.push(r)
  return filas
}

async function run() {
  const [users, pacientes, casos, citas, docs] = await Promise.all([
    leerTodo('users_2'),
    leerTodo('users_patient'),
    leerTodo('cases'),
    leerTodo('appointments'),
    leerTodo('documents'),
  ])

  const uPorId = new Map(users.map(u => [u.id, u]))

  // ─── 1. Quién está borrado ────────────────────────────────────────────────
  const borrados = new Set(
    users.filter(u => u.status === 'DELETED' || u.status === 'INACTIVE').map(u => u.id),
  )

  // ─── 2. Peso de cada ficha, para descartar cáscaras ───────────────────────
  const casosDe = new Map()
  for (const c of casos) {
    if (!casosDe.has(c.patientId)) casosDe.set(c.patientId, [])
    casosDe.get(c.patientId).push(c.id)
  }
  const citasPorCaso = new Map()
  for (const a of citas) citasPorCaso.set(a.caseId, (citasPorCaso.get(a.caseId) ?? 0) + 1)
  const docsPorPaciente = new Map()
  for (const d of docs) if (d.patientId) docsPorPaciente.set(d.patientId, (docsPorPaciente.get(d.patientId) ?? 0) + 1)

  const peso = p => {
    const cs = casosDe.get(p.id) ?? []
    return cs.length + cs.reduce((s, id) => s + (citasPorCaso.get(id) ?? 0), 0) + (docsPorPaciente.get(p.id) ?? 0)
  }

  const vivos = pacientes.filter(p => !borrados.has(p.userId) && uPorId.has(p.userId))

  const grupos = new Map()
  for (const p of vivos) {
    const u = uPorId.get(p.userId)
    const k = `${norm(val(u.name))}|${norm(val(u.lastname))}|${(u.birthdate ?? '').slice(0, 10)}`
    if (!k.replace(/\|/g, '')) continue                 // sin datos para agrupar
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(p)
  }

  const cascaras = new Set()
  const aFusionar = []
  for (const [k, v] of grupos) {
    if (v.length < 2) continue
    const conDatos = v.filter(p => peso(p) > 0)
    if (conDatos.length === 1) {
      for (const p of v) if (p !== conDatos[0]) cascaras.add(p.id)
    } else if (conDatos.length === 0) {
      for (const p of v.slice(1)) cascaras.add(p.id)     // todas vacías: queda una
    } else {
      aFusionar.push({ persona: k.split('|').join(' · '), fichas: v.map(p => ({ v2Id: p.id, peso: peso(p) })) })
    }
  }

  console.log(`📋 ${pacientes.length} pacientes en el export`)
  console.log(`   − ${pacientes.length - vivos.length} borrados`)
  console.log(`   − ${cascaras.size} fichas cáscara (duplicados sin datos)`)
  console.log(`   = ${vivos.length - cascaras.size} a importar`)
  console.log(`   ⚠️  ${aFusionar.length} grupos con datos repartidos — entran todos, hay que fusionarlos a mano`)

  if (DRY) {
    console.log('\nDRY RUN — muestra:')
    for (const p of vivos.filter(p => !cascaras.has(p.id)).slice(0, 5)) {
      const u = uPorId.get(p.userId)
      console.log(`  P-${p.id}  ${val(u.name)} ${val(u.lastname)}  ${u.email ?? 'sin correo'}  tel ${telefono(val(u.phone)) ?? '—'}  ${sexo(val(p.sex)) ?? '?'}  ${idioma(val(p.primaryLanguage)) ?? '?'}`)
    }
    return
  }

  // ─── 3. Inserción ─────────────────────────────────────────────────────────
  const db = getPool()
  // ⚠️ Se CARGA el existente: arrancar con {} y escribir al final pisa el id-map
  // entero con lo de esta corrida. En la re-corrida de los 2 pacientes que
  // faltaban dejó el mapa con 2 entradas y los 3.032 casos quedaron huérfanos.
  const idMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}
  let insertados = 0, fallidos = 0
  const pendientesTutor = []

  const aImportar = vivos.filter(p => !cascaras.has(p.id))

  for (let i = 0; i < aImportar.length; i += LOTE) {
    for (const p of aImportar.slice(i, i + LOTE)) {
      // Re-corrida: lo que ya entró no se vuelve a intentar.
      if (idMap[p.id]) continue
      const u = uPorId.get(p.userId)
      const f = fuente(val(p.heardFrom))
      const nuevoId = cuid()

      try {
        const { rows } = await db.query(
          `INSERT INTO patients (
             id, "patientCode", "firstName", "lastName", email, phone, phone2,
             "dateOfBirth", sex, "maritalStatus", "preferredLanguage",
             "addressLine1", "addressCity", "addressState", "addressZip",
             "socialSecurityNumber", employer, "preferredPharmacy",
             "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation",
             "emergency2Name", "emergency2Phone", "emergency2Relation",
             race, ethnicity, "communicationPreference",
             "referralSource", "referralSourceOther", status,
             "createdAt", "updatedAt"
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,
             $8::timestamp,$9::"PatientSex",$10::"MaritalStatus",$11,
             $12,$13,$14,$15,
             $16,$17,$18,
             $19,$20,$21,
             $22,$23,$24,
             $25::"PatientRace",$26::"PatientEthnicity",$27::"CommunicationPreference",
             $28::"ReferralSource",$29,'ACTIVE'::"PatientStatus",
             COALESCE($30::timestamp, NOW()), NOW()
           )
           ON CONFLICT ("patientCode") DO NOTHING
           RETURNING id`,
          [
            nuevoId, `P-${p.id}`, val(u.name), val(u.lastname), u.email || null,
            telefono(val(u.phone)), telefono(val(u.cellphone)),
            u.birthdate || null, sexo(val(p.sex)), civil(val(p.maritalStatus)), idioma(val(p.primaryLanguage)),
            val(u.address), val(p.city), val(p.state), val(p.zipCode),
            p.ssp ? decryptSSP(p.ssp) : null, val(p.employeer), val(p.preferredPharmacy),
            val(p.emergency1Name), telefono(val(p.emergency1Phone)), val(p.emergency1Relation),
            val(p.emergency2Name), telefono(val(p.emergency2Phone)), val(p.emergency2Relation),
            raza(val(p.race)), etnia(val(p.ethnicity)), comoAvisar(val(p.notificationMethod)),
            f.enumv, f.otro, u.createdAt || null,
          ],
        )
        // Sin fila devuelta, el  lo rebotó: el código ya estaba
        // tomado por otro paciente. Guardar  igual —lo que hacía
        // antes— deja el id-map apuntando a una fila que NO existe, y después
        // sus casos revientan con violación de clave foránea. Pasó con P-1 y
        // P-2, que los había ocupado un paciente de prueba creado desde la app.
        if (!rows[0]) {
          console.log()
          fallidos++
          continue
        }
        const id = rows[0].id
        idMap[p.id] = id
        if (p.guardianId) pendientesTutor.push({ pacienteV3: id, guardianUserId: p.guardianId })
        insertados++
      } catch (e) {
        console.log(`  ⚠️  paciente ${p.id}: ${e.message.split('\n')[0]}`)
        fallidos++
      }
    }
    process.stdout.write(`   ${insertados}/${aImportar.length}\r`)
    writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  }

  // ─── 4. Tutores ───────────────────────────────────────────────────────────
  // `users_patient.guardianId` apunta a `users.id`, no a otro paciente. Si esa
  // persona TAMBIÉN es paciente, se enlaza con `guardianPatientId`; si no, se
  // guardan nombre y teléfono, que es para lo que existen esas columnas.
  const pacientePorUserId = new Map(pacientes.map(p => [p.userId, p]))
  let conFicha = 0, soloNombre = 0
  for (const t of pendientesTutor) {
    const gu = uPorId.get(t.guardianUserId)
    if (!gu) continue
    const gp = pacientePorUserId.get(t.guardianUserId)
    const idTutor = gp ? idMap[gp.id] : null
    if (idTutor) {
      await db.query(`UPDATE patients SET "guardianPatientId" = $1 WHERE id = $2`, [idTutor, t.pacienteV3])
      conFicha++
    } else {
      await db.query(
        `UPDATE patients SET "guardianName" = $1, "guardianPhone" = $2 WHERE id = $3`,
        [`${val(gu.name) ?? ''} ${val(gu.lastname) ?? ''}`.trim() || null, telefono(val(gu.phone)), t.pacienteV3],
      )
      soloNombre++
    }
  }

  writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  if (aFusionar.length) writeFileSync(FUSIONAR, JSON.stringify(aFusionar, null, 2))

  console.log(`\n📊 Pacientes: ${insertados} insertados · ${fallidos} fallidos`)
  console.log(`   tutores: ${conFicha} enlazados a su ficha de paciente · ${soloNombre} guardados como nombre+teléfono`)
  console.log(`💾 id-map (${Object.keys(idMap).length}) → ${MAP_FILE}`)
  if (aFusionar.length) console.log(`⚠️  ${aFusionar.length} personas duplicadas CON datos en ambas fichas → ${FUSIONAR}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
