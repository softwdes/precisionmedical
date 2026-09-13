/**
 * Reconstruir los id-maps de pacientes y casos desde la BASE.
 *
 * POR QUÉ EXISTE: los id-maps son archivos sueltos y es fácil pisarlos. Ya pasó
 * dos veces —`04-patients.mjs` arrancaba con el mapa vacío y lo escribía al
 * final, así que re-correrlo para 2 pacientes dejó el archivo con 2 entradas y
 * los 3.032 casos quedaron "sin paciente"—. Y un proceso viejo que termina DESPUÉS
 * de que uno arregló el archivo lo vuelve a pisar al cerrar.
 *
 * Se puede reconstruir sin perder nada porque el código guarda el id del v2:
 *
 *     patients.patientCode = `P-<id v2>`
 *     cases.caseCode       = `MVA-<id v2>` · `GM-<id v2>`
 *
 * Los otros mapas (citas, documentos, notas, facturación) NO tienen ese puente:
 * si se pierden, la re-corrida los reconstruye sola porque los scripts detectan
 * lo ya insertado por otra vía (el índice natural de citas, `existe` en
 * consentimientos, etc.).
 *
 * Uso:  node 00e-rehacer-id-maps.mjs
 */
import './utils/env.mjs'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getPool, closePool } from './utils/db.mjs'

const MAPS = join(import.meta.dirname, 'id-maps')

async function run() {
  const db = getPool()
  if (!existsSync(MAPS)) mkdirSync(MAPS, { recursive: true })

  const { rows: pacientes } = await db.query(
    `SELECT id, "patientCode" FROM patients WHERE "patientCode" ~ '^P-[0-9]+$'`,
  )
  const mapaPacientes = Object.fromEntries(pacientes.map(r => [r.patientCode.slice(2), r.id]))
  writeFileSync(join(MAPS, 'patients.json'), JSON.stringify(mapaPacientes, null, 2))

  const { rows: casos } = await db.query(
    `SELECT id, "caseCode" FROM cases WHERE "caseCode" ~ '^(MVA|GM)-[0-9]+$'`,
  )
  const mapaCasos = Object.fromEntries(casos.map(r => [r.caseCode.split('-')[1], r.id]))
  writeFileSync(join(MAPS, 'cases.json'), JSON.stringify(mapaCasos, null, 2))

  console.log(`✅ patients.json → ${Object.keys(mapaPacientes).length}`)
  console.log(`✅ cases.json    → ${Object.keys(mapaCasos).length}`)
  console.log('   (citas, documentos y notas no se pueden rehacer así: no llevan el id del v2)')
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
