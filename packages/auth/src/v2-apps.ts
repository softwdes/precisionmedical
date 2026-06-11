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
 * Verifica acceso al back-office usando la configuración dinámica en roles_config.
 * Para roles que ya tienen acceso por la matriz estática (SUPER_ADMIN, ADMIN, CONTADOR),
 * devuelve true directamente. Para el resto, consulta roles_config.permissions.pm_clinic.
 * Usar junto con caché en cookie (1h) para evitar llamadas repetidas por request.
 */
export async function fetchRoleClinicAccess(dbRole: string): Promise<boolean> {
  // Roles con acceso garantizado por la matriz estática
  if (canAccessV2App(dbRole, 'back-office')) return true;

  try {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/roles_config` +
      `?select=permissions&role=eq.${encodeURIComponent(dbRole)}&limit=1`;

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
 * Fetch del role del usuario desde Supabase REST API.
 * Edge-safe — no usa el SDK de Supabase, solo fetch.
 * Cachear el resultado en cookie (1h) para evitar llamadas repetidas.
 */
export async function fetchDbRole(email: string): Promise<string> {
  try {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users` +
      `?select=role&email=eq.${encodeURIComponent(email)}&limit=1`;

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
