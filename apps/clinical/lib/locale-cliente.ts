/**
 * El idioma del usuario, leído de la cookie, sin hook.
 *
 * Existe por el mismo motivo que `localeApp()` en el back-office: los
 * formateadores de fecha de esta app son funciones sueltas a nivel de módulo
 * —`fmtTime(iso)`, llamada desde ocho lugares— y desde ahí no se puede usar
 * `useLocale()`. La alternativa era pasar el idioma por parámetro hasta el
 * fondo de cada componente cliente.
 *
 * El toggle ES/EN escribe la cookie `locale` (la misma que lee
 * `i18n/request.ts`), así que acá se puede resolver leyéndola.
 *
 * En el servidor no hay `document`: devuelve `undefined` y el formateo cae al
 * default de Node, que es lo que hacía antes de esto. Los componentes de
 * servidor usan `getLocale()` de `next-intl/server` y no pasan por acá.
 *
 * Nació el 28-sep-2026: estas pantallas tenían `es-US` clavado y mostraban las
 * fechas en castellano aunque el sistema estuviera en inglés.
 */
export function localeDeFechas(): string {
  if (typeof document === 'undefined') return 'es-US';
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return m && decodeURIComponent(m[1]) === 'en' ? 'en-US' : 'es-US';
}
