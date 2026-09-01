import type { NoteLocale } from './types';

/**
 * Catalogo de modulos.
 *
 * `ReleaseEntry.module` guarda la CLAVE, no la etiqueta. Asi el nombre del
 * modulo se traduce solo y no hay que escribirlo dos veces como el texto de la
 * nota — los modulos son un conjunto cerrado que curamos nosotros, los textos
 * de las notas no.
 *
 * No viven en `packages/i18n` porque `timeclock` no usa next-intl: la API
 * resuelve la etiqueta con `moduleLabel()` y la manda ya traducida en el DTO.
 */
export const MODULE_LABELS: Record<string, Record<NoteLocale, string>> = {
  appointments: { es: 'Citas y agenda', en: 'Appointments & scheduling' },
  patients: { es: 'Pacientes', en: 'Patients' },
  cases: { es: 'Casos', en: 'Cases' },
  tracking: { es: 'Seguimiento de casos', en: 'Case tracking' },
  prescriptions: { es: 'Recetas', en: 'Prescriptions' },
  notes: { es: 'Notas clinicas', en: 'Clinical notes' },
  labs: { es: 'Laboratorios', en: 'Labs' },
  triage: { es: 'Triaje', en: 'Triage' },
  admission: { es: 'Admision', en: 'Admission' },
  visits: { es: 'Consulta', en: 'Visits' },
  billing: { es: 'Facturacion y cobros', en: 'Billing & payments' },
  catalog: { es: 'Catalogo y precios', en: 'Catalog & pricing' },
  communications: { es: 'Mensajeria y llamadas', en: 'Messaging & calls' },
  doctor: { es: 'Portal del doctor', en: 'Doctor portal' },
  attorney: { es: 'Abogados y bufetes', en: 'Attorneys & firms' },
  intake: { es: 'Formularios de admision', en: 'Intake forms' },
  clinic: { es: 'Clinica', en: 'Clinic' },
  documents: { es: 'Documentos', en: 'Documents' },
  metrics: { es: 'Metricas y reportes', en: 'Metrics & reports' },
  access: { es: 'Acceso y permisos', en: 'Access & permissions' },
  timeclock: { es: 'Marcacion de horas', en: 'Time clock' },
  interface: { es: 'Interfaz', en: 'Interface' },
  settings: { es: 'Configuracion', en: 'Settings' },
  platform: { es: 'Plataforma', en: 'Platform' },
  other: { es: 'Otros', en: 'Other' },
};

/** Fallback cuando el scope no esta mapeado o el commit no trae scope. */
export const FALLBACK_MODULE = 'other';

/**
 * Scope del commit → clave de modulo.
 *
 * Los scopes no son modulos: hay 74 distintos en el historial, con ES y EN
 * mezclados y duplicados —`rx` y `recetas`, `notes` y `nota`, `pagos` y
 * `charges` y `billing` y `finanzas`, `doctor` y `doctor-portal` y
 * `doctor-view`. Este mapa es la parte curada a mano, y lo que no cae aca
 * termina en `other` marcado para revisar.
 */
export const SCOPE_TO_MODULE: Record<string, string> = {
  // Citas
  calendar: 'appointments',
  appointments: 'appointments',
  scheduling: 'appointments',
  calendario: 'appointments',
  citas: 'appointments',
  'citas del caso': 'appointments',
  telemedicina: 'appointments',

  // Pacientes y casos
  patients: 'patients',
  cases: 'cases',
  casos: 'cases',
  'case-detail': 'cases',
  'alta de caso': 'cases',
  coverage: 'cases',
  relaciones: 'cases',
  cifrado: 'cases',
  cobertura: 'cases',
  consentimientos: 'cases',
  archivado: 'cases',
  tracking: 'tracking',

  // Clinico
  rx: 'prescriptions',
  recetas: 'prescriptions',
  notes: 'notes',
  nota: 'notes',
  'nota interna': 'notes',
  'notas sin cerrar': 'notes',
  plantillas: 'notes',
  summary: 'notes',
  diag: 'notes',
  'historial medico': 'notes',
  labs: 'labs',
  triage: 'triage',
  triaje: 'triage',
  admission: 'admission',
  admision: 'admission',
  'admision online': 'admission',
  visita: 'visits',
  'consulta online': 'visits',
  clinical: 'clinic',
  lobby: 'clinic',
  'front-office': 'clinic',

  // Plata
  billing: 'billing',
  charges: 'billing',
  pagos: 'billing',
  finanzas: 'billing',
  codes: 'billing',
  braces: 'billing',
  catalog: 'catalog',
  catalogo: 'catalog',

  // Comunicacion
  messages: 'communications',
  llamadas: 'communications',
  twilio: 'communications',
  sms: 'communications',
  email: 'communications',
  telefono: 'communications',
  'envio portal': 'communications',

  // Portales
  doctor: 'doctor',
  'doctor-portal': 'doctor',
  'doctor-view': 'doctor',
  'portal medico': 'doctor',
  'mi dia': 'doctor',
  lawyers: 'attorney',
  'portal legal': 'attorney',
  'vigía': 'attorney',
  vigia: 'attorney',
  forms: 'intake',
  intake: 'intake',

  // Documentos y reportes
  pdf: 'documents',
  impresion: 'documents',
  archivos: 'documents',
  metrics: 'metrics',
  metricas: 'metrics',
  dashboard: 'metrics',

  // Acceso
  auth: 'access',
  permissions: 'access',
  roles: 'access',
  security: 'access',
  seguridad: 'access',
  accesos: 'access',
  permisos: 'access',
  activacion: 'access',

  // Otras apps
  timeclock: 'timeclock',

  // Interfaz
  ui: 'interface',
  'ui-phoenix': 'interface',
  layout: 'interface',
  a11y: 'interface',
  branding: 'interface',
  ux: 'interface',
  tailwind: 'interface',
  i18n: 'interface',
  // Menu, barra superior, sidebar: es interfaz. Caian en `other` y el aviso
  // mostraba "OTROS" para un cambio del menu.
  nav: 'interface',
  sidebar: 'interface',
  topbar: 'interface',
  menu: 'interface',
  'menus de fila': 'interface',
  'panel flotante': 'interface',

  // Configuracion y plataforma
  settings: 'settings',
  clinicas: 'settings',
  providers: 'settings',
  database: 'settings',
  migration: 'settings',
  datos: 'settings',
  admin: 'settings',
  'back-office': 'settings',
  pwa: 'platform',
  sync: 'platform',
  webhook: 'platform',
  build: 'platform',
  'release-notes': 'platform',
  audit: 'settings',
  validacion: 'interface',
  errores: 'platform',
  fechas: 'platform',
};

export function moduleLabel(module: string, locale: NoteLocale): string {
  return MODULE_LABELS[module]?.[locale] ?? MODULE_LABELS[FALLBACK_MODULE][locale];
}

export function moduleForScope(scope: string | null): {
  module: string;
  mapped: boolean;
} {
  if (scope === null) return { module: FALLBACK_MODULE, mapped: false };
  const module = SCOPE_TO_MODULE[scope.toLowerCase()];
  return module === undefined
    ? { module: FALLBACK_MODULE, mapped: false }
    : { module, mapped: true };
}
