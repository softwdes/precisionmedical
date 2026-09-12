/**
 * Migración 03b — Bufetes (companies del v2 → lawyers con entityType FIRM)
 *
 * POR QUÉ EXISTE: hasta hoy NADIE insertaba los bufetes. Los 15 que había en la
 * base de prueba los sembró a mano `packages/database/prisma/seed-law-firms.mjs`
 * con una lista de referencia, y los scripts que vinculan —`07b-link-case-firms`
 * y `09-link-members-to-firms`— solo BUSCAN por nombre (`firmName ILIKE`) contra
 * lo que ya exista. Por eso el id-map de companies de la corrida anterior tenía
 * 15 entradas: no es que hubiera 15 bufetes, es que solo 15 estaban sembrados.
 * Con `lawyers` vacío después de la limpieza, sin este script quedan 0 bufetes y
 * 0 casos con `lawFirmId`.
 *
 * ORDEN: este script va PRIMERO del bloque legal.
 *   03b-companies  →  03-attorneys  →  09-link-members-to-firms  →  07b/08
 *
 * SALIDA: `id-maps/companies.json` ({ companyId v2 → cuid v3 }), que es el mismo
 * archivo que `07b` espera. Ojo: `07b` lo REESCRIBE al final con su match por
 * nombre. Mientras los nombres vengan del mismo CSV el resultado es idéntico,
 * salvo que haya nombres REPETIDOS — ese caso se reporta abajo.
 *
 * IDEMPOTENTE: la llave de deduplicación es (nombre + ciudad) en minúsculas, no
 * el nombre solo. En el catálogo hay bufetes con el mismo nombre en ciudades
 * distintas y son SUCURSALES, con su propio teléfono: colapsarlos pierde el
 * número al que hay que llamar. Al re-correr, actualiza y conserva el id.
 * Nunca pisa con NULL un dato que ya esté cargado (COALESCE).
 *
 * Uso:
 *   node 03b-companies.mjs --dry      # no escribe nada, muestra el plan
 *   node 03b-companies.mjs
 *   node 03b-companies.mjs --csv=/ruta/companies.csv
 */
import './utils/env.mjs'   // ⚠️ primero: decrypt.mjs valida la clave al importarse
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { parseCSV } from './utils/csv.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const CSV_ARG = process.argv.find(a => a.startsWith('--csv='))?.slice(6)
const MAP_FILE = join(import.meta.dirname, 'id-maps/companies.json')
const DUPES_FILE = join(import.meta.dirname, 'companies-duplicados.json')

// ─── Origen ─────────────────────────────────────────────────────────────────
// El export cambia de nombre en cada corrida (`companies_202607141002.csv`), así
// que se busca por prefijo en CSV_DIR en vez de hardcodear el timestamp: es el
// error más tonto y más caro de la mañana de una migración.
function resolverCsv() {
  if (CSV_ARG) return CSV_ARG
  const dir = process.env.CSV_DIR
  if (!dir) throw new Error('Falta CSV_DIR en scripts/migration/.env (o pasá --csv=/ruta.csv)')
  const candidatos = readdirSync(dir)
    .filter(f => /^companies.*\.csv$/i.test(f))
    .sort()
  if (candidatos.length === 0) {
    throw new Error(`No encontré ningún "companies*.csv" en ${dir}. Exportá la hoja a CSV UTF-8.`)
  }
  if (candidatos.length > 1) {
    console.log(`ℹ️  Hay ${candidatos.length} archivos companies*: uso el último → ${candidatos.at(-1)}`)
  }
  return join(dir, candidatos.at(-1))
}

// ─── Columnas ───────────────────────────────────────────────────────────────
// Los headers del v2 nunca son los que uno asume (`first_name` resultó ser
// `name`, `role` era `type`…). Se resuelven por alias y se REPORTA todo header
// que no se consumió, para ver en el momento si el Excel trae algo nuevo.
const ALIAS = {
  id:        ['id', 'companyId', 'uuid'],
  name:      ['name', 'companyName', 'firmName', 'nombre', 'razonSocial'],
  phone:     ['phone', 'phoneNumber', 'telephone', 'tel', 'cellphone', 'cellPhone'],
  email:     ['email', 'mail', 'correo'],
  address:   ['address', 'address1', 'street', 'direccion'],
  city:      ['city', 'ciudad'],
  state:     ['state', 'estado'],
  zip:       ['zipCode', 'zip', 'postalCode', 'cp'],
  active:    ['active', 'isActive', 'status', 'enabled'],
  createdAt: ['createdAt', 'created_at', 'fechaAlta'],
}

