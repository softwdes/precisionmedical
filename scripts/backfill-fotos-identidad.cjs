/**
 * Backfill: las fotos de identidad del intake v3, como documentos del paciente.
 *
 * Desde hoy toda foto que entra queda además como fila de `patient_documents`
 * (ver `packages/database/src/foto-identidad.ts`). Este script hace lo mismo
 * con las que ya estaban: las que viven SOLO como URL dentro de
 * `Case.consentsData.photos` y por eso no aparecían en ninguna lista de
 * archivos.
 *
 * Qué hace con cada foto:
 *   1. La baja del bucket público `intake-photos`.
 *   2. La sube al privado `case-documents`, en `patients/<id>/personal/`.
 *   3. Crea (o actualiza) la fila con `patientId` y **`caseId: null`**.
 *
 * ⚠️ `caseId: null` no es un olvido: el portal del bufete sirve TODOS los
 * documentos de un caso, así que una licencia de conducir con `caseId` puesto
 * le queda a la vista al abogado. Decisión de Erick, 11-sep y 15-sep.
 *
 * Es idempotente: correrlo dos veces pisa el mismo archivo y actualiza la misma
 * fila. No borra nada — la URL del recuadro se queda donde está.
 *
 * Uso:
 *   node scripts/backfill-fotos-identidad.cjs              → simulacro (no escribe)
 *   node scripts/backfill-fotos-identidad.cjs --aplicar    → escribe
 *   node scripts/backfill-fotos-identidad.cjs --aplicar --paciente <id>
 *
 * El simulacro es el default a propósito: esto escribe en la base y en el
 * storage de producción.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// El .env de la app, que es donde están las vars del storage de Phoenix.
for (const line of fs.readFileSync(path.join(RAIZ, 'apps/back-office/.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { Client } = require(path.join(RAIZ, 'packages/database/node_modules/pg'));

const SUPABASE_URL = process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_STORAGE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_DESTINO = 'case-documents';

/** Misma convención que `foto-identidad.ts` — si cambia allá, cambia acá. */
const NOMBRE_DE_SLOT = {
  selfie:             'patient_photo',
  dlFront:            'dl_front',
  insuranceCardFront: 'id_card_front',
  insuranceCardBack:  'id_card_back',
};

const APLICAR  = process.argv.includes('--aplicar');
const SOLO_UNO = (() => {
  const i = process.argv.indexOf('--paciente');
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** `cuid`-ish: la columna `id` no tiene default en la base (el schema se aplicó con db push). */
function nuevoId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function extDe(url, contentType) {
  const enLaUrl = (url.split('?')[0].match(/\.([a-z0-9]{1,8})$/i) || [])[1];
  if (enLaUrl) return enLaUrl.toLowerCase();
  const porTipo = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
  return porTipo[(contentType || '').toLowerCase()] || 'jpg';
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { rows: casos } = await db.query(
    `SELECT c.id, c."caseCode", c."patientId", c."consentsData" -> 'photos' AS photos
       FROM cases c
      WHERE jsonb_typeof(c."consentsData" -> 'photos') = 'object'
        AND c."consentsData" -> 'photos' <> '{}'::jsonb
        AND c."patientId" IS NOT NULL
        AND ($1::text IS NULL OR c."patientId" = $1)
      ORDER BY c."createdAt"`,
    [SOLO_UNO],
  );

  console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (nada se escribe)'} — ${casos.length} caso(s) con fotos\n`);

  let creadas = 0, actualizadas = 0, fallos = 0, saltadas = 0;

  for (const caso of casos) {
    const slots = Object.keys(caso.photos || {}).filter((s) => NOMBRE_DE_SLOT[s]);
    console.log(`· ${caso.caseCode}  paciente ${caso.patientId}  [${slots.join(', ') || 'sin recuadros conocidos'}]`);

    for (const slot of slots) {
      const url = caso.photos[slot];
      if (typeof url !== 'string' || !url.startsWith('http')) { saltadas++; continue; }

      try {
        const bajada = await fetch(url);
        if (!bajada.ok) {
          console.log(`    ✗ ${slot}: no se pudo bajar (HTTP ${bajada.status})`);
          fallos++; continue;
        }
        const tipo  = bajada.headers.get('content-type') || 'image/jpeg';
        const bytes = Buffer.from(await bajada.arrayBuffer());
        const ext   = extDe(url, tipo);
        const nombre = `${NOMBRE_DE_SLOT[slot]}.${ext}`;
        const s3Key  = `patients/${caso.patientId}/personal/${nombre}`;

        // ¿Ya hay fila para ese recuadro? (incluye las del v2 y las de la papelera)
        const { rows: previas } = await db.query(
          `SELECT id, name FROM patient_documents
            WHERE "patientId" = $1 AND "caseId" IS NULL AND "isFolder" = false
              AND name ~* $2 LIMIT 1`,
          [caso.patientId, `^${NOMBRE_DE_SLOT[slot]}\\.`],
        );
        const previa = previas[0] || null;

        if (!APLICAR) {
          console.log(`    · ${slot}: ${previa ? 'actualizaría' : 'crearía'} ${nombre} (${(bytes.length / 1024).toFixed(0)} KB)`);
          previa ? actualizadas++ : creadas++;
          continue;
        }

        const subida = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_DESTINO}/${s3Key}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            'Content-Type': tipo,
            'x-upsert': 'true',
          },
          body: bytes,
        });
        if (!subida.ok) {
          console.log(`    ✗ ${slot}: storage rechazó la copia — ${await subida.text()}`);
          fallos++; continue;
        }

        if (previa) {
          await db.query(
            `UPDATE patient_documents
                SET name = $1, "s3Key" = $2, "mimeType" = $3, size = $4,
                    "deletedAt" = NULL, "deletedById" = NULL, "deletedByName" = NULL,
                    "updatedAt" = now()
              WHERE id = $5`,
            [nombre, s3Key, tipo, bytes.length, previa.id],
          );
          actualizadas++;
          console.log(`    ✓ ${slot}: actualizada (${nombre})`);
        } else {
          await db.query(
            `INSERT INTO patient_documents
               (id, name, "s3Key", "isFolder", size, "mimeType", "patientId", "caseId",
                "parentId", "createdByUserId", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, false, $4, $5, $6, NULL, NULL, NULL, now(), now())`,
            [nuevoId(), nombre, s3Key, bytes.length, tipo, caso.patientId],
          );
          creadas++;
          console.log(`    ✓ ${slot}: creada (${nombre})`);
        }
      } catch (e) {
        console.log(`    ✗ ${slot}: ${e.message}`);
        fallos++;
      }
    }
  }

  console.log(`\nresumen — creadas: ${creadas}  actualizadas: ${actualizadas}  saltadas: ${saltadas}  fallos: ${fallos}`);
  if (!APLICAR) console.log('fue un simulacro. Para escribir de verdad: --aplicar');
  await db.end();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
