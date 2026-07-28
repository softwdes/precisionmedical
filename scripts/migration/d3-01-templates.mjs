/**
 * D3-01 · Migración de plantillas clínicas (templates) del v2 → Phoenix.
 *
 * Fuente: templates_202607141014.csv (export del v2)
 *   columnas: id, title, description, complaint, history, reviewsystem,
 *             physical, assessments, plan, like, createdAt, updatedAt
 *
 * Reglas confirmadas por Erick (2026-07-28):
 *   - Los prefijos (NG-, BC-) son parte del TÍTULO, no indican doctor.
 *   - Todas las plantillas son GLOBALES → scope = SHARED.
 *   - El doctor puede crear y editar; solo el admin puede eliminar.
 *
 * El contenido del v2 es Markdown → se convierte a HTML (nuestro editor
 * trabaja con HTML). El campo `like` NO se migra: los favoritos son
 * personales por doctor (TemplateFavorite) y cada uno marcará los suyos.
 *
 * Uso:  node d3-01-templates.mjs           (dry-run)
 *       node d3-01-templates.mjs --apply
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import { config } from 'dotenv';

config();

const APPLY = process.argv.includes('--apply');
const CSV_PATH = process.env.TEMPLATES_CSV
  ?? 'C:/Users/Erick/Downloads/DBA 3/templates_202607141014.csv';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const cuid = () => 'c' + crypto.randomBytes(16).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 23);

// ─── CSV parser (campos multilínea con comillas dobles escapadas) ────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ─── Markdown → HTML (conservador: no pierde contenido clínico) ──────────────
function mdToHtml(md) {
  if (!md || !md.trim()) return '';

  // 1. Escapar HTML, preservando los <br> que el v2 ya trae
  let s = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>');

  // 2. Escapes del v2: \* \, \. → carácter literal
  s = s.replace(/\\([*,.\-_])/g, '$1');

  const lines = s.split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  const inline = (txt) =>
    txt
      // negrita **texto**
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // itálica *texto* (sin capturar bullets: requiere no-espacio tras el *)
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?![*\w])/g, '$1<em>$2</em>')
      // links [texto](url)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) { closeList(); continue; }

    const ul = /^\*\s+(.*)$/.exec(trimmed);        // "* item"
    const ol = /^(\d+)[.)]\s+(.*)$/.exec(trimmed); // "1. item"

    if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }

    closeList();
    if (trimmed === '<br>') { out.push('<br>'); continue; }
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  closeList();
  return out.join('\n');
}

// ─── Clasificación encounterType / caseType desde el título ──────────────────
function classify(title, description) {
  const t = `${title} ${description}`.toLowerCase();
  const caseType = t.includes('nursing home') ? 'NURSING_HOME'
    : t.includes('mva') || t.includes('motor vehicle') ? 'MVA'
    : 'GENERAL';
  const encounterType =
    t.includes('nursing home') && /new|admit/.test(t) ? 'NEW_PATIENT'
    : /f\/u|follow[- ]?up/.test(t) ? 'FOLLOW_UP'
    : t.includes('uri') ? 'URI'
    : t.includes('physical') ? 'PHYSICAL'
    : t.includes('re-eval') || t.includes('re eval') ? 'RE_EVAL'
    : /new|mva/.test(t) ? 'NEW_PATIENT'
    : 'OTHER';
  return { caseType, encounterType };
}

// Columna del CSV → sectionKey de nuestro schema (orden del formulario v2)
const SECTION_MAP = [
  ['complaint',    'QUEJA_PRINCIPAL'],
  ['history',      'HPI'],
  ['reviewsystem', 'ROS'],
  ['physical',     'EXAMEN_FISICO'],
  ['assessments',  'EVALUACIONES'],
  ['plan',         'PLAN'],
];

console.log(`\n${APPLY ? '⚡ APPLY' : '🔍 DRY-RUN'} — d3-01 templates del v2\n`);

const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
console.log(`Filas en CSV: ${rows.length}\n`);

// Creador de las plantillas migradas: usuario admin del sistema en Phoenix.
// Si no existe, se crea (los templates son globales, no de un doctor).
const SYSTEM_EMAIL = 'erick@precisionmedicalcare.com';
let creatorId = null;
{
  const { rows: found } = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [SYSTEM_EMAIL]);
  if (found[0]) {
    creatorId = found[0].id;
    console.log(`Creador: ${SYSTEM_EMAIL} (${creatorId})\n`);
  } else if (APPLY) {
    creatorId = cuid();
    await pool.query(
      `INSERT INTO users (id, email, "firstName", "lastName", role, status, "emailVerifiedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Erick', 'Salinas', 'SUPER_ADMIN', 'ACTIVE', now(), now(), now())`,
      [creatorId, SYSTEM_EMAIL],
    );
    console.log(`Creador CREADO: ${SYSTEM_EMAIL} (${creatorId})\n`);
  } else {
    console.log(`Creador: ${SYSTEM_EMAIL} — se creará al aplicar\n`);
  }
}

let inserted = 0, skipped = 0;

for (const r of rows) {
  const title = r.title?.trim();
  if (!title) continue;

  const { caseType, encounterType } = classify(title, r.description ?? '');
  const sections = SECTION_MAP
    .map(([col, key], i) => ({ key, html: mdToHtml(r[col] ?? ''), orderIndex: i }))
    .filter((s) => s.html);

  const { rows: exists } = await pool.query(
    'SELECT id FROM templates WHERE title = $1 AND "deletedAt" IS NULL', [title],
  );
  if (exists[0]) {
    console.log(`= ${title} — ya existe, skip`);
    skipped++;
    continue;
  }

  console.log(`+ ${title}`);
  console.log(`    ${r.description || '(sin descripción)'}`);
  console.log(`    encounterType=${encounterType} · caseType=${caseType} · scope=SHARED`);
  console.log(`    secciones con contenido: ${sections.map((s) => s.key).join(', ') || '(ninguna)'}`);

  if (!APPLY) continue;

  const templateId = cuid();
  await pool.query(
    `INSERT INTO templates (id, title, description, "encounterType", "caseType", scope,
       "createdById", "usageCount", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4::"EncounterType", $5::"CaseType", 'SHARED', $6, 0, true, $7, $8)`,
    [
      templateId, title, r.description?.trim() || null, encounterType, caseType, creatorId,
      r.createdAt ? new Date(r.createdAt) : new Date(),
      r.updatedAt ? new Date(r.updatedAt) : new Date(),
    ],
  );

  for (const s of sections) {
    await pool.query(
      `INSERT INTO template_sections (id, "templateId", "sectionKey", content, "enabledByDefault", "orderIndex")
       VALUES ($1, $2, $3::"TemplateSectionKey", $4, true, $5)`,
      [cuid(), templateId, s.key, s.html, s.orderIndex],
    );
  }
  // Sección de diagnósticos vacía (se llena desde la UI con ICD-10/SNOMED)
  await pool.query(
    `INSERT INTO template_sections (id, "templateId", "sectionKey", content, "enabledByDefault", "orderIndex")
     VALUES ($1, $2, 'DIAGNOSTICOS', '', true, 6)`,
    [cuid(), templateId],
  );

  console.log(`    ✓ insertado (${sections.length + 1} secciones)`);
  inserted++;
}

if (APPLY) {
  const { rows: check } = await pool.query(`
    SELECT t.title, t."encounterType", t."caseType", COUNT(s.id)::int AS secciones
    FROM templates t LEFT JOIN template_sections s ON s."templateId" = t.id
    WHERE t."deletedAt" IS NULL GROUP BY t.id, t.title, t."encounterType", t."caseType" ORDER BY t.title`);
  console.log('\nEstado final:');
  console.table(check);
}

console.log(`\n${APPLY ? `✅ Aplicado — ${inserted} insertados, ${skipped} ya existían` : 'ℹ Dry-run. Correr con --apply para ejecutar.'}\n`);
await pool.end();
