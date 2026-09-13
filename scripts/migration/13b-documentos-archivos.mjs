/**
 * Migración 13b — Los ARCHIVOS de los documentos (S3/MinIO del v2 → Supabase)
 *
 * POR QUÉ EXISTE: el script 13 migra la FICHA del documento (nombre, carpeta,
 * tamaño, a qué caso pertenece) pero no el archivo. Medido el 2026-09-11 sobre
 * la base de prueba: 10.442 filas con `s3Key` apuntando al MinIO del v2
 * (`patients/3258/cases/1862/…pdf`) y el bucket `case-documents` de Supabase
 * COMPLETAMENTE VACÍO. O sea: en pantalla se ven 10.442 PDFs y cada descarga es
 * un 404, porque la ruta de descarga firma esa misma clave contra ese bucket.
 *
 * Volumen esperado (misma medición): **4,03 GB · 10.442 archivos** — 7.440 PDF,
 * 2.728 JPG, 263 GIF. Promedio 404 KB.
 *
 * CUÁNDO: DESPUÉS del script 13, porque lee los `s3Key` de la base.
 * La clave de destino es LA MISMA que la de origen, así que las filas ya
 * migradas quedan apuntando bien sin tocar la base.
 *
 * Env que hace falta en scripts/migration/.env (lo de AWS lo trae Erick):
 *   V2_S3_BUCKET=            nombre del bucket del v2
 *   V2_S3_REGION=us-east-1
 *   V2_S3_ACCESS_KEY_ID=
 *   V2_S3_SECRET_ACCESS_KEY=
 *   V2_S3_ENDPOINT=          SOLO si es MinIO y no S3 (https://minio.dominio:9000)
 *   SUPABASE_STORAGE_URL=        (Phoenix — ya está)
 *   SUPABASE_STORAGE_SERVICE_KEY=(Phoenix — ya está)
 *
 * Uso:
 *   node 13b-documentos-archivos.mjs --dry          # no baja ni sube nada
 *   node 13b-documentos-archivos.mjs --limite=20    # prueba con 20 archivos
 *   node 13b-documentos-archivos.mjs                # la corrida completa
 *
 * Se puede cortar y volver a lanzar: lleva progreso en `documentos-progreso.json`
 * y además trata el "ya existe" del destino como éxito.
 */
import './utils/env.mjs'
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getPool, closePool } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const LIMITE = Number(process.argv.find(a => a.startsWith('--limite='))?.slice(9)) || 0
const CONCURRENCIA = Number(process.argv.find(a => a.startsWith('--tandas='))?.slice(9)) || 5

const BUCKET_DESTINO = 'case-documents'
const PROGRESO = join(import.meta.dirname, 'documentos-progreso.json')
const FALLIDOS = join(import.meta.dirname, 'documentos-fallidos.json')

// Tipos que el navegador puede servir. El export del v2 trae basura en esta
// columna —se vieron `image/jpeg43082` y `image/jpeg41566`, que son el mime y
// el TAMAÑO pegados por un corrimiento de columnas, el mismo problema que los
// 19 `caseCode` con nombre de bufete—. Un content-type inválido hace que
// Supabase rechace la subida, así que se sanea acá.
const MIME_OK = /^[a-z]+\/[a-z0-9.+-]+$/i
const mimeSano = m => (m && MIME_OK.test(m) ? m : 'application/octet-stream')

/**
 * Clave que Supabase Storage acepta.
 *
 * S3 guarda cualquier cosa en el nombre; Supabase rechaza con `Invalid key` todo
 * lo que no sea ASCII. Son 26 archivos del v2 con tilde o apóstrofo en el nombre
 * del paciente (`Naomi Alcántara-idcard-011526.pdf`): existen, bajan bien de S3 y
 * el destino los rebota.
 *
 * Se les quita el acento y se sube con la clave saneada — pero entonces la clave
 * ya NO es la del v2, así que hay que **corregir también la fila** de
 * `patient_documents`, o el botón de descargar apunta a un archivo que no está.
 * Esa corrección la hace el propio script al final.
 */
