#!/usr/bin/env node
/**
 * Auditor de i18n del monorepo.
 *
 *   pnpm i18n:audit              → compara contra la línea base y falla si SUBIÓ
 *   pnpm i18n:audit -- --detalle → lista archivo, línea y texto de cada hallazgo
 *   pnpm i18n:audit -- --sellar  → reescribe la línea base con el estado de hoy
 *   pnpm i18n:audit -- --app apps/web
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * next-intl NO rompe el build cuando falta una clave: muestra la ruta cruda en
 * pantalla. Y un literal en castellano dentro de un `.tsx` no se lo lleva por
 * delante ni `tsc` ni el build. O sea: la única forma de que esto no vuelva es
 * contarlo y no dejar que el número suba.
 *
 * Mide dos cosas distintas:
 *   1. El DICCIONARIO — claves que faltan en inglés, y claves cuyo valor inglés
 *      está en castellano. Hoy da 0 en las cinco apps; mantenerlo en 0 es gratis.
 *   2. El CÓDIGO — texto en castellano que nunca pasa por next-intl.
 *
 * ── Lo que NO cuenta, y por qué ─────────────────────────────────────────────
 * Un contador que miente se ignora a la semana. Estos cuatro casos se
 * descartan a propósito, cada uno descubierto por un falso positivo real:
 *
 *   · Comentarios. El repo comenta en castellano por convención. Sin sacarlos
 *     el ruido tapa todo — y hay que hacerlo con una máquina de estados que
 *     respete strings y template literals, no con un regex.
 *   · Placeholders de ICU. "Open case {caso}" está en inglés perfecto pero el
 *     placeholder se llama `caso`: sin limpiarlos daba 47 falsos positivos.
 *     El patrón tiene que aceptar tildes o `{dueño}` se escapa.
 *   · Pares bilingües. `lang === 'es' ? 'Su cita es' : 'Your appointment is'`
 *     es código BIEN escrito. Las dos ramas pueden usar comillas distintas
 *     (el inglés suele llevar apóstrofo), y sin contemplarlo `apps/forms` daba
 *     419 hallazgos siendo una app enteramente bilingüe.
 *   · Diccionarios propios: `const STRINGS = { es: {…}, en: {…} }`. Es deuda
 *     (vive fuera de next-intl) pero NO es un defecto de idioma.
 *
 * Y los prompts de los agentes (`lib/vigia`, `lib/cifo`): los `description` y
 * `name` de una herramienta los lee el MODELO, no una persona.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const BASE = path.join(__dirname, 'i18n-baseline.json');

const APPS = [
  'apps/back-office',
  'apps/web',
  'apps/clinical',
  'apps/attorney',
  'apps/forms',
  'apps/timeclock',
  'packages/ui',
];

// ─────────────────────────── detector de castellano ──────────────────────────

/** Solo existen en castellano. Una sola alcanza. */
const FUERTES = new Set([
  'que', 'para', 'con', 'sin', 'del', 'los', 'las', 'una', 'unos', 'unas',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'hay', 'puede', 'pueden', 'debe', 'deben', 'tiene', 'tienen', 'ya',
  'desde', 'hasta', 'entre', 'sobre', 'cuando', 'donde', 'porque', 'pero',
  'aunque', 'mientras', 'cada', 'todo', 'toda', 'todos', 'todas',
  'otro', 'otra', 'otros', 'otras', 'nuevo', 'nueva', 'nuevos', 'nuevas',
  'ningun', 'ninguna', 'algun', 'alguna', 'algunos', 'algunas',
  'guardar', 'cancelar', 'eliminar', 'borrar', 'buscar', 'cerrar', 'abrir',
  'agregar', 'crear', 'editar', 'seleccionar', 'elegir', 'cargar', 'enviar',
  'volver', 'siguiente', 'anterior', 'aceptar', 'confirmar', 'guardando',
  'cargando', 'buscando', 'enviando', 'eliminando',
  'paciente', 'pacientes', 'cita', 'citas', 'caso', 'casos', 'bufete',
  'bufetes', 'abogado', 'abogados', 'nombre', 'apellido', 'correo',
  'telefono', 'direccion', 'fecha', 'hora', 'usuario', 'usuarios',
  'obligatorio', 'obligatoria', 'requerido', 'requerida', 'invalido',
  'invalida', 'valido', 'valida', 'seguro', 'segura', 'resultados',
  'mensaje', 'mensajes', 'archivo', 'archivos', 'ninguno',
  'sido', 'ser', 'estar', 'hacer', 'tener', 'poder', 'decir', 'existe',
  'falta', 'faltan', 'debes', 'deberia', 'podes', 'tenes', 'agrega',
  'segun', 'tambien', 'solo', 'ahora', 'luego', 'antes', 'despues',
  'siempre', 'nunca', 'aqui', 'alli', 'asi', 'muy', 'mas', 'menos',
]);

