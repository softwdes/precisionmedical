/**
 * Migración 13 — Fichas de documentos (16.977 filas: 4.651 carpetas + 12.326 archivos)
 *
 * ⚠️ Esto migra la FICHA, no el archivo. Los bytes viven en el S3/MinIO del v2 y
 * los copia `13b-documentos-archivos.mjs` cuando estén las llaves de AWS. La
 * clave de destino es la MISMA (`minioKey` → `s3Key`), así que estas filas
 * quedan apuntando bien sin tocarlas después.
 *
 * ── Carpetas primero ────────────────────────────────────────────────────────
 * `parentId` apunta a otra fila de la misma tabla, así que las carpetas se
 * insertan antes que los archivos y ordenadas por id: cuando llega un hijo, su
 * padre ya tiene id nuevo en el mapa.
 *
 * ── Las fotos de identidad ──────────────────────────────────────────────────
 * 3.188 archivos cuelgan de `patients/<id>/personal/` y en el v2 NO tienen caso:
 * son del PACIENTE. Entran con `caseId` nulo a propósito — ver la decisión en
 * `docs/plan-limpieza-y-cableado-v3.md` §3.8: con `caseId` quedarían visibles
 * para el bufete en el portal legal.
 *
 * Uso:  node 13-patient-documents.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'patient-documents.json')
const LOTE = 100

const leerMapa = n => {
  const f = join(MAPS, n)
  if (!existsSync(f)) throw new Error(`Falta id-maps/${n}`)
  return JSON.parse(readFileSync(f, 'utf8'))
}

/** Tipos servibles. El v2 trae basura acá (mime y tamaño pegados). */
const MIME_OK = /^[a-z]+\/[a-z0-9.+-]+$/i
const mime = m => (m && MIME_OK.test(m) ? m : null)

const entero = v => {
  const n = Number(String(v ?? '').replace(/[^0-9]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

async function run() {
  const mapaPacientes = leerMapa('patients.json')
  const mapaCasos = leerMapa('cases.json')

  const filas = []
  for await (const d of leerRegistros(buscarCsv('documents'))) filas.push(d)

  // Carpetas antes que archivos, y dentro de cada grupo por id: el padre
  // siempre se inserta antes que el hijo.
  const orden = (a, b) => Number(a.id) - Number(b.id)
  const carpetas = filas.filter(d => d.isFolder === 'true').sort(orden)
  const archivos = filas.filter(d => d.isFolder !== 'true').sort(orden)

  const db = getPool()
  const idMap = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}
  let insertados = 0, fallidos = 0, sinPaciente = 0, sinMime = 0

  async function meter(lista, etiqueta) {
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE)
      const valores = []
      const params = []
      const ids = []

      for (const d of lote) {
        if (idMap[d.id]) continue
        const patientId = d.patientId ? (mapaPacientes[d.patientId] ?? null) : null
        const caseId = d.caseId ? (mapaCasos[d.caseId] ?? null) : null
        // Sin paciente NI caso la fila no cuelga de nadie: no se puede mostrar.
        if (!patientId && !caseId) { sinPaciente++; continue }
        const m = mime(d.mimeType)
        if (d.mimeType && !m) sinMime++

        const nuevoId = cuid()
        const b = params.length
        valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},COALESCE($${b + 10}::timestamp,NOW()),NOW())`)
        params.push(
          nuevoId, d.name ?? '(sin nombre)', d.isFolder === 'true' ? null : (d.minioKey || null),
          d.isFolder === 'true', entero(d.size), m,
          patientId, caseId,
          d.parentId ? (idMap[d.parentId] ?? null) : null,
          d.createdAt || null,
        )
        ids.push([d.id, nuevoId])
      }
      if (valores.length === 0) continue
      if (DRY) { insertados += ids.length; ids.forEach(([v2]) => { idMap[v2] = '(nuevo)' }); continue }

      try {
        await db.query(
          `INSERT INTO patient_documents
             (id,name,"s3Key","isFolder",size,"mimeType","patientId","caseId","parentId","createdAt","updatedAt")
           VALUES ${valores.join(',')}`,
          params,
        )
        for (const [v2, v3] of ids) idMap[v2] = v3
        insertados += ids.length
      } catch (e) {
        console.log(`  ⚠️  ${etiqueta} lote ${i}: ${e.message.split('\n')[0]}`)
        fallidos += ids.length
      }
      if (i % 2000 === 0) {
        process.stdout.write(`   ${etiqueta}: ${insertados}\r`)
        if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
      }
    }
  }

  await meter(carpetas, 'carpetas')
  await meter(archivos, 'archivos')

  if (!DRY) writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))

  console.log(`\n📊 Documentos: ${insertados} fichas${DRY ? ' (dry)' : ''} · ${fallidos} fallidas`)
  console.log(`   ${sinPaciente} sin paciente ni caso · ${sinMime} con mimeType inválido (queda null)`)
  console.log('   ⚠️  Son fichas SIN ARCHIVO hasta que corra 13b con las llaves de AWS.')
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
