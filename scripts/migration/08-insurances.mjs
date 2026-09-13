/**
 * Migración 08 — Seguros (`insurances` del v2)
 *
 * El v2 guarda UNA tabla con los dos tipos y colgada del PACIENTE:
 *     general 884  (seguro de salud)   ·   auto 276  (el del accidente, con PIP)
 *
 * v3 los separa, y a nivel CASO:
 *   · salud → `Case.primaryInsuranceId` + `primaryPolicyNumber`
 *   · auto  → una fila en `case_auto_insurances`, que es prácticamente la misma
 *             columna por columna (póliza, PIP, n° de reclamo, ajustador, lien)
 * Y el catálogo de aseguradoras vive aparte, en `insurance_carriers`.
 *
 * ── Del paciente al caso ────────────────────────────────────────────────────
 * El seguro es de la PERSONA, así que se aplica a sus casos:
 *   · salud: a todos los casos del paciente que no tengan seguro todavía.
 *   · auto : a sus casos MVA (si no tiene ninguno, a todos) — el PIP es del
 *            accidente, y un caso GM no lo usa.
 * Nunca pisa un dato ya cargado.
 *
 * ── Ajustadores ─────────────────────────────────────────────────────────────
 * `adjusterName/Phone/Fax/Email` se convierten en `insurance_adjusters` (uno por
 * aseguradora y nombre) y además quedan copiados como texto en la fila del caso
 * (`adjusterNameRaw`, `adjusterPhoneRaw`): así el dato se ve aunque la ficha del
 * ajustador se archive.
 *
 * Uso:  node 08-insurances.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'insurances.json')

const norm = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()

const NO_ES_TELEFONO = new Set(['n/a', 'na', 'none', 'null', '-', '.'])
function telefono(raw) {
  if (!raw) return null
  const t = String(raw).trim()
  if (NO_ES_TELEFONO.has(t.toLowerCase())) return null
  const d = t.replace(/\D/g, '')
  if (/^0+$/.test(d)) return null
  if (d.length === 11 && d.startsWith('1')) {
    const n = d.slice(1)
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return t
}

/**
 * `shortCode` es NOT NULL y se usa como avatar del carrier (máx. 4 caracteres).
 * Iniciales si el nombre tiene varias palabras ("State Farm" → SF), si no las
 * primeras letras ("Aetna" → AETN).
 */