/** Frecuentes en castellano pero posibles en inglés o en jerga. Suman de a dos. */
const DEBILES = new Set([
  'el', 'la', 'lo', 'le', 'se', 'de', 'en', 'al', 'un', 'y', 'o',
  'es', 'son', 'fue', 'era', 'sea', 'esta', 'este',
  'no', 'si', 'su', 'sus', 'mi', 'te', 'nos', 'por',
]);

/** Si aparece una de estas, el texto NO es castellano (salvo tilde o 2 fuertes). */
const INGLES_DURO = new Set([
  'the', 'and', 'you', 'your', 'this', 'that', 'with', 'from', 'have', 'has',
  'will', 'would', 'could', 'should', 'cannot', 'does', 'doesn', 'their',
  'there', 'been', 'were', 'what', 'which', 'when', 'where', 'while',
]);

const ACENTOS = /[áéíóúñüÁÉÍÓÚÑÜ¿¡]/;
const NOMBRES_PROPIOS = /\b(Vigía|Vigia|CIFO|Medusa|Phoenix|Precision Medical)\b/g;

function limpiar(s) {
  return String(s)
    .replace(/\{\s*([a-zA-Z0-9_\u00C0-\u024F]+)\s*\}/g, ' ')
    .replace(/\{\s*[a-zA-Z0-9_]+\s*,\s*(plural|select|selectordinal)\s*,/g, ' ')
    .replace(/\b(one|other|zero|two|few|many)\s*\{/g, ' ')
    .replace(NOMBRES_PROPIOS, ' ')
    .replace(/[{}#]/g, ' ');
}

function palabras(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/).filter(Boolean);
}

function esCastellano(crudo) {
  const texto = limpiar(crudo);
  if (!texto || texto.trim().length < 3) return false;
  if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3}/.test(texto)) return false;

  const w = palabras(texto);
  if (!w.length) return false;

  const tildes = ACENTOS.test(texto);
  const fuertes = new Set(w.filter((x) => FUERTES.has(x)));
  const debiles = new Set(w.filter((x) => DEBILES.has(x)));
  const ingles = w.filter((x) => INGLES_DURO.has(x));

  if (ingles.length > 0 && !tildes && fuertes.size < 2) return false;
  return tildes || fuertes.size >= 1 || debiles.size >= 2;
}

// ─────────────────────────────── diccionarios ────────────────────────────────

function aplanar(obj, prefijo = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) aplanar(v, ruta, out);
    else out[ruta] = v;
  }
  return out;
}

/** `apps/attorney` no tiene messages propio: lee el diccionario compartido. */
const DICCIONARIO_DE = { 'apps/attorney': 'packages/i18n' };

