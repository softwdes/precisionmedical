/**
 * Migración 11b — QUÉ se cobró en cada cargo migrado.
 *
 * El dinero del v2 llegó completo: 6.462 filas en `appointment_billing` con su
 * costo, lo pagado y el saldo, todas enganchadas a su cita y a su caso. Lo que
 * NO llegó es la descripción: solo 5 de esas filas tienen código de servicio y
 * 7 tienen texto. En pantalla eso es una lista de importes sin concepto —
 * "$180 · —"— y quien cobra no sabe qué está cobrando.
 *
 * No fue un error de la migración del dinero: la tabla `costs` del v2, que es
 * la que se migró, **solo guarda totales**. El concepto vive en otra tabla,
 * `appointment_service` (8.633 líneas), que apunta al catálogo `services`.
 *
 * Este script cruza las dos y le pone nombre a cada cargo.
 *
 * ── Por qué NO escribe en `appointment_services` ────────────────────────────
 *
 * Era lo primero que parecía correcto —es la tabla del detalle— y es justamente
 * lo que no hay que hacer. `lib/cash-service-billing.ts` lee esa tabla filtrando
 * `status: 'CHARGED'` y **crea una fila de `appointment_billing` por cada
 * servicio que encuentre sin cobro asociado**. Si metemos ahí las 8.008 líneas
 * históricas, la próxima vez que alguien toque una de esas citas el sistema
 * generaría el cobro "que falta" — duplicando cargos ya migrados por más de
 * 1,4 millones de dólares. Y el enum solo tiene `CHARGED` y `VOIDED`: no hay un
 * estado "histórico, no sincronizar" donde esconderlas.
 *
 * Así que esto **solo completa dos columnas de texto** en las filas de cobro que
 * ya existen. No crea cargos, no toca montos, no toca pagos.
 *
 * ── A qué filas les escribe ─────────────────────────────────────────────────
 *
 * Solo a las que vinieron del v2: `serviceDescription` en NULL y sin
 * `braceId` / `cashServiceId` / `labOrderId`, que son las marcas de un cargo
 * nacido en v3 (una férula, un servicio de mostrador, un laboratorio). Un cargo
 * de v3 ya tiene su propio concepto y no se pisa.
 *
 * ── Dos cosas que se ven al cruzar ──────────────────────────────────────────
 *
 *  · El v2 repite líneas: la misma ausencia cargada como `NO SHOW · PATIENT
 *    FAILS TO SHOW UP` y como `1 · No show appointment`, las dos de $100. Se
 *    deduplica por código+nombre para no escribir el concepto dos veces.
 *  · Hay nombres del catálogo corrompidos EN EL ORIGEN, no en el export: el
 *    J3301 dice "KENALOG INJECTION, TRIAMCINOLONE ACECTHONIDE, NOT OT4H0.E0R0
 *    WISE SPECIFIED, 10 M J3302 INJECTION,". Alguien pegó dos renglones de una
 *    lista de precios en un campo. Se importa tal cual —limpiarlo sería
 *    inventar— y el script los lista al final para que la clínica los corrija
 *    en el catálogo.
 *
 * Uso:
 *   node 11b-detalle-de-los-cargos.mjs --dry
 *   node 11b-detalle-de-los-cargos.mjs
 */
import './utils/env.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')

/** Un nombre con dígitos incrustados en medio de una palabra viene corrompido. */
const SOSPECHOSO = /[A-Za-z]\d[A-Za-z]|\d\.\d{2}[A-Z]/

