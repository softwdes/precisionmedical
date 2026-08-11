/**
 * Fechas y horas para MOSTRAR — siempre en el idioma que eligió el usuario.
 *
 * Había 124 formateos con el locale clavado a mano en el back-office: unos en
 * `'es-US'` y otros en `'en-US'`, así que la misma pantalla mezclaba los dos
 * formatos y ninguno seguía el selector EN/ES. La cabecera de visita del tab de
 * Servicios decía `LUN, 10 DE AGO DE 2026` con la app en inglés.
 *
 * Regla de Erick (2026-08-09): el formato sigue a la ubicación — en EEUU es
 * mes/día/año y en Latinoamérica día/mes/año. Eso lo resuelve el locale; lo que
 * no hay que hacer es elegirlo a mano.
 *
 * ── OJO: esto es solo PRESENTACIÓN ────────────────────────────────────────────
 * Hay formateos con locale fijo que están BIEN y no se tocan:
 *  · `Intl.DateTimeFormat('en-CA', …)` → produce `YYYY-MM-DD` y se usa como
 *    CLAVE para comparar días (la agenda busca las citas del día con eso). Si
 *    cambiara con el idioma, dejaría de encontrarlas — y sin dar ningún error.
 *  · `.formatToParts()` con `'en-US'` → extrae hora y día para llenar inputs.
 *    Es parsing, no texto para leer.
 *  · `Number.toLocaleString('en-US', { style: 'currency' })` → la clínica cobra
 *    en dólares; el formato del dinero no depende del idioma de la interfaz.
 *
 * La clínica opera en Utah, así que la zona es fija: una cita de las 9 AM es a
 * las 9 AM en la clínica, no en la zona del navegador de quien mira.
 */

export const ZONA_CLINICA = 'America/Denver';

type Locale = string | undefined;

/**
 * El locale efectivo cuando no se pasa uno.
 *
 * Los 44 archivos del back-office definen cada uno su `fmtDate` a nivel de
 * módulo, fuera de todo componente — ahí no se puede usar `useLocale()`. Pasarlo
 * por parámetro en los 67 call sites era la alternativa, y significaba tocar
 * cada componente que los llama.
 *
 * El locale ya vive en la cookie `locale` (la escribe el switch EN/ES del topbar
 * y la lee `i18n/request.ts`), así que se puede resolver sin hook. En el server
 * no hay `document`: ahí devuelve undefined y el formateo cae al default de
 * Node, que es lo mismo que hacía antes de este cambio.
 *
 * Los componentes que YA tienen el hook siguen pasando su locale y ganan: no
 * dependen de leer la cookie.
 */
export function localeApp(explicito?: Locale): Locale {
  if (explicito) return explicito;
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** `10 ago 2026` — la más usada: listas, tablas, cabeceras. */
export function fecha(iso: string | Date | null | undefined, locale?: Locale): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeApp(locale), {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA_CLINICA,
  });
}

/** `lun, 10 ago 2026` — cuando el día de la semana importa (agenda, visitas). */
export function fechaConDia(iso: string | Date | null | undefined, locale?: Locale): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeApp(locale), {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA_CLINICA,
  });
}

/** `10/08/2026` o `08/10/2026` según la ubicación — para columnas angostas. */
export function fechaCorta(iso: string | Date | null | undefined, locale?: Locale): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeApp(locale), {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA_CLINICA,
  });
}

/** `9:05 a. m.` — hora sola. */
export function hora(iso: string | Date | null | undefined, locale?: Locale): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(localeApp(locale), {
    hour: 'numeric', minute: '2-digit', timeZone: ZONA_CLINICA,
  });
}

/** `10 ago 2026, 9:05 a. m.` — fecha y hora juntas. */
export function fechaHora(iso: string | Date | null | undefined, locale?: Locale): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(localeApp(locale), {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: ZONA_CLINICA,
  });
}

/**
 * `2026-08-10` en la zona de la clínica — CLAVE de día, no texto para leer.
 *
 * Vive acá para que quede claro que su locale fijo es a propósito: es lo que
 * permite comparar "¿esta cita es de hoy?" sin que el idioma lo altere.
 */
export function claveDia(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}