function armarMapeo(headers) {
  const mapa = {}
  const usados = new Set()
  for (const [campo, alias] of Object.entries(ALIAS)) {
    const h = headers.find(x => alias.some(a => a.toLowerCase() === String(x).toLowerCase()))
    if (h) { mapa[campo] = h; usados.add(h) }
  }
  return { mapa, sinUsar: headers.filter(h => h && !usados.has(h)) }
}

const val = (row, col) => {
  if (!col) return null
  const v = row[col]
  if (v === null || v === undefined) return null
  const t = decrypt(String(v))          // el v2 cifra campos sueltos con `e:`
  const s = t === null ? null : String(t).trim()
  return s === '' ? null : s
}

// ─── Teléfono ───────────────────────────────────────────────────────────────
// Reglas del plan (§3): sacar el 1 de país, `N/A`/`NA`/`NONE` a null por LISTA
// EXPLÍCITA —nunca por regex amplio, que se lleva datos mal ubicados pero
// reales— y NO inventar placeholders tipo 0000000000, que después traban el
// intake porque un área code que empieza en 0 es inválido.
const NO_ES_TELEFONO = new Set(['N/A', 'NA', 'NONE', 'NULL', '-', '.'])

function normalizarTelefono(raw) {
  if (!raw) return { valor: null, marca: null }
  const t = raw.trim()
  if (NO_ES_TELEFONO.has(t.toUpperCase())) return { valor: null, marca: 'vacío' }

  const d = t.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) {
    const n = d.slice(1)
    return { valor: `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`, marca: 'normalizado' }
  }
  if (d.length === 10) {
    return { valor: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, marca: null }
  }
  // Internacionales y texto mal ubicado se conservan TAL CUAL y se listan al
  // final: es información, y quien la mira decide. Borrarla es perderla.
  return { valor: t, marca: 'revisar' }
}

const llave = (nombre, ciudad) =>
  `${(nombre ?? '').toLowerCase().trim()}|${(ciudad ?? '').toLowerCase().trim()}`

