/**
 * Los mensajes viven en DOS lugares desde 2026-09-06:
 *
 *  - `packages/i18n/messages/{es,en}.json`: lo COMPARTIDO entre apps (common,
 *    providers, patients, updateBanner, phoenix.carrera, phoenix.releaseNotes).
 *  - `apps/<app>/messages/{es,en}.json`: lo propio de cada app (phoenix.* en
 *    back-office, los namespaces del admin en web, clinical en clinical).
 *
 * Por qué: Vercel redespliega cada app cuando cambia un paquete del que
 * depende. Con un solo JSON para todas, cualquier texto nuevo del portal medico
 * reconstruia tambien forms, timeclock y el admin. Con el corte, un texto del
 * back-office solo redespliega el back-office; lo compartido sigue
 * redesplegando a todos, que es lo correcto porque todos lo muestran.
 *
 * Cada app arma su catalogo con `mergeMessages(compartido, propio)`. La fusion
 * es profunda (objeto sobre objeto), asi `phoenix.carrera` del paquete y
 * `phoenix.doctor` de la app terminan bajo el mismo `phoenix`. Si una clave
 * existe en ambos, gana la de la app; no deberia pasar, y el script del corte lo
 * verifico hoja por hoja el dia del cambio.
 */
export type Messages = { [key: string]: string | Messages };

export function mergeMessages(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] =
      typeof value === 'object' && value !== null && typeof current === 'object' && current !== null
        ? mergeMessages(current, value)
        : value;
  }
  return out;
}
