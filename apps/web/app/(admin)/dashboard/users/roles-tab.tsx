'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ALL_ROLES, ROLE_META } from '@/lib/permissions';
import type { Role, ModulePerm } from '@/lib/permissions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleConfig {
  id: string;
  role: string;
  label: string;
  color: string;
  icon: string;
  description: string;
  is_system: boolean;
  permissions: {
    lm_admin: Record<string, string>;
    pm_timeclock: boolean;
    pm_clinic?:    boolean;   // Clinic Back-Office
    pm_clinical?:  boolean;   // Doctors App
    pm_attorney?:  boolean;   // Attorney Portal
  };
}

// ─── Module config for the permissions editor ────────────────────────────────

const MODULES: Array<{ key: string; label: string; specialOptions?: Array<{ value: string; label: string }> }> = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'usuarios',      label: 'Usuarios' },
  {
    key: 'empleados', label: 'Empleados',
    specialOptions: [{ value: 'payroll_only', label: 'Solo Nómina' }],
  },
  { key: 'finanzas',      label: 'Finanzas' },
  {
    key: 'metricas', label: 'Métricas',
    specialOptions: [
      { value: 'own_cases', label: 'Sus casos' },
      { value: 'own_data',  label: 'Sus datos'  },
    ],
  },
  {
    key: 'agentes_ia', label: 'Agentes IA',
    specialOptions: [{ value: 'cifo_only', label: 'Solo CIFO' }],
  },
  { key: 'configuracion', label: 'Configuración' },
];

const BASE_OPTIONS: Array<{ value: ModulePerm; label: string }> = [
  { value: 'none',  label: 'Sin acceso'    },
  { value: 'read',  label: 'Solo lectura'  },
  { value: 'write', label: 'Escritura'     },
];

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }): React.ReactElement {
  const meta = ROLE_META[role];
  const hex = meta.color;
  return (
    <span
      style={{
        background: `${hex}1a`,
        color: hex,
        border: `1px solid ${hex}40`,
        padding: '3px 9px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 500,
        display: 'inline-block',
      }}
    >
      {meta.label}
    </span>
  );
}

// ─── Role description per card ────────────────────────────────────────────────

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'Acceso total · Admin · Clinic Back-Office · Doctors App · Attorney Portal.',
  admin:       'Admin · Clinic Back-Office · Doctors App · Attorney Portal. Sin configuración.',
  contador:    'Clinic Back-Office · Nómina y Asistencia.',
  employee:    'PM Time Clock · Doctors App.',
  lawyer:      'Attorney Portal · Métricas de sus casos.',
  provider:    'Doctors App · Métricas de sus propios datos.',
  ia_auditor:  'Agentes IA y Finanzas (solo lectura).',
};

// ─── Permissions Modal ────────────────────────────────────────────────────────