// ─── Corrida ────────────────────────────────────────────────────────────────
async function run() {
  const csv = resolverCsv()
  console.log(`📂 Origen: ${csv}${DRY ? '   (DRY RUN — no escribe nada)' : ''}`)

  const filas = await parseCSV(csv)
  if (filas.length === 0) throw new Error('El CSV no tiene filas.')

  const headers = Object.keys(filas[0])
  const { mapa, sinUsar } = armarMapeo(headers)
  if (!mapa.id || !mapa.name) {
    throw new Error(
      `No encontré las columnas mínimas (id y nombre). Headers: ${headers.join(', ')}`,
    )
  }
  console.log(`📋 ${filas.length} companies · columnas mapeadas: ${Object.entries(mapa).map(([k, v]) => `${k}←${v}`).join(', ')}`)
  if (sinUsar.length) console.log(`⚠️  Columnas del CSV que NO se importan: ${sinUsar.join(', ')}`)

  const db = getPool()

  // Estado actual: una sola consulta y se compara en memoria.
  const { rows: existentes } = await db.query(
    `SELECT id, "firmName", city FROM lawyers
      WHERE "entityType" = 'FIRM' AND "deletedAt" IS NULL`,
  )
  const porLlave = new Map(existentes.map(f => [llave(f.firmName, f.city), f.id]))
  console.log(`🏛️  Bufetes ya en la base: ${existentes.length}`)

  const idMap = {}
  const repetidos = new Map()   // nombre → [{ id v2, ciudad }]
  const paraRevisar = []
  let insertados = 0, actualizados = 0, saltados = 0

  for (const fila of filas) {
    const v2Id = val(fila, mapa.id)
    const nombre = val(fila, mapa.name)
    if (!v2Id || !nombre) { saltados++; continue }

    const ciudad = val(fila, mapa.city)
    const { valor: telefono, marca } = normalizarTelefono(val(fila, mapa.phone))
    if (marca === 'revisar') paraRevisar.push({ v2Id, nombre, telefono })

    // El v2 marca la baja con `active=false` (o status INACTIVE). No se saltea:
    // un caso viejo puede apuntar a un bufete dado de baja, y sin la ficha ese
    // caso se queda sin bufete. Entra INACTIVE y no ensucia los selectores.
    const activo = val(fila, mapa.active)
    const estado = activo !== null && /^(false|0|inactive|inactivo)$/i.test(activo)
      ? 'INACTIVE'
      : 'ACTIVE'

    const creado = val(fila, mapa.createdAt)
    const k = llave(nombre, ciudad)

    // Nombres repetidos en el ORIGEN: son las sucursales. Se importan las dos,
    // pero se reportan porque `07b`/`09` vinculan por nombre y ahí sí se
    // confunden — el aviso es para decidir antes de correrlos, no después.
    const previo = repetidos.get(nombre.toLowerCase()) ?? []
    repetidos.set(nombre.toLowerCase(), [...previo, { v2Id, ciudad }])

    const yaEsta = porLlave.get(k)

    if (DRY) {
      idMap[v2Id] = yaEsta ?? '(nuevo)'
      if (yaEsta) actualizados++
      else { insertados++; porLlave.set(k, '(nuevo)') }  // así dos filas iguales del CSV no cuentan dos altas
      continue
    }

    if (yaEsta) {
      // COALESCE: el CSV completa huecos, no borra lo que alguien cargó a mano
      // (notas de Edson, % de honorarios, velocidad de pago).
      await db.query(
        `UPDATE lawyers SET
           phone     = COALESCE($2, phone),
           email     = COALESCE($3, email),
           address   = COALESCE($4, address),
           city      = COALESCE($5, city),
           state     = COALESCE($6, state),
           zip       = COALESCE($7, zip),
           status    = $8::"ExternalStatus",
           "updatedAt" = NOW()
         WHERE id = $1`,
        [yaEsta, telefono, val(fila, mapa.email), val(fila, mapa.address),
         ciudad, val(fila, mapa.state), val(fila, mapa.zip), estado],
      )
      idMap[v2Id] = yaEsta
      actualizados++
      continue
    }

    const nuevoId = cuid()
    // El id se toma del RETURNING, no de la variable: si otra corrida ya había
    // insertado esta fila, `nuevoId` no es el id real y el id-map quedaría
    // apuntando a nada. Es exactamente el error que obligó a escribir
    // `rebuild-all-maps.mjs` en la corrida anterior.
    const { rows } = await db.query(
      `INSERT INTO lawyers
         (id, "entityType", "firmName", phone, email, address, city, state, zip,
          status, "createdAt", "updatedAt")
       VALUES ($1, 'FIRM'::"LawyerEntityType", $2, $3, $4, $5, $6, $7, $8,
               $9::"ExternalStatus", COALESCE($10::timestamp, NOW()), NOW())
       RETURNING id`,
      [nuevoId, nombre, telefono, val(fila, mapa.email), val(fila, mapa.address),
       ciudad, val(fila, mapa.state), val(fila, mapa.zip), estado, creado],
    )
    const idReal = rows[0]?.id ?? nuevoId
    idMap[v2Id] = idReal
    porLlave.set(k, idReal)
    insertados++
    console.log(`  ✅ ${nombre}${ciudad ? ` · ${ciudad}` : ''}${estado === 'INACTIVE' ? ' (inactivo)' : ''}`)
  }

  // ─── Reportes ─────────────────────────────────────────────────────────────
  const conRepetidos = [...repetidos.entries()].filter(([, v]) => v.length > 1)

  if (!DRY) {
    if (!existsSync(dirname(MAP_FILE))) mkdirSync(dirname(MAP_FILE), { recursive: true })
    writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
    if (conRepetidos.length) {
      writeFileSync(DUPES_FILE, JSON.stringify(Object.fromEntries(conRepetidos), null, 2))
    }
  }

  console.log(`\n📊 Bufetes: ${insertados} insertados, ${actualizados} actualizados, ${saltados} sin id/nombre`)
  console.log(`💾 id-map (${Object.keys(idMap).length} entradas) → ${MAP_FILE}${DRY ? ' [no escrito]' : ''}`)

  if (conRepetidos.length) {
    console.log(`\n⚠️  ${conRepetidos.length} nombres REPETIDOS en el origen (sucursales).`)
    console.log('   Se importaron todas, pero `07b` y `09` vinculan por NOMBRE y van a')
    console.log('   elegir una cualquiera. Revisar antes de correrlos:')
    for (const [nombre, filas] of conRepetidos.slice(0, 10)) {
      console.log(`   · ${nombre} → ${filas.map(f => f.ciudad ?? 'sin ciudad').join(' · ')}`)
    }
    if (!DRY) console.log(`   Detalle completo → ${DUPES_FILE}`)
  }

  if (paraRevisar.length) {
    console.log(`\n⚠️  ${paraRevisar.length} teléfonos que no son NANP (se guardaron tal cual):`)
    for (const t of paraRevisar.slice(0, 10)) console.log(`   · ${t.nombre}: ${t.telefono}`)
  }

  console.log('\n👉 Sigue: 03-attorneys.mjs, después 09-link-members-to-firms.mjs')
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
