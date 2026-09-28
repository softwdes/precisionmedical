/**
 * El idioma del usuario para formatear fechas, leído de la cookie.
 *
 * Mismo patrón que `localeApp()` en el back-office y `localeDeFechas()` en
 * clinical, y por el mismo motivo: varios formateadores de esta app son
 * funciones sueltas a nivel de módulo —`fmtClinicDate(iso)` en
 * `metricas-shared`, exportada y usada desde varias pantallas— y desde ahí no
 * se puede llamar a `useLocale()`.
 *
 * La cookie `locale` la escribe el selector de la topbar
 * (`components/layout/topbar.tsx`, `escribirCookieIdioma`), que además la
 * sincroniza con el `preferredLocale` guardado en la base.
 *
 * ⚠️ Yo mismo tenía anotado que el Admin NO tenía selector de idioma y que por
 * eso estas fechas en castellano no eran un bug. Era viejo: el selector existe
 * desde antes del 28-sep-2026. Verificado antes de escribir esto.
 *
 * Sin `document` —render de servidor— devuelve castellano, que es lo que hacía
 * el código clavado en `es-US` antes de este cambio.
 */
export function localeDeFechas(): string {
  if (typeof document === 'undefined') return 'es-US';
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return m && decodeURIComponent(m[1]) === 'en' ? 'en-US' : 'es-US';
}
