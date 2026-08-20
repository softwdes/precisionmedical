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

// ─── Fechas de CALENDARIO (sin zona) ─────────────────────────────────────────

/**
 * Una fecha de nacimiento NO lleva `ZONA_CLINICA`. Es la excepción de este
 * archivo y hay que entender por qué antes de "corregirla".
 *
 * Todo lo de arriba fija America/Denver porque son INSTANTES: una cita de las
 * 9 AM es a las 9 AM en la clínica. Un cumpleaños no es un instante, es una
 * fecha del calendario, y no tiene hora ni zona.
 *
 * La columna es `DateTime`, así que el valor llega como instante. Si se guardó
 * a medianoche UTC (`2000-01-01T00:00:00Z`), en Utah eso son las 5 de la tarde
 * del 31 de diciembre de 1999: formatearlo en Denver —o en la zona del
 * navegador, que es lo que hacían las pantallas— muestra **el día anterior**.
 * Por eso un paciente nacido el 1 de enero de 2000 aparecía como Dec 31, 1999.
 *
 * Formatear en UTC da el día correcto con las dos convenciones de guardado que
 * conviven hoy: medianoche UTC (la API de pacientes) y mediodía UTC (el diálogo
 * de caso nuevo, que ya se defendía de esto a mano).
 *
 * ⚠️ NO le agregues `timeZone: ZONA_CLINICA`. Vuelve el bug.
 */
export function fechaCalendario(iso: string | Date | null | undefined, locale?: Locale): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(localeApp(locale), {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Edad en años cumplidos, por calendario.
 *
 * Reemplaza a los seis `Math.floor(diff / (365.25 * 24 * 3600 * 1000))` que
 * había repartidos por las pantallas. Dividir por 365.25 días no es aritmética
 * de calendario: cerca del cumpleaños se equivoca por un día en un sentido o el
 * otro según cuántos bisiestos haya en el medio, y como cada pantalla tenía su
 * versión, la misma persona podía mostrar 25 en una y 26 en otra.
 *
 * Importa más de lo que parece: la edad va impresa en la nota clínica y en la
 * orden de laboratorio, que son documentos que salen de la clínica.
 *
 * Se compara en UTC por la misma razón que `fechaCalendario`: el día que vale
 * es el del calendario, no el instante.
 */
export function edad(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;

  const hoy = new Date();
  let años = hoy.getUTCFullYear() - d.getUTCFullYear();
  const mes = hoy.getUTCMonth() - d.getUTCMonth();
  // Todavía no llegó el cumpleaños de este año.
  if (mes < 0 || (mes === 0 && hoy.getUTCDate() < d.getUTCDate())) años -= 1;
  return años < 0 ? null : años;
}

/**
 * `YYYY-MM-DD` para un `<input type="date">`, leyendo el día en UTC.
 *
 * Con `getFullYear()`/`getMonth()` (hora local) un valor guardado a medianoche
 * UTC retrocede un día al abrir el formulario: la persona entra a editar otra
 * cosa, guarda, y la fecha de nacimiento queda un día antes. Cada vez.
 */
export function fechaParaInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Fecha de calendario que puede venir a medias: `YYYY` o `YYYY-MM-DD`.
 *
 * Un año suelto se devuelve tal cual. Formatearlo como fecha lo convertía en
 * "1 de enero de 2018" — un día y un mes INVENTADOS, que en un historial
 * clínico es peor que no tener el dato: el doctor lo lee como si fuera exacto.
 *
 * Lo usa el historial de cirugías, donde el formulario pide el año (una cirugía
 * de 2011 se recuerda por el año, no por el día).
 */
export function anioOFecha(iso: string | null | undefined, locale?: Locale): string {
  if (!iso) return '—';
  const v = iso.trim();
  if (/^\d{4}$/.test(v)) return v;
  return fechaCalendario(v, locale);
}
