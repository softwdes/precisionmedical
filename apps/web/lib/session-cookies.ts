/**
 * Cookies de sesión propias de la app (las de Supabase las maneja su SDK).
 *
 * Viven acá y no en cada archivo porque las escribe el middleware y las tiene
 * que borrar el signout: si los nombres se escriben sueltos en los dos lados,
 * alcanza con una letra distinta para que el borrado deje de funcionar en
 * silencio. Es el mismo problema que tuvimos con las URLs (ver `app-urls.ts`).
 *
 * Sin imports a propósito: las usa el middleware, que corre en el Edge.
 */

/** Rol del usuario, cacheado 1h para no consultar la DB en cada request. */
export const ROLE_COOKIE = 'pm_role';

/**
 * A quién pertenece `pm_role`.
 *
 * El rol cacheado NO se puede usar sin comprobar de quién es. Sin esto, un
 * segundo login en el mismo navegador hereda el rol del usuario anterior por
 * hasta una hora — y como el ruteo por rol decide a qué app entra cada uno, eso
 * puede meter a alguien donde no le corresponde. Mismo patrón que
 * `apps/back-office/middleware.ts`, donde ya estaba resuelto.
 */
export const ROLE_EMAIL_COOKIE = 'pm_role_email';

/** Opciones comunes: 1h de vida, solo servidor. */
export const ROLE_COOKIE_OPTIONS = {
  httpOnly: true,
  path:     '/',
  maxAge:   3600,
  sameSite: 'lax',
} as const;

/** `users.status` cacheado, y a quién pertenece (mismo guard que el rol). */
export const STATUS_COOKIE       = 'pm_status';
export const STATUS_EMAIL_COOKIE = 'pm_status_email';

/**
 * 60s, no 1h.
 *
 * El rol se cachea una hora porque cambiarlo es raro y no urgente. El ESTADO es
 * la puerta: una cuenta que se suspende porque alguien se fue o pasó algo tiene
 * que quedar afuera ya. Una hora de gracia convierte la suspensión en un
 * trámite. El costo es una consulta por minuto y por usuario activo, y solo
 * cuando la cookie venció — no por request.
 */
export const STATUS_COOKIE_OPTIONS = {
  httpOnly: true,
  path:     '/',
  maxAge:   60,
  sameSite: 'lax',
} as const;