async function run() {
  const db = getPool()

  const mapaCitas = JSON.parse(
    readFileSync(join(import.meta.dirname, 'id-maps/appointments.json'), 'utf8'))

  /**
   * Los nombres del v2 vienen con tabulaciones y corridas de espacios adentro
   * ("OFFICE OUTPATIENT VISIT 25 MINUTES       CH"). En una tabla HTML eso se
   * colapsa solo, pero en el buscador y en un PDF no: se normaliza al leer.
   * Es formato, no contenido — ninguna palabra se toca.
   */
  const limpiar = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

  const catalogo = new Map()
  for await (const s of leerRegistros(buscarCsv('services'))) {
    catalogo.set(String(s.id), { code: limpiar(s.code), name: limpiar(s.description) })
  }
  console.log(`catálogo del v2: ${catalogo.size} servicios`)

  // v3 appointmentId → conceptos (deduplicados, en el orden en que aparecen)
  const porCita = new Map()
  let lineas = 0, sinCita = 0, sinServicio = 0
  for await (const r of leerRegistros(buscarCsv('appointment_service'))) {
    lineas++
    const v3 = mapaCitas[String(r.appointmentId)]
    if (!v3) { sinCita++; continue }
    const s = catalogo.get(String(r.serviceId))
    if (!s) { sinServicio++; continue }

    if (!porCita.has(v3)) porCita.set(v3, new Map())
    // La clave junta código y nombre: así la ausencia cargada dos veces con dos
    // códigos distintos se colapsa igual, porque el nombre no aporta nada nuevo.
    porCita.get(v3).set(`${s.code}|${s.name}`.toLowerCase(), s)
  }

  console.log(`líneas de servicio        : ${lineas}`)
  console.log(`  su cita no migró        : ${sinCita}`)
  console.log(`  su servicio no está     : ${sinServicio}`)
  console.log(`citas con concepto        : ${porCita.size}\n`)

  /**
   * Los cobros candidatos, en UNA consulta.
   *
   * La primera versión preguntaba cita por cita: 6.443 viajes de ida y vuelta
   * contra el pooler, que a ~100 ms cada uno son diez minutos de reloj para
   * leer seis mil filas. Una sola lectura y las escrituras por tandas hacen lo
   * mismo en segundos.
   */
  const { rows: cobros } = await db.query(
    `SELECT id, "appointmentId", ("serviceDescription" IS NOT NULL) AS tenia
       FROM appointment_billing
      WHERE "braceId" IS NULL AND "cashServiceId" IS NULL AND "labOrderId" IS NULL
        AND "appointmentId" IS NOT NULL`)

  const cobrosDeCita = new Map()
  for (const c of cobros) {
    if (!cobrosDeCita.has(c.appointmentId)) cobrosDeCita.set(c.appointmentId, [])
    cobrosDeCita.get(c.appointmentId).push(c)
  }
  console.log(`cobros del v2 candidatos  : ${cobros.length}\n`)

  const corruptos = new Set()
  const aEscribir = []
  let sinCobro = 0, yaTenian = 0, variosCobros = 0

  for (const [appointmentId, conceptos] of porCita) {
    const lista = [...conceptos.values()]
    for (const c of lista) if (SOSPECHOSO.test(c.name)) corruptos.add(`${c.code} · ${c.name}`)

    const codigos = [...new Set(lista.map((c) => c.code).filter(Boolean))]
    // El código va solo si hay UNO: la columna es un código, no una lista, y
    // poner el primero de tres sería decir que el cargo es de ese servicio.
    const serviceCode = codigos.length === 1 ? codigos[0] : null
    const serviceDescription = lista.map((c) => c.name).filter(Boolean).join(' + ') || null
    if (!serviceDescription) continue

    const filas = cobrosDeCita.get(appointmentId) ?? []
    if (filas.length === 0) { sinCobro++; continue }
    if (filas.length > 1) variosCobros++

    for (const fila of filas) {
      if (fila.tenia) { yaTenian++; continue }
      aEscribir.push([fila.id, serviceCode, serviceDescription.slice(0, 500)])
    }
  }

  const escritas = aEscribir.length
  if (!DRY) {
    const TANDA = 500
    for (let i = 0; i < aEscribir.length; i += TANDA) {
      const tanda = aEscribir.slice(i, i + TANDA)
      const values = tanda
        .map((_, j) => `($${j * 3 + 1}::text, $${j * 3 + 2}::text, $${j * 3 + 3}::text)`)
        .join(', ')
      await db.query(
        `UPDATE appointment_billing AS b
            SET "serviceCode" = v.code, "serviceDescription" = v.descr,
                "updatedAt" = CURRENT_TIMESTAMP
           FROM (VALUES ${values}) AS v(id, code, descr)
          WHERE b.id = v.id AND b."serviceDescription" IS NULL`,
        tanda.flat())
      process.stdout.write(`  ${Math.min(i + TANDA, aEscribir.length)}/${aEscribir.length}\r`)
    }
    process.stdout.write('\n')
  }

  console.log(`cargos con concepto nuevo : ${escritas}${DRY ? '  (DRY — no se escribió)' : ''}`)
  console.log(`  ya tenían concepto      : ${yaTenian}`)
  console.log(`citas sin fila de cobro   : ${sinCobro}`)
  console.log(`citas con más de un cobro : ${variosCobros}  (a todas les cae el mismo concepto)`)

  if (corruptos.size > 0) {
    console.log(`\n⚠ ${corruptos.size} servicios del catálogo del v2 tienen el nombre corrompido EN EL ORIGEN.`)
    console.log('  Se importan tal cual; conviene corregirlos en el catálogo de v3:')
    for (const c of [...corruptos].slice(0, 15)) console.log(`   ${c.slice(0, 110)}`)
  }

  if (!DRY) {
    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE "serviceDescription" IS NOT NULL)::int AS con_concepto,
              count(*)::int AS total FROM appointment_billing`)
    console.log(`\nen la base: ${rows[0].con_concepto} de ${rows[0].total} cargos ya dicen qué se cobró`)
  }

  await closePool()
}

run().catch((e) => { console.error(e); process.exit(1) })
