/**
 * Script: 11-case-extern-history.mjs
 * Migra el historial de asignaciones de casos (case_extern_history) de v2 → auditLog v3.
 * Ejecutar: node scripts/migration/11-case-extern-history.mjs
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { getPool, closePool, cuid } from './utils/db.mjs';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const casesMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'id-maps', 'cases.json'), 'utf8'));

function parseJsonField(str) {
  if (!str || str.trim() === '' || str.trim() === '""') return null;
  try {
    const s = str.startsWith('"') ? JSON.parse(str) : str;
    return typeof s === 'string' ? JSON.parse(s) : s;
  } catch { return null; }
}

function personName(obj) {
  if (!obj) return null;
  return `${obj.userName ?? ''} ${obj.userLastname ?? ''}`.trim() || null;
}

function mapChangeType(v) {
  return { ATTORNEY: 'Abogado', CASE_MANAGER: 'Gestor de casos', ASSISTANT_GROUP: 'Asistente' }[v] ?? v;
}

function mapAction(v) {
  return { ASSIGNED: 'Asignado', UPDATED: 'Actualizado', REMOVED: 'Removido' }[v] ?? v;
}

async function parseCsv(filePath) {
  const rows = [];
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false, i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i += 2; continue; } // escaped ""
        inQ = !inQ; i++; continue;
      }
      if (ch === ',' && !inQ) { cols.push(cur); cur = ''; i++; continue; }
      cur += ch; i++;
    }
    cols.push(cur);
    if (!headers) { headers = cols; continue; }
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

async function main() {
  const csvPath = 'C:\\Users\\Erick\\Downloads\\case_extern_history_202607171145.csv';
  const pool = getPool();

  console.log('📂 Leyendo CSV...');
  const rows = await parseCsv(csvPath);
  console.log(`   ${rows.length} registros encontrados`);

  let inserted = 0, skippedNoId = 0, skippedNoMap = 0, alreadyExists = 0;

  for (const row of rows) {
    const v2CaseId = parseInt(row.caseId, 10);
    if (!v2CaseId) { skippedNoId++; continue; }

    const v3CaseId = casesMap[String(v2CaseId)];
    if (!v3CaseId) { console.log(`   ⚠ caseId v2=${v2CaseId} sin mapeo`); skippedNoMap++; continue; }

    const prevObj = parseJsonField(row.previousValue);
    const newObj  = parseJsonField(row.newValue);

    const metadata = {
      migratedFromV2:  true,
      v2HistoryId:     row.id,
      changeType:      mapChangeType(row.changeType),
      changeTypeRaw:   row.changeType,
      action:          mapAction(row.action),
      actionRaw:       row.action,
      changedByEmail:  row.changedByUserEmail || null,
      changedByV2Id:   row.changedByUserId   || null,
      previousValue:   personName(prevObj),
      newValue:        personName(newObj),
    };

    // Idempotency
    const check = await pool.query(
      `SELECT id FROM audit_logs WHERE "entityType"='cases' AND "entityId"=$1 AND metadata->>'v2HistoryId'=$2 LIMIT 1`,
      [v3CaseId, row.id],
    );
    if (check.rows.length > 0) { alreadyExists++; continue; }

    await pool.query(
      `INSERT INTO audit_logs (id, "entityType", "entityId", action, "actorType", "actorUserId", metadata, "createdAt")
       VALUES ($1, 'cases', $2, 'ASSIGNMENT_CHANGE', 'HUMAN_USER', $3, $4::jsonb, $5)`,
      [
        cuid(),
        v3CaseId,
        null, // actorUserId: v2 IDs no existen en v3 users — guardado en metadata.changedByV2Id
        JSON.stringify(metadata),
        new Date(row.changeDate),
      ],
    );

    inserted++;
    console.log(`   ✓ v2=${v2CaseId}→v3=${v3CaseId.slice(0,8)}… | ${metadata.changeType} ${metadata.action}: "${metadata.previousValue ?? '—'}" → "${metadata.newValue ?? '—'}"`);
  }

  console.log('\n─── Resumen ───────────────────────────');
  console.log(`   Insertados:            ${inserted}`);
  console.log(`   Ya existían:           ${alreadyExists}`);
  console.log(`   Sin caseId (caseId=0): ${skippedNoId}`);
  console.log(`   Sin mapeo v2→v3:       ${skippedNoMap}`);
  console.log('───────────────────────────────────────');

  await closePool();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
