/**
 * Migración 16 — Catálogo de precios (labs · inyectables · servicios · férulas)
 *
 * Origen: "LabCorp Lab Pricing - LabCorp Prices.csv" — la hoja que la clínica
 * mantiene a mano. Contiene cuatro tablas distintas mezcladas:
 *
 *   1. ~149 labs send-out a LabCorp   (cols A-F)
 *   2.    9 inyectables                (cols A + D, sin código)
 *   3.    8 servicios in-house         (cols A + D, sin código)
 *   4.    8 férulas / DME              ¡dentro de la columna NOTES! (col F)
 *
 * Además funde los estudios que ya viven en `lab_catalog` (migrados del v2) para
 * que el buscador de órdenes del doctor no pierda ninguno.
 *
 * Idempotente: ON CONFLICT (code) DO UPDATE. Correr las veces que haga falta.
 * Emite `catalog-conflicts.json` con todo lo que necesita decisión humana —
 * el script nunca inventa un precio.
 *
 * Uso:  node scripts/migration/16-catalog-items.mjs [--dry]
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CSV_FILE = `${process.env.CSV_DIR ?? 'C:/Users/Erick/Downloads'}/LabCorp Lab Pricing - LabCorp Prices.csv`;
const REPORT_FILE = join(import.meta.dirname, 'catalog-conflicts.json');
const DRY = process.argv.includes('--dry');

// El session pooler (:5432) de Supabase no responde; el transaction pooler sí.
function resolveConnString() {
  const raw = process.env.DATABASE_URL ?? '';
  if (/pooler\.supabase\.com:5432/.test(raw)) {
    const swapped = raw.replace(':5432/', ':6543/');
    console.log('ℹ️  session pooler (:5432) no disponible → usando transaction pooler (:6543)');
    return swapped.includes('pgbouncer') ? swapped : `${swapped}?pgbouncer=true`;
  }
  return raw;
}

const pool = new pg.Pool({
  connectionString: resolveConnString(),
  ssl: { rejectUnauthorized: false },
});

// ─── CSV con soporte de campos multilínea entre comillas ─────────────────────
// (la fila "Acute Hepatitis Panel" tiene un salto de línea dentro del código)
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { /* skip */ }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ─── Normalizadores ──────────────────────────────────────────────────────────
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