function auditarDiccionario(app) {
  const dir = path.join(RAIZ, DICCIONARIO_DE[app] ?? app, 'messages');
  if (!fs.existsSync(path.join(dir, 'es.json'))) return null;
  const es = aplanar(JSON.parse(fs.readFileSync(path.join(dir, 'es.json'), 'utf8')));
  const en = aplanar(JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8')));

  const faltanEn = Object.keys(es).filter((k) => !(k in en));
  const castellanoEnIngles = Object.entries(en)
    .filter(([, v]) => typeof v === 'string' && esCastellano(v))
    .map(([k, v]) => `${k} = ${JSON.stringify(String(v).slice(0, 70))}`);

  return { claves: Object.keys(es).length, faltanEn, castellanoEnIngles };
}

// ───────────────────────────────── el código ─────────────────────────────────

/** Saca comentarios sin romper strings ni template literals. */
function sinComentarios(src) {
  let out = '';
  let modo = 'code';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (modo === 'code') {
      if (c === '/' && d === '/') { modo = 'line'; out += '  '; i++; continue; }
      if (c === '/' && d === '*') { modo = 'block'; out += '  '; i++; continue; }
      if (c === "'") modo = 'sq';
      else if (c === '"') modo = 'dq';
      else if (c === '`') modo = 'tpl';
      out += c; continue;
    }
    if (modo === 'line') { if (c === '\n') { modo = 'code'; out += c; } else out += ' '; continue; }
    if (modo === 'block') {
      if (c === '*' && d === '/') { modo = 'code'; out += '  '; i++; continue; }
      out += c === '\n' ? '\n' : ' '; continue;
    }
    if (c === '\\') { out += c + (d ?? ''); i++; continue; }
    if ((modo === 'sq' && c === "'") || (modo === 'dq' && c === '"') || (modo === 'tpl' && c === '`')) modo = 'code';
    out += c;
  }
  return out;
}

const PROPS_TEXTO = [
  'title', 'label', 'placeholder', 'aria-label', 'ariaLabel', 'alt',
  'description', 'subtitle', 'heading', 'hintLabel', 'emptyMessage',
  'confirmLabel', 'cancelLabel', 'confirmText', 'cancelText', 'tooltip',
  'helperText', 'errorMessage', 'caption', 'legend', 'texto', 'titulo',
];

const CITA = `(?:'([^'\\n]{2,})'|"([^"\\n]{2,})"|\`([^\`\\n]{2,})\`)`;
const PAR_BILINGUE = new RegExp(`\\?\\s*${CITA}\\s*:\\s*${CITA}`, 'g');

/** Textos que son una rama de un ternario ES/EN: traducción, no defecto. */
function paresBilingues(src) {
  const ok = new Set();
  for (const m of src.matchAll(PAR_BILINGUE)) {
    const a = m[1] ?? m[2] ?? m[3];
    const b = m[4] ?? m[5] ?? m[6];
    if (a && b && esCastellano(a) !== esCastellano(b)) { ok.add(a); ok.add(b); }
  }
  return ok;
}

