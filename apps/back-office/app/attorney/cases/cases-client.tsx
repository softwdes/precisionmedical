'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import {
  PageHeader, DataTable, TagPill, StatusPill, EmptyState, Skeleton, TableFooter,
} from '@/components/ui-phoenix';
import { Input } from '@precision/ui';
import { fecha } from '@/lib/fechas';

/**
 * Portal Legal · tabla de casos.
 *
 * Búsqueda, filtro y paginación viven acá y viajan a `/api/attorney/cases`, que
 * IGNORA cualquier intento de ampliar el alcance: el bufete sale de la sesión.
 * Por eso esta pantalla no manda —ni tiene— un `firmId`.
 */

export interface FirmMember {
  id: string;
  name: string;
  role: string | null;
}

interface CaseRow {
  id: string;
  caseCode: string;
  caseType: string | null;
  status: string;
  createdAt: string;
  accidentDate: string | null;
  patient: { firstName: string; lastName: string };
  attorneyId: string | null;
  paralegalId: string | null;
  legalAssistantId: string | null;
  hasSigned: boolean;
  signatureExempt: boolean;
}

const STATUS_STATE: Record<string, 'active' | 'info' | 'warning' | 'success' | 'neutral'> = {
  NEW_REFERRAL: 'info', INTAKE_PENDING: 'info', INTAKE_COMPLETED: 'info',
  CONFIRMED: 'active', ACTIVE: 'active', MMI: 'warning',
  CLOSED: 'neutral', SETTLED: 'success', ARCHIVED: 'neutral', CANCELLED: 'neutral',
};

const STATUSES = [
  'NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED',
  'ACTIVE', 'MMI', 'CLOSED', 'SETTLED', 'ARCHIVED', 'CANCELLED',
] as const;

/** Los tres selectores filtran por el rol que le toca a cada columna. */
const ROLE_FOR_COLUMN = {
  attorneyId:       ['ATTORNEY'],
  paralegalId:      ['PARALEGAL', 'CASE_MANAGER'],
  legalAssistantId: ['LEGAL_ASSISTANT'],
} as const;

type AssignColumn = keyof typeof ROLE_FOR_COLUMN;

