/**
 * Importador de MEMBRESÍAS — corre TODAS LAS SEMANAS, no es una migración.
 *
 * Vive en esta carpeta porque acá están el lector de CSV que aguanta los saltos
 * de línea del export y el descifrado AES del v2, que este archivo necesita:
 * la columna `paciente` viene cifrada con la misma llave. Pero no es un paso de
 * la migración y no lleva número de orden — se lanza cada vez que llega un
 * corte nuevo, y va a seguir existiendo hasta que el sistema de membresías
 * tenga integración en vivo.
 *
 * ── Cómo cruza con las fichas ───────────────────────────────────────────────
 * 1. Por código: `patients.patientCode` es `P-` + el `paciente_id` del origen.
 *    Comprobado sobre el primer corte: 21 de 22 enganchan así, y es estable
 *    porque no depende de los mapas de la migración.
 * 2. Por nombre, si el código no está. Hace falta de verdad: el contrato de
 *    Elissa Parsons apunta a la ficha v2 `5058`, que se descartó por duplicada
 *    —ella vive como `P-5399`—. Con 64 fichas todavía por fusionar esto se
 *    repite. Solo engancha si hay UNA ficha con ese nombre; con dos no adivina.
 * 3. Lo que no enganchó **se reporta**, no se descarta en silencio. Un socio que
 *    paga y aparece como "sin membresía" es peor que no tener la función.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 * No borra. Si un corte deja de traer un contrato, lo marca
 * `enUltimoCorte = false`: un archivo incompleto no puede hacer desaparecer la
 * membresía de alguien que está pagando.
 *
 * Uso:
 *   node membresias-semanal.mjs                          # D:/Proyectos/PM/Migracion/membresias.csv, corte = hoy
 *   node membresias-semanal.mjs --archivo=otro.csv
 *   node membresias-semanal.mjs --corte=2026-09-13
 *   node membresias-semanal.mjs --dry                     # no escribe nada
 */
import './utils/env.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { leerRegistros } from './utils/csv.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const DRY = process.argv.includes('--dry')
const ARCHIVO = arg('archivo') ?? 'D:/Proyectos/PM/Migracion/membresias.csv'
// `toISOString()` da la fecha UTC: corriendo de tarde en Denver adelanta el
// corte un día, y ese día es el que después muestra la pastilla.
const CORTE = arg('corte') ?? new Date().toLocaleDateString('en-CA')

/** Descifra y descarta lo que quedó ilegible. */
const val = (v) => {
  if (!v) return null
  const t = decrypt(String(v))
  if (t === null) return null
  const s = String(t).trim()
  return s === '' || /^e:/.test(s) ? null : s
}

/** La columna `paciente` trae DOS tokens cifrados separados por espacio. */
const nombreDe = (v) => (v ?? '').split(' ').map(val).filter(Boolean).join(' ')

/** `2026-10-10` tal cual, o null. A la columna DATE no le mandamos un instante. */
const fecha = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

