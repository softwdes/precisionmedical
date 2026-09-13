/**
 * Inventario de los Excel del v2 — lo PRIMERO que se corre cuando llega la
 * carpeta, antes de importar nada.
 *
 * POR QUÉ: los 19 scripts de migración leen CSV con un parser propio y en el
 * monorepo no había ninguna librería de xlsx. Sin esto, una carpeta de Excel no
 * se puede ni abrir. Y además contesta, en una pantalla, las preguntas que en la
 * corrida anterior se contestaron tarde y mal: qué hojas vinieron, cómo se
 * llaman las columnas DE VERDAD, cuáles están cifradas, cuáles vienen vacías y
 * qué script consume cada archivo.
 *
 * Uso:
 *   node 00-inventario-de-excel.mjs                    # usa CSV_DIR del .env
 *   node 00-inventario-de-excel.mjs /ruta/a/la/carpeta
 *   node 00-inventario-de-excel.mjs --convertir        # además escribe los .csv
 *
 * `--convertir` deja un CSV UTF-8 por hoja, con el nombre que espera cada
 * script (`companies.csv`, `users_patient.csv`, …), para que el resto de la
 * migración corra sin tocar una línea.
 */
import './utils/env.mjs'
import ExcelJS from 'exceljs'
import { readdirSync, writeFileSync, statSync } from 'fs'

import { join, extname, basename } from 'path'
import { leerFilas } from './utils/csv.mjs'

const args = process.argv.slice(2)
const CONVERTIR = args.includes('--convertir')
const CARPETA = args.find(a => !a.startsWith('--')) ?? process.env.CSV_DIR
const REPORTE = join(import.meta.dirname, 'inventario.json')

/** Filas que se guardan por hoja para perfilar las columnas. */
const MUESTRA = 400

/**
 * Cuánto se imprime.
 *
 * Con 60 archivos, volcar cada columna de cada uno son más de mil líneas y el
 * inventario deja de servir para lo que sirve: ver de un vistazo qué llegó.
 * Por defecto va una línea por hoja; `--detalle` abre todas las columnas y
 * `--detalle=cases,appointments` solo esas. El JSON siempre sale completo.
 */
const DETALLE_ARG = args.find(a => a === '--detalle' || a.startsWith('--detalle='))
const DETALLE_TODO = DETALLE_ARG === '--detalle'
const DETALLE_SOLO = DETALLE_ARG?.startsWith('--detalle=')
  ? DETALLE_ARG.slice(10).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : []
const conDetalle = nombre =>
  DETALLE_TODO || DETALLE_SOLO.some(p => nombre.toLowerCase().includes(p))

if (!CARPETA) {
  console.error('Falta la carpeta: pasala como argumento o poné CSV_DIR en scripts/migration/.env')
  process.exit(1)
}

// ─── Qué esperamos del v2 ───────────────────────────────────────────────────
// El nombre de la hoja/archivo se compara contra esto para decir, en el
// momento, qué script la consume y qué falta. Sale de los 19 scripts y del
// plan de migración.
const ESPERADAS = [
  { nombre: "users_patient", patron: /^users_patient/i, v3: 'patients',                script: '04-patients' },
  { nombre: "users_clinic", patron: /^users_clinic/i, v3: 'providers',               script: '02-providers (se saltea: ya están)' },
  { nombre: "users_extern", patron: /^users_extern/i, v3: 'lawyers (miembros)',      script: '03-attorneys' },
  { nombre: "users", patron: /^users/i, v3: 'base de nombres/correos', script: '03 · 04 (se cruza por userId)' },
  { nombre: "companies", patron: /^companies/i, v3: 'lawyers (bufetes)',       script: '03b-companies' },
  { nombre: "clinics", patron: /^clinics/i, v3: 'clinics',                 script: '01-clinics (se saltea: quedan las 6 reales)' },
  { nombre: "cases", patron: /^cases/i, v3: 'cases',                   script: '05-cases' },
  { nombre: "appointments", patron: /^appointments/i, v3: 'appointments',            script: '06-appointments' },
  { nombre: "case_externs", patron: /^case_externs/i, v3: 'firmas + vínculo legal',  script: '07-case-externs · 07b · 08' },
  { nombre: "insurances", patron: /^insurances/i, v3: 'insurance_carriers',      script: '08-insurances' },
  { nombre: "notes", patron: /^notes/i, v3: 'visit_notes',             script: '09-visit-notes' },
  { nombre: "vitals", patron: /^vitals/i, v3: 'visit_notes (vitales)',   script: '09-visit-notes' },
  { nombre: "note_diagnosic", patron: /^note_diagnosic/i, v3: 'visit_note_diagnoses',    script: '10-note-diagnoses' },
  { nombre: "appointment_service", patron: /^appointment_service/i, v3: 'visit_service_codes',   script: '11-appt-services' },
  { nombre: "services", patron: /^services/i, v3: 'service_codes',           script: '05b-services-catalog' },
  { nombre: "diagnostics", patron: /^diagnostics/i, v3: 'diagnoses (ICD-10)',      script: '05c-icd10-catalog' },
  { nombre: "costs", patron: /^costs/i, v3: 'appointment_billing',     script: '12-billing' },
  { nombre: "payments", patron: /^payments/i, v3: 'billing_payments',        script: '12-billing' },
  { nombre: "documents", patron: /^documents/i, v3: 'patient_documents',       script: '13-patient-documents' },
  { nombre: "case_consents", patron: /^case_consents/i, v3: 'case_consents',           script: '14-case-consents' },
  { nombre: "authorized", patron: /^authorized/i, v3: 'authorized_dependents',   script: '15-authorized-dependents' },
]

