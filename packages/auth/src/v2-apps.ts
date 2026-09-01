/**
 * Auth helpers para las apps LienMaster v2:
 *   back-office  →  Billing (Brunella + Admin + Super)
 *   clinical     →  Médicos + MA (Provider + Employee + Admin + Super)
 *   attorney     →  Portal abogados (Lawyer + Super)
 *
 * Portal de pacientes NO usa este helper — usa token-based auth propio.
 */

export type V2App = 'back-office' | 'clinical' | 'attorney';

/** Mapa: UserRole → apps permitidas */
const ROLE_APP_ACCESS: Record<string, V2App[]> = {
  SUPER_ADMIN:  ['back-office', 'clinical', 'attorney'],
  ADMIN:        ['back-office', 'clinical', 'attorney'],
  CONTADOR:     ['back-office'],
  EMPLOYEE:     ['back-office', 'clinical'],
  DOCTOR:       ['clinical'], // portal /doctor en back-office se gobierna en su middleware
  PROVIDER:     ['clinical'],
  LAWYER:       ['attorney'],
  AUDITOR_AI:   [],
};

/**
 * Devuelve true si el rol tiene acceso a la app indicada.
 * @param dbRole  Valor de UserRole tal como viene de la DB (ej: "SUPER_ADMIN")
 * @param app     Identificador de la app v2
 */
export function canAccessV2App(dbRole: string, app: V2App): boolean {
  const allowed = ROLE_APP_ACCESS[dbRole] ?? [];
  return allowed.includes(app);
}

/**
 * `users.role` (MAYÚSCULAS) → `roles_config.role` (forma interna, minúsculas).
 *
 * Casi siempre es un `toLowerCase()`, pero **`AUDITOR_AI` se llama `ia_auditor`**
 * en la tabla — invertido. Con el lowercase a secas esa fila no se encuentra y su
 * configuración se ignora en silencio. Espejo de `dbRoleToRole()` en
 * `apps/web/lib/permissions.ts`, que hace el mismo mapeo del otro lado.
 */
const ROLE_CONFIG_KEY: Record<string, string> = { AUDITOR_AI: 'ia_auditor' };

function roleConfigKey(dbRole: string): string {
  const upper = dbRole.toUpperCase();
  return ROLE_CONFIG_KEY[upper] ?? upper.toLowerCase();
}

/**
 * Verifica acceso al back-office usando la configuración dinámica en roles_config.
 * Para roles que ya tienen acceso por la matriz estática (SUPER_ADMIN, ADMIN, CONTADOR),
 * devuelve true directamente. Para el resto, consulta roles_config.permissions.pm_clinic.
 * Usar junto con caché en cookie (1h) para evitar llamadas repetidas por request.
 *
 * OJO CON EL CASE: `users.role` viene en MAYÚSCULAS (`EMPLOYEE`) y `roles_config.role`
 * guarda la forma interna en minúsculas (`employee`). Sin normalizar con
 * `roleConfigKey()` la consulta no matcheaba NUNCA y el toggle "Clinic Back-Office"
 * del panel de roles era decorativo: siempre devolvía false.
 */