async function run() {
  const db = getPool()

  const filas = []
  for await (const r of leerRegistros(ARCHIVO)) filas.push(r)
  console.log(`${filas.length} contratos en ${ARCHIVO}  ·  corte ${CORTE}${DRY ? '  (DRY)' : ''}\n`)

  const porCodigo = [], porNombre = [], sinFicha = []
  const contratos = []

  for (const r of filas) {
    const nombre = nombreDe(r.paciente)
    const codigo = `P-${r.paciente_id}`

    let { rows } = await db.query(
      `SELECT id, "patientCode" FROM patients WHERE "patientCode" = $1`, [codigo])
    let como = 'código'

    if (rows.length === 0 && nombre) {
      // Una sola coincidencia o nada: con dos fichas del mismo nombre, colgar la
      // membresía de la equivocada es peor que dejarla sin cruzar.
      const partes = nombre.split(' ')
      const r2 = await db.query(
        `SELECT id, "patientCode" FROM patients
          WHERE lower("firstName") = lower($1) AND lower("lastName") = lower($2)`,
        [partes[0], partes.slice(1).join(' ')])
      if (r2.rows.length === 1) { rows = r2.rows; como = 'nombre' }
    }

    if (rows.length === 0) {
      sinFicha.push({ contrato: r.contrato_id, externo: r.paciente_id, nombre, correo: r.email || '—' })
      continue
    }

    const paciente = rows[0]
    ;(como === 'código' ? porCodigo : porNombre).push(`${r.contrato_id} · ${nombre} → ${paciente.patientCode}`)
    contratos.push({ r, patientId: paciente.id })
  }

  if (!DRY) {
    for (const { r, patientId } of contratos) {
      await db.query(
        `INSERT INTO patient_memberships (
           id, "patientId", "contratoExterno", "pacienteExterno", plan, tipo, "montoMensual",
           empresa, "grupoFamiliar", "fechaInicio", "ultimoPago", "proximoPago",
           origen, "corteAl", "enUltimoCorte", "updatedAt"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'CSV',$13,true,CURRENT_TIMESTAMP)
         ON CONFLICT ("contratoExterno") DO UPDATE SET
           "patientId"     = EXCLUDED."patientId",
           plan            = EXCLUDED.plan,
           tipo            = EXCLUDED.tipo,
           "montoMensual"  = EXCLUDED."montoMensual",
           empresa         = EXCLUDED.empresa,
           "grupoFamiliar" = EXCLUDED."grupoFamiliar",
           "fechaInicio"   = EXCLUDED."fechaInicio",
           "ultimoPago"    = EXCLUDED."ultimoPago",
           "proximoPago"   = EXCLUDED."proximoPago",
           "corteAl"       = EXCLUDED."corteAl",
           "enUltimoCorte" = true,
           "updatedAt"     = CURRENT_TIMESTAMP`,
        [
          cuid(), patientId, String(r.contrato_id), String(r.paciente_id),
          r.plan ?? 'Basic', r.tipo_membresia ?? 'INDIVIDUAL', r.monto_mensual ?? 0,
          r.empresa || null, r.grupo_familiar || null,
          fecha(r.fecha_inicio), fecha(r.ultimo_pago), fecha(r.proximo_pago),
          CORTE,
        ],
      )
    }

    // Los que ya no vienen en el corte: se apagan, no se borran.
    const vigentes = contratos.map(({ r }) => String(r.contrato_id))
    const { rowCount } = await db.query(
      `UPDATE patient_memberships SET "enUltimoCorte" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "enUltimoCorte" = true AND NOT ("contratoExterno" = ANY($1))`,
      [vigentes],
    )
    if (rowCount > 0) console.log(`⚠ ${rowCount} contratos ya no vienen en el corte → marcados fuera del último corte\n`)
  }

  console.log(`cruzados por código : ${porCodigo.length}`)
  console.log(`cruzados por nombre : ${porNombre.length}`)
  porNombre.forEach((t) => console.log(`    ${t}`))

  if (sinFicha.length > 0) {
    console.log(`\n❌ SIN FICHA EN V3 — ${sinFicha.length}. Estos NO se guardaron y hay que resolverlos a mano:`)
    for (const s of sinFicha) {
      console.log(`    contrato ${s.contrato} · id externo ${s.externo} · ${s.nombre || '(nombre ilegible)'} · ${s.correo}`)
    }
  } else {
    console.log('\n✔ todos los contratos encontraron su ficha')
  }

  // Cómo queda la foto, con la misma cuenta que va a hacer la pantalla.
  if (!DRY) {
    const { rows: est } = await db.query(
      `SELECT count(*) FILTER (WHERE "proximoPago" >= CURRENT_DATE)::int AS activas,
              count(*) FILTER (WHERE "proximoPago" <  CURRENT_DATE)::int AS vencidas,
              count(*)::int AS total
         FROM patient_memberships WHERE "enUltimoCorte"`)
    console.log(`\nen la base: ${est[0].total} membresías · ${est[0].activas} al día · ${est[0].vencidas} vencidas`)
  }

  await closePool()
}

run().catch((e) => { console.error(e); process.exit(1) })