// Los export traen nombres como `_diagnostics__202609120145`: el guion bajo de
// adelante es del dump, no de la tabla, y sin sacarlo el patrón `^diagnostics`
// no engancha y el archivo se reporta como "no llegó" teniéndolo delante.
const destino = nombre => ESPERADAS.find(e => e.patron.test(nombre.replace(/^_+/, ''))) ?? null

// ─── Normalizar celdas ──────────────────────────────────────────────────────
// ExcelJS no devuelve strings: devuelve objetos para fórmulas, texto con
// formato e hipervínculos. Sin esto, una columna entera sale como
// "[object Object]" y te enterás recién cuando el import ya corrió.
function plano(v) {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return fecha(v)
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('')
    if ('result' in v) return plano(v.result)      // fórmula ya calculada
    if ('text' in v) return String(v.text)          // hipervínculo
    if ('error' in v) return null                   // #N/A, #REF! → vacío
    return JSON.stringify(v)
  }
  return String(v)
}

const dosDig = n => String(n).padStart(2, '0')
const fecha = d =>
  `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())} ` +
  `${dosDig(d.getHours())}:${dosDig(d.getMinutes())}:${dosDig(d.getSeconds())}`

// ─── Qué tiene adentro cada columna ─────────────────────────────────────────
const ES = {
  cifrado:  v => /^(e:|t:.*\|e:)/.test(v),
  uuid:     v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  fecha:    v => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/.test(v),
  email:    v => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v),
  telefono: v => /^[+(]?[\d][\d\s().+-]{6,}$/.test(v),
  booleano: v => /^(true|false|0|1)$/i.test(v),
}

/**
 * Perfilador INCREMENTAL: una columna, fila por fila, sin guardar las filas.
 *
 * La primera versión guardaba una muestra y sacaba los porcentajes de ahí, y el
 * número salía mentiroso justo donde más importa: la muestra son las primeras
 * filas del dump, o sea las MÁS VIEJAS. En `documents` daba "95 % sin caso"
 * mirando 400 filas de 16.977 — las de cuando el sistema todavía no usaba
 * casos—. Acumulando contadores el archivo se recorre entero, la memoria no
 * crece y el porcentaje es el de verdad.
 */
function nuevoPerfil() {
  return { total: 0, llenos: 0, coincidencias: {}, ejemplos: [] }
}

function acumular(p, v) {
  p.total++
  if (v === null || v === '') return
  p.llenos++
  for (const [nombre, test] of Object.entries(ES)) {
    if (test(v)) p.coincidencias[nombre] = (p.coincidencias[nombre] ?? 0) + 1
  }
  if (p.ejemplos.length < 2) p.ejemplos.push(v.length > 38 ? v.slice(0, 38) + '…' : v)
}