export async function fetchRoleClinicAccess(dbRole: string): Promise<boolean> {
  // Roles con acceso garantizado por la matriz estática
  if (canAccessV2App(dbRole, 'back-office')) return true;

  try {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/roles_config` +
      `?select=permissions&role=eq.${encodeURIComponent(roleConfigKey(dbRole))}&limit=1`;

    const res = await fetch(url, {
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });

    if (!res.ok) return false;
    const data = (await res.json()) as Array<{ permissions?: { pm_clinic?: boolean } }>;
    return data[0]?.permissions?.pm_clinic === true;
  } catch {
    return false;
  }
}

/**
 * Menús del back-office visibles para UN USUARIO (checks por menú, por persona).
 *
 * Lee users.clinicModules (Record<módulo, boolean> | null) por email.
 * null / ausente = "Visión completa" (sin restricción — ve todos los menús).
 * Cachear en cookie (1h) igual que el resto de flags.
 */
export async function fetchUserClinicModules(email: string): Promise<Record<string, boolean> | null> {
  try {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users` +
      `?select=clinicModules&email=ilike.${encodeURIComponent(email)}&limit=1`;

    const res = await fetch(url, {
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ clinicModules?: Record<string, boolean> | null }>;
    return data[0]?.clinicModules ?? null;
  } catch {
    return null;
  }
}

/**
 * Estados que CORTAN el acceso.
 *
 * `PENDING_VERIFICATION` NO está acá a propósito: significa "todavía no puso su
 * propia contraseña", no "no debería entrar". Bloquearlo dejaría afuera a quien
 * está trabajando con una contraseña temporal recién emitida, que es un flujo
 * normal y no un problema de seguridad.
 *
 * Es el mismo conjunto que `ESTADOS_QUE_BLOQUEAN` de `users.ts`, que le pone
 * `ban_duration` en Supabase Auth. Se repite acá porque este paquete es
 * edge-safe y no puede importar de `packages/api`; si uno cambia, cambiar los
 * dos.
 */
export const BLOCKING_STATUSES = new Set(['INACTIVE', 'SUSPENDED']);

/**
 * Type guard, no un booleano suelto: dentro del `if` TypeScript ya sabe que
 * `status` es un string, así que el caller puede usarlo (para el `?reason=`)
 * sin un `!` que apague el chequeo.
 */
export function isBlockedStatus(status: string | null | undefined): status is string {
  return !!status && BLOCKING_STATUSES.has(status);
}

/**
 * Rol Y estado del usuario en una sola consulta.
 *
 * Existe porque hasta el 2026-08-31 **ninguna de las apps miraba
 * `users.status` para entrar**: el único freno era el ban de Supabase Auth que
 * pone `syncAuthStatus`, así que una cuenta marcada INACTIVE por SQL —sin pasar
 * por la pantalla de Usuarios— seguía entrando como si nada. El estado se veía
 * en la lista, no gobernaba nada.
 *
 * `status` viene `null` cuando la consulta falla o el email no está en el
 * directorio, y el caller NO debe bloquear en ese caso: un parpadeo de red no
 * puede dejar a la clínica entera afuera. El corte es explícito —el directorio
 * dijo INACTIVE/SUSPENDED— o no es.
 */
export async function fetchDbUserAccess(
  email: string,
): Promise<{ role: string; status: string | null }> {
  try {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users` +
      `?select=role,status&email=ilike.${encodeURIComponent(email)}&limit=1`;

    const res = await fetch(url, {
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });

    if (!res.ok) return { role: 'EMPLOYEE', status: null };
    const data = (await res.json()) as Array<{ role: string; status: string }>;
    return { role: data[0]?.role ?? 'EMPLOYEE', status: data[0]?.status ?? null };
  } catch {
    return { role: 'EMPLOYEE', status: null };
  }
}

/**
 * Fetch del role del usuario desde Supabase REST API.
 * Edge-safe — no usa el SDK de Supabase, solo fetch.
 * Cachear el resultado en cookie (1h) para evitar llamadas repetidas.
 */
export async function fetchDbRole(email: string): Promise<string> {
  try {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users` +
      `?select=role&email=ilike.${encodeURIComponent(email)}&limit=1`;

    const res = await fetch(url, {
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });

    if (!res.ok) return 'EMPLOYEE';
    const data = (await res.json()) as Array<{ role: string }>;
    return data[0]?.role ?? 'EMPLOYEE';
  } catch {
    return 'EMPLOYEE';
  }
}

export interface DirectoryUser {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
}

/**
 * Ficha completa de un usuario en el DIRECTORIO DE LOGINS (proyecto Admin), que
 * es distinto de la base de la app (Phoenix, vía Prisma).
 *
 * Existe porque los dos directorios están desconectados: el middleware autentica
 * contra Admin, pero las FK de la app (AuditLog.actorUserId, MessageRecipient,
 * user_activity) apuntan a `users` de Phoenix. Un usuario que solo existe en
 * Admin queda sin identidad para la app: mensajería devuelve 401 y las métricas
 * de actividad ni lo registran. Con esto se lo puede provisionar al vuelo.
 *
 * Devuelve null si no está en el directorio o si la consulta falla — el caller
 * decide qué hacer (nunca inventar un usuario).
 */
export async function fetchDirectoryUser(email: string): Promise<DirectoryUser | null> {
  try {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users` +
      `?select=email,firstName,lastName,role,status&email=ilike.${encodeURIComponent(email)}&limit=1`;

    const res = await fetch(url, {
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as DirectoryUser[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}