/** "$15.50" → 15.50 · "$30 per view" → {value:30, rest:'per view'} · "" → null */
function parseMoney(raw) {
  const s = clean(raw);
  if (!s) return { value: null, rest: null };
  const m = s.match(/\$?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return { value: null, rest: s };
  return {
    value: parseFloat(m[1].replace(/,/g, '')),
    rest: clean(s.slice(m.index + m[0].length)) || null,
  };
}

/**
 * Precios compuestos del tipo "$172 + $197 for Reflex if +" —
 * el segundo número es el reflex, no parte del precio base.
 */
function parsePriceWithReflex(raw) {
  const s = clean(raw);
  const base = parseMoney(s);
  const reflexInline = s.match(/\+\s*\$?([\d,]+(?:\.\d{1,2})?)\s*(?:for|if)\s*reflex/i)
    ?? s.match(/reflex(?:es)?\s*(?:may apply\s*)?at\s*\$?([\d,]+(?:\.\d{1,2})?)/i);
  return {
    value: base.value,
    reflex: reflexInline ? parseFloat(reflexInline[1].replace(/,/g, '')) : null,
    rest: base.rest,
  };
}

function parseVerification(notes) {
  const s = clean(notes);
  if (/REQUESTED (PRICE UPDATE|UPDATED PRICING)/i.test(s)) return { status: 'UPDATE_REQUESTED', date: null };
  if (/(not verified|UNCONFIRMED)/i.test(s)) return { status: 'UNVERIFIED', date: null };
  const m = s.match(/verified\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!m) return { status: 'UNVERIFIED', date: null };
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
  return { status: 'VERIFIED', date: new Date(Date.UTC(year, parseInt(mm, 10) - 1, parseInt(dd, 10))) };
}

const TUBE_MAP = [
  [/l\.?\s*blue|light blue/i, 'LIGHT_BLUE'],
  [/lav/i, 'LAVENDER'],
  [/yellow/i, 'YELLOW'],
  [/green/i, 'GREEN'],
  [/\bred\b/i, 'RED'],
  [/pale/i, 'PALE'],
];
const CONTAINER_MAP = [
  [/para-?pak/i, 'PARAPAK'],
  [/urine bottle/i, 'URINE_BOTTLE'],
  [/\bstool\b/i, 'STOOL'],
  [/\bspecimen\b/i, 'SPECIMEN'],
];

/** La columna "Tube Color" mezclaba color, contenedor e instrucciones. */
function parseTube(raw) {
  const s = clean(raw);
  if (!s) return { colors: [], container: null, handling: null };
  const colors = [];
  for (const [re, key] of TUBE_MAP) if (re.test(s) && !colors.includes(key)) colors.push(key);
  const container = CONTAINER_MAP.find(([re]) => re.test(s))?.[1] ?? null;
  const handling = /special handling|frozen|room temp|see instructions|check link|2 tubes|separated/i.test(s)
    ? s : null;
  return { colors, container, handling };
}

/** Costos de reflex que estaban redactados en prosa dentro de NOTES. */
function parseReflexFromNotes(notes) {
  const s = clean(notes);
  const out = { cost: null, price: null };
  // "Reflex is an additional cost of $1182 to patient ($472.50 to us)"
  const both = s.match(/reflex is an additional cost of \$?([\d,.]+) to patient \(\$?([\d,.]+) to us\)/i);
  if (both) {
    out.price = parseFloat(both[1].replace(/,/g, ''));
    out.cost = parseFloat(both[2].replace(/,/g, ''));
    return out;
  }
  // "Reflex is $80 additional"
  const add = s.match(/reflex is \$?([\d,.]+) additional/i);
  if (add) out.price = parseFloat(add[1].replace(/,/g, ''));
  // "reflex is $47.05 cost to us"  ·  "Each one is $10.11 cost to us"
  const us = s.match(/(?:reflex is|each one is) \$?([\d,.]+) cost to us/i);
  if (us) out.cost = parseFloat(us[1].replace(/,/g, ''));
  return out;
}

const slug = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ─── Extracción ──────────────────────────────────────────────────────────────
const conflicts = [];
const flag = (type, item, detail) => conflicts.push({ type, item, detail });

/** Bloque de férulas/físicos escondido en la columna NOTES del final. */
function parseColumnF(cell) {
  const s = (cell ?? '').replace(/\s+$/, '');
  if (!s.trim() || !/\$\d/.test(s)) return null;
  const parts = s.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const priceRaw = parts[parts.length - 1];
  if (!/^\$\d/.test(priceRaw)) return null;
  return {
    name: parts[0].replace(/:$/, '').trim(),
    size: parts.length >= 3 ? parts[1] : null,
    price: parseMoney(priceRaw).value,
  };
}

function extract() {
  const rows = parseCSV(readFileSync(CSV_FILE, 'utf8')).slice(1);
  const items = [];
  const seenCodes = new Map();
  const seenNames = new Set();
  let section = 'GENERAL';
  let statRule = null;

  const SECTIONS = { 'CULTURES': 'CULTURES', 'PAP TESTS': 'PAP' };

  rows.forEach((r, idx) => {
    const line = idx + 2;
    const [nameRaw, codeRaw, costRaw, cashRaw, tubeRaw, notesRaw] = r;
    const name = clean(nameRaw);
    const code = clean(codeRaw);
    const notes = clean(notesRaw);

    if (/STAT TESTING/i.test(notes)) statRule = notes;

    // ── Bloque 4: férulas y físicos, escondidos en la columna NOTES ──
    const colF = parseColumnF(notesRaw);
    if (colF) {
      const isPhysical = /physical/i.test(colF.name);
      items.push({
        kind: isPhysical ? 'SERVICE' : 'DME',
        code: `PM-${isPhysical ? 'SVC' : 'DME'}-${slug(colF.name)}`,
        name: colF.name,
        vendor: 'IN_HOUSE',
        costPrice: null,
        publicPrice: colF.price,
        sizeLabel: colF.size,
        alwaysFullPayment: !isPhysical, // "Ferulas: sus precios sí o sí lo pagan todo"
        priceStatus: 'UNVERIFIED',
        sourceLine: line,
      });
      if (!isPhysical) flag('SIN_COSTO_REAL', colF.name, 'férula sin costo en el Excel');
      else flag('SIN_COSTO_REAL', colF.name, 'servicio sin costo en el Excel');
    }

    if (!name) return;

    // Encabezado de sección ("CULTURES", "PAP TESTS")
    if (!code && !clean(costRaw) && !clean(cashRaw)) {
      const key = SECTIONS[name.toUpperCase()];
      if (key) { section = key; return; }
      return;
    }

    // ── Bloques 2 y 3: sin código LabCorp = inyectable o servicio in-house ──
    if (!code) {
      const cash = parseMoney(cashRaw);
      const isInjection = /injection|shot|block/i.test(name);
      const key = name.toLowerCase();
      if (seenNames.has(key)) { flag('DUPLICADO_SERVICIO', name, `línea ${line} repetida`); return; }
      seenNames.add(key);
      items.push({
        kind: isInjection ? 'INJECTION' : 'SERVICE',
        code: `PM-${isInjection ? 'INJ' : 'SVC'}-${slug(name)}`,
        name,
        vendor: 'IN_HOUSE',
        costPrice: null,
        publicPrice: cash.value,
        unitLabel: /per view/i.test(cash.rest ?? '') ? 'por vista' : null,
        priceNote: cash.rest,
        priceStatus: 'UNVERIFIED',
        sourceLine: line,
      });
      flag('SIN_COSTO_REAL', name, `${isInjection ? 'inyectable' : 'servicio'} sin costo en el Excel`);
      return;
    }

    // ── Bloque 1: lab send-out a LabCorp ──
    const cost = parsePriceWithReflex(costRaw);
    const cash = parsePriceWithReflex(cashRaw);
    const tube = parseTube(tubeRaw);
    const ver = parseVerification(notes);
    const notesReflex = parseReflexFromNotes(notes);
    const inactive = /INACTIVE/i.test(`${name} ${notes}`);
    const replacedBy = `${name} ${notes}`.match(/USE NEW CODE (\d+)/i)?.[1] ?? null;
    const hasReflex = /reflex|rflx|rfx/i.test(`${name} ${notes}`);

    const item = {
      kind: 'LAB',
      code,
      name,
      category: 'LABORATORY',
      section,
      vendor: 'LABCORP',
      costPrice: cost.value,
      publicPrice: cash.value,
      priceNote: cash.rest,
      hasReflex,
      reflexCost: cost.reflex ?? notesReflex.cost,
      reflexPrice: cash.reflex ?? notesReflex.price,
      reflexPolicy: hasReflex ? (notes || null) : null,
      tubeColors: tube.colors,
      containerType: tube.container,
      specialHandling: tube.handling,
      priceStatus: ver.status,
      priceVerifiedAt: ver.date,
      isActive: !inactive,
      isOrderable: !(cost.value == null && cash.value == null),
      replacedByCode: replacedBy,
      notes: notes || null,
      sourceLine: line,
    };

    // Duplicado por código: gana la verificación más reciente, se reporta.
    const prev = seenCodes.get(code);
    if (prev) {
      const prevDate = prev.priceVerifiedAt?.getTime() ?? 0;
      const currDate = item.priceVerifiedAt?.getTime() ?? 0;
      const winner = currDate >= prevDate ? item : prev;
      flag('DUPLICADO_PRECIO_DISTINTO', `${code} · ${name}`,
        `L${prev.sourceLine}: $${prev.costPrice}/$${prev.publicPrice} vs ` +
        `L${item.sourceLine}: $${item.costPrice}/$${item.publicPrice} → ` +
        `se toma L${winner.sourceLine} (verificación más reciente). REVISAR.`);
      Object.assign(prev, winner);
      return;
    }
    seenCodes.set(code, item);
    items.push(item);

    if (cost.rest) flag('PRECIO_NO_NUMERICO', name, `costo: "${clean(costRaw)}"`);
    if (cash.rest) flag('PRECIO_NO_NUMERICO', name, `precio público: "${clean(cashRaw)}"`);
    if (cash.value == null) flag('SIN_PRECIO_PUBLICO', name, notes);
    if (inactive) flag('TEST_INACTIVO', name, replacedBy ? `reemplazar por ${replacedBy}` : notes);
    if (ver.status !== 'VERIFIED') flag(`VERIF_${ver.status}`, name, notes);
  });

  // La regla de STAT no es un ítem del Excel pero sí es un cobro real.
  if (statRule) {
    items.push({
      kind: 'SERVICE',
      code: 'PM-SVC-STAT-PROCESSING',
      name: 'Procesamiento STAT',
      vendor: 'LABCORP',
      costPrice: 35.70,
      publicPrice: 70.00,
      unitLabel: 'por set de labs STAT',
      priceNote: 'Se cobra una vez por orden STAT, no por cada lab',
      notes: statRule,
      priceStatus: 'UNVERIFIED',
      sourceLine: null,
    });
  }

  return items;
}

// ─── Carga ───────────────────────────────────────────────────────────────────
const COLS = [
  'kind', 'code', 'name', 'category', 'section', 'loinc', 'vendor',
  'costPrice', 'publicPrice', 'memberPrice', 'priceNote', 'unitLabel',
  'hasReflex', 'reflexCost', 'reflexPrice', 'reflexPolicy',
  'tubeColors', 'containerType', 'specialHandling',
  'sizeLabel', 'alwaysFullPayment',
  'priceStatus', 'priceVerifiedAt',
  'isActive', 'isOrderable', 'replacedByCode', 'notes',
];

async function upsert(client, it) {
  const values = COLS.map((c) => {
    const v = it[c];
    if (v === undefined) {
      if (c === 'tubeColors') return [];
      if (c === 'hasReflex' || c === 'alwaysFullPayment') return false;
      if (c === 'isActive' || c === 'isOrderable') return true;
      if (c === 'vendor') return 'IN_HOUSE';
      if (c === 'priceStatus') return 'UNVERIFIED';
      return null;
    }
    return v;
  });
  const ph = COLS.map((_, i) => `$${i + 1}`).join(', ');
  const quoted = COLS.map((c) => `"${c}"`).join(', ');
  // No pisar un precio cargado a mano con un null del Excel.
  const updates = COLS.filter((c) => c !== 'code')
    .map((c) => `"${c}" = COALESCE(EXCLUDED."${c}", "catalog_items"."${c}")`)
    .join(', ');

  await client.query(
    `INSERT INTO "catalog_items" (${quoted}, "updatedAt")
     VALUES (${ph}, NOW())
     ON CONFLICT ("code") DO UPDATE SET ${updates}, "updatedAt" = NOW()`,
    values,
  );
}

async function main() {
  const items = extract();

  const byKind = items.reduce((a, i) => { a[i.kind] = (a[i.kind] ?? 0) + 1; return a; }, {});
  console.log('📋 Extraído del Excel:', JSON.stringify(byKind));

  const client = await pool.connect();

  // Funde los estudios que ya están en lab_catalog (migrados del v2) para que
  // el buscador de órdenes del doctor no pierda ninguno.
  const legacy = await client.query('SELECT code, name, loinc, category FROM lab_catalog');
  const csvCodes = new Set(items.filter((i) => i.kind === 'LAB').map((i) => i.code));
  let carried = 0;
  for (const row of legacy.rows) {
    if (csvCodes.has(row.code)) continue;
    items.push({
      kind: 'LAB',
      code: row.code,
      name: row.name,
      category: row.category,
      section: 'GENERAL',
      loinc: row.loinc,
      vendor: 'LABCORP',
      costPrice: null,
      publicPrice: null,
      priceStatus: 'UNVERIFIED',
      notes: 'Migrado del v2 · sin precio cargado',
    });
    carried++;
  }
  console.log(`🔗 lab_catalog: ${legacy.rows.length} estudios · ${legacy.rows.length - carried} ya venían en el Excel · ${carried} arrastrados sin precio`);
  if (carried) flag('SIN_PRECIO_PUBLICO', `${carried} estudios del v2`, 'están en lab_catalog pero no en el Excel — quedan sin precio');

  // El v2 y el Excel usan nombres distintos para el mismo estudio (a veces con
  // códigos LabCorp distintos). No se fusionan solos — hay precios de por medio.
  // Se reportan para que alguien decida cuál queda.
  const tokens = (s) => new Set((s.toUpperCase().match(/[A-Z0-9]{3,}/g) ?? [])
    .filter((t) => !['THE', 'AND', 'WITH', 'REFLEX', 'TOTAL', 'TEST'].includes(t)));
  const fromExcel = items.filter((i) => i.kind === 'LAB' && i.vendor === 'LABCORP' && i.publicPrice != null);
  const fromV2 = items.filter((i) => i.kind === 'LAB' && i.publicPrice == null);
  for (const v2 of fromV2) {
    const a = tokens(v2.name);
    if (a.size < 2) continue;
    for (const ex of fromExcel) {
      const b = tokens(ex.name);
      if (b.size < 2) continue;
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      const jaccard = inter / (a.size + b.size - inter);
      if (jaccard >= 0.6) {
        flag('POSIBLE_DUPLICADO_V2', `${v2.code} · ${v2.name}`,
          `parece el mismo estudio que ${ex.code} · ${ex.name} (similitud ${jaccard.toFixed(2)}) — decidir cuál queda`);
      }
    }
  }

  if (DRY) {
    console.log('🔍 --dry: no se escribe nada');
  } else {
    await client.query('BEGIN');
    try {
      for (const it of items) await upsert(client, it);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }

  const total = await client.query(
    `SELECT kind, count(*)::int n,
            count("costPrice")::int con_costo,
            count("publicPrice")::int con_precio
       FROM "catalog_items" WHERE "deletedAt" IS NULL GROUP BY kind ORDER BY kind`,
  );
  console.table(total.rows);

  client.release();
  await pool.end();

  // ── Reporte de conflictos ──
  const byType = conflicts.reduce((a, c) => { a[c.type] = (a[c.type] ?? 0) + 1; return a; }, {});
  writeFileSync(REPORT_FILE, JSON.stringify({ generatedFrom: CSV_FILE, byType, conflicts }, null, 2));
  console.log('\n⚠️  Conflictos que necesitan decisión humana:');
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${t}`);
  }
  console.log(`\n📄 Detalle: ${REPORT_FILE}`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
