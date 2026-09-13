/**
 * Auditoría del export del v2 — qué viene BORRADO y qué viene REPETIDO.
 *
 * POR QUÉ: el dev del v2 avisó que sacó varios duplicados pero que quedan
 * algunos que no detectó, y que hay que quitar los borrados. Esto lo mide sobre
 * los CSV, ANTES de importar: un borrado que entra es un paciente que reaparece
 * en la agenda, y un duplicado que entra es una persona con la historia clínica
 * partida en dos.
 *
 * Todo se lee por streaming y se proyecta solo lo necesario: `case_consents` son
 * 44 MB de firmas en base64 y no hacen falta para contar.
 *
 *   node 00c-borrados-y-repetidos.mjs
 */
import './utils/env.mjs'
import { readdirSync } from 'fs'

import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'

function csv(prefijo) {
  const dir = process.env.CSV_DIR
  if (!dir) throw new Error('Falta CSV_DIR en scripts/migration/.env')
  const f = readdirSync(dir).filter(x => new RegExp(`^${prefijo}.*\\.csv$`, 'i').test(x)).sort().at(-1)
  if (!f) throw new Error(`No encontré ${prefijo}*.csv en ${dir}`)
  return join(dir, f)
}

/** Streaming con proyección: solo las columnas pedidas llegan a memoria. */
async function leer(prefijo, columnas) {
  const filas = []
  let verificado = false
  for await (const reg of leerRegistros(csv(prefijo))) {
    if (!verificado) {
      const falta = columnas.filter(c => !(c in reg))
      if (falta.length) throw new Error(`${prefijo}: faltan columnas ${falta.join(', ')} (hay: ${Object.keys(reg).join(', ')})`)
      verificado = true
    }
    filas.push(Object.fromEntries(columnas.map(n => [n, reg[n] ?? null])))
  }
  return filas
}

