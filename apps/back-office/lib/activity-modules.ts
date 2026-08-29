/**
 * Ruta → módulo, para el tiempo de uso por módulo de las métricas.
 *
 * El navegador manda la ruta y el mapeo se hace ACÁ, en el servidor: si el
 * cliente eligiera el nombre del módulo, cualquiera podría inventarse uno y
 * ensuciar el reporte. Además así el mapa vive en un solo lugar cuando se
 * agregue una pantalla nueva.
 *
 * Las llaves coinciden con las de `MODULE_ROUTES` del middleware donde el
 * módulo ya existía (`externals` para bufetes, no "legal"): que la misma
 * palabra signifique lo mismo en toda la app vale más que el nombre lindo.
 *
 * El orden importa: gana el primer patrón que matchea, así que lo específico
 * (`/attorney/vigia`) va antes que lo general (`/attorney`).
 */

/** Módulos que el reporte reconoce. `other` es el cajón de lo no mapeado. */
export type ActivityModule =
  | 'dashboard' | 'patients' | 'calendar' | 'admission' | 'billing'
  | 'edson' | 'intake' | 'messages' | 'externals' | 'settings'
  | 'doctor' | 'attorney' | 'vigia' | 'other';

const RULES: Array<[ActivityModule, RegExp]> = [
  // Portal legal — lo específico primero: Vigía se mide aparte porque es la
  // función de IA y su costo/uso interesa por separado.
  ['vigia',     /^\/attorney\/vigia/],
  ['attorney',  /^\/attorney/],

  ['doctor',    /^\/doctor(-print)?(\/|$)/],

  ['dashboard', /^\/dashboard/],
  // El detalle de caso vive en /front-office pero es trabajo de Pacientes
  // (mismo criterio que el middleware).
  ['patients',  /^\/(patients|front-office)/],
  ['calendar',  /^\/calendar/],
  ['admission', /^\/admission/],
  ['billing',   /^\/billing/],
  ['edson',     /^\/edson/],
  ['intake',    /^\/intake/],
  ['messages',  /^\/messages/],
  ['externals', /^\/admin\/lawyers/],
  // Catálogos + auditoría: el resto de /admin/* cae acá, igual que en el
  // check de acceso por módulo.
  ['settings',  /^\/(settings|audit-logs|admin)/],
];

/** Etiquetas para la UI del reporte. */
export const MODULE_LABELS: Record<ActivityModule, string> = {
  dashboard: 'Dashboard',
  patients:  'Pacientes',
  calendar:  'Calendario',
  admission: 'Admisión',
  billing:   'Facturación',
  edson:     'Bandeja Edson',
  intake:    'Intake',
  messages:  'Mensajería',
  externals: 'Bufetes',
  settings:  'Configuración',
  doctor:    'Portal Médico',
  attorney:  'Portal Legal',
  vigia:     'Vigía (IA)',
  other:     'Otro',
};

/**
 * Módulo de una ruta. Acepta cualquier string (viene del navegador) y nunca
 * lanza: lo que no matchea es `other`, no un error que tire el latido.
 */
export function moduleForPath(path: string | null | undefined): ActivityModule {
  if (!path) return 'other';
  // Sin query ni hash, y sin la barra final que no distingue nada.
  const clean = path.split('?')[0]!.split('#')[0]!.replace(/\/+$/, '') || '/';
  for (const [mod, re] of RULES) if (re.test(clean)) return mod;
  return 'other';
}
