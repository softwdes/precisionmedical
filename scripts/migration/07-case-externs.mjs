/**
 * Migración 07 — Firmas del acuerdo (lien) desde `case_externs`
 *
 * ── El bug que arregla ──────────────────────────────────────────────────────
 *
 * La versión de julio subía las firmas a Storage y las insertaba en una tabla
 * `case_signatures` **que se creaba a sí misma** con `CREATE TABLE IF NOT
 * EXISTS`. Esa tabla no existe en el esquema de v3 (la base responde 404): las
 * firmas quedaban en un rincón que ninguna pantalla lee.
 *
 * La tabla de verdad es `lien_signatures`, y de ella cuelga todo el flujo legal:
 * `hasSigned` del portal del bufete, el desbloqueo del PDF del acuerdo (el
 * endpoint devuelve 409 sin firma) y la cola de "liens sin firma" de Vigía. Con
 * las firmas en el lugar equivocado, los 256 casos con bufete aparecían **todos
 * sin firmar** y Vigía abría con 256 alertas falsas.
 *
 * ── Qué trae ────────────────────────────────────────────────────────────────
 *
 *   456 firmas de PACIENTE  ·  37 firmas de ABOGADO
 *
 * Vienen en el propio CSV como `data:image/png;base64,…` —no en el S3— así que
 * esto no espera a las llaves de AWS. Se guardan tal cual en `signatureSvg`, que
 * es lo que el esquema pide ("base64 PNG o SVG path data") y lo que escribe el
 * pad de firma del portal.
 *
 * Idempotente: no duplica una firma que ya esté para ese caso y ese firmante.
 *
 * Uso:  node 07-case-externs.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')

async function run() {
  const casesMap = join(MAPS, 'cases.json')
  if (!existsSync(casesMap)) throw new Error('Falta id-maps/cases.json — correr antes 05-cases.mjs')
  const mapaCasos = JSON.parse(readFileSync(casesMap, 'utf8'))

  const filas = []
  for await (const r of leerRegistros(buscarCsv('case_externs'))) filas.push(r)

  const db = getPool()

  // Lo que ya está, para no duplicar en una re-corrida.
  const { rows: yaHay } = await db.query(
    `SELECT "caseId", "signerType" FROM lien_signatures`,
  )
  const existe = new Set(yaHay.map(r => `${r.caseId}|${r.signerType}`))

  let paciente = 0, abogado = 0, sinCaso = 0, repetidas = 0, fallidas = 0

  for (const r of filas) {
    const caseId = mapaCasos[r.caseId]
    if (!caseId) {
      if (r.patientSignatureBase64 || r.responsibleSignatureBase64) sinCaso++
      continue
    }

    const firmas = [
      { tipo: 'PATIENT',  png: r.patientSignatureBase64,     nombre: r.patientNameSignature },
      { tipo: 'ATTORNEY', png: r.responsibleSignatureBase64, nombre: r.responsibleNameSignature },
    ]

    for (const f of firmas) {
      if (!f.png) continue
      if (existe.has(`${caseId}|${f.tipo}`)) { repetidas++; continue }
      if (DRY) { f.tipo === 'PATIENT' ? paciente++ : abogado++; continue }

      try {
        await db.query(
          `INSERT INTO lien_signatures
             (id, "caseId", "signerType", "signerName", "signatureSvg", "signedAt", "createdAt")
           VALUES ($1,$2,$3::"lien_signer_type",$4,$5,COALESCE($6::timestamp, NOW()),NOW())`,
          [
            cuid(), caseId, f.tipo,
            // `signerName` es NOT NULL: si el v2 no guardó el nombre, se deja
            // constancia de que la firma existe igual.
            (f.nombre ?? '').trim() || (f.tipo === 'PATIENT' ? 'Paciente (v2)' : 'Abogado (v2)'),
            f.png, r.createdAt || null,
          ],
        )
        existe.add(`${caseId}|${f.tipo}`)
        f.tipo === 'PATIENT' ? paciente++ : abogado++
      } catch (e) {
        console.log(`  ⚠️  firma ${f.tipo} del caso v2 ${r.caseId}: ${e.message.split('\n')[0]}`)
        fallidas++
      }
    }
  }

  console.log(`\n📊 Firmas del lien${DRY ? ' (dry)' : ''}: ${paciente} de paciente · ${abogado} de abogado`)
  console.log(`   ${repetidas} ya estaban · ${sinCaso} con firma pero sin caso importado · ${fallidas} fallidas`)
  if (!DRY && abogado) {
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT "caseId")::int AS n FROM lien_signatures WHERE "signerType" = 'ATTORNEY'`,
    )
    console.log(`   👉 ${rows[0].n} casos quedan marcados como FIRMADOS por el abogado (PDF del acuerdo desbloqueado)`)
  }
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