export function AttorneyCasesClient({
  members, canAssign,
}: {
  members: FirmMember[];
  canAssign: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);

  const [rows, setRows] = React.useState<CaseRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Debounce del buscador: sin esto cada tecla dispara una consulta.
  React.useEffect(() => {
    const id = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (debounced) qs.set('search', debounced);
      if (status) qs.set('status', status);
      const res = await fetch(`/api/attorney/cases?${qs.toString()}`);
      if (!res.ok) { setError(t('assignError')); return; }
      const data = await res.json() as { cases: CaseRow[]; total: number; pageSize: number };
      setRows(data.cases);
      setTotal(data.total);
      setPageSize(data.pageSize);
      setError(null);
    } catch {
      setError(t('assignError'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, status, t]);

  React.useEffect(() => { void load(); }, [load]);

  async function assign(caseId: string, column: AssignColumn, value: string): Promise<void> {
    // Optimista: el selector queda en el valor elegido mientras viaja el PATCH.
    // Si el server rechaza, `load()` lo devuelve al valor real — no se inventa
    // un estado que la base no confirmó.
    setRows((prev) => prev.map((r) => (r.id === caseId ? { ...r, [column]: value || null } : r)));
    try {
      const res = await fetch('/api/attorney/cases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, [column]: value || null }),
      });
      if (!res.ok) { setError(t('assignError')); void load(); }
    } catch {
      setError(t('assignError'));
      void load();
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <PageHeader title={t('casesTitle')} subtitle={t('casesSubtitle')} />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-md border border-border bg-bg-1 px-3 py-2 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-brand/40"
        >
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState.Inline message={t('noResults')} />
      ) : (
        <DataTable.Card>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('colCase')}</DataTable.Th>
                <DataTable.Th>{t('colType')}</DataTable.Th>
                <DataTable.Th>{t('colPatient')}</DataTable.Th>
                <DataTable.Th>{t('colAttorney')}</DataTable.Th>
                <DataTable.Th>{t('colParalegal')}</DataTable.Th>
                <DataTable.Th>{t('colAssistant')}</DataTable.Th>
                <DataTable.Th>{t('colSignature')}</DataTable.Th>
                <DataTable.Th>{t('colStatus')}</DataTable.Th>
                <DataTable.Th>{t('colCreated')}</DataTable.Th>
                <DataTable.Th align="right" sticky="right">
                  <span className="sr-only">{t('colCase')}</span>
                </DataTable.Th>
              </DataTable.Head>
              <tbody>
                {rows.map((c) => (
                  <DataTable.Row key={c.id}>
                    <DataTable.Td sticky="left">
                      <TagPill label={c.caseCode} mono compact colorClass="bg-brand/10 text-brand-text border-brand/20" />
                    </DataTable.Td>
                    <DataTable.Td>
                      {c.caseType ? <TagPill label={c.caseType} compact colorClass="bg-emerald/10 text-emerald border-emerald/20" /> : '—'}
                    </DataTable.Td>
                    <DataTable.Td>
                      {c.patient.lastName.toUpperCase()}, {c.patient.firstName}
                    </DataTable.Td>

                    <AssignCell caseRow={c} column="attorneyId"       members={members} canAssign={canAssign} onAssign={assign} placeholder={t('selectAttorney')} unassigned={t('unassigned')} />
                    <AssignCell caseRow={c} column="paralegalId"      members={members} canAssign={canAssign} onAssign={assign} placeholder={t('selectParalegal')} unassigned={t('unassigned')} />
                    <AssignCell caseRow={c} column="legalAssistantId" members={members} canAssign={canAssign} onAssign={assign} placeholder={t('selectAssistant')} unassigned={t('unassigned')} />

                    <DataTable.Td>
                      {c.signatureExempt
                        ? <StatusPill state="neutral" label={t('sigExempt')} />
                        : c.hasSigned
                          ? <StatusPill state="success" label={t('sigSigned')} />
                          : <StatusPill state="warning" label={t('sigPending')} />}
                    </DataTable.Td>
                    <DataTable.Td>
                      <StatusPill state={STATUS_STATE[c.status] ?? 'neutral'} label={c.status.replace(/_/g, ' ')} />
                    </DataTable.Td>
                    <DataTable.Td>
                      <span className="whitespace-nowrap">{fecha(c.createdAt)}</span>
                    </DataTable.Td>
                    <DataTable.Td align="right" sticky="right">
                      <Link href={`/attorney/cases/${c.id}`} className="text-text-muted hover:text-brand-text inline-flex">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </DataTable.Td>
                  </DataTable.Row>
                ))}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>

          <TableFooter
            left={t('casesCount', { count: total })}
            right={
              <div className="flex items-center gap-1">
                <span className="mr-2">{t('pageOf', { page, total: totalPages })}</span>
                <PagerButton disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="w-3.5 h-3.5" /></PagerButton>
                <PagerButton disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></PagerButton>
                <PagerButton disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></PagerButton>
                <PagerButton disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="w-3.5 h-3.5" /></PagerButton>
              </div>
            }
          />
        </DataTable.Card>
      )}
    </div>
  );
}

function PagerButton({
  disabled, onClick, children,
}: {
  disabled: boolean; onClick: () => void; children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-md text-text-muted hover:text-text-1 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent inline-flex items-center justify-center"
    >
      {children}
    </button>
  );
}

/**
 * Celda de asignación. Sin permiso muestra el nombre en texto — no un selector
 * deshabilitado, que sugeriría que la acción existe y está rota.
 */
function AssignCell({
  caseRow, column, members, canAssign, onAssign, placeholder, unassigned,
}: {
  caseRow: CaseRow;
  column: AssignColumn;
  members: FirmMember[];
  canAssign: boolean;
  onAssign: (caseId: string, column: AssignColumn, value: string) => Promise<void>;
  placeholder: string;
  unassigned: string;
}): React.ReactElement {
  const [saving, setSaving] = React.useState(false);
  const roles: readonly string[] = ROLE_FOR_COLUMN[column];
  const options = members.filter((m) => m.role !== null && roles.includes(m.role));
  const current = caseRow[column];

  if (!canAssign) {
    const found = members.find((m) => m.id === current);
    return <DataTable.Td>{found?.name ?? '—'}</DataTable.Td>;
  }

  return (
    <DataTable.Td>
      <div className="flex items-center gap-1.5">
        <select
          value={current ?? ''}
          disabled={saving}
          onChange={async (e) => {
            setSaving(true);
            try { await onAssign(caseRow.id, column, e.target.value); }
            finally { setSaving(false); }
          }}
          className="min-w-[150px] rounded-md border border-border bg-bg-1 px-2 py-1 text-[12.5px] text-text-1 focus:outline-none focus:ring-1 focus:ring-brand/40 disabled:opacity-50"
        >
          <option value="">{current ? unassigned : placeholder}</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {saving && <Loader2 className="w-3 h-3 text-text-muted animate-spin shrink-0" />}
      </div>
    </DataTable.Td>
  );
}
