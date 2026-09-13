/**
 * Migración 15 — Dependientes autorizados del caso (329 filas)
 *
 * Son las personas a las que el paciente autoriza a recibir información de su
 * caso. En el v2 vienen cifrados, y acá las columnas se llaman
 * `nameEncrypted` / `relationshipEncrypted`.
 *
 * ⚠️ El nombre de la columna dice "Encrypted", pero se guarda DESCIFRADO, por la
 * misma regla del plan que el resto de la migración: la clave AES no está en
 * Vercel, así que un blob cifrado en la base es texto ilegible en la pantalla —
 * es lo que dejó 2.669 `employer` como `e:…` en la corrida de julio. Si algún
 * día se cifra de verdad en v3, se cifra con la clave de v3 y se re-escribe.
 *
 * Uso:  node 15-authorized-dependents.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv } from './utils/export.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')

const val = v => {
  if (!v) return null
  const t = decrypt(String(v))
  if (t === null) return null
  const s = String(t).trim()
  return s === '' || /^e:/.test(s) ? null : s
}

async function run() {
  const f = join(import.meta.dirname, 'id-maps/cases.json')
  if (!existsSync(f)) throw new Error('Falta id-maps/cases.json')
  const mapaCasos = JSON.parse(readFileSync(f, 'utf8'))

  const db = getPool()
  const { rows: yaHay } = await db.query(`SELECT "caseId", "nameEncrypted" FROM authorized_dependents`)
  const existe = new Set(yaHay.map(r => `${r.caseId}|${r.nameEncrypted}`))

  let insertados = 0, sinCaso = 0, sinNombre = 0, repetidos = 0, fallidos = 0

  for await (const d of leerRegistros(buscarCsv('authorized_dependents'))) {
    const caseId = mapaCasos[d.caseId]
    if (!caseId) { sinCaso++; continue }

    const nombre = val(d.name)
    if (!nombre) { sinNombre++; continue }

    const clave = `${caseId}|${nombre}`
    if (existe.has(clave)) { repetidos++; continue }
    existe.add(clave)

    if (DRY) { insertados++; continue }
    try {
      await db.query(
        `INSERT INTO authorized_dependents (id,"caseId","nameEncrypted","relationshipEncrypted","createdAt")
         VALUES ($1,$2,$3,$4,NOW())`,
        [cuid(), caseId, nombre, val(d.relationship)],
      )
      insertados++
    } catch (e) {
      console.log(`  ⚠️  dependiente ${d.id}: ${e.message.split('\n')[0]}`)
      fallidos++
    }
  }

  console.log(`\n📊 Dependientes autorizados: ${insertados}${DRY ? ' (dry)' : ''}`)
  console.log(`   ${sinCaso} sin caso · ${sinNombre} sin nombre legible · ${repetidos} ya estaban · ${fallidos} fallidos`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
