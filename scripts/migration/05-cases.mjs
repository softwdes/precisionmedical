/**
 * Migración 05 — Casos (`cases` del v2 → `cases`)
 *
 * ── Decisiones ──────────────────────────────────────────────────────────────
 *
 * 1. **`caseCode` = `MVA-<id v2>` / `GM-<id v2>`.** El v2 NO tiene código de
 *    caso: tiene 13 columnas y ninguna lo es. Derivarlo del id conserva la
 *    referencia cruzada con MedUSA, y `nextCaseCode()` de v3 sigue desde el
 *    máximo porque lee `MAX(split_part(caseCode,'-',2))`.
 *
 *    ⚠️ Y es la corrección del bug de julio: los 19 `caseCode` que quedaron con
 *    un nombre de bufete cifrado adentro salieron de escribir `reference` —que
 *    es el bufete referente— en la columna del código.
 *
 * 2. **No entran los borrados**: 115 con `status = DELETED`, ni los casos de un
 *    paciente borrado (no están en el id-map).
 *
 * 3. **`close = true` → CLOSED** (22 casos). El resto, ACTIVE.
 *
 * 4. **Nada de lo cifrado se pierde.** `description`, `preferredLawyer` (423),
 *    `reference` (522 — el bufete que refirió) y `preferredChiropractor` (347)
 *    se descifran y se guardan rotulados en `accidentNotes`. Son MÁS casos con
 *    dato de bufete que los 256 de `case_externs`, así que además sirven para
 *    completar `lawFirmId` después (ver `07b`).
 *
 * 5. **Si el `caseCode` ya está tomado, NO se mapea.** Hoy alguien creó casos de
 *    prueba desde la app (GM-1, GM-2) justo después del vaciado. Un
 *    `ON CONFLICT DO NOTHING` que igual guarda el id nuevo en el id-map deja las
 *    citas colgando de un caso que no existe. Se loguea y se salta.
 *
 * Uso:  node 05-cases.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'cases.json')
const PACIENTES = join(MAPS, 'patients.json')

const val = v => {
  if (v === null || v === undefined) return null
  const t = decrypt(String(v))
  if (t === null) return null
  const s = String(t).trim()
  return s === '' || /^e:/.test(s) ? null : s
}

const norm = s => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** `accidentType` del v2 es el MECANISMO (rear-end, head-on); v3 guarda el MEDIO. */
function tipoAccidente(v) {
  const s = norm(v)
  if (!s) return null
  if (s.includes('pedestrian') || s.includes('peaton')) return 'PEDESTRIAN'
  if (s.includes('motorcycle') || s.includes('moto')) return 'MOTORCYCLE'
  if (s.includes('work') || s.includes('trabajo')) return 'WORKPLACE'
  if (/rear|side|head|auto|car|veh/.test(s)) return 'AUTO'
  return 'OTHER'
}

async function leerTodo(prefijo) {
  const filas = []
  for await (const r of leerRegistros(buscarCsv(prefijo))) filas.push(r)
  return filas
}

async function run() {
  if (!existsSync(PACIENTES)) throw new Error('Falta id-maps/patients.json — correr antes 04-patients.mjs')
  const mapaPacientes = JSON.parse(readFileSync(PACIENTES, 'utf8'))

  const casos = await leerTodo('cases')
  const db = getPool()

  // Códigos ya ocupados (los que alguien creó desde la app).
  const { rows: existentes } = await db.query(`SELECT "caseCode" FROM cases`)
  const ocupados = new Set(existentes.map(r => r.caseCode))

  // La fuente del caso sale del paciente: en el v2 el "cómo nos conoció" vive en
  // `users_patient.heardFrom`, no en el caso.
  const { rows: fuentes } = await db.query(`SELECT id, "referralSource" FROM patients`)
  const fuentePorPaciente = new Map(fuentes.map(r => [r.id, r.referralSource]))

  const idMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}
  let insertados = 0, borrados = 0, sinPaciente = 0, chocados = 0, fallidos = 0
  const choques = []

  for (const c of casos) {
    if (c.status === 'DELETED') { borrados++; continue }

    const patientId = mapaPacientes[c.patientId]
    if (!patientId) { sinPaciente++; continue }

    const prefijo = c.type === 'MVA' ? 'MVA' : 'GM'
    const caseCode = `${prefijo}-${c.id}`
    if (ocupados.has(caseCode)) {
      choques.push(caseCode)
      chocados++
      continue
    }

    // Todo lo cifrado, rotulado, en una sola nota. Que el dato sobreviva importa
    // más que la prolijidad: `reference` es el ÚNICO lugar donde está el bufete
    // referente de 522 casos.
    const notas = [
      val(c.description),
      val(c.accidentType) && `Mecanismo: ${val(c.accidentType)}`,
      val(c.reference) && `Bufete referente (v2): ${val(c.reference)}`,
      val(c.preferredLawyer) && `Abogado preferido (v2): ${val(c.preferredLawyer)}`,
      val(c.preferredChiropractor) && `Quiropráctico (v2): ${val(c.preferredChiropractor)}`,
    ].filter(Boolean).join('\n') || null

    if (DRY) { insertados++; continue }

    const nuevoId = cuid()
    try {
      const { rows } = await db.query(
        `INSERT INTO cases (
           id, "caseCode", "patientId", "caseType", status, source, "coverageType",
           "accidentDate", "accidentType", "accidentNotes", "signatureExempt",
           "createdAt", "updatedAt"
         ) VALUES (
           $1,$2,$3,$4::"CaseTypeWorkflow",$5::"CaseStatus",$6::"ReferralSource",
           'UNKNOWN'::"coverage_type",
           $7::timestamp,$8::"AccidentType",$9,false,
           COALESCE($10::timestamp, NOW()), NOW()
         )
         RETURNING id`,
        [
          nuevoId, caseCode, patientId,
          c.type === 'MVA' ? 'MVA' : 'GENERAL',
          c.close === 'true' ? 'CLOSED' : 'ACTIVE',
          fuentePorPaciente.get(patientId) ?? 'OTHER',
          c.accidentDate || null,
          tipoAccidente(val(c.accidentType)),
          notas,
          c.createdAt || null,
        ],
      )
      idMap[c.id] = rows[0].id
      ocupados.add(caseCode)
      insertados++
    } catch (e) {
      console.log(`  ⚠️  caso ${c.id} (${caseCode}): ${e.message.split('\n')[0]}`)
      fallidos++
    }

    if (insertados % 200 === 0) {
      process.stdout.write(`   ${insertados}\r`)
      writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
    }
  }

  if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log(`\n📊 Casos: ${insertados} insertados${DRY ? ' (dry)' : ''} · ${borrados} borrados · ${sinPaciente} sin paciente · ${fallidos} fallidos`)
  if (chocados) {
    // Casi siempre son los ya importados en una corrida anterior; solo es un
    // problema si el código lo ocupó un caso creado a mano desde la app.
    console.log(`ℹ️  ${chocados} con el código ya ocupado (re-corrida): ${choques.slice(0, 8).join(", ")}…`)
    console.log('   Si alguno es de un caso creado desde la app, hay que borrarlo y re-correr.')
  }
  console.log(`💾 id-map (${Object.keys(idMap).length}) → ${MAP_FILE}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
