/**
 * Migración 02b — Los mapas que NO salen del CSV: doctores y clínicas
 *
 * POR QUÉ EXISTE: `06-appointments.mjs` necesita `id-maps/providers.json` y
 * `id-maps/clinics.json`, y los construía `02-providers` / `01-clinics` **al
 * insertar**. Esta vez esas dos tablas NO se migran —las 6 clínicas reales y los
 * providers con sus cuentas se conservan— así que los mapas no los genera nadie
 * y las 9.784 citas entrarían sin doctor y sin clínica.
 *
 * Y no alcanza con cruzar por email, que es el puente que usa todo el resto del
 * sistema: **los correos del v2 no son los del v3**. Medido el 2026-09-12:
 *
 *     v2 mstouffer@gmail.com                      v3 mstouffer@precisionmedicalcare.com
 *     v2 scottrigdon@hotmail.com                  v3 srigdon@precisionmedicalcare.com
 *     v2 andrew@precisionmedical3.onmicrosoft.com v3 anielsen@precisionmedicalcare.com
 *
 * Cero coincidencias sobre 14. Lo único que comparten es el APELLIDO, que en el
 * v2 viene cifrado dentro de `users.lastname`.
 *
 * QUÉ HACE: descifra los nombres, cuenta cuántas citas tiene cada doctor del v2,
 * busca su ficha en v3 por apellido y propone el mapa. **No escribe nada sin
 * `--escribir`**: primero se mira la tabla, porque un doctor mal mapeado le
 * cuelga miles de citas a otra persona.
 *
 * Uso:
 *   node 02b-mapas-por-nombre.mjs              # solo muestra la propuesta
 *   node 02b-mapas-por-nombre.mjs --escribir   # guarda los dos id-maps
 */
import './utils/env.mjs'
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'

import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool } from './utils/db.mjs'

const ESCRIBIR = process.argv.includes('--escribir')
const MAPS = join(import.meta.dirname, 'id-maps')
const REVISION = join(import.meta.dirname, 'mapa-doctores.json')

/** Busca por prefijo: el timestamp del export cambia en cada corrida. */
function csv(prefijo) {
  const dir = process.env.CSV_DIR
  if (!dir) throw new Error('Falta CSV_DIR en scripts/migration/.env')
  const f = readdirSync(dir).filter(x => new RegExp(`^${prefijo}.*\\.csv$`, 'i').test(x)).sort().at(-1)
  if (!f) throw new Error(`No encontré ${prefijo}*.csv en ${dir}`)
  return join(dir, f)
}

async function leer(ruta) {
  const filas = []
  for await (const reg of leerRegistros(ruta)) filas.push(reg)
  return filas
}

