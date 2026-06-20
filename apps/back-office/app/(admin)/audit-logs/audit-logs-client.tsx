'use client';

/**
 * B.44 — Visor de Audit Log
 *
 * Color de identidad: brand (indigo) — módulo de compliance/seguridad.
 * Filtros: actorType, action, entityType, fecha desde/hasta, búsqueda libre.
 * Paginación: 50 filas por página.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Search, RefreshCw, Filter, ChevronLeft, ChevronRight, User, Bot, Settings } from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix/page-header';
import { KpiCard    } from '@/components/ui-phoenix/kpi-card';
import { EmptyState  } from '@/components/ui-phoenix/empty-state';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditEntry {
  id:          string;
  actorType:   'HUMAN_USER' | 'AI_AGENT' | 'SYSTEM';
  actorUserId: string | null;
  actorRole:   string | null;
  action:      string;
  entityType:  string | null;
  entityId:    string | null;
  ipAddress:   string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata:    any;
  createdAt:   string;
}

interface Kpis {
  total:       number;
  todayCount:  number;
  humanCount:  number;
  systemCount: number;
}

interface Props {
  kpis:        Kpis;
  initialLogs: AuditEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    timeZone: 'America/Denver',
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString('es-US');
}

const ACTOR_ICON: Record<string, React.ReactNode> = {
  HUMAN_USER: <User  className="w-3 h-3" />,
  AI_AGENT:   <Bot   className="w-3 h-3" />,
  SYSTEM:     <Settings className="w-3 h-3" />,
};

const ACTOR_COLOR: Record<string, string> = {
  HUMAN_USER: 'text-brand  bg-brand/10  border-brand/20',
  AI_AGENT:   'text-violet bg-violet/10 border-violet/20',
  SYSTEM:     'text-text-muted bg-bg-2 border-border',
};

const ACTION_COLOR: Record<string, string> = {
  CREATE:     'text-emerald',
  SIGN:       'text-cyan',
  SETTLEMENT: 'text-amber',
  DELETE:     'text-rose',
  VIEW:       'text-text-muted',
  GENERATE:   'text-violet',
};

function actionColor(action: string): string {
  for (const [key, cls] of Object.entries(ACTION_COLOR)) {
    if (action.toUpperCase().includes(key)) return cls;
  }
  return 'text-text-1';
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AuditLogsClient({ kpis, initialLogs }: Props) {
  const [logs,    setLogs]    = useState<AuditEntry[]>(initialLogs);
  const [total,   setTotal]   = useState(kpis.total);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(Math.ceil(kpis.total / 50));
  const [loading, setLoading] = useState(false);

  // Filters
  const [q,          setQ]          = useState('');
  const [actorType,  setActorType]  = useState('');
  const [action,     setAction]     = useState('');
  const [entityType, setEntityType] = useState('');
  const [from,       setFrom]       = useState('');
  const [to,         setTo]         = useState('');

  // Filter options loaded from API
  const [actionOpts,     setActionOpts]     = useState<string[]>([]);
  const [entityTypeOpts, setEntityTypeOpts] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (q)          params.set('q', q);
      if (actorType)  params.set('actorType', actorType);
      if (action)     params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      if (from)       params.set('from', from);
      if (to)         params.set('to', to);

      const res  = await fetch(`/api/admin/audit-logs?${params}`);
      const data = await res.json();
      if (!data.ok) return;

      setLogs(data.logs);
      setTotal(data.total);
      setPage(data.page);
      setPages(data.pages);
      if (data.filterOptions?.actions.length)     setActionOpts(data.filterOptions.actions);
      if (data.filterOptions?.entityTypes.length) setEntityTypeOpts(data.filterOptions.entityTypes);
    } finally {
      setLoading(false);
    }
  }, [q, actorType, action, entityType, from, to]);

  // Debounce text search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLogs(1), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchLogs]);

  // Load filter options on mount
  useEffect(() => {
    fetch('/api/admin/audit-logs?limit=1').then(r => r.json()).then(d => {
      if (d.filterOptions?.actions.length)     setActionOpts(d.filterOptions.actions);
      if (d.filterOptions?.entityTypes.length) setEntityTypeOpts(d.filterOptions.entityTypes);
    });
  }, []);

  function resetFilters() {
    setQ(''); setActorType(''); setAction(''); setEntityType(''); setFrom(''); setTo('');
  }

  const hasFilters = q || actorType || action || entityType || from || to;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand" />
            Audit Log
          </span>
        }
        subtitle="Registro de actividad HIPAA — todas las acciones del sistema"
        action={
          <button
            onClick={() => fetchLogs(page)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-1 px-3 py-1.5 text-xs text-text-1 hover:bg-bg-2 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total eventos"  value={fmtNum(kpis.total)}      color="text-brand"   />
        <KpiCard label="Hoy"            value={fmtNum(kpis.todayCount)} color="text-cyan"    />
        <KpiCard label="Humanos"        value={fmtNum(kpis.humanCount)} color="text-emerald" />
        <KpiCard label="Sistema / AI"   value={fmtNum(kpis.systemCount)} color="text-violet" />
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted flex-wrap">
          <Filter className="w-3 h-3" />
          Filtros
          {hasFilters && (
            <button onClick={resetFilters} className="ml-auto text-rose hover:underline normal-case font-normal text-[10px]">
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar acción, entidad, ID…"
              className="w-full rounded-md border border-border bg-bg-2 pl-7 pr-3 py-1.5 text-xs text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand/50"
            />
          </div>

          {/* Actor Type */}
          <select
            value={actorType}
            onChange={e => setActorType(e.target.value)}
            className="rounded-md border border-border bg-bg-2 px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand/50"
          >
            <option value="">Tipo de actor</option>
            <option value="HUMAN_USER">Humano</option>
            <option value="AI_AGENT">AI Agent</option>
            <option value="SYSTEM">Sistema</option>
          </select>

          {/* Action */}
          <select
            value={action}
            onChange={e => setAction(e.target.value)}
            className="rounded-md border border-border bg-bg-2 px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand/50"
          >
            <option value="">Acción (todas)</option>
            {actionOpts.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Entity Type */}
          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            className="rounded-md border border-border bg-bg-2 px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand/50"
          >
            <option value="">Entidad (todas)</option>
            {entityTypeOpts.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          {/* From */}
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-border bg-bg-2 px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand/50"
          />

          {/* To */}
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded-md border border-border bg-bg-2 px-2 py-1.5 text-xs text-text-1 focus:outline-none focus:border-brand/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
            {fmtNum(total)} eventos
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded p-1 text-text-muted hover:text-text-1 disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-text-muted px-1">{page} / {pages}</span>
              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= pages || loading}
                className="rounded p-1 text-text-muted hover:text-text-1 disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {logs.length === 0 ? (
          <EmptyState.Rich
            icon={Shield}
            title="Sin eventos"
            subtitle="No hay eventos de auditoría que coincidan con los filtros."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold whitespace-nowrap">Fecha</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Actor</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Acción</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold">Entidad</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold hidden lg:table-cell">IP</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted font-semibold hidden xl:table-cell">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-b border-border/40 hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-bg-2/20'}`}
                  >
                    {/* Fecha */}
                    <td className="px-4 py-2.5 whitespace-nowrap text-text-muted font-mono text-[11px]">
                      {fmtDate(log.createdAt)}
                    </td>

                    {/* Actor */}
                    <td className="px-3 py-2.5">
                      <div className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${ACTOR_COLOR[log.actorType] ?? ''}`}>
                        {ACTOR_ICON[log.actorType]}
                        <span className="hidden sm:inline">{log.actorType.replace('_', ' ')}</span>
                      </div>
                      {log.actorRole && (
                        <div className="text-[10px] text-text-muted mt-0.5">{log.actorRole}</div>
                      )}
                    </td>

                    {/* Acción */}
                    <td className="px-3 py-2.5">
                      <span className={`font-mono font-semibold ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Entidad */}
                    <td className="px-3 py-2.5">
                      {log.entityType && (
                        <span className="text-text-muted">{log.entityType}</span>
                      )}
                      {log.entityId && (
                        <div className="font-mono text-[10px] text-text-muted truncate max-w-[120px]" title={log.entityId}>
                          {log.entityId}
                        </div>
                      )}
                    </td>

                    {/* IP */}
                    <td className="px-3 py-2.5 hidden lg:table-cell text-text-muted font-mono text-[10px]">
                      {log.ipAddress ?? '—'}
                    </td>

                    {/* Metadata */}
                    <td className="px-3 py-2.5 hidden xl:table-cell">
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <span className="text-[10px] text-text-muted italic line-clamp-1">
                          {Object.entries(log.metadata).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-[10px] text-text-muted">
              Página {page} de {pages} · {fmtNum(total)} eventos totales
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchLogs(1)}
                disabled={page <= 1 || loading}
                className="rounded px-2 py-1 text-[10px] text-text-muted hover:text-text-1 disabled:opacity-30"
              >
                Primera
              </button>
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded p-1 text-text-muted hover:text-text-1 disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= pages || loading}
                className="rounded p-1 text-text-muted hover:text-text-1 disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fetchLogs(pages)}
                disabled={page >= pages || loading}
                className="rounded px-2 py-1 text-[10px] text-text-muted hover:text-text-1 disabled:opacity-30"
              >
                Última
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