const norm = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const soloDigitos = s => (s ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')

/** Agrupa por una llave y devuelve {grupos, sobrantes, ejemplos}. */
function repetidos(filas, llave, etiqueta = () => '') {
  const m = new Map()
  for (const f of filas) {
    const k = llave(f)
    if (k === null) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(f)
  }
  const grupos = [...m.entries()].filter(([, v]) => v.length > 1)
  return {
    grupos: grupos.length,
    sobrantes: grupos.reduce((s, [, v]) => s + v.length - 1, 0),
    ejemplos: grupos.sort((a, b) => b[1].length - a[1].length).slice(0, 5)
      .map(([k, v]) => `×${v.length}  ${etiqueta(v[0]) || k}`),
  }
}

const linea = (t) => console.log('\n' + t + '\n' + '─'.repeat(t.length))

async function run() {
  console.log('Leyendo el export…')
  const [users, pacientes, casos, citas, docs, consents, costos, notas, seguros] = await Promise.all([
    leer('users_2',        ['id', 'name', 'lastname', 'email', 'birthdate', 'phone', 'cellphone', 'type', 'status']),
    leer('users_patient',  ['id', 'userId', 'ssp', 'guardianId', 'active']),
    leer('cases',          ['id', 'patientId', 'type', 'status', 'accidentDate', 'createdAt']),
    leer('appointments',   ['id', 'caseId', 'date', 'timeStart', 'doctorId', 'status']),
    leer('documents',      ['id', 'patientId', 'caseId', 'minioKey', 'isFolder']),
    leer('case_consents',  ['id', 'caseId', 'code']),
    leer('costs',          ['id', 'appointmentId', 'caseId']),
    leer('notes',          ['id', 'caseId', 'appointmentId']),
    leer('insurances',     ['id', 'patientId', 'policyNumber', 'companyName', 'status']),
  ])

  // ─── 1. Borrados ──────────────────────────────────────────────────────────
  const userPorId = new Map(users.map(u => [u.id, u]))
  const pacientePorId = new Map(pacientes.map(p => [p.id, p]))

  const usersBorrados = new Set(users.filter(u => u.status === 'DELETED' || u.status === 'INACTIVE').map(u => u.id))
  const pacientesBorrados = new Set(
    pacientes.filter(p => usersBorrados.has(p.userId)).map(p => p.id),
  )
  const casosBorrados = new Set(casos.filter(c => c.status === 'DELETED').map(c => c.id))
  const casosDePacienteBorrado = casos.filter(c => pacientesBorrados.has(c.patientId) && !casosBorrados.has(c.id))
  const citasBorradas = citas.filter(c => c.status === 'DELETE')
  const casosMuertos = new Set([...casosBorrados, ...casosDePacienteBorrado.map(c => c.id)])

  linea('1 · BORRADOS — lo que no tiene que entrar')
  console.log(`usuarios DELETED/INACTIVE        ${String(usersBorrados.size).padStart(6)} de ${users.length}`)
  console.log(`  de esos, pacientes             ${String(pacientesBorrados.size).padStart(6)} de ${pacientes.length}`)
  console.log(`casos DELETED                    ${String(casosBorrados.size).padStart(6)} de ${casos.length}`)
  console.log(`casos ACTIVOS de paciente borrado${String(casosDePacienteBorrado.length).padStart(6)}   ← se arrastran si solo se filtra por cases.status`)
  console.log(`citas con status DELETE          ${String(citasBorradas.length).padStart(6)} de ${citas.length}`)
  console.log(`citas ACTIVAS de caso muerto     ${String(citas.filter(a => casosMuertos.has(a.caseId) && a.status !== 'DELETE').length).padStart(6)}   ← ídem`)
  console.log(`documentos de caso/paciente muerto${String(docs.filter(d => (d.caseId && casosMuertos.has(d.caseId)) || (d.patientId && pacientesBorrados.has(d.patientId))).length).padStart(5)}`)
  console.log(`consentimientos de caso muerto   ${String(consents.filter(c => casosMuertos.has(c.caseId)).length).padStart(6)}`)
  console.log(`seguros DELETED                  ${String(seguros.filter(s => s.status === 'DELETED').length).padStart(6)}`)

  // ─── 2. Personas repetidas ────────────────────────────────────────────────
  // El nombre viene cifrado; sin descifrar, un duplicado es invisible.
  const vivos = users.filter(u => u.type === 'patient' && !usersBorrados.has(u.id))
  const claros = vivos.map(u => ({
    id: u.id,
    nombre: norm(decrypt(u.name ?? '') ?? ''),
    apellido: norm(decrypt(u.lastname ?? '') ?? ''),
    nacimiento: (u.birthdate ?? '').slice(0, 10),
    email: norm(u.email),
    tel: soloDigitos(decrypt(u.phone ?? '') ?? decrypt(u.cellphone ?? '') ?? ''),
  }))

  linea('2 · PERSONAS REPETIDAS — pacientes vivos (nombre descifrado)')
  const porNombreFecha = repetidos(
    claros,
    p => (p.nombre && p.apellido && p.nacimiento ? `${p.nombre}|${p.apellido}|${p.nacimiento}` : null),
    p => `${p.apellido}, ${p.nombre} · ${p.nacimiento}`,
  )
  console.log(`nombre + apellido + nacimiento : ${porNombreFecha.grupos} grupos, ${porNombreFecha.sobrantes} de más`)
  porNombreFecha.ejemplos.forEach(e => console.log(`    ${e}`))

  const soloNombre = repetidos(
    claros,
    p => (p.nombre && p.apellido ? `${p.nombre}|${p.apellido}` : null),
    p => `${p.apellido}, ${p.nombre}`,
  )
  console.log(`\nnombre + apellido (sin fecha)  : ${soloNombre.grupos} grupos, ${soloNombre.sobrantes} de más`)
  soloNombre.ejemplos.forEach(e => console.log(`    ${e}`))
  console.log('    ↑ incluye homónimos reales: mirar con la fecha al lado antes de fusionar')

  const porTelefono = repetidos(claros, p => (p.tel.length >= 10 ? p.tel : null), p => p.tel)
  console.log(`\nmismo teléfono                 : ${porTelefono.grupos} grupos, ${porTelefono.sobrantes} de más`)
  console.log('    ↑ NO son duplicados: son familias. Ver plan-vinculo-familiar-contactos-compartidos')

  // ─── 2b. ¿Se pueden borrar, o hay que fusionar? ───────────────────────────
  // La pregunta que decide el trabajo: si de las 4 fichas de una persona solo
  // UNA tiene casos, las otras tres son cáscaras y se descartan. Si tienen
  // datos repartidas, descartar una PIERDE historia clínica y hay que fusionar.
  const pacientePorUserId = new Map(pacientes.map(p => [p.userId, p]))
  const casosPorPaciente = new Map()
  for (const c of casos) casosPorPaciente.set(c.patientId, (casosPorPaciente.get(c.patientId) ?? 0) + 1)
  const citasPorCaso = new Map()
  for (const a of citas) citasPorCaso.set(a.caseId, (citasPorCaso.get(a.caseId) ?? 0) + 1)
  const casosDe = new Map()
  for (const c of casos) {
    if (!casosDe.has(c.patientId)) casosDe.set(c.patientId, [])
    casosDe.get(c.patientId).push(c.id)
  }
  const docsPorPaciente = new Map()
  for (const d of docs) if (d.patientId) docsPorPaciente.set(d.patientId, (docsPorPaciente.get(d.patientId) ?? 0) + 1)

  /** Cuánto "pesa" una ficha: casos + citas + documentos. */
  function peso(userId) {
    const p = pacientePorUserId.get(userId)
    if (!p) return 0
    const cs = casosDe.get(p.id) ?? []
    const citasN = cs.reduce((s, id) => s + (citasPorCaso.get(id) ?? 0), 0)
    return cs.length + citasN + (docsPorPaciente.get(p.id) ?? 0)
  }

  const grupos = new Map()
  for (const p of claros) {
    if (!p.nombre || !p.apellido || !p.nacimiento) continue
    const k = `${p.nombre}|${p.apellido}|${p.nacimiento}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(p)
  }
  const repes = [...grupos.entries()].filter(([, v]) => v.length > 1)
  let cascaras = 0, fusionar = 0, vacios = 0
  const paraFusionar = []
  for (const [k, v] of repes) {
    const pesos = v.map(p => peso(p.id))
    const conDatos = pesos.filter(n => n > 0).length
    if (conDatos === 0) vacios++
    else if (conDatos === 1) cascaras++
    else { fusionar++; paraFusionar.push(`${k.split('|').reverse().join(' · ')}  → pesos ${pesos.join(' / ')}`) }
  }
  console.log(`\nde los ${repes.length} grupos con misma persona y misma fecha:`)
  console.log(`   ${String(cascaras).padStart(3)} tienen los datos en UNA sola ficha  → las otras son cáscaras, se descartan`)
  console.log(`   ${String(vacios).padStart(3)} están todas vacías                   → se queda cualquiera`)
  console.log(`   ${String(fusionar).padStart(3)} tienen datos REPARTIDOS             → descartar una pierde historia: hay que fusionar`)
  paraFusionar.slice(0, 8).forEach(t => console.log(`       ${t}`))

  // ─── 3. Repetidos por tabla ───────────────────────────────────────────────
  linea('3 · REPETIDOS POR TABLA (sobre las filas que SÍ entrarían)')

  const citasVivas = citas.filter(c => c.status !== 'DELETE' && !casosMuertos.has(c.caseId))
  const dupCitas = repetidos(
    citasVivas,
    c => (c.caseId && c.date && c.timeStart ? `${c.caseId}|${c.date}|${c.timeStart}|${c.doctorId ?? ''}` : null),
    c => `caso ${c.caseId} · ${c.date} ${c.timeStart}`,
  )
  console.log(`citas  (caso+fecha+hora+doctor) : ${dupCitas.grupos} grupos, ${dupCitas.sobrantes} de más`)
  dupCitas.ejemplos.forEach(e => console.log(`    ${e}`))

  const consentsVivos = consents.filter(c => !casosMuertos.has(c.caseId))
  const dupConsents = repetidos(consentsVivos, c => `${c.caseId}|${c.code}`, c => `caso ${c.caseId} · ${c.code}`)
  console.log(`\nconsentimientos (caso+código)   : ${dupConsents.grupos} grupos, ${dupConsents.sobrantes} de más`)
  dupConsents.ejemplos.forEach(e => console.log(`    ${e}`))

  const dupCostos = repetidos(costos.filter(c => c.appointmentId), c => c.appointmentId, c => `cita ${c.appointmentId}`)
  console.log(`\ncargos (una cuenta por cita)    : ${dupCostos.grupos} grupos, ${dupCostos.sobrantes} de más`)
  dupCostos.ejemplos.forEach(e => console.log(`    ${e}`))

  const dupNotas = repetidos(notas.filter(n => n.appointmentId), n => n.appointmentId, n => `cita ${n.appointmentId}`)
  console.log(`\nnotas (una por cita)            : ${dupNotas.grupos} grupos, ${dupNotas.sobrantes} de más`)
  dupNotas.ejemplos.forEach(e => console.log(`    ${e}`))

  const dupSeguros = repetidos(
    seguros.filter(s => s.status !== 'DELETED' && s.policyNumber),
    s => `${s.patientId}|${norm(s.policyNumber)}`,
    s => `paciente ${s.patientId} · ${s.companyName} ${s.policyNumber}`,
  )
  console.log(`\nseguros (paciente+póliza)       : ${dupSeguros.grupos} grupos, ${dupSeguros.sobrantes} de más`)
  dupSeguros.ejemplos.forEach(e => console.log(`    ${e}`))

  const dupDocs = repetidos(docs.filter(d => d.isFolder !== 'true'), d => d.minioKey, d => d.minioKey)
  console.log(`\ndocumentos (misma ruta)         : ${dupDocs.grupos} grupos, ${dupDocs.sobrantes} de más`)

  // ─── 4. Huérfanos ─────────────────────────────────────────────────────────
  linea('4 · HUÉRFANOS — apuntan a algo que no existe en el export')
  const idsPaciente = new Set(pacientes.map(p => p.id))
  const idsCaso = new Set(casos.map(c => c.id))
  const idsCita = new Set(citas.map(c => c.id))
  console.log(`casos sin paciente en el export        : ${casos.filter(c => !idsPaciente.has(c.patientId)).length}`)
  console.log(`citas sin caso                         : ${citas.filter(c => !idsCaso.has(c.caseId)).length}`)
  console.log(`cargos sin cita                        : ${costos.filter(c => c.appointmentId && !idsCita.has(c.appointmentId)).length}`)
  console.log(`notas sin cita                         : ${notas.filter(n => n.appointmentId && !idsCita.has(n.appointmentId)).length}`)
  console.log(`documentos sin paciente                : ${docs.filter(d => d.patientId && !idsPaciente.has(d.patientId)).length}`)
  console.log(`pacientes sin fila en users            : ${pacientes.filter(p => !userPorId.has(p.userId)).length}`)
  console.log(`tutores (guardianId) que no existen    : ${pacientes.filter(p => p.guardianId && !pacientePorId.has(p.guardianId) && !userPorId.has(p.guardianId)).length}`)

  linea('5 · LO QUE ENTRARÍA')
  const pacientesVivos = pacientes.filter(p => !pacientesBorrados.has(p.id))
  const casosVivos = casos.filter(c => !casosMuertos.has(c.id))
  console.log(`pacientes ${String(pacientesVivos.length).padStart(6)}   casos ${String(casosVivos.length).padStart(6)}   citas ${String(citasVivas.length - dupCitas.sobrantes).padStart(6)} (sin los repetidos)`)
}

run().catch(e => { console.error(e); process.exit(1) })