/** minúsculas, sin acentos y sin dobles espacios — para comparar apellidos. */
const norm = s => (s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

const esPrueba = s => /prueba|test|-x-/i.test(s ?? '')

async function run() {
  const [users, clinicUsers, citas, clinicasV2] = await Promise.all([
    leer(csv('users_2')),            // `users_2…` para no agarrar users_clinic ni users_extern
    leer(csv('users_clinic')),
    leer(csv('appointments')),
    leer(csv('clinics')),
  ])

  const porUserId = Object.fromEntries(users.map(u => [u.id, u]))

  // ─── Citas por doctor del v2 ──────────────────────────────────────────────
  // `appointments.doctorId` apunta a `users_clinic.id` (la fila del staff), NO a
  // `users.id`. Cruzarlo con `userId` da cero coincidencias y parece que el
  // export viniera mal.
  const citasPorDoctor = new Map()
  for (const c of citas) {
    const k = c.doctorId || '(sin doctor)'
    citasPorDoctor.set(k, (citasPorDoctor.get(k) ?? 0) + 1)
  }

  // ─── Providers de v3 ──────────────────────────────────────────────────────
  const db = getPool()
  const { rows: providers } = await db.query(
    `SELECT id, "firstName", "lastName", email, status
       FROM providers WHERE "deletedAt" IS NULL`,
  )
  const { rows: clinicasV3 } = await db.query(`SELECT id, name FROM clinics`)
  await closePool()

  // ─── Staff del v2 ─────────────────────────────────────────────────────────
  // Se miran TODOS los roles, no solo `doctor`: hay 39 citas cuyo `doctorId` es
  // un admin o una recepcionista. Casi todas son de prueba, pero 2 son de Devin
  // Clanton, que es doctor de verdad y en el v2 quedó cargado como admin. El
  // filtro no lo pone el rol: lo pone el nombre, de los dos lados.
  const staff = clinicUsers

  const filas = staff.map(c => {
    const u = porUserId[c.userId] ?? {}
    const nombre = decrypt(u.name ?? '') ?? ''
    const apellido = decrypt(u.lastname ?? '') ?? ''
    const n = citasPorDoctor.get(c.id) ?? 0

    const porApellido = providers.filter(p => norm(p.lastName) === norm(apellido) && norm(apellido))
    const porAmbos = porApellido.filter(p => norm(p.firstName).startsWith(norm(nombre).split(' ')[0]))

    let elegido = null, confianza = 'SIN MATCH'
    if (porAmbos.length === 1)      { elegido = porAmbos[0];    confianza = 'nombre+apellido' }
    else if (porApellido.length === 1) { elegido = porApellido[0]; confianza = 'apellido' }
    else if (porApellido.length > 1)   { confianza = `AMBIGUO (${porApellido.length})` }

    return {
      v2Id: c.id, rol: c.role, nombre, apellido, emailV2: u.email ?? null, citas: n,
      activo: c.active !== 'false',
      // Prueba si lo dice CUALQUIERA de los dos lados: `Wilfredo Villarroel` en
      // el v2 no lleva la marca, pero su ficha v3 es "Villarroel (PRUEBA)".
      prueba: esPrueba(`${nombre} ${apellido}`) ||
              esPrueba(`${elegido?.firstName ?? ''} ${elegido?.lastName ?? ''}`),
      v3Id: elegido?.id ?? null,
      v3: elegido ? `${elegido.firstName} ${elegido.lastName}` : null,
      emailV3: elegido?.email ?? null,
      confianza,
    }
  }).sort((a, b) => b.citas - a.citas)

  // ─── Tabla ────────────────────────────────────────────────────────────────
  console.log(`\n👩‍⚕️  ${filas.length} personas con rol clínico en el v2 · ${providers.length} providers en v3\n`)
  console.log('citas   v2 (apellido, nombre)          correo v2                        →  provider v3                  match')
  console.log('─'.repeat(132))
  for (const f of filas) {
    const izq = `${f.apellido}, ${f.nombre}`.slice(0, 30)
    const marca = f.prueba ? ' (prueba)' : ''
    console.log(
      `${String(f.citas).padStart(5)}   ${izq.padEnd(30)} ${(f.emailV2 ?? '—').padEnd(32)} →  ` +
      `${(f.v3 ?? '❌ SIN FICHA EN V3').padEnd(28)} ${f.confianza}${marca}`,
    )
  }

  const sinMatch = filas.filter(f => !f.v3Id)
  const citasSinMatch = sinMatch.reduce((s, f) => s + f.citas, 0)
  const huerfanas = [...citasPorDoctor]
    .filter(([id]) => id !== '(sin doctor)' && !staff.some(s => s.id === id))
    .reduce((s, [, n]) => s + n, 0)

  console.log('\n' + '─'.repeat(132))
  console.log(`✅ mapeados: ${filas.length - sinMatch.length}   ❌ sin ficha: ${sinMatch.length} (${citasSinMatch} citas)`)
  console.log(`   citas sin doctor en el origen: ${citasPorDoctor.get('(sin doctor)') ?? 0}`)
  console.log(`   citas cuyo doctorId no es de este listado: ${huerfanas}`)

  // ─── Clínicas ─────────────────────────────────────────────────────────────
  // Mismo problema, más fácil: el nombre SÍ es el mismo en los dos lados.
  const mapaClinicas = {}
  console.log('\n🏥  Clínicas')
  for (const c of clinicasV2) {
    const v3 = clinicasV3.find(x => norm(x.name) === norm(c.name))
    if (v3) mapaClinicas[c.id] = v3.id
    console.log(`   ${String(c.id).padStart(3)}  ${(c.name ?? '').padEnd(20)} → ${v3 ? v3.id : '❌ no está en v3 (se salta)'}`)
  }

  // ─── Salida ───────────────────────────────────────────────────────────────
  /**
   * Las cuentas de prueba quedan FUERA del mapa, a propósito.
   *
   * Sus fichas existen en v3 y matchean, así que sería facilísimo mapearlas. Pero
   * entre sus 13 citas hay **2 de pacientes reales** —una del 1-sep-2026 con nota
   * "MVA FU POST ESI"—: alguien usó la cuenta de prueba para agendar de verdad.
   * Sin mapa esas citas entran con `providerId` nulo, que es honesto; mapeadas,
   * quedarían atribuidas a "Ruth Prueba2" dentro de la historia clínica de una
   * paciente real. Una cita sin doctor se corrige en una pantalla; una cita con
   * el doctor equivocado nadie la mira dos veces.
   */
  const mapaDoctores = Object.fromEntries(
    filas.filter(f => f.v3Id && !f.prueba).map(f => [f.v2Id, f.v3Id]),
  )
  const excluidas = filas.filter(f => f.v3Id && f.prueba)
  if (excluidas.length) {
    console.log(`\n🚫 fuera del mapa por ser cuentas de prueba: ${excluidas.map(f => `${f.apellido} (${f.citas} citas)`).join(', ')}`)
    console.log('   sus citas entran sin provider — ver el comentario en este script')
  }

  if (!ESCRIBIR) {
    console.log('\n👉 Revisá la tabla. Si está bien: node 02b-mapas-por-nombre.mjs --escribir')
    return
  }

  if (!existsSync(MAPS)) mkdirSync(MAPS, { recursive: true })
  writeFileSync(join(MAPS, 'providers.json'), JSON.stringify(mapaDoctores, null, 2))
  writeFileSync(join(MAPS, 'clinics.json'), JSON.stringify(mapaClinicas, null, 2))
  // El de revisión guarda TODO —incluido lo que no matcheó— para que la decisión
  // quede escrita y no haya que volver a deducirla dentro de un mes.
  writeFileSync(REVISION, JSON.stringify(filas, null, 2))

  console.log(`\n💾 id-maps/providers.json (${Object.keys(mapaDoctores).length}) · id-maps/clinics.json (${Object.keys(mapaClinicas).length})`)
  console.log(`💾 detalle y sin-match → ${REVISION}`)
}

run().catch(e => { console.error(e); process.exit(1) })
