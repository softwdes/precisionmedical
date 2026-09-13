/**
 * Respaldo completo de la base Phoenix a archivos locales, ANTES de vaciarla.
 *
 * POR QUÉ no alcanza con el backup de Supabase: el del plan gratuito es diario y
 * automático, no se dispara a pedido, y para restaurar una tabla suelta hay que
 * abrir un ticket. Esto deja una copia **acá**, en NDJSON, que se puede mirar con
 * `grep` y volver a insertar con un script si algo salió mal a las dos semanas.
 *
 * ⚠️ LO QUE ESCRIBE ES PHI. Va a una carpeta gitignoreada (`Migracion/…`) y no
 * se sube a ningún lado. Ver la regla en `.gitignore`.
 *
 * Uso:
 *   node 00d-respaldo.mjs                     # todo, a Migracion/respaldo-<fecha>
 *   node 00d-respaldo.mjs --destino=D:/otro   # otra carpeta
 *   node 00d-respaldo.mjs --solo=patients,cases
 *
 * Es reanudable: una tabla que ya tiene su archivo con el conteo correcto se
 * saltea, así que si se corta se vuelve a lanzar y sigue.
 */
import './utils/env.mjs'
import { mkdirSync, existsSync, createWriteStream, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'

const URL_BASE = process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('Faltan SUPABASE_STORAGE_URL / SUPABASE_STORAGE_SERVICE_KEY en scripts/migration/.env')
  process.exit(1)
}

const args = process.argv.slice(2)
const hoy = new Date().toISOString().slice(0, 10)
const DESTINO = args.find(a => a.startsWith('--destino='))?.slice(10)
  ?? join(import.meta.dirname, '..', '..', 'Migracion', `respaldo-${hoy}`)
const SOLO = args.find(a => a.startsWith('--solo='))?.slice(7)?.split(',').map(s => s.trim()) ?? null

const cabeceras = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const PAGINA = 1000

/** Las tablas salen del propio PostgREST: si mañana hay una nueva, entra sola. */
async function tablas() {
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers: cabeceras })
  if (!res.ok) throw new Error(`No pude listar las tablas: ${res.status}`)
  const spec = await res.json()
  return Object.keys(spec.definitions ?? {}).sort()
}

/** El total exacto, del header `content-range` (`0-0/1234`). */
async function contar(tabla) {
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=*&limit=1`, {
    headers: { ...cabeceras, Range: '0-0', Prefer: 'count=exact' },
  })
  const rango = res.headers.get('content-range') ?? ''
  return Number(rango.split('/')[1] ?? 0)
}

async function volcar(tabla, total) {
  const archivo = join(DESTINO, `${tabla}.ndjson`)
  const salida = createWriteStream(archivo, { encoding: 'utf8' })
  let escritas = 0

  for (let desde = 0; desde < total; desde += PAGINA) {
    // Se pagina con `order=id` para que el corte sea estable entre páginas. Las
    // pocas tablas sin `id` (las de llave compuesta) se piden sin orden: son
    // chicas y una fila repetida sería peor que ninguna garantía.
    const orden = SIN_ID.has(tabla) ? '' : '&order=id'
    const res = await fetch(
      `${URL_BASE}/rest/v1/${tabla}?select=*${orden}&limit=${PAGINA}&offset=${desde}`,
      { headers: cabeceras },
    )
    if (!res.ok) throw new Error(`${tabla} offset ${desde}: ${res.status} ${await res.text()}`)
    const filas = await res.json()
    for (const f of filas) salida.write(JSON.stringify(f) + '\n')
    escritas += filas.length
    if (total > 5000) process.stdout.write(`   ${tabla}: ${escritas}/${total}\r`)
  }

  await new Promise(r => salida.end(r))
  return escritas
}

/** Tablas sin columna `id` (llave compuesta). Se detectan solas al fallar. */
const SIN_ID = new Set()

async function run() {
  mkdirSync(DESTINO, { recursive: true })
  console.log(`🗄️  Respaldo de ${URL_BASE.replace('https://', '').split('.')[0]} → ${DESTINO}\n`)

  const lista = (await tablas()).filter(t => !SOLO || SOLO.includes(t))
  const resumen = []
  let filasTotales = 0, bytesTotales = 0

  for (const tabla of lista) {
    const total = await contar(tabla)
    const archivo = join(DESTINO, `${tabla}.ndjson`)

    // Reanudable: si ya está completa, no se vuelve a bajar.
    if (existsSync(archivo)) {
      const ya = readFileSync(archivo, 'utf8').split('\n').filter(Boolean).length
      if (ya === total) {
        console.log(`   ↷ ${tabla.padEnd(32)} ${String(total).padStart(7)} (ya estaba)`)
        resumen.push({ tabla, filas: total, ok: true })
        filasTotales += total
        bytesTotales += statSync(archivo).size
        continue
      }
    }

    let escritas
    try {
      escritas = await volcar(tabla, total)
    } catch (e) {
      if (/column .*id.* does not exist|42703/.test(e.message)) {
        SIN_ID.add(tabla)
        escritas = await volcar(tabla, total)
      } else {
        console.log(`   ✗ ${tabla.padEnd(32)} ${e.message.slice(0, 60)}`)
        resumen.push({ tabla, filas: 0, ok: false, error: e.message })
        continue
      }
    }

    const bytes = existsSync(archivo) ? statSync(archivo).size : 0
    filasTotales += escritas
    bytesTotales += bytes
    const ok = escritas === total
    console.log(`   ${ok ? '✓' : '⚠'} ${tabla.padEnd(32)} ${String(escritas).padStart(7)}${ok ? '' : ` de ${total}`}  ${(bytes / 1048576).toFixed(1)} MB`)
    resumen.push({ tabla, filas: escritas, esperadas: total, ok })
  }

  writeFileSync(join(DESTINO, '_resumen.json'), JSON.stringify({
    fecha: new Date().toISOString(),
    proyecto: URL_BASE,
    filas: filasTotales,
    tablas: resumen,
  }, null, 2))

  const fallidas = resumen.filter(r => !r.ok)
  console.log(`\n📦 ${lista.length} tablas · ${filasTotales.toLocaleString('es')} filas · ${(bytesTotales / 1048576).toFixed(0)} MB`)
  console.log(`   ${DESTINO}`)
  if (fallidas.length) {
    console.log(`\n⚠️  ${fallidas.length} tablas incompletas: ${fallidas.map(f => f.tabla).join(', ')}`)
    console.log('   NO vaciar la base hasta resolverlas.')
    process.exitCode = 1
  } else {
    console.log('\n✅ Todas las tablas completas. Ahora sí se puede vaciar.')
  }
}

run().catch(e => { console.error(e); process.exit(1) })