const tieneDiccionarioPropio = (src) => /\bes\s*:\s*\{/.test(src) && /\ben\s*:\s*\{/.test(src);
const NO_ES_INTERFAZ = [/lib\/vigia\//, /lib\/cifo\//, /prompts?\./];

const RUIDO = [
  /^https?:\/\//, /^\//, /^@/, /^[A-Z_]+$/, /^\d/, /^[\s\W]+$/,
  /^[a-z]+(-[a-z0-9]+)*$/, /application\/|text\/|image\/|multipart\//,
  /^[\w-]+\.(tsx?|jsx?|json|css|svg|png|pdf)$/i,
];
/**
 * El patrón de texto suelto en JSX (`>…<`) también captura comparaciones de
 * TypeScript: `a > desde && rule.startsAt <` se lee como si fuera un nodo de
 * texto. Si trae operadores o acceso a propiedades, es código.
 */
const PARECE_CODIGO = /&&|\|\||=>|===|!==|\?\.|\{|\}|\w+\.\w+\(|^\w+\.\w+$/;

const esRuido = (t) =>
  RUIDO.some((r) => r.test(t)) ||
  PARECE_CODIGO.test(t) ||
  /^(flex|grid|text-|bg-|border|rounded|w-|h-|p-|m-|gap-|px-|py-|absolute|relative|inline)/.test(t);

const PROPS_RE = new RegExp(
  `\\b(${PROPS_TEXTO.join('|')})\\s*=\\s*(?:"([^"\\n]{3,})"|'([^'\\n]{3,})'|\\{\\s*['"\`]([^'"\`\\n]{3,})['"\`]\\s*\\})`,
  'g',
);

const FAMILIAS = [
  ['JSX', /_>([^<>{}\n]{3,})</g, 1],                                   // se reemplaza abajo
  ['prop', PROPS_RE, 2],
  ['aviso', /\b(toast(?:\.\w+)?|alert|confirm|window\.confirm)\s*\(\s*(?:`([^`]{3,})`|'([^'\n]{3,})'|"([^"\n]{3,})")/g, 2],
  ['Error()', /new Error\(\s*(?:`([^`]{3,})`|'([^'\n]{3,})'|"([^"\n]{3,})")/g, 1],
  ['campo servidor', /\b(message|mensaje|detalle|motivo|reason)\s*:\s*(?:`([^`]{3,})`|'([^'\n]{3,})'|"([^"\n]{3,})")/g, 2],
  ['mapa de etiquetas', /\b([A-Z][A-Z0-9_]{2,})\s*:\s*(?:'([^'\n]{3,})'|"([^"\n]{3,})")/g, 2],
  ['ternario', /\?\s*'([^'\n]{4,})'\s*:/g, 1],
  ['fallback', /(?:\?\?|\|\|)\s*'([^'\n]{4,})'/g, 1],
  ['push/subject', /\b(sub|cuerpo|subject|asunto|leyenda)\s*[:=]\s*(?:"([^"\n]{4,})"|'([^'\n]{4,})')/g, 2],
  ['zod', /\.(?:min|max|email|regex|url|length|nonempty|refine)\([^,)]*,\s*(?:'([^'\n]{5,})'|"([^"\n]{5,})")/g, 1],
  // La forma más obvia de todas, y la que faltaba: `const aviso = 'texto'`.
  // Se probó inyectando una regresión a mano y el auditor no la vio.
  ['asignación', /\b(?:const|let|var)\s+\w+(?:\s*:\s*[^=\n]+?)?\s*=\s*(?:'([^'\n]{4,})'|"([^"\n]{4,})"|`([^`\n]{4,})`)/g, 1],
  ['return', /\breturn\s+(?:'([^'\n]{4,})'|"([^"\n]{4,})"|`([^`\n]{4,})`)\s*;/g, 1],
];
FAMILIAS[0][1] = />([^<>{}\n]{3,})</g;   // texto suelto en JSX

const IGNORAR_DIR = new Set(['node_modules', '.next', 'dist', '.turbo', 'messages', 'public']);

function archivos(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!IGNORAR_DIR.has(e.name)) archivos(p, out); }
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

function auditarCodigo(app) {
  const hallazgos = [];
  const diccionariosPropios = [];

  for (const f of archivos(path.join(RAIZ, app))) {
    const rel = path.relative(RAIZ, f).replace(/\\/g, '/');
    if (NO_ES_INTERFAZ.some((r) => r.test(rel))) continue;

    const src = sinComentarios(fs.readFileSync(f, 'utf8'));
    if (tieneDiccionarioPropio(src)) { diccionariosPropios.push(rel); continue; }

    const bilingues = paresBilingues(src);
    const vistos = new Set();
    for (const [familia, re, grupo] of FAMILIAS) {
      for (const m of src.matchAll(re)) {
        const texto = (m[grupo] ?? m[grupo + 1] ?? m[grupo + 2] ?? '').trim();
        if (!texto || esRuido(texto) || bilingues.has(texto)) continue;
        if (!esCastellano(texto)) continue;
        const clave = `${m.index}|${texto}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        hallazgos.push({
          archivo: rel,
          linea: src.slice(0, m.index).split('\n').length,
          familia,
          texto,
        });
      }
    }
  }
  return { hallazgos, diccionariosPropios };
}

// ─────────────────────────────────── salida ──────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const detalle = args.includes('--detalle');
  const sellar = args.includes('--sellar');
  const soloApp = args.includes('--app') ? args[args.indexOf('--app') + 1] : null;
  const apps = soloApp ? [soloApp] : APPS;

  const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : { apps: {} };
  const hoy = {};
  let subio = false;
  let roto = false;

  console.log('idioma · auditoría\n');
  console.log('app                      código   base   dicc');
  console.log('─'.repeat(52));

  for (const app of apps) {
    const { hallazgos, diccionariosPropios } = auditarCodigo(app);
    const dicc = auditarDiccionario(app);
    hoy[app] = hallazgos.length;

    const previo = base.apps?.[app];
    const marca = previo === undefined ? '  —'
      : hallazgos.length > previo ? ` +${hallazgos.length - previo}`
      : hallazgos.length < previo ? ` -${previo - hallazgos.length}`
      : '  =';
    if (previo !== undefined && hallazgos.length > previo) subio = true;

    const estadoDicc = !dicc ? '—'
      : (dicc.faltanEn.length || dicc.castellanoEnIngles.length) ? '✗' : 'ok';
    if (dicc && (dicc.faltanEn.length || dicc.castellanoEnIngles.length)) roto = true;

    console.log(
      app.padEnd(24) +
      String(hallazgos.length).padStart(6) +
      String(previo ?? '-').padStart(7) + marca.padStart(4) +
      estadoDicc.padStart(6),
    );

    if (dicc && dicc.faltanEn.length) {
      console.log(`      ✗ ${dicc.faltanEn.length} clave(s) sin traducir en en.json — se ve la RUTA en pantalla:`);
      for (const k of dicc.faltanEn.slice(0, 10)) console.log(`          ${k}`);
    }
    if (dicc && dicc.castellanoEnIngles.length) {
      console.log(`      ✗ ${dicc.castellanoEnIngles.length} clave(s) con el valor inglés en castellano:`);
      for (const k of dicc.castellanoEnIngles.slice(0, 10)) console.log(`          ${k}`);
    }

    if (detalle && hallazgos.length) {
      const porArchivo = new Map();
      for (const h of hallazgos) {
        if (!porArchivo.has(h.archivo)) porArchivo.set(h.archivo, []);
        porArchivo.get(h.archivo).push(h);
      }
      for (const [arch, hs] of [...porArchivo].sort((a, b) => b[1].length - a[1].length)) {
        console.log(`\n   ${String(hs.length).padStart(4)}  ${arch}`);
        for (const h of hs) console.log(`         ${String(h.linea).padStart(5)}  [${h.familia}] ${h.texto.slice(0, 90)}`);
      }
      if (diccionariosPropios.length) {
        console.log(`\n   (aparte — diccionario bilingüe propio, NO es defecto de idioma:`);
        for (const d of diccionariosPropios) console.log(`         ${d}`);
        console.log('    son deuda: viven fuera de next-intl)');
      }
      console.log();
    }
  }

  const total = Object.values(hoy).reduce((a, b) => a + b, 0);
  console.log('─'.repeat(52));
  console.log(`total`.padEnd(24) + String(total).padStart(6));

  if (sellar) {
    fs.writeFileSync(BASE, JSON.stringify({
      nota: 'Línea base de textos en castellano en duro. Solo puede BAJAR. Se resella con: pnpm i18n:audit -- --sellar',
      sellado: new Date().toISOString().slice(0, 10),
      apps: { ...base.apps, ...hoy },
    }, null, 2) + '\n');
    console.log(`\nlínea base sellada en ${path.relative(RAIZ, BASE)}`);
    return;
  }

  if (roto) {
    console.error('\n✗ El diccionario tiene huecos: en inglés se ve la ruta cruda o texto en castellano.');
    process.exit(1);
  }
  if (subio) {
    console.error('\n✗ Subió el texto en castellano en duro.');
    console.error('  Usá next-intl en vez de escribir el texto en el .tsx.');
    console.error('  Si el aumento es legítimo, resellá: pnpm i18n:audit -- --sellar');
    process.exit(1);
  }
  console.log('\n✓ No subió.');
}

main();
