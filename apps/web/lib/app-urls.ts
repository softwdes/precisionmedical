/**
 * URLs de las otras apps del ecosistema, en UN solo lugar.
 *
 * Nació de un bug real: cada archivo traía su propio fallback y no coincidían.
 * `middleware.ts` mandaba a los empleados a `pmtc.lienmaster.net` mientras el
 * botón "Ir a PM Time Clock" de la página sin acceso apuntaba a
 * `clock.precisionmedical.com` — un dominio que no aparece en ningún otro lado
 * del proyecto. Uno de los dos estaba mandando gente a la nada, y como son
 * fallbacks silenciosos nadie se enteraba. Si hay que cambiar un dominio ahora
 * se cambia acá y listo.
 *
 * La variable de entorno siempre gana. El fallback existe para que un deploy sin
 * configurar no deje a nadie sin destino, pero lo correcto es definirlas en
 * Vercel: son `NEXT_PUBLIC_*`, así que se resuelven en tiempo de build y un
 * cambio necesita redeploy.
 */

/** Back-Office (Clinic): pacientes, citas, admisión, facturación. */
export const BACK_OFFICE_URL =
  process.env.NEXT_PUBLIC_BACK_OFFICE_URL ?? 'https://clinic.lienmaster.net';

/** PM Time Clock: marcado de entrada y salida. */
export const TIMECLOCK_URL =
  process.env.NEXT_PUBLIC_TIMECLOCK_URL ?? 'https://pmtc.lienmaster.net';

/**
 * Portal Médico. Es la MISMA aplicación del Back-Office, pero servida por su
 * propio dominio: `apps/back-office/middleware.ts` detecta el host con
 * `/^providers?\./` y ahí solo deja pasar el mundo doctor, mandando la raíz a
 * `/doctor`. Por eso va como URL aparte y sin `/doctor` al final — el dominio ya
 * lo resuelve.
 */
export const DOCTOR_PORTAL_URL =
  process.env.NEXT_PUBLIC_DOCTOR_PORTAL_URL ?? 'https://provider.lienmaster.net';
