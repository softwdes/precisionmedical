// ─── Roles & Permissions — Central Source of Truth ────────────────────────────
// All role logic lives here. Components import from this file only.

// ── Types ─────────────────────────────────────────────────────────────────────

/** Internal (lowercase) role values used throughout the app */
export type Role =
  | 'super_admin'
  | 'admin'
  | 'contador'
  | 'employee'
  | 'lawyer'
  | 'provider'
  | 'ia_auditor';

/** DB-level role values (stored in users.role column) */
export type DbRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CONTADOR'
  | 'EMPLOYEE'
  | 'LAWYER'
  | 'PROVIDER'
  | 'AUDITOR_AI';

/** Per-module permission levels */
export type ModulePerm =
  | 'write'
  | 'read'
  | 'cifo_only'
  | 'payroll_only'
  | 'own_cases'
  | 'own_data'
  | 'none';

export type LmModule =
  | 'dashboard'
  | 'usuarios'
  | 'empleados'
  | 'finanzas'
  | 'metricas'
  | 'agentes_ia'
  | 'configuracion';

export interface LmAdminPerms {
  dashboard: ModulePerm;
  usuarios: ModulePerm;
  empleados: ModulePerm;
  finanzas: ModulePerm;
  metricas: ModulePerm;
  agentes_ia: ModulePerm;
  configuracion: ModulePerm;
}

export interface RolePermissions {
  lm_admin: LmAdminPerms;
  pm_timeclock: boolean;
}

// ── Role Meta (label, color, badge style) ────────────────────────────────────

export interface RoleMeta {
  label: string;
  color: string;
  dbValue: DbRole;
  accesos: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  super_admin: {
    label: 'Super Admin',
    color: '#6366F1',
    dbValue: 'SUPER_ADMIN',
    accesos: 'Acceso total',
  },
  admin: {
    label: 'Admin',
    color: '#06B6D4',
    dbValue: 'ADMIN',
    accesos: 'Dashboard · Empleados · Métricas',
  },
  contador: {
    label: 'Contador',
    color: '#F59E0B',
    dbValue: 'CONTADOR',
    accesos: 'Asistencia · Reporte Horas',
  },
  employee: {
    label: 'Empleado',
    color: '#10B981',
    dbValue: 'EMPLOYEE',
    accesos: 'PM Time Clock',
  },
  lawyer: {
    label: 'Abogado',
    color: '#F59E0B',
    dbValue: 'LAWYER',
    accesos: 'Métricas (sus casos)',
  },
  provider: {
    label: 'Proveedor',
    color: '#8B5CF6',
    dbValue: 'PROVIDER',
    accesos: 'Métricas (sus datos)',
  },
  ia_auditor: {
    label: 'IA Auditor',
    color: '#F43F5E',
    dbValue: 'AUDITOR_AI',
    accesos: 'Agentes IA · Finanzas (lectura)',
  },
};

/** All roles in display order */
export const ALL_ROLES: Role[] = [
  'super_admin',
  'admin',
  'contador',
  'employee',
  'lawyer',
  'provider',
  'ia_auditor',
];

// ── Role Conversions ──────────────────────────────────────────────────────────

/** Convert DB uppercase role value → internal lowercase role */
export function dbRoleToRole(dbRole: string): Role {
  const map: Record<string, Role> = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    CONTADOR: 'contador',
    EMPLOYEE: 'employee',
    LAWYER: 'lawyer',
    PROVIDER: 'provider',
    AUDITOR_AI: 'ia_auditor',
  };
  return map[dbRole?.toUpperCase()] ?? 'employee';
}

/** Convert internal lowercase role → DB uppercase value */
export function roleToDbRole(role: Role): DbRole {
  return ROLE_META[role].dbValue;
}

// ── Permissions Matrix ────────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  super_admin: {
    lm_admin: {
      dashboard: 'write',
      usuarios: 'write',
      empleados: 'write',
      finanzas: 'write',
      metricas: 'write',
      agentes_ia: 'write',
      configuracion: 'write',
    },
    pm_timeclock: true,
  },

  admin: {
    lm_admin: {
      dashboard: 'read',
      usuarios: 'none',
      empleados: 'write',
      finanzas: 'read',
      metricas: 'write',
      agentes_ia: 'cifo_only',
      configuracion: 'none',
    },
    pm_timeclock: true,
  },

  contador: {
    lm_admin: {
      dashboard: 'none',
      usuarios: 'none',
      empleados: 'payroll_only',
      finanzas: 'none',
      metricas: 'none',
      agentes_ia: 'none',
      configuracion: 'none',
    },
    pm_timeclock: false,
  },

  employee: {
    lm_admin: {
      dashboard: 'none',
      usuarios: 'none',
      empleados: 'none',
      finanzas: 'none',
      metricas: 'none',
      agentes_ia: 'none',
      configuracion: 'none',
    },
    pm_timeclock: true,
  },

  lawyer: {
    lm_admin: {
      dashboard: 'none',
      usuarios: 'none',
      empleados: 'none',
      finanzas: 'none',
      metricas: 'own_cases',
      agentes_ia: 'none',
      configuracion: 'none',
    },
    pm_timeclock: false,
  },

  provider: {
    lm_admin: {
      dashboard: 'none',
      usuarios: 'none',
      empleados: 'none',
      finanzas: 'none',
      metricas: 'own_data',
      agentes_ia: 'none',
      configuracion: 'none',
    },
    pm_timeclock: false,
  },

  ia_auditor: {
    lm_admin: {
      dashboard: 'none',
      usuarios: 'none',
      empleados: 'none',
      finanzas: 'read',
      metricas: 'none',
      agentes_ia: 'write',
      configuracion: 'none',
    },
    pm_timeclock: false,
  },
};

// ── Helper Functions ──────────────────────────────────────────────────────────

/** Returns true if the role has any access (not 'none') to the module */
export function can(role: Role, module: LmModule): boolean {
  return ROLE_PERMISSIONS[role].lm_admin[module] !== 'none';
}

/** Returns true if the role has write access to the module */
export function canWrite(role: Role, module: LmModule): boolean {
  return ROLE_PERMISSIONS[role].lm_admin[module] === 'write';
}

/** Returns the exact permission level for a role+module pair */
export function getPermission(role: Role, module: LmModule): ModulePerm {
  return ROLE_PERMISSIONS[role].lm_admin[module];
}

/** Returns which modules are visible (non-none) for the role */
export function visibleModules(role: Role): LmModule[] {
  return (Object.keys(ROLE_PERMISSIONS[role].lm_admin) as LmModule[]).filter(
    (mod) => ROLE_PERMISSIONS[role].lm_admin[mod] !== 'none',
  );
}

/** Returns the first accessible module for a role (for default redirect) */
export function defaultModule(role: Role): string {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return '/dashboard';
    case 'contador':
      return '/dashboard/employees?tab=asistencia';
    case 'lawyer':
    case 'provider':
      return '/dashboard/metricas';
    case 'ia_auditor':
      return '/dashboard/ai-agents';
    case 'employee':
      return process.env.NEXT_PUBLIC_TIMECLOCK_URL ?? '/dashboard';
    default:
      return '/dashboard';
  }
}
