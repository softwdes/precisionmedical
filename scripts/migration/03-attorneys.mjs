/**
 * Migración 03 — Abogados y personal de los bufetes (`users_extern` → `lawyers`)
 *
 * Corre DESPUÉS de `03b-companies.mjs`, que crea los bufetes y deja
 * `id-maps/companies.json`. Así cada persona nace ya colgada de su despacho
 * (`parentFirmId`) en vez de vincularse después por nombre — que es lo que hacía
 * `09-link-members-to-firms` y lo que dejó el catálogo a medias la vez pasada.
 *
 * ── Lo que cambió respecto de la versión de julio ───────────────────────────
 *
 * 1. **El CSV se busca por prefijo**: el nombre del dump trae el timestamp.
 * 2. **`parentFirmId` desde el id-map**, no por `ILIKE` del nombre.
 * 3. **`memberRole` de verdad.** Antes entraban los 95 como `ATTORNEY`. El v2 no
 *    tiene un rol "abogado", pero los datos lo dicen igual: de los 161 casos con
 *    responsable, **los 161 tienen rol `admin`**, y de los 148 con asistente,
 *    125 son `assistant`. Así que:
 *        admin → ATTORNEY · assistant → CASE_MANAGER
 *        paralegal → PARALEGAL · legal_assistant → LEGAL_ASSISTANT
 * 4. **Se saltean 7 cuentas del staff de la clínica** metidas como externos
 *    (ver `utils/export.mjs`). Cuesta 3 casos que se quedan sin `attorneyId`.
 * 5. **`entityType` = FIRM_MEMBER** para todos. Es la convención del portal; el
 *    alta desde Externals usa `INDEPENDENT` y esa inconsistencia ya está
 *    anotada en `api/attorney/members/route.ts`.
 *
 * Uso:  node 03-attorneys.mjs [--dry]
 */
import './utils/env.mjs'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { leerRegistros } from './utils/csv.mjs'
import { buscarCsv, CORREO_INTERNO } from './utils/export.mjs'
import { decrypt } from './utils/decrypt.mjs'
import { getPool, closePool, cuid } from './utils/db.mjs'

const DRY = process.argv.includes('--dry')
const MAPS = join(import.meta.dirname, 'id-maps')
const MAP_FILE = join(MAPS, 'attorneys.json')
const COMPANIES = join(MAPS, 'companies.json')

/** `users_extern.role` → `LawyerMemberRole` de v3. Ver el punto 3 del encabezado. */
const ROL = {
  admin: 'ATTORNEY',
  assistant: 'CASE_MANAGER',
  paralegal: 'PARALEGAL',
  legal_assistant: 'LEGAL_ASSISTANT',
}

const NO_ES_TELEFONO = new Set(['N/A', 'NA', 'NONE', 'NULL', '-', '.'])

function normalizarTelefono(raw) {
  if (!raw) return null
  const t = String(raw).trim()
  if (NO_ES_TELEFONO.has(t.toUpperCase())) return null
  const d = t.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) {
    const n = d.slice(1)
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return t   // internacional o dato mal ubicado: se conserva, no se inventa
}

const val = v => {
  if (v === null || v === undefined) return null
  const t = decrypt(String(v))
  const s = t === null ? null : String(t).trim()
  return s === '' ? null : s
}

async function leerTodo(prefijo) {
  const filas = []
  for await (const r of leerRegistros(buscarCsv(prefijo))) filas.push(r)
  return filas
}