function claveSegura(k) {
  return k
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // á → a
    .replace(/[^\x20-\x7E]/g, '')                        // cualquier otro no-ASCII
    .replace(/['"`]/g, '')                               // comillas y apóstrofos
}

function faltaEnv() {
  const req = ['V2_S3_BUCKET', 'V2_S3_ACCESS_KEY_ID', 'V2_S3_SECRET_ACCESS_KEY',
               'SUPABASE_STORAGE_URL', 'SUPABASE_STORAGE_SERVICE_KEY']
  return req.filter(k => !process.env[k])
}

const leerProgreso = () =>
  existsSync(PROGRESO) ? new Set(JSON.parse(readFileSync(PROGRESO, 'utf8'))) : new Set()

async function run() {
  const faltan = faltaEnv()
  if (faltan.length && !DRY) {
    console.error(`Faltan variables en scripts/migration/.env: ${faltan.join(', ')}`)
    console.error('(con --dry se puede correr igual: solo lista lo que haría)')
    process.exit(1)
  }

  // ─── Qué hay que copiar ───────────────────────────────────────────────────
  const db = getPool()
  const { rows } = await db.query(`
    SELECT id, name, "s3Key", size, "mimeType"
      FROM patient_documents
     WHERE "isFolder" = false AND "s3Key" IS NOT NULL
     ORDER BY id
  `)
  await closePool()

  const pendientes = LIMITE ? rows.slice(0, LIMITE) : rows
  const totalBytes = rows.reduce((s, r) => s + (Number(r.size) || 0), 0)
  console.log(`📄 ${rows.length} archivos en la base · ${(totalBytes / 1073741824).toFixed(2)} GB`)
  if (LIMITE) console.log(`   (--limite=${LIMITE}: se procesan ${pendientes.length})`)

  const yaHechos = leerProgreso()
  if (yaHechos.size) console.log(`⏩ ${yaHechos.size} ya copiados en una corrida anterior`)

  const raros = rows.filter(r => r.mimeType && !MIME_OK.test(r.mimeType))
  if (raros.length) {
    console.log(`⚠️  ${raros.length} filas con mimeType inválido (corrimiento de columnas en el export):`)
    for (const r of raros.slice(0, 5)) console.log(`   · ${r.name} → "${r.mimeType}"`)
    console.log('   Se suben como application/octet-stream. Vale la pena mirarlo en el CSV origen.')
  }

  if (DRY) {
    console.log('\n🔍 DRY RUN — muestra de lo que se copiaría:')
    for (const r of pendientes.slice(0, 5)) {
      console.log(`   s3://${process.env.V2_S3_BUCKET || '<bucket>'}/${r.s3Key}`)
      console.log(`     → ${BUCKET_DESTINO}/${r.s3Key}  (${mimeSano(r.mimeType)}, ${Math.round((r.size ?? 0) / 1024)} KB)`)
    }
    console.log(`\n   Total a copiar: ${pendientes.length - yaHechos.size} archivos`)
    return
  }

  // ─── Clientes ─────────────────────────────────────────────────────────────
  const s3 = new S3Client({
    region: process.env.V2_S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.V2_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.V2_S3_SECRET_ACCESS_KEY,
    },
    // MinIO sirve por PATH (bucket en la ruta), no por subdominio. Sin
    // forcePathStyle, la primera petición se va a un host que no existe.
    ...(process.env.V2_S3_ENDPOINT
      ? { endpoint: process.env.V2_S3_ENDPOINT, forcePathStyle: true }
      : {}),
  })
  const supa = createClient(
    process.env.SUPABASE_STORAGE_URL,
    process.env.SUPABASE_STORAGE_SERVICE_KEY,
    { auth: { persistSession: false } },
  )

  const hechos = new Set(yaHechos)
  /** Archivos que se subieron con la clave saneada — hay que corregir su fila. */
  const renombrados = []
  const fallidos = []
  let copiados = 0, saltados = 0, bytes = 0

  async function copiar(doc) {
    if (hechos.has(doc.id)) { saltados++; return }
    try {
      const obj = await s3.send(new GetObjectCommand({
        Bucket: process.env.V2_S3_BUCKET,
        Key: process.env.V2_S3_PREFIX ? `${process.env.V2_S3_PREFIX}${doc.s3Key}` : doc.s3Key,
      }))
      const cuerpo = Buffer.from(await obj.Body.transformToByteArray())

      const destino = claveSegura(doc.s3Key)
      const { error } = await supa.storage
        .from(BUCKET_DESTINO)
        .upload(destino, cuerpo, { contentType: mimeSano(doc.mimeType), upsert: false })

      // "ya existe" no es un fallo: es una corrida anterior que llegó hasta acá.
      if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message)

      // Si hubo que sanear la clave, la fila tiene que apuntar a la nueva.
      if (destino !== doc.s3Key) renombrados.push({ id: doc.id, clave: destino })

      hechos.add(doc.id)
      copiados++
      bytes += cuerpo.length
    } catch (e) {
      fallidos.push({ id: doc.id, s3Key: doc.s3Key, name: doc.name, error: e.message })
    }
  }

  // Tandas chicas: 10.442 peticiones en paralelo tumban la conexión y dejan a
  // medias un montón de archivos, que es peor que tardar unos minutos más.
  for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
    await Promise.all(pendientes.slice(i, i + CONCURRENCIA).map(copiar))
    const hechosTotal = copiados + saltados
    if (hechosTotal % 100 < CONCURRENCIA || i + CONCURRENCIA >= pendientes.length) {
      const pct = Math.round(((i + CONCURRENCIA) / pendientes.length) * 100)
      console.log(`   ${Math.min(pct, 100)}% · ${copiados} copiados · ${saltados} salteados · ${fallidos.length} fallidos · ${(bytes / 1048576).toFixed(0)} MB`)
      writeFileSync(PROGRESO, JSON.stringify([...hechos]))   // guardar seguido: si se corta, no se re-baja todo
    }
  }

  writeFileSync(PROGRESO, JSON.stringify([...hechos]))
  if (fallidos.length) writeFileSync(FALLIDOS, JSON.stringify(fallidos, null, 2))

  // Las filas cuya clave hubo que sanear: sin esto el archivo está subido y el
  // botón de descargar apunta a la ruta vieja, con tilde, que no existe.
  if (renombrados.length) {
    const db = getPool()
    for (const r of renombrados) {
      await db.query(`UPDATE patient_documents SET "s3Key" = $1 WHERE id = $2`, [r.clave, r.id])
    }
    await closePool()
    console.log(`   ${renombrados.length} claves saneadas (tenían tilde o apóstrofo) y corregidas en la base`)
  }

  console.log(`\n📊 ${copiados} copiados · ${saltados} salteados · ${fallidos.length} fallidos · ${(bytes / 1073741824).toFixed(2)} GB`)
  if (fallidos.length) {
    console.log(`❌ Detalle → ${FALLIDOS}`)
    console.log('   Volver a lanzar el script reintenta solo los que faltan.')
  }
  console.log('\n👉 Verificar: abrir un caso en el back-office y descargar un documento.')
}

run().catch(e => { console.error(e); process.exit(1) })
