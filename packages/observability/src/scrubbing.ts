/**
 * PHI / PII scrubbing para Sentry.
 *
 * Esta es la PRIMERA capa de defensa (client-side, antes de enviar el evento).
 * La SEGUNDA capa son las reglas de Data Scrubbing del dashboard de Sentry.
 * Ambas deben estar activas — nunca confiar en una sola.
 *
 * Reglas:
 *  - Cualquier campo cuyo nombre esté en REDACT_KEYS se reemplaza por [redacted].
 *  - Strings sueltos se limpian de patrones sensibles (SSN, email, teléfono).
 *  - Cookies, headers de auth y query strings se eliminan.
 *  - IDs en rutas (UUID / numéricos) se enmascaran para no correlacionar pacientes.
 */

import type { Breadcrumb, ErrorEvent, Event } from '@sentry/nextjs';

const REDACTED = '[redacted]';

/** Nombres de campo (lowercase, sin separadores) a redactar siempre. */
const REDACT_KEYS = new Set([
  // identidad del paciente
  'name', 'firstname', 'lastname', 'fullname', 'middlename', 'patientname',
  'dob', 'dateofbirth', 'birthdate', 'birthday',
  'ssn', 'socialsecurity', 'socialsecuritynumber',
  'mrn', 'patientid', 'medicalrecordnumber',
  // contacto
  'email', 'phone', 'mobile', 'cell', 'telephone',
  'address', 'street', 'address1', 'address2', 'zip', 'zipcode', 'postalcode',
  // clínico (PHI)
  'diagnosis', 'icd', 'icd10', 'chiefcomplaint', 'complaint',
  'notes', 'soap', 'soapnote', 'clinicalnote', 'visitnote',
  'medication', 'prescription', 'rx', 'allergy', 'allergies', 'symptoms',
  // seguros / legal
  'insurance', 'policynumber', 'claimnumber', 'caseid', 'casenumber',
  // secretos técnicos
  'password', 'token', 'accesstoken', 'refreshtoken', 'authorization',
  'cookie', 'apikey', 'secret', 'serviceroleskey', 'servicerolekey',
]);

/** Patrones de texto libre que delatan PII aunque el campo no esté en la lista. */
const PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]'],                                  // SSN
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],       // email
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]'], // teléfono US
];

/** Normaliza un nombre de campo para comparar contra REDACT_KEYS. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, '');
}

/** Limpia patrones sensibles de un string. */
export function scrubText(value: string): string {
  let out = value;
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

/** Enmascara IDs en una ruta para no correlacionar pacientes entre eventos. */
export function scrubUrl(url: string): string {
  return url
    // UUID v4
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]')
    // segmentos numéricos largos
    .replace(/\/\d{4,}(?=\/|$)/g, '/[id]')
    // query string completo (puede llevar PII)
    .replace(/\?.*$/, '?[scrubbed]');
}

/** Recorre recursivamente un valor y redacta lo sensible. Evita ciclos. */
export function deepScrub<T>(input: T, seen = new WeakSet<object>()): T {
  if (typeof input === 'string') return scrubText(input) as unknown as T;
  if (input === null || typeof input !== 'object') return input;
  if (seen.has(input as object)) return input;
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) => deepScrub(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    result[key] = REDACT_KEYS.has(normalizeKey(key)) ? REDACTED : deepScrub(val, seen);
  }
  return result as unknown as T;
}

/**
 * beforeSend de Sentry: limpia el evento completo antes de enviarlo.
 * Devuelve el evento saneado (nunca null aquí — el filtrado por ruido va aparte).
 */
export function scrubEvent(event: ErrorEvent | Event): ErrorEvent {
  // mensaje principal
  if (event.message) event.message = scrubText(event.message);

  // request: cabeceras, cookies, query y body
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.query_string) event.request.query_string = '[scrubbed]';
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    if (event.request.data) event.request.data = deepScrub(event.request.data);
  }

  // datos arbitrarios y contexto
  if (event.extra) event.extra = deepScrub(event.extra);
  if (event.contexts) event.contexts = deepScrub(event.contexts);

  // usuario: conservar solo el id interno, nunca email/ip/nombre
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }

  // breadcrumbs (Event.breadcrumbs es Breadcrumb[])
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }

  return event as ErrorEvent;
}

/** beforeBreadcrumb de Sentry: limpia cada breadcrumb (o lo descarta). */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
  if (breadcrumb.data) {
    if (typeof breadcrumb.data.url === 'string') {
      breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
    }
    breadcrumb.data = deepScrub(breadcrumb.data);
  }
  return breadcrumb;
}