async function run() {
  if (!existsSync(COMPANIES)) {
    throw new Error('Falta id-maps/companies.json — correr antes 03b-companies.mjs')
  }
  const mapaBufetes = JSON.parse(readFileSync(COMPANIES, 'utf8'))

  const [externos, users] = await Promise.all([
    leerTodo('users_extern'),
    leerTodo('users_2'),          // `users_2…` para no agarrar users_clinic ni users_extern
  ])
  const porUserId = new Map(users.map(u => [u.id, u]))

  console.log(`📋 ${externos.length} externos · ${Object.keys(mapaBufetes).length} bufetes en el id-map${DRY ? '   (DRY RUN)' : ''}`)

  const db = getPool()
  const idMap = {}
  let insertados = 0, actualizados = 0, internos = 0, sinDatos = 0, sinBufete = 0

  for (const ext of externos) {
    const u = porUserId.get(ext.userId)
    const email = u?.email?.trim() || null

    if (email && CORREO_INTERNO.test(email)) {
      console.log(`  🚫 interno de la clínica, no entra: ${email}`)
      internos++
      continue
    }

    const firstName = val(u?.name)
    const lastName = val(u?.lastname)
    if (!email && !firstName) { sinDatos++; continue }

    const parentFirmId = ext.companyId ? (mapaBufetes[ext.companyId] ?? null) : null
    if (ext.companyId && !parentFirmId) sinBufete++

    const memberRole = ROL[ext.role] ?? 'OTHER'
    const estado = ext.active === 'false' ? 'INACTIVE' : 'ACTIVE'
    const telefono = normalizarTelefono(val(u?.phone) ?? val(u?.cellphone))

    if (DRY) {
      console.log(`  · ${(lastName ?? '') + ', ' + (firstName ?? '')} — ${memberRole} — ${email ?? 'sin correo'} — bufete ${parentFirmId ? 'ok' : '—'}`)
      idMap[ext.id] = '(nuevo)'
      insertados++
      continue
    }

    const nuevoId = cuid()
    // `email` es UNIQUE: si la persona ya está (re-corrida, o dos filas con el
    // mismo correo), se actualiza y se toma el id REAL del RETURNING. Guardar el
    // `nuevoId` a ciegas es lo que obligó a escribir `rebuild-all-maps.mjs`.
    const { rows } = await db.query(
      `INSERT INTO lawyers
         (id, "entityType", "firstName", "lastName", email, phone,
          city, state, zip, "parentFirmId", "memberRole", status,
          "createdAt", "updatedAt")
       VALUES ($1, 'FIRM_MEMBER'::"LawyerEntityType", $2, $3, $4, $5, $6, $7, $8, $9,
               $10::"LawyerMemberRole", $11::"ExternalStatus", NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET
         "firstName"    = COALESCE(EXCLUDED."firstName", lawyers."firstName"),
         "lastName"     = COALESCE(EXCLUDED."lastName",  lawyers."lastName"),
         phone          = COALESCE(EXCLUDED.phone,       lawyers.phone),
         city           = COALESCE(EXCLUDED.city,        lawyers.city),
         state          = COALESCE(EXCLUDED.state,       lawyers.state),
         zip            = COALESCE(EXCLUDED.zip,         lawyers.zip),
         "parentFirmId" = COALESCE(EXCLUDED."parentFirmId", lawyers."parentFirmId"),
         "memberRole"   = EXCLUDED."memberRole",
         "updatedAt"    = NOW()
       RETURNING id, (xmax = 0) AS insertado`,
      [nuevoId, firstName, lastName, email, telefono,
       ext.city || null, ext.state || null, ext.zipCode || null,
       parentFirmId, memberRole, estado],
    )

    idMap[ext.id] = rows[0].id
    if (rows[0].insertado) insertados++; else actualizados++
  }

  if (!DRY) {
    if (!existsSync(MAPS)) mkdirSync(MAPS, { recursive: true })
    writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2))
  }

  console.log(`\n📊 Abogados: ${insertados} nuevos · ${actualizados} actualizados · ${internos} internos salteados · ${sinDatos} sin nombre ni correo`)
  if (sinBufete) console.log(`⚠️  ${sinBufete} con companyId que no está en el id-map de bufetes`)
  console.log(`💾 id-map (${Object.keys(idMap).length}) → ${MAP_FILE}${DRY ? ' [no escrito]' : ''}`)
  await closePool()
}

run().catch(e => { console.error(e); process.exit(1) })