function EditPermissionsModal({
  config,
  onClose,
  onSaved,
}: {
  config: RoleConfig;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  // Defaults para nuevas apps según v2-apps.ts (aplican cuando aún no hay valor en DB)
  const V2_DEFAULTS: Record<string, { clinic: boolean; clinical: boolean; attorney: boolean }> = {
    SUPER_ADMIN: { clinic: true,  clinical: true,  attorney: true  },
    ADMIN:       { clinic: true,  clinical: true,  attorney: true  },
    CONTADOR:    { clinic: true,  clinical: false, attorney: false },
    EMPLOYEE:    { clinic: false, clinical: true,  attorney: false },
    PROVIDER:    { clinic: false, clinical: true,  attorney: false },
    LAWYER:      { clinic: false, clinical: false, attorney: true  },
    AUDITOR_AI:  { clinic: false, clinical: false, attorney: false },
  };
  const v2 = V2_DEFAULTS[config.role.toUpperCase()] ?? { clinic: false, clinical: false, attorney: false };

  const [perms, setPerms] = useState<Record<string, string>>(
    { ...config.permissions.lm_admin },
  );
  const [timeclock, setTimeclock] = useState(config.permissions.pm_timeclock);
  const [clinic,    setClinic]    = useState(config.permissions.pm_clinic    ?? v2.clinic);
  const [clinical,  setClinical]  = useState(config.permissions.pm_clinical  ?? v2.clinical);
  const [attorney,  setAttorney]  = useState(config.permissions.pm_attorney  ?? v2.attorney);
  const [saving, setSaving] = useState(false);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/roles/${config.role}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            lm_admin: perms,
            pm_timeclock: timeclock,
            pm_clinic:    clinic,
            pm_clinical:  clinical,
            pm_attorney:  attorney,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Error al guardar');
      }
      toast.success('Permisos actualizados', {
        description: `Rol ${config.label} · cambios aplicados`,
      });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const getPerm = (mod: string): string => perms[mod] ?? 'none';
  const setPerm = (mod: string, val: string): void =>
    setPerms(p => ({ ...p, [mod]: val }));

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-lg rounded-2xl sm:rounded-2xl border border-border bg-bg-1 shadow-2xl overflow-hidden"
        style={{ maxHeight: '88vh' }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-[15px] font-bold text-text-1">
            Permisos — {config.label}
          </h2>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(88vh - 140px)' }}>
          {/* Warning banner */}
          <div className="mx-6 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-[11px] text-amber-400 leading-relaxed">
              Los cambios afectan a todos los usuarios con este rol inmediatamente.
            </p>
          </div>

          {/* Section 1: LM Super Admin modules */}
          <div className="px-6 mt-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-3">
              LM Super Admin — Módulos
            </p>
            <div className="space-y-1.5">
              {MODULES.map((mod) => {
                const val = getPerm(mod.key);
                const isNone = val === 'none';
                const isWrite = val === 'write';
                const options: Array<{ value: string; label: string }> = [
                  ...BASE_OPTIONS,
                  ...(mod.specialOptions ?? []),
                ];
                return (
                  <div
                    key={mod.key}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                    style={{
                      opacity: isNone ? 0.5 : 1,
                      borderLeft: isWrite ? '2px solid #6366F1' : '2px solid transparent',
                      background: isWrite ? 'rgba(99,102,241,0.04)' : 'transparent',
                    }}
                  >
                    <span className="flex-1 text-[13px] text-text-2 font-medium">{mod.label}</span>
                    <select
                      value={val}
                      onChange={e => setPerm(mod.key, e.target.value)}
                      className="rounded-md border border-border bg-bg-1 px-2 py-1.5 text-[12px] text-text-1 focus:outline-none focus:ring-1 focus:ring-brand"
                    >
                      {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: External apps */}
          <div className="px-6 mt-5 mb-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-3">
              Apps Externas
            </p>
            <div className="space-y-2">
              {([
                { key: 'timeclock', label: 'PM Time Clock',       emoji: '⏱', color: 'bg-emerald', val: timeclock, set: setTimeclock },
                { key: 'clinic',    label: 'Clinic Back-Office',  emoji: '🏥', color: 'bg-amber',   val: clinic,    set: setClinic    },
                { key: 'clinical',  label: 'Doctors App',         emoji: '🩺', color: 'bg-violet',  val: clinical,  set: setClinical  },
                { key: 'attorney',  label: 'Attorney Portal',     emoji: '⚖️', color: 'bg-brand',   val: attorney,  set: setAttorney  },
              ] as const).map(app => (
                <div key={app.key} className="flex items-center gap-3 rounded-lg border border-border bg-surface/50 px-4 py-3">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${app.color}/15`}>
                    <span className="text-[11px]">{app.emoji}</span>
                  </div>
                  <span className="flex-1 text-[13px] text-text-2 font-medium">{app.label}</span>
                  <button
                    type="button"
                    onClick={() => app.set((v: boolean) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-200 cursor-pointer ${app.val ? app.color : 'bg-border'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${app.val ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-bg-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm text-text-2 hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  config,
  userCount,
  onEdit,
}: {
  role: Role;
  config: RoleConfig | null;
  userCount: number;
  onEdit: () => void;
}): React.ReactElement {
  const meta = ROLE_META[role];
  const isSystem = config?.is_system ?? (role === 'super_admin' || role === 'ia_auditor');

  return (
    <div
      className="rounded-xl border border-border bg-surface/50 p-5 flex flex-col gap-3"
      style={{ opacity: isSystem ? 0.75 : 1 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold"
            style={{ background: `${meta.color}20`, color: meta.color }}
          >
            {meta.label.charAt(0)}
          </div>
          <div>
            <p className="text-[13px] font-bold text-text-1">{meta.label}</p>
            <p className="text-[11px] text-text-muted">
              {userCount} {userCount === 1 ? 'usuario' : 'usuarios'}
            </p>
          </div>
        </div>
        {isSystem && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-text-muted">
            No editable
          </span>
        )}
      </div>

      {/* Role badge */}
      <RoleBadge role={role} />

      {/* Description */}
      <p className="text-[11.5px] text-text-3 leading-relaxed flex-1">
        {ROLE_DESCRIPTIONS[role]}
      </p>

      {/* Edit button */}
      {!isSystem && (
        <button
          onClick={onEdit}
          className="mt-auto text-[12px] px-3 py-2 rounded-lg border border-border text-text-2 hover:bg-surface hover:text-text-1 transition-colors w-full text-center font-medium"
        >
          Editar permisos
        </button>
      )}
    </div>
  );
}

// ─── Roles Tab ────────────────────────────────────────────────────────────────

export function RolesTab(): React.ReactElement {
  const [configs, setConfigs] = useState<RoleConfig[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const fetchConfigs = useCallback(async (): Promise<void> => {
    try {
      const [rolesRes, countsRes] = await Promise.all([
        fetch('/api/roles'),
        fetch('/api/roles/counts'),
      ]);
      if (rolesRes.ok) {
        const data = await rolesRes.json() as RoleConfig[];
        setConfigs(data);
      }
      if (countsRes.ok) {
        const counts = await countsRes.json() as Record<string, number>;
        setUserCounts(counts);
      }
    } catch {
      /* silently fail, show defaults */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchConfigs(); }, [fetchConfigs]);

  const getConfig = (role: Role): RoleConfig | null =>
    configs.find(c => c.role === role) ?? null;

  const editingConfig = editingRole ? getConfig(editingRole) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-muted text-sm">
        Cargando roles…
      </div>
    );
  }

  return (
    <div className="py-5">
      {/* Grid: 3+3+1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ALL_ROLES.map(role => (
          <RoleCard
            key={role}
            role={role}
            config={getConfig(role)}
            userCount={userCounts[role] ?? 0}
            onEdit={() => setEditingRole(role)}
          />
        ))}
      </div>

      {/* Permissions modal */}
      {editingRole && editingConfig && (
        <EditPermissionsModal
          config={editingConfig}
          onClose={() => setEditingRole(null)}
          onSaved={() => { setEditingRole(null); void fetchConfigs(); }}
        />
      )}
    </div>
  );
}