function cerrarPerfil(p) {
  const marcas = Object.entries(p.coincidencias)
    .filter(([, n]) => p.llenos && n / p.llenos > 0.8)
    .map(([nombre]) => nombre)
  const crudo = p.total ? ((p.total - p.llenos) / p.total) * 100 : 100
  return {
    vacios: p.total - p.llenos,
    // Un 99,6 % redondeaba a "100 % vacío" al lado de dos ejemplos reales, que
    // se lee como un error de la herramienta. Si hay AL MENOS UN valor, el tope
    // es 99.
    pctVacio: p.llenos > 0 ? Math.min(99, Math.round(crudo)) : 100,
    marcas,
    muestra: p.ejemplos,
  }
}

// ─── Escribir CSV que entienda utils/csv.mjs ────────────────────────────────
const celdaCsv = v => {
  if (v === null) return ''
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
const aCsv = (headers, filas) =>
  [headers.map(celdaCsv).join(','), ...filas.map(f => f.map(celdaCsv).join(','))].join('\n')

// ─── Lectura ────────────────────────────────────────────────────────────────
async function leerExcel(ruta) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(ruta)
  const hojas = []
  wb.eachSheet(ws => {
    const filas = []
    let headers = null
    ws.eachRow({ includeEmpty: false }, row => {
      const celdas = (Array.isArray(row.values) ? row.values.slice(1) : []).map(plano)
      if (!headers) headers = celdas.map(h => (h ?? '').trim())
      else filas.push(celdas)
    })
    if (headers) hojas.push({ nombre: ws.name, headers, filas })
  })
  return hojas
}

/**
 * CSV por STREAMING: guarda una muestra y cuenta el resto.
 *
 * `parseCSV` arma un objeto por fila; con los export del v2 —`snomed_icd_map`
 * son 88 MB, `case_consents` 44 MB— eso es cargar el archivo entero en memoria
 * solo para mirarle los encabezados. Para perfilar columnas alcanza con las
 * primeras filas, y el total se cuenta sin guardar nada.
 *
 * Nota: cuenta LÍNEAS, igual que `parseCSV`, que tampoco soporta saltos de
 * línea dentro de un campo entrecomillado. Si un archivo los tuviera, el número
 * es alto y el import lo va a sufrir igual — se ve en la muestra.
 */
async function leerCsv(ruta, muestra = MUESTRA) {
  let headers = null
  let perfiles = null
  const filas = []          // solo para `--convertir`, que necesita el contenido
  let total = 0

  // `leerFilas` respeta los saltos de línea DENTRO de un campo entrecomillado.
  // Contando líneas, `notes` daba 1.864 "filas" que en realidad eran pedazos de
  // notas largas (ver el encabezado de `utils/csv.mjs`).
  for await (const campos of leerFilas(ruta)) {
    if (headers === null) {
      headers = campos.map(h => (h ?? '').trim())
      perfiles = headers.map(nuevoPerfil)
      continue
    }
    if (campos.length === 1 && campos[0] === null) continue   // línea en blanco
    total++
    headers.forEach((_, i) => acumular(perfiles[i], plano(campos[i])))
    if (filas.length < muestra) filas.push(campos)
  }

  if (!headers) return []
  return [{ nombre: basename(ruta, '.csv'), headers, filas, perfiles, total }]
}

