/**
 * Migración 14 — Consentimientos del caso (16.730 filas)
 *
 * ── Dos códigos del v2 son el mismo de v3 ───────────────────────────────────
 * El v2 tiene 5 códigos por caso, pero `MEDICAL_INFORMATION_RELEASE` y
 * `MEDICAL_INFORMATION_RELEASE_TO_ASSIGNED_PARTIES` son el mismo consentimiento
 * y en v3 hay uno solo. Como `case_consents` tiene `@@unique([caseId, code])`,
 * al mapear hay que quedarse con UNA fila — si no, la segunda revienta (o peor:
 * si el índice no está aplicado en la base, entra duplicada y el caso muestra el
 * consentimiento dos veces).
 *
 * ── La firma ────────────────────────────────────────────────────────────────
 * 1.487 filas traen firma, cifrada. Medido: pertenecen a 1.470 casos y **en
 * ningún caso las firmas difieren entre sí** — se firma una vez para todos los
 * consentimientos. Por eso, además de guardarla en la fila, se escribe UNA en
 * `Case.consentSignaturePng` + `consentsSignedAt`: ese es el campo que el PDF de
 * intake dibuja. Sin ese paso las 1.487 firmas quedan en una tabla que **ningún
 * archivo de la app lee** (`caseConsent` no aparece en el código: la tabla es
 * registro legal, no pantalla).
 *
 * Se guarda DESCIFRADA, siguiendo la regla del plan ("desencriptar en la
 * migración misma"): un blob cifrado en la base es ilegible sin la clave, y la
 * clave no está en Vercel — es lo que dejó 2.669 `employer` como `e:…`.
 *
 * Uso:  node 14-case-consents.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const LOTE = 100

/** v2 → `ConsentCode`. Los dos primeros colapsan en uno. */
const CODIGO = {
  CONSENT_FOR_TREATMENT: 'CONSENT_FOR_TREATMENT',
  MEDICAL_INFORMATION_RELEASE: 'MEDICAL_INFORMATION_RELEASE_TO_ASSIGNED_PARTIES',
  MEDICAL_INFORMATION_RELEASE_TO_ASSIGNED_PARTIES: 'MEDICAL_INFORMATION_RELEASE_TO_ASSIGNED_PARTIES',
  CREDIT_AND_FINANCE_CHARGE_POLICY_AND_AGREEMENT: 'CREDIT_AND_FINANCE_CHARGE_POLICY_AND_AGREEMENT',
  MEDICATION_HISTORY_AUTHORITY: 'MEDICATION_HISTORY_AUTHORITY',
  HIPAA_NOTICE_OF_PRIVACY_PRACTICES: 'HIPAA_NOTICE_OF_PRIVACY_PRACTICES',
  ASSIGNMENT_OF_BENEFITS: 'ASSIGNMENT_OF_BENEFITS',
}

async function run() {
  const f = join(MAPS, 'cases.json')
  if (!existsSync(f)) throw new Error('Falta id-maps/cases.json')
  const mapaCasos = JSON.parse(readFileSync(f, 'utf8'))

  const db = getPool()

  // Lo que ya esté, para poder re-correr sin duplicar.
  const { rows: yaHay } = await db.query(`SELECT "caseId", code FROM case_consents`)
  const existe = new Set(yaHay.map(r => `${r.caseId}|${r.code}`))

  const filas = []            // las que se van a insertar
  const firmaDeCaso = new Map()
  let sinCaso = 0, sinCodigo = 0, colapsadas = 0, noDescifran = 0

  for await (const c of leerRegistros(buscarCsv('case_consents'))) {
    const caseId = mapaCasos[c.caseId]
    if (!caseId) { sinCaso++; continue }

    const code = CODIGO[c.code]
    if (!code) { sinCodigo++; continue }

    const clave = `${caseId}|${code}`
    if (existe.has(clave)) { colapsadas++; continue }
    existe.add(clave)

    let png = null
    if (c.signatureBase64) {
      png = decrypt(c.signatureBase64)
      if (!png) noDescifran++
      else if (!firmaDeCaso.has(caseId)) firmaDeCaso.set(caseId, { png, cuando: c.createdAt || null })
    }

    filas.push([
      cuid(), caseId, code,
      c.accepted === 'true',
      png,
      c.createdAt || null,
    ])
  }

  console.log(`📋 a insertar: ${filas.length} · ${colapsadas} colapsadas por código repetido · ${sinCaso} sin caso · ${sinCodigo} con código desconocido`)
  console.log(`   firmas: ${firmaDeCaso.size} casos · ${noDescifran} que no descifran`)

  if (DRY) { await closePool(); return }

  // ─── Inserción por lotes ──────────────────────────────────────────────────
  // 13.000 INSERT de a uno contra el pooler son ~25 minutos; de a 100, dos.
  let insertadas = 0, fallidas = 0
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE)
    const valores = []
    const params = []
    lote.forEach((f, j) => {
      const b = j * 6
      valores.push(`($${b + 1},$${b + 2},$${b + 3}::"ConsentCode",$${b + 4},$${b + 5},COALESCE($${b + 6}::timestamp,NOW()),COALESCE($${b + 6}::timestamp,NOW()))`)
      params.push(...f)
    })
    try {
      await db.query(
        `INSERT INTO case_consents (id,"caseId",code,accepted,"signatureLegacy","signedAt","createdAt")
         VALUES ${valores.join(',')}`,
        params,
      )
      insertadas += lote.length
    } catch (e) {
      console.log(`  ⚠️  lote ${i}: ${e.message.split('\n')[0]}`)
      fallidas += lote.length
    }
    if (i % 2000 === 0) process.stdout.write(`   ${insertadas}/${filas.length}\r`)
  }

  // ─── La firma que se ve: en el caso ───────────────────────────────────────
  let casosFirmados = 0
  for (const [caseId, { png, cuando }] of firmaDeCaso) {
    try {
      await db.query(
        `UPDATE cases
            SET "consentSignaturePng" = COALESCE("consentSignaturePng", $2),
                "consentsSignedAt"    = COALESCE("consentsSignedAt", $3::timestamp)
          WHERE id = $1`,
        [caseId, png, cuando],
      )
      casosFirmados++
    } catch (e) {
      console.log(`  ⚠️  firma del caso ${caseId}: ${e.message.split('\n')[0]}`)
    }
  }

  console.log(`\n📊 Consentimientos: ${insertadas} insertados · ${fallidas} fallidos`)
  console.log(`   ${casosFirmados} casos con su firma visible en el PDF de intake`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
