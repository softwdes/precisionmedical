'use client';

import { useState, useMemo } from 'react';
import { cn } from '@precision/ui';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  MessageSquare, Clock, User, Search, Calendar,
} from 'lucide-react';

// ─── Types matching Prisma CallLog shape (serialized from server) ─────────────

export interface CallLogRow {
  id:             string;
  direction:      'INBOUND' | 'OUTBOUND';
  outcome:        'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'IN_PROGRESS';
  fromNumber:     string;
  toNumber:       string;
  durationSeconds: number | null;
  agentName:      string | null;
  patientName:    string | null;
  caseCode:       string | null;
  createdAt:      string;
}

interface KPIs {
  totalCalls:    number;
  answered:      number;
  noAnswer:      number;
  avgDurationSec: number;
  outbound:      number;
  inbound:       number;
}

interface Props {
  calls: CallLogRow[];
  kpis:  KPIs;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(sec: number | null) {
  if (!sec) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtDate(iso: string) {
  // Append 'Z' if no timezone info — DB stores UTC without suffix
  const utc = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  return new Date(utc).toLocaleString('es-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const OUTCOME_CONFIG = {
  ANSWERED:    { label: 'Contestó',    color: 'text-emerald bg-emerald/10 border-emerald/20' },
  NO_ANSWER:   { label: 'Sin respuesta', color: 'text-amber bg-amber/10 border-amber/20' },
  BUSY:        { label: 'Ocupado',     color: 'text-amber bg-amber/10 border-amber/20' },
  FAILED:      { label: 'Falló',       color: 'text-rose bg-rose/10 border-rose/20' },
  IN_PROGRESS: { label: 'En curso',   color: 'text-cyan bg-cyan/10 border-cyan/20' },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{label}</span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-text-1 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-text-3 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ComunicacionesClient({ calls, kpis }: Props) {
  const [search,      setSearch]      = useState('');
  const [filterDir,   setFilterDir]   = useState<'ALL' | 'INBOUND' | 'OUTBOUND'>('ALL');
  const [filterOut,   setFilterOut]   = useState<string>('ALL');
  const [filterAgent, setFilterAgent] = useState<string>('ALL');

  const agents = useMemo(() => {
    const names = calls.map(c => c.agentName).filter(Boolean) as string[];
    return Array.from(new Set(names)).sort();
  }, [calls]);

  const filtered = useMemo(() => {
    let rows = calls;
    if (filterDir   !== 'ALL') rows = rows.filter(r => r.direction === filterDir);
    if (filterOut   !== 'ALL') rows = rows.filter(r => r.outcome === filterOut);
    if (filterAgent !== 'ALL') rows = rows.filter(r => r.agentName === filterAgent);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.patientName?.toLowerCase().includes(q) ||
        r.agentName?.toLowerCase().includes(q) ||
        r.fromNumber.includes(q) ||
        r.toNumber.includes(q) ||
        r.caseCode?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [calls, search, filterDir, filterOut, filterAgent]);

  const avgFmt = kpis.avgDurationSec > 0 ? fmtDuration(Math.round(kpis.avgDurationSec)) : '—';

  return (
    <div className="p-6 space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Phone}         label="Total llamadas" value={kpis.totalCalls}  color="bg-brand/10 text-brand-text" />
        <KpiCard icon={PhoneIncoming} label="Entrantes"      value={kpis.inbound}     color="bg-cyan/10 text-cyan" />
        <KpiCard icon={PhoneOutgoing} label="Salientes"      value={kpis.outbound}    color="bg-violet/10 text-violet-text" />
        <KpiCard icon={Phone}         label="Contestadas"    value={kpis.answered}    sub={kpis.totalCalls > 0 ? `${Math.round(kpis.answered / kpis.totalCalls * 100)}%` : '—'} color="bg-emerald/10 text-emerald" />
        <KpiCard icon={PhoneMissed}   label="Sin respuesta"  value={kpis.noAnswer}    color="bg-amber/10 text-amber" />
        <KpiCard icon={Clock}         label="Duración prom." value={avgFmt}            color="bg-rose/10 text-rose" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar paciente, agente, número…"
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text-1 placeholder:text-text-3 focus:outline-none focus:border-brand/50"
          />
        </div>

        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
          {(['ALL', 'INBOUND', 'OUTBOUND'] as const).map(d => (
            <button
              key={d}
              onClick={() => setFilterDir(d)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                filterDir === d
                  ? 'bg-brand text-white'
                  : 'text-text-3 hover:text-text-1',
              )}
            >
              {d === 'ALL' ? 'Todos' : d === 'INBOUND' ? 'Entrantes' : 'Salientes'}
            </button>
          ))}
        </div>

        <select
          value={filterOut}
          onChange={e => setFilterOut(e.target.value)}
          className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-1 focus:outline-none focus:border-brand/50"
        >
          <option value="ALL">Todos los resultados</option>
          <option value="ANSWERED">Contestó</option>
          <option value="NO_ANSWER">Sin respuesta</option>
          <option value="BUSY">Ocupado</option>
          <option value="FAILED">Falló</option>
        </select>

        {agents.length > 0 && (
          <select
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
            className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-text-1 focus:outline-none focus:border-brand/50"
          >
            <option value="ALL">Todos los agentes</option>
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="w-8 h-8 text-text-3 mx-auto mb-3" />
            <p className="text-sm text-text-3">
              {calls.length === 0
                ? 'No hay llamadas registradas aún. Aparecerán aquí automáticamente cuando el equipo empiece a usar el sistema de llamadas.'
                : 'No hay llamadas que coincidan con los filtros.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3">Dirección</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3">Paciente / Número</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3">Agente</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3">Resultado</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3">Duración</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3">Caso</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(row => {
                  const outcome = OUTCOME_CONFIG[row.outcome] ?? OUTCOME_CONFIG.FAILED;
                  return (
                    <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        {row.direction === 'OUTBOUND' ? (
                          <span className="flex items-center gap-1.5 text-violet-text">
                            <PhoneOutgoing className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-medium">Saliente</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-cyan">
                            <PhoneIncoming className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-medium">Entrante</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.patientName ? (
                          <div>
                            <div className="font-medium text-text-1 text-[12.5px]">{row.patientName}</div>
                            <div className="font-mono text-[10px] text-text-3">{row.toNumber}</div>
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-text-2">{row.toNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-[12px] text-text-2">
                          <User className="w-3 h-3 text-text-3" />
                          {row.agentName ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', outcome.color)}>
                          {outcome.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[12px] text-text-2 tabular-nums">
                          {fmtDuration(row.durationSeconds)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.caseCode ? (
                          <span className="font-mono text-[11px] text-brand-text">{row.caseCode}</span>
                        ) : (
                          <span className="text-text-3 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-[11px] text-text-3">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(row.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-[11px] text-text-3 text-right">{filtered.length} llamadas mostradas</p>
      )}
    </div>
  );
}