function sigla(nombre) {
  const palabras = (nombre ?? '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'
  if (palabras.length === 1) return palabras[0].slice(0, 4).toUpperCase()
  return palabras.map(p => p[0]).join('').slice(0, 4).toUpperCase()
}

const pip = v => {
  const s = norm(v)
  if (s === 'yes' || s === 'si') return 'YES'
  if (s === 'no') return 'NO'
  return 'UNKNOWN'
}

const limpio = v => {
  const s = (v ?? '').trim()
  return s === '' || NO_ES_TELEFONO.has(s.toLowerCase()) ? null : s
}

async function run() {
  const pacientesMap = join(MAPS, 'patients.json')
  if (!existsSync(pacientesMap)) throw new Error('Falta id-maps/patients.json')
  const mapaPacientes = JSON.parse(readFileSync(pacientesMap, 'utf8'))

  const filas = []
  for await (const r of leerRegistros(buscarCsv('insurances'))) filas.push(r)

  const db = getPool()

  // Casos por paciente, para saber a cuál colgar cada seguro.
  const { rows: casos } = await db.query(
    `SELECT id, "patientId", "caseType", "primaryInsuranceId" FROM cases WHERE "deletedAt" IS NULL`,
  )
  const casosDe = new Map()
  for (const c of casos) {
    if (!casosDe.has(c.patientId)) casosDe.set(c.patientId, [])
    casosDe.get(c.patientId).push(c)
  }

  // ─── 1. Catálogo de aseguradoras ──────────────────────────────────────────
  const { rows: yaHay } = await db.query(`SELECT id, name FROM insurance_carriers WHERE "deletedAt" IS NULL`)
  const carrierPorNombre = new Map(yaHay.map(r => [norm(r.name), r.id]))

  const nombres = new Map()   // normalizado → nombre "bonito" (el más frecuente)
  for (const f of filas) {
    const n = limpio(f.companyName)
    if (!n) continue
    const k = norm(n)
    const e = nombres.get(k) ?? { nombre: n, veces: 0 }
    e.veces++
    nombres.set(k, e)
  }

  let carriersNuevos = 0
  for (const [k, e] of nombres) {
    if (carrierPorNombre.has(k)) continue
    if (DRY) { carriersNuevos++; continue }
    const id = cuid()
    const { rows } = await db.query(
      `INSERT INTO insurance_carriers (id, name, "shortCode", type, "isActive", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,'OTHER'::"InsuranceType",true,NOW(),NOW())
       ON CONFLICT DO NOTHING RETURNING id`,
      [id, e.nombre, sigla(e.nombre)],
    )
    if (rows[0]) { carrierPorNombre.set(k, rows[0].id); carriersNuevos++ }
  }

  // ─── 2. Ajustadores ───────────────────────────────────────────────────────
  const ajustadorPorClave = new Map()
  let ajustadores = 0
  if (!DRY) {
    for (const f of filas) {
      const nombre = limpio(f.adjusterName)
      const carrierId = carrierPorNombre.get(norm(limpio(f.companyName) ?? ''))
      if (!nombre || !carrierId) continue
      const k = `${carrierId}|${norm(nombre)}`
      if (ajustadorPorClave.has(k)) continue
      const id = cuid()
      const { rows } = await db.query(
        `INSERT INTO insurance_adjusters
           (id, "insuranceCarrierId", name, phone, phone2, fax, email, status, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE'::"ExternalStatus",NOW(),NOW())
         RETURNING id`,
        [id, carrierId, nombre, telefono(f.adjusterPhone), telefono(f.adjusterOtherPhone),
         limpio(f.adjusterFax), limpio(f.adjusterEmail)],
      )
      ajustadorPorClave.set(k, rows[0].id)
      ajustadores++
    }
  }

  // ─── 3. Seguros a los casos ───────────────────────────────────────────────
  const idMap = {}
  let salud = 0, auto = 0, sinPaciente = 0, sinCaso = 0, borrados = 0

  for (const f of filas) {
    if (f.status === 'DELETED') { borrados++; continue }

    const patientId = mapaPacientes[f.patientId]
    if (!patientId) { sinPaciente++; continue }

    const suyos = casosDe.get(patientId) ?? []
    if (suyos.length === 0) { sinCaso++; continue }

    const carrierId = carrierPorNombre.get(norm(limpio(f.companyName) ?? '')) ?? null

    if (f.type === 'auto') {
      // El PIP es del accidente: va a los casos MVA. Si no tiene ninguno, a todos.
      const destino = suyos.filter(c => c.caseType === 'MVA')
      const objetivo = destino.length ? destino : suyos
      for (const c of objetivo) {
        if (DRY) { auto++; continue }
        const ajustador = ajustadorPorClave.get(`${carrierId}|${norm(limpio(f.adjusterName) ?? '')}`) ?? null
        try {
          await db.query(
            `INSERT INTO case_auto_insurances
               (id, "caseId", "carrierId", "carrierNameRaw", "policyId", "lossDate",
                "pipAvailable", "claimNum", "adjusterId", "adjusterNameRaw", "adjusterPhoneRaw",
                comments, "fullLien", "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6::timestamp,$7::"PipAvailability",$8,$9,$10,$11,$12,$13,NOW(),NOW())`,
            [cuid(), c.id, carrierId, limpio(f.companyName), limpio(f.policyNumber),
             f.effectiveDate || null, pip(f.isPIPAvailable), limpio(f.claimNumber),
             ajustador, limpio(f.adjusterName), telefono(f.adjusterPhone),
             limpio(f.comment), f.fullLien === 'true'],
          )
          idMap[f.id] = c.id
          auto++
        } catch (e) {
          console.log(`  ⚠️  seguro auto ${f.id}: ${e.message.split('\n')[0]}`)
        }
      }
    } else {
      // Salud: a los casos que todavía no tienen seguro primario.
      for (const c of suyos) {
        if (c.primaryInsuranceId) continue
        if (DRY) { salud++; continue }
        await db.query(
          `UPDATE cases SET "primaryInsuranceId" = COALESCE("primaryInsuranceId", $2),
                            "primaryPolicyNumber" = COALESCE("primaryPolicyNumber", $3)
             WHERE id = $1`,
          [c.id, carrierId, limpio(f.policyNumber)],
        )
        c.primaryInsuranceId = carrierId    // que el siguiente seguro no lo pise
        idMap[f.id] = c.id
        salud++
      }
    }
  }

  if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log(`\n📊 Seguros${DRY ? ' (dry)' : ''}`)
  console.log(`   aseguradoras nuevas en el catálogo : ${carriersNuevos}`)
  console.log(`   ajustadores                        : ${ajustadores}`)
  console.log(`   pólizas de SALUD aplicadas a casos : ${salud}`)
  console.log(`   seguros de AUTO (PIP) en casos     : ${auto}`)
  console.log(`   ${borrados} borrados · ${sinPaciente} sin paciente · ${sinCaso} sin casos`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
