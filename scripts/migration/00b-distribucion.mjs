/**
 * Distribución de valores de una o varias columnas de un CSV del v2.
 *
 * Para contestar en 5 segundos las preguntas que deciden un mapeo: ¿qué estados
 * trae `appointments.status`? ¿cuántos casos vienen DELETED? ¿los bufetes se
 * repiten? Se usa ANTES de importar, sobre el archivo, sin tocar la base.
 */
import { leerFilas } from './utils/csv.mjs'



const [ruta, ...cols] = process.argv.slice(2)

let headers = null
let indices = null
const conteos = new Map()
let total = 0

for await (const campos of leerFilas(ruta)) {
  if (headers === null) {
    headers = campos.map(h => (h ?? '').trim())
    if (cols[0] === '--cols') { console.log(headers.join('\n')); process.exit(0) }
    for (const c of cols) if (!headers.includes(c)) { console.error(`No existe la columna "${c}". Hay: ${headers.join(', ')}`); process.exit(1) }
    indices = cols.map(c => headers.indexOf(c))
    continue
  }
  if (campos.length === 1 && campos[0] === null) continue
  total++
  const clave = indices.map(i => campos[i] ?? '(vacío)').join(' · ')
  conteos.set(clave, (conteos.get(clave) ?? 0) + 1)
}

console.log(`${ruta.split(/[\\/]/).pop()} — ${total} filas · ${cols.join(' · ')}`)
for (const [v, n] of [...conteos].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`  ${String(n).padStart(7)}  ${v}`)
}
if (conteos.size > 30) console.log(`  … y ${conteos.size - 30} valores más`)
