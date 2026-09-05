/**
 * Menús del PORTAL MÉDICO gobernables por usuario.
 *
 * Vive solo y sin imports porque lo comparten dos runtimes: el middleware
 * (Edge) y los server components (Node) — misma razón que
 * `doctor-view-module.ts`.
 *
 * ## Por qué las llaves van prefijadas
 *
 * Los menús del back-office y los del portal médico conviven en el MISMO JSON
 * (`users.clinicModules`), y tres nombres chocan: `patients` y `calendar`
 * existen de los dos lados, y no son la misma pantalla —`/patients` es la lista
 * administrativa de toda la clínica y `/doctor/patients` son los pacientes de
 * ese médico—. Sin prefijo, apagarle Patients a alguien en el back-office le
 * apagaba también el menú de su portal, o al revés.
 *
 * `doctor:` no choca con la capacidad `doctor` de `doctor-view-module.ts`: son
 * cadenas distintas (`'doctor'` ≠ `'doctor:patients'`).
 *
 * ## La regla es la del back-office, NO la de las capacidades
 *
 * Se ve **salvo que esté en `false`**: un mapa nulo o sin estas llaves concede
 * todos los menús. Es lo contrario de `doctor`/`attorney`, que exigen un `true`
 * explícito — pero ahí lo que está en juego es suplantar a otra persona, y acá
 * solo qué pantallas propias ve. Un provider nuevo tiene que entrar y ver su
 * portal completo sin que nadie le configure nada.
 */

/** Prefijo de namespace. Ver el comentario de arriba. */
export const DOCTOR_MENU_PREFIX = 'doctor:';

/**
 * Ruta → llave del menú, en el orden del sidebar.
 *
 * `Mi día` (`/doctor` exacto) también se puede apagar: si se apaga, el portal
 * redirige al primer menú permitido, igual que hace el back-office con
 * `MODULE_HOME`. No se dejó fijo porque "todos por defecto y desmarcar lo que
 * no necesita" (Erick) incluye a Mi día para un provider que solo usa, por
 * ejemplo, Recetas.
 *
 * `/doctor-print/*` NO está acá a propósito: no es área del portal —se abre
 * también desde el detalle del caso, que es una pantalla administrativa— y ya
 * tiene su propia puerta en el middleware.
 */
export const DOCTOR_MENUS = [
  { key: 'myday',         href: '/doctor'                    },
  { key: 'calendar',      href: '/doctor/calendar'           },
  { key: 'patients',      href: '/doctor/patients'           },
  { key: 'prescriptions', href: '/doctor/prescriptions'      },
  { key: 'stats',         href: '/doctor/stats'              },
  // `templates` y `catalog` viven desde 2026-09-05 bajo el menú Configuración
  // (`/doctor/settings/*`), pero conservan SUS llaves: ya están guardadas en
  // `false` en `clinicModules` de usuarios reales y una llave nueva
  // (`doctor:settings`) las habría dejado sin efecto. El menú Configuración
  // se ve si se ve alguno de sus ítems — ver `DOCTOR_SETTINGS_ITEMS`.
  { key: 'templates',     href: '/doctor/settings/templates' },
  { key: 'catalog',       href: '/doctor/settings/labs'      },
] as const;

/** Raíz del menú Configuración del portal. */
export const DOCTOR_SETTINGS_HREF = '/doctor/settings';

/**
 * Ítems del menú Configuración → llave del menú que los gobierna.
 *
 * Los snippets (`/doctor/settings/snippets/<sección>`) van con `templates`:
 * son plantillas de una sección y quien administra unas administra las otras.
 * El orden es el del índice izquierdo de la pantalla.
 */
export const DOCTOR_SETTINGS_ITEMS = [
  { href: '/doctor/settings/templates', menu: 'templates' },
  { href: '/doctor/settings/snippets',  menu: 'templates' },
  { href: '/doctor/settings/labs',      menu: 'catalog'   },
] as const;

/**
 * Rutas viejas → nuevas. Redirección PERMANENTE en el middleware: los marcadores
 * y los enlaces de otras sesiones/planes siguen llegando.
 */
export const DOCTOR_LEGACY_REDIRECTS: Record<string, string> = {
  '/doctor/templates': '/doctor/settings/templates',
  '/doctor/catalog':   '/doctor/settings/labs',
};

/** Llave completa tal como se guarda en `clinicModules`. */
export function doctorMenuKey(key: string): string {
  return `${DOCTOR_MENU_PREFIX}${key}`;
}

/**
 * ¿Ve este usuario el menú? `mods` null (visión completa) o sin la llave = sí.
 *
 * Solo un `false` explícito lo apaga, que es la regla de los menús. Nunca se
 * pasa un mapa de OTRO usuario: sale de la cookie de la sesión.
 */
export function seesDoctorMenu(mods: Record<string, boolean> | null, key: string): boolean {
  return mods?.[doctorMenuKey(key)] !== false;
}

/**
 * Menú que gobierna esta ruta del portal, o null si la ruta no es un menú.
 *
 * El match es por prefijo salvo `Mi día`, que es `/doctor` EXACTO: con prefijo
 * se tragaría el portal entero y apagar Mi día dejaría a la persona sin nada.
 */
export function doctorMenuForPath(pathname: string): string | null {
  if (pathname === '/doctor') return 'myday';
  // Los ítems de Configuración primero: `/doctor/settings/snippets/*` no es un
  // href de DOCTOR_MENUS pero sí tiene menú (`templates`).
  for (const { href, menu } of DOCTOR_SETTINGS_ITEMS) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return menu;
  }
  for (const { key, href } of DOCTOR_MENUS) {
    if (href !== '/doctor' && (pathname === href || pathname.startsWith(`${href}/`))) return key;
  }
  // `/doctor/settings` EXACTO no es un menú: la página redirige al primer ítem
  // visible, y si no hay ninguno, a `/doctor`.
  return null;
}

/**
 * ¿Ve este usuario el menú Configuración? Sí si ve alguno de sus ítems. Con
 * todos apagados el menú desaparece entero, igual que cualquier otro.
 */
export function seesDoctorSettings(mods: Record<string, boolean> | null): boolean {
  return DOCTOR_SETTINGS_ITEMS.some(({ menu }) => seesDoctorMenu(mods, menu));
}

/** Primer ítem de Configuración que la persona puede ver, o null. */
export function firstVisibleSettingsHref(mods: Record<string, boolean> | null): string | null {
  return DOCTOR_SETTINGS_ITEMS.find(({ menu }) => seesDoctorMenu(mods, menu))?.href ?? null;
}