// ─── Corrida ────────────────────────────────────────────────────────────────
async function run() {
  const archivos = readdirSync(CARPETA)
    .filter(f => ['.xlsx', '.xlsm', '.csv'].includes(extname(f).toLowerCase()))
    .filter(f => !f.startsWith('~$'))           // temporales de Excel abiertos
    .sort()

  if (archivos.length === 0) {
    console.error(`No hay .xlsx ni .csv en ${CARPETA}`)
    process.exit(1)
  }

  console.log(`📁 ${CARPETA} — ${archivos.length} archivos\n`)
  const inventario = []
  const vistos = new Set()

  for (const archivo of archivos) {
    const ruta = join(CARPETA, archivo)
    const kb = Math.round(statSync(ruta).size / 1024)
    let hojas
    try {
      hojas = extname(archivo).toLowerCase() === '.csv' ? await leerCsv(ruta) : await leerExcel(ruta)
    } catch (e) {
      console.log(`❌ ${archivo} — no se pudo leer: ${e.message}\n`)
      continue
    }

    for (const hoja of hojas) {
      const etiqueta = hojas.length > 1 ? `${archivo} › ${hoja.nombre}` : archivo
      const base = (hojas.length > 1 ? hoja.nombre : basename(archivo, extname(archivo)))
      const d = destino(base) ?? destino(basename(archivo, extname(archivo)))
      if (d) vistos.add(d.script)

      const filas = hoja.total ?? hoja.filas.length
      const columnas = hoja.headers.map((h, i) => {
        // El CSV ya viene perfilado de la pasada por streaming; el Excel se
        // perfila acá, que sus hojas entran enteras en memoria sin drama.
        const p = hoja.perfiles?.[i] ?? (() => {
          const acc = nuevoPerfil()
          for (const f of hoja.filas) acumular(acc, plano(f[i]))
          return acc
        })()
        return { columna: h || `(col ${i + 1})`, ...cerrarPerfil(p) }
      })

      const cifradasAca = columnas.filter(c => c.marcas.includes('cifrado')).map(c => c.columna)
      const vaciasAca   = columnas.filter(c => c.pctVacio === 100).length

      if (conDetalle(etiqueta)) {
        console.log(`── ${etiqueta}  (${kb} KB · ${filas} filas · ${hoja.headers.length} columnas)`)
        console.log(d ? `   → ${d.v3}   [${d.script}]` : '   → ⚠️  no reconocida: nadie la importa hoy')
        for (const c of columnas) {
          const marcas = c.marcas.length ? `  [${c.marcas.join(' ')}]` : ''
          const vacio = c.pctVacio >= 50 ? `  ⚠️ ${c.pctVacio}% vacío` : ''
          console.log(`   · ${c.columna.padEnd(26)} ${(c.muestra.join(' | ') || '—').padEnd(42)}${marcas}${vacio}`)
        }
        console.log()
      } else {
        // Una línea por hoja: nombre · filas · columnas · a dónde va · señales.
        const senal = [
          cifradasAca.length ? `🔐${cifradasAca.length}` : '',
          vaciasAca ? `∅${vaciasAca}` : '',
        ].filter(Boolean).join(' ')
        const destinoTxt = d ? d.v3 : '⚠️ sin destino'
        console.log(
          `${etiqueta.padEnd(46)} ${String(filas).padStart(7)} filas ` +
          `${String(hoja.headers.length).padStart(3)} col  ${destinoTxt.padEnd(24)} ${senal}`,
        )
      }

      inventario.push({
        archivo, hoja: hoja.nombre, filas, muestreado: hoja.muestreado ?? false,
        destino: d?.v3 ?? null, script: d?.script ?? null, columnas,
      })

      if (CONVERTIR && extname(archivo).toLowerCase() !== '.csv') {
        const salida = join(CARPETA, `${base}.csv`)
        writeFileSync(salida, aCsv(hoja.headers, hoja.filas.map(f => f.map(plano))), 'utf8')
        console.log(`   💾 ${salida}\n`)
      }
    }
  }

  // ─── Qué falta ────────────────────────────────────────────────────────────
  const faltan = ESPERADAS.filter(e => !vistos.has(e.script))
  if (faltan.length) {
    console.log('⚠️  Del v2 no llegó (o tiene otro nombre):')
    for (const f of faltan) console.log(`   · ${f.nombre.padEnd(20)} → ${f.v3}`)
    console.log()
  }

  // Set: después de `--convertir`, la carpeta tiene el .xlsx Y el .csv de la
  // misma hoja, y sin esto cada columna cifrada sale listada dos veces.
  const cifradas = [...new Set(inventario.flatMap(i =>
    i.columnas.filter(c => c.marcas.includes('cifrado')).map(c => `${i.hoja}.${c.columna}`)))]
  if (cifradas.length) {
    console.log(`🔐 Columnas CIFRADAS (hay que descifrarlas AL IMPORTAR, no después): ${cifradas.join(', ')}\n`)
  }

  writeFileSync(REPORTE, JSON.stringify(inventario, null, 2))
  console.log(`💾 Inventario completo → ${REPORTE}`)
  if (!CONVERTIR) console.log('👉 Para generar los CSV que leen los scripts: --convertir')
}

run().catch(e => { console.error(e); process.exit(1) })
