/**
 * Campos de combinación de los snippets — los `[Patient Name]`, `[Age]`,
 * `[DOB]`, `[Sex]`, `[Phone]` e `[Insurance Details]` del editor de Medusa.
 *
 * En el CATÁLOGO el campo es un chip: `<span data-merge="patient.name">…</span>`
 * con `contenteditable="false"`, que se inserta desde la barra o aparece solo al
 * pegar el texto literal de Medusa entre corchetes. En la NOTA no existe: al
 * insertar el snippet se reemplaza por el dato del paciente de la cita, y lo
 * que queda es texto plano que el provider edita como cualquier otro. Si el
 * dato no está (paciente sin teléfono, o una pantalla que no trae el contexto),
 * queda el rótulo entre corchetes para que se vea que falta completar.
 *
 * Sin imports de servidor: lo usan el editor (cliente) y las pantallas que
 * arman el contexto del paciente.
 */

import { edad, fechaCalendario } from './fechas';

export const MERGE_FIELDS = [
  'patient.name',
  'patient.age',
  'patient.dob',
  'patient.sex',
  'patient.phone',
  'patient.insurance',
] as const;

export type MergeField = typeof MERGE_FIELDS[number];

export function isMergeField(v: unknown): v is MergeField {
  return typeof v === 'string' && (MERGE_FIELDS as readonly string[]).includes(v);
}

/**
 * Lo que escribe Medusa en el texto → nuestro campo. La comparación es sin
 * distinguir mayúsculas, porque en los snippets ya cargados aparece de las dos
 * formas ("[Patient Name]" en el panel, "[patient name]" tipeado a mano).
 */
const MEDUSA_TOKENS: Record<string, MergeField> = {
  'patient name':      'patient.name',
  'age':               'patient.age',
  'dob':               'patient.dob',
  'sex':               'patient.sex',
  'phone':             'patient.phone',
  'insurance details': 'patient.insurance',
  'insurance':         'patient.insurance',
};

// Sin `g` a propósito: un regex global guarda `lastIndex`, y `matchAll` LO
// COPIA — después de un `.test()` el recorrido arrancaba en el segundo token
// y el primer `[Patient Name]` de cada texto quedaba sin convertir.
const TOKEN_SRC = '\\[(patient name|age|dob|sex|phone|insurance details|insurance)\\]';
const TOKEN_TEST = new RegExp(TOKEN_SRC, 'i');
const tokenScanner = (): RegExp => new RegExp(TOKEN_SRC, 'gi');

/** El campo que nombra un token `[…]` de Medusa, o null si no es uno. */
export function medusaTokenField(token: string): MergeField | null {
  return MEDUSA_TOKENS[token.replace(/^\[|\]$/g, '').trim().toLowerCase()] ?? null;
}

/** HTML del chip tal como se guarda en el catálogo. `label` es el rótulo visible. */
export function mergeChipHtml(field: MergeField, label: string): string {
  return `<span data-merge="${field}" contenteditable="false">[${escapeHtml(label)}]</span>`;
}

/**
 * Convierte los tokens literales de Medusa que haya en un texto en chips, con
 * el rótulo que el llamador elija por campo (viene de i18n). Devuelve HTML.
 */
export function medusaTokensToChips(text: string, label: (f: MergeField) => string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(tokenScanner())) {
    const field = medusaTokenField(m[0]);
    out += escapeHtml(text.slice(last, m.index));
    out += field ? mergeChipHtml(field, label(field)) : escapeHtml(m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/** ¿Hay algún token de Medusa en este texto? Para no parsear lo que no lo necesita. */
export function hasMedusaTokens(text: string): boolean {
  return TOKEN_TEST.test(text);
}

// ─── Resolución en la nota ────────────────────────────────────────────────────

/** Los datos del paciente que un snippet puede pedir. null = no se sabe. */
export type SnippetMergeData = Record<MergeField, string | null>;

/**
 * Arma los datos desde el contexto del paciente que ya tienen la consulta y
 * Day Admission (`lib/patient-context.ts`). La fecha de nacimiento va con
 * `fechaCalendario`, SIN zona: con la zona de la clínica un nacido el 1-ene
 * sale 31-dic (ver la trampa en lib/fechas.ts).
 */
export function mergeDataFromPatient(p: {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  phone: string | null;
  insurance: { primaryName: string | null; primaryPolicy: string | null };
}): SnippetMergeData {
  const years = edad(p.dateOfBirth);
  const insurance = [p.insurance.primaryName, p.insurance.primaryPolicy].filter(Boolean).join(' · ');
  return {
    'patient.name':      `${p.firstName} ${p.lastName}`.trim() || null,
    'patient.age':       years === null ? null : String(years),
    'patient.dob':       p.dateOfBirth ? fechaCalendario(p.dateOfBirth) : null,
    'patient.sex':       p.sex || null,
    'patient.phone':     p.phone || null,
    'patient.insurance': insurance || null,
  };
}

/**
 * Reemplaza cada chip `data-merge` por el dato del paciente. Sin dato, deja el
 * rótulo entre corchetes como TEXTO (sin el span): en la nota no hay chips,
 * solo texto que el provider completa.
 *
 * Usa el DOM del navegador: se llama desde el editor, nunca en el servidor.
 */
export function resolveMergeFields(html: string, data: SnippetMergeData | null | undefined): string {
  if (!html.includes('data-merge')) return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll<HTMLElement>('span[data-merge]').forEach((chip) => {
    const field = chip.getAttribute('data-merge');
    const value = isMergeField(field) ? data?.[field] ?? null : null;
    chip.replaceWith(document.createTextNode(value ?? chip.textContent ?? ''));
  });
  return root.innerHTML;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
