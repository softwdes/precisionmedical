'use client';

/**
 * B.12 — Grilla de tracking de Edson.
 *
 * Réplica del Excel: una fila por caso MVA con SOLO su primera cita, agrupada
 * por día. Incluye citas pasadas (no-show, canceladas) — son las que persigue.
 *
 * Reparto de la edición (decidido con Erick sobre el mockup):
 *  · Un clic en la celda para lo rápido: PIP, completado y una entrada nueva de
 *    observaciones. Nada de doble clic: es invisible y no existe en móvil.
 *  · Modal para lo pesado (abogado, seguro, claim, adjuster, quiropráctico).
 *    Modal y NO panel lateral: todo el sistema es modal y un Sheet rompería el
 *    patrón. Como el modal tapa la fila, su encabezado repite paciente, caso,
 *    clínica y hora.
 *
 * Ver docs/plan-vista-edson.md
 */

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Search as SearchIcon, Check, ChevronLeft, ChevronRight, Pencil,
  Archive, ArchiveRestore, X, Loader2, MessageSquarePlus,
} from 'lucide-react';
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle,
         DialogDescription, DialogFooter, Label } from '@precision/ui';
import {
  PageHeader, KpiCard, FilterPill, IconAction, DataTable,
  TableFooter, EmptyState, Autocomplete, type AutoResult,
} from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { localeApp } from '@/lib/fechas';
import { apptVisual, MVA_FIRST_GLOW } from '@/lib/appointment-colors';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Row {
  caseId: string;
  caseCode: string;
  patient: { id: string; firstName: string; lastName: string; dateOfBirth: string | null; phone: string | null };
  appointment: {
    id: string; scheduledFor: string; status: string;
    clinicName: string | null; clinicColor: string | null; providerName: string | null;
  };
  lawFirmId: string | null;
  attorneyId: string | null;
  firmName: string | null;
  attorneyName: string | null;
  chiropractor: string | null;
  carrierName: string | null;
  lossDate: string | null;
  claimNum: string | null;
  pipAvailable: 'YES' | 'NO' | 'UNKNOWN';
  adjusterName: string | null;
  adjusterPhone: string | null;
  adjusterExt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  lastNote: string | null;
  lastNoteAt: string | null;
  noteCount: number;
}

interface Stats { total: number; no_pip: number; no_adjuster: number; completed: number; archivable: number }

interface Props {
  clinics:   { id: string; name: string; color: string | null }[];
  providers: { id: string; name: string }[];
  carriers:  { id: string; name: string; shortCode: string; color: string }[];
}

/** Todos los estados posibles, para el selector de filtro. */
const APPT_STATUSES = [
  'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS',
  'COMPLETED', 'PENDING', 'CANCELLED', 'NO_SHOW',
];

const PIP_CYCLE: Record<string, 'YES' | 'NO' | 'UNKNOWN'> = {
  UNKNOWN: 'YES', YES: 'NO', NO: 'UNKNOWN',
};

const DENVER = 'America/Denver';

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString(localeApp(), { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: DENVER });
}
function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: DENVER });
}
function fmtDayHeader(d: string): string {
  return new Date(d).toLocaleDateString(localeApp(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: DENVER });
}
/** Clave de agrupación: el día calendario en la zona de la clínica. */
function dayKey(d: string): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: DENVER });
}

function Empty() { return <span className="text-text-muted italic">—</span>; }

// ─── Componente ──────────────────────────────────────────────────────────────

export function EdsonClient({ clinics, providers, carriers }: Props) {
  const t  = useTranslations('phoenix.edsonTracking');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();

  const [archived, setArchived] = useState(false);
  const [q, setQ]               = useState('');
  const [qLive, setQLive]       = useState('');
  const [clinicId, setClinicId]     = useState('');
  const [providerId, setProviderId] = useState('');
  const [apptStatus, setApptStatus] = useState('');
  const [carrierId, setCarrierId]   = useState('');
  const [flag, setFlag]             = useState('');
  const [page, setPage]             = useState(1);

  const [rows, setRows]   = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, no_pip: 0, no_adjuster: 0, completed: 0, archivable: 0 });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  // Archivar saca la fila de la cola de trabajo: se confirma, como el resto de
  // las acciones que mueven algo de sitio en el sistema.
  const [confirmArchive, setConfirmArchive] = useState<Row | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  // Debounce del buscador: sin esto cada tecla dispara una consulta a Supabase.
  useEffect(() => {
    const id = setTimeout(() => { setQ(qLive); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [qLive]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const sp = new URLSearchParams({ page: String(page), size: '25', archived: String(archived) });
      if (q)          sp.set('q', q);
      if (clinicId)   sp.set('clinicId', clinicId);
      if (providerId) sp.set('providerId', providerId);
      if (apptStatus) sp.set('apptStatus', apptStatus);
      if (carrierId)  sp.set('carrierId', carrierId);
      if (flag)       sp.set('flag', flag);
      // La grilla se lee siempre por fecha de cita, más reciente primero —
      // igual que el Excel, que crece hacia abajo por jornada.
      sp.set('sort', 'appointment');
      sp.set('dir', 'desc');
      const res  = await fetch(`/api/admin/edson/tracking?${sp}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(t('errLoad')); return; }
      setRows(json.rows ?? []);
      setStats(json.stats ?? { total: 0, no_pip: 0, no_adjuster: 0, completed: 0, archivable: 0 });
      setTotalPages(json.totalPages ?? 1);
      setTotal(json.total ?? 0);
    } catch { setError(t('errLoad')); }
    finally { setLoading(false); }
  }, [page, archived, q, clinicId, providerId, apptStatus, carrierId, flag, t]);

  useEffect(() => { void load(); }, [load]);

  const anyFilter = !!(q || clinicId || providerId || apptStatus || carrierId || flag);
  function clearFilters() {
    setQLive(''); setQ(''); setClinicId(''); setProviderId('');
    setApptStatus(''); setCarrierId(''); setFlag(''); setPage(1);
  }

  /** Cambia un campo de la fila en pantalla sin recargar toda la tabla. */
  function patchRow(caseId: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => (r.caseId === caseId ? { ...r, ...patch } : r)));
  }

  async function cyclePip(row: Row) {
    const next = PIP_CYCLE[row.pipAvailable] ?? 'YES';
    patchRow(row.caseId, { pipAvailable: next });   // optimista
    const res = await fetch(`/api/admin/cases/${row.caseId}/auto-insurance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipAvailable: next }),
    });
    if (!res.ok) patchRow(row.caseId, { pipAvailable: row.pipAvailable }); // revierte
  }

  async function toggleDone(row: Row) {
    const next = row.completedAt ? null : new Date().toISOString();
    patchRow(row.caseId, { completedAt: next });
    const res = await fetch(`/api/admin/cases/${row.caseId}/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !row.completedAt }),
    });
    if (!res.ok) patchRow(row.caseId, { completedAt: row.completedAt });
  }

  async function setArchivedFlag(caseId: string, value: boolean) {
    const res = await fetch(`/api/admin/cases/${caseId}/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: value }),
    });
    if (res.ok) void load();
  }

  async function archiveReady() {
    // Solo los de la página visible: archivar a ciegas los que Edson no vio
    // sería tomarle una decisión que no tomó.
    const ready = rows.filter(r => r.completedAt && new Date(r.appointment.scheduledFor) < new Date());
    await Promise.all(ready.map(r =>
      fetch(`/api/admin/cases/${r.caseId}/tracking`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      }),
    ));
    void load();
  }

  async function addNote(caseId: string, body: string) {
    const res = await fetch(`/api/admin/cases/${caseId}/tracking/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    patchRow(caseId, {
      lastNote: json.note?.body ?? body,
      lastNoteAt: json.note?.createdAt ?? new Date().toISOString(),
      noteCount: (rows.find(r => r.caseId === caseId)?.noteCount ?? 0) + 1,
    });
    return true;
  }

  // Agrupación por día — como el Excel, que separa cada jornada.
  const groups: { key: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.appointment.scheduledFor);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.rows.push(r);
    else groups.push({ key: k, rows: [r] });
  }

  const readyToArchive = rows.filter(r => r.completedAt && new Date(r.appointment.scheduledFor) < new Date()).length;

  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[false, true].map((isArch) => (
          <button
            key={String(isArch)}
            type="button"
            onClick={() => { setArchived(isArch); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              archived === isArch
                ? 'border-amber text-amber'
                : 'border-transparent text-text-3 hover:text-text-1'
            }`}
          >
            {isArch ? t('tabArchived') : t('tabTracking')}
          </button>
        ))}
      </div>

      {!archived && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label={t('kpiTotal')}       value={stats.total}      sub={t('kpiTotalSub')}      color="text-text-1" />
          <KpiCard label={t('kpiNoPip')}       value={stats.no_pip}     sub={t('kpiNoPipSub')}      color={stats.no_pip > 0 ? 'text-amber' : 'text-text-muted'} />
          <KpiCard label={t('kpiNoAdjuster')}  value={stats.no_adjuster} sub={t('kpiNoAdjusterSub')} color={stats.no_adjuster > 0 ? 'text-rose' : 'text-text-muted'} />
          <KpiCard label={t('kpiArchivable')}  value={stats.archivable} sub={t('kpiArchivableSub')} color={stats.archivable > 0 ? 'text-emerald' : 'text-text-muted'} />
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input className="pl-9" placeholder={t('searchPlaceholder')} value={qLive} onChange={e => setQLive(e.target.value)} />
        </div>
        <select value={clinicId} onChange={e => { setClinicId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allClinics')}</option>
          {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={providerId} onChange={e => { setProviderId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allProviders')}</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={apptStatus} onChange={e => { setApptStatus(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allStatuses')}</option>
          {APPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={carrierId} onChange={e => { setCarrierId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allCarriers')}</option>
          {carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        {([
          ['noPip', t('flagNoPip')], ['noAdjuster', t('flagNoAdjuster')],
          ['noClaim', t('flagNoClaim')], ['noAttorney', t('flagNoAttorney')],
          ['completed', t('flagCompleted')], ['pending', t('flagPending')],
        ] as const).map(([k, label]) => (
          <FilterPill
            key={k}
            active={flag === k}
            label={label}
            onClick={() => { setFlag(flag === k ? '' : k); setPage(1); }}
          />
        ))}
        {anyFilter && (
          <button type="button" onClick={clearFilters} className="text-xs text-text-muted hover:text-text-1 underline underline-offset-2">
            {t('clearFilters')}
          </button>
        )}
      </div>

      {error && <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>}

      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('colPatient')}</DataTable.Th>
              <DataTable.Th>{t('colCase')}</DataTable.Th>
              <DataTable.Th>{t('colTime')}</DataTable.Th>
              <DataTable.Th>{t('colProvider')}</DataTable.Th>
              <DataTable.Th>{t('colLossDate')}</DataTable.Th>
              <DataTable.Th>{t('colAttorney')}</DataTable.Th>
              <DataTable.Th>{t('colChiropractor')}</DataTable.Th>
              <DataTable.Th>{t('colCarrier')}</DataTable.Th>
              <DataTable.Th>{t('colClaim')}</DataTable.Th>
              <DataTable.Th align="center">{t('colPip')}</DataTable.Th>
              <DataTable.Th>{t('colAdjuster')}</DataTable.Th>
              <DataTable.Th width="130px">{t('colAdjusterPhone')}</DataTable.Th>
              <DataTable.Th>{t('colObservations')}</DataTable.Th>
              <DataTable.Th align="center">{t('colDone')}</DataTable.Th>
              {archived && <DataTable.Th>{t('colArchivedAt')}</DataTable.Th>}
              <DataTable.Th align="right" sticky="right">{tc('actions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><DataTable.Td colSpan={archived ? 16 : 15}>
                  <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
                  </div>
                </DataTable.Td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><DataTable.Td colSpan={archived ? 16 : 15}>
                  <EmptyState.Inline message={archived ? t('emptyArchived') : t('empty')} />
                </DataTable.Td></tr>
              )}

              {groups.map(group => (
                <Fragment key={group.key}>
                  <tr>
                    <DataTable.Td colSpan={archived ? 16 : 15}>
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-text-3 py-0.5">
                        <span>{fmtDayHeader(group.rows[0].appointment.scheduledFor)}</span>
                        <span className="text-text-muted">
                          — {t('apptCount', { count: group.rows.length })}
                        </span>
                      </div>
                    </DataTable.Td>
                  </tr>

                  {group.rows.map(row => {
                    const done = !!row.completedAt;
                    const vis  = apptVisual(row.appointment.status);
                    return (
                      <DataTable.Row key={row.caseId} highlight={done} highlightClass="bg-emerald/[0.05]">
                        <DataTable.Td sticky="left">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-1 h-8 rounded-full shrink-0"
                              style={{
                                background: vis.background,
                                boxShadow: vis.glow ? MVA_FIRST_GLOW : undefined,
                              }}
                              title={row.appointment.status}
                            />
                            <div className="min-w-0">
                              <div
                                className="text-text-1 font-semibold truncate"
                                style={{ textDecoration: vis.strike ? 'line-through' : undefined }}
                              >
                                {row.patient.lastName}, {row.patient.firstName}
                              </div>
                              <div className="text-text-muted text-[11px] truncate font-mono">
                                {fmtDate(row.patient.dateOfBirth)}{row.patient.phone ? ` · ${row.patient.phone}` : ''}
                              </div>
                            </div>
                          </div>
                        </DataTable.Td>
                        <DataTable.Td><span className="font-mono text-xs text-text-2">{row.caseCode}</span></DataTable.Td>
                        <DataTable.Td>
                          <div className="whitespace-nowrap">
                            <span className="text-text-2">{fmtTime(row.appointment.scheduledFor)}</span>
                            {row.appointment.clinicName && (
                              <span className="flex items-center gap-1 text-[11px] text-text-muted mt-0.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ background: row.appointment.clinicColor ?? 'var(--text-muted)' }}
                                />
                                {row.appointment.clinicName}
                              </span>
                            )}
                          </div>
                        </DataTable.Td>
                        <DataTable.Td><Txt v={row.appointment.providerName} /></DataTable.Td>
                        <DataTable.Td><span className="text-text-2 whitespace-nowrap">{row.lossDate ? fmtDate(row.lossDate) : <Empty />}</span></DataTable.Td>
                        <DataTable.Td><Txt v={row.attorneyName ?? row.firmName} /></DataTable.Td>
                        <DataTable.Td><Txt v={row.chiropractor} /></DataTable.Td>
                        <DataTable.Td><Txt v={row.carrierName} /></DataTable.Td>
                        <DataTable.Td>{row.claimNum ? <span className="font-mono text-xs text-text-2">{row.claimNum}</span> : <Empty />}</DataTable.Td>
                        <DataTable.Td align="center">
                          <PipChip row={row} readOnly={archived} onCycle={() => void cyclePip(row)} />
                        </DataTable.Td>
                        <DataTable.Td><Txt v={row.adjusterName} /></DataTable.Td>
                        <DataTable.Td>
                          {row.adjusterPhone
                            ? <span className="font-mono text-xs text-text-2 whitespace-nowrap">
                                {row.adjusterPhone}{row.adjusterExt ? ` ext. ${row.adjusterExt}` : ''}
                              </span>
                            : <Empty />}
                        </DataTable.Td>
                        <DataTable.Td>
                          <NoteCell
                            row={row}
                            readOnly={archived}
                            open={noteFor === row.caseId}
                            onOpen={() => setNoteFor(row.caseId)}
                            onClose={() => setNoteFor(null)}
                            onSave={(body) => addNote(row.caseId, body)}
                          />
                        </DataTable.Td>
                        <DataTable.Td align="center">
                          {archived ? (
                            done
                              ? <Check className="w-3.5 h-3.5 text-emerald inline" strokeWidth={3} />
                              : <Empty />
                          ) : (
                            <button
                              type="button"
                              onClick={() => void toggleDone(row)}
                              title={done ? t('markUndone') : t('markDone')}
                              aria-pressed={done}
                              className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] grid place-items-center transition-colors ${
                                done ? 'bg-emerald border-emerald' : 'border-border-strong hover:border-text-3'
                              }`}
                            >
                              {done && <Check className="w-3 h-3 text-bg-0" strokeWidth={3.4} />}
                            </button>
                          )}
                        </DataTable.Td>
                        {archived && (
                          <DataTable.Td>
                            <span className="text-text-muted text-xs whitespace-nowrap">
                              {row.archivedAt ? fmtDate(row.archivedAt) : <Empty />}
                            </span>
                          </DataTable.Td>
                        )}
                        <DataTable.Td align="right" sticky="right">
                          <div className="flex items-center justify-end gap-1">
                            {archived ? (
                              <IconAction icon={ArchiveRestore} label={t('restore')} onClick={() => void setArchivedFlag(row.caseId, false)} />
                            ) : (
                              <>
                                <IconAction icon={Pencil} label={t('openCase')} onClick={() => setEditing(row)} />
                                <IconAction icon={Archive} label={t('archiveOne')} onClick={() => setConfirmArchive(row)} />
                              </>
                            )}
                          </div>
                        </DataTable.Td>
                      </DataTable.Row>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>

        <TableFooter
          left={t('showing', { shown: rows.length, total })}
          right={
            <span className="flex items-center gap-3">
              <span className="text-text-muted">{t('page', { page, pages: totalPages })}</span>
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                      className="p-1 rounded disabled:opacity-30 hover:text-text-1"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                      className="p-1 rounded disabled:opacity-30 hover:text-text-1"><ChevronRight className="w-4 h-4" /></button>
            </span>
          }
        />
      </DataTable.Card>

      {!archived && readyToArchive > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg bg-bg-1 px-4 py-3">
          <span className="text-sm text-text-2">{t('archiveBulkHint', { count: readyToArchive })}</span>
          <span className="flex-1" />
          <Button onClick={() => setConfirmBulk(true)}>
            <Archive className="w-3.5 h-3.5 mr-1" /> {t('archiveBulk', { count: readyToArchive })}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmArchive}
        variant="warning"
        title={t('confirmArchiveTitle')}
        description={t('confirmArchiveBody', {
          name: confirmArchive ? `${confirmArchive.patient.lastName}, ${confirmArchive.patient.firstName}` : '',
        })}
        confirmLabel={t('archiveOne')}
        cancelLabel={tc('cancel')}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={() => {
          const row = confirmArchive;
          setConfirmArchive(null);
          if (row) void setArchivedFlag(row.caseId, true);
        }}
      />

      <ConfirmDialog
        open={confirmBulk}
        variant="warning"
        title={t('confirmArchiveBulkTitle')}
        description={t('confirmArchiveBulkBody', { count: readyToArchive })}
        confirmLabel={t('archiveBulk', { count: readyToArchive })}
        cancelLabel={tc('cancel')}
        onCancel={() => setConfirmBulk(false)}
        onConfirm={() => { setConfirmBulk(false); void archiveReady(); }}
      />

      {editing && (
        <TrackingDialog
          row={editing}
          carriers={carriers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); router.refresh(); }}
        />
      )}
    </div>
  );
}

const selectCls =
  'bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand max-w-[190px]';

function PipChip({ row, readOnly, onCycle }: { row: Row; readOnly: boolean; onCycle: () => void }) {
  const t = useTranslations('phoenix.edsonTracking');
  const label = row.pipAvailable === 'YES' ? t('pipYes') : row.pipAvailable === 'NO' ? t('pipNo') : t('pipUnknown');
  const tone =
    row.pipAvailable === 'YES' ? 'bg-emerald/15 text-emerald border-emerald/30'
    : row.pipAvailable === 'NO' ? 'bg-rose/15 text-rose border-rose/30'
    : 'text-text-muted border-dashed border-border-strong';
  const base = `min-w-[38px] inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold border ${tone}`;

  if (readOnly) return <span className={base}>{label}</span>;
  return (
    <button type="button" onClick={onCycle} title={t('pipSet')}
            className={`${base} transition-colors hover:text-text-1`}>
      {label}
    </button>
  );
}

function Txt({ v }: { v: string | null }) {
  if (!v) return <Empty />;
  return <span className="text-text-2 truncate block max-w-[160px]" title={v}>{v}</span>;
}

// ─── Celda de observaciones ──────────────────────────────────────────────────

function NoteCell({
  row, readOnly, open, onOpen, onClose, onSave,
}: {
  row: Row;
  readOnly: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (body: string) => Promise<boolean>;
}) {
  const t = useTranslations('phoenix.edsonTracking');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) ref.current?.focus(); }, [open]);

  async function commit() {
    const body = value.trim();
    if (!body) { onClose(); return; }
    setSaving(true);
    const ok = await onSave(body);
    setSaving(false);
    if (ok) { setValue(''); onClose(); }
  }

  // En archivados la celda solo muestra: no se agregan entradas a un caso que
  // ya se cerro.
  if (readOnly) {
    if (!row.lastNote) return <Empty />;
    return (
      <div className="max-w-[240px]">
        <span className="text-[12.5px] text-text-2 line-clamp-2">
          <span className="text-text-muted font-mono">{fmtDate(row.lastNoteAt)} · </span>
          {row.lastNote}
        </span>
        {row.noteCount > 1 && (
          <span className="block text-[10.5px] text-text-muted mt-0.5">{t('noteCount', { count: row.noteCount })}</span>
        )}
      </div>
    );
  }

  if (open) {
    return (
      <div className="min-w-[220px]">
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            // Enter guarda, Shift+Enter hace salto de línea: se escriben muchas
            // entradas seguidas y llegar al botón con el mouse cada vez cansa.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commit(); }
            if (e.key === 'Escape') onClose();
          }}
          rows={2}
          disabled={saving}
          placeholder={t('newNotePlaceholder')}
          className="w-full bg-bg-2 border border-border rounded-md px-2 py-1.5 text-[12.5px] text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none"
        />
        <div className="flex items-center gap-2 mt-1">
          <button type="button" onClick={() => void commit()} disabled={saving}
                  className="text-[11px] text-brand-text hover:underline disabled:opacity-50">{t('saveNote')}</button>
          <button type="button" onClick={onClose} className="text-[11px] text-text-muted hover:text-text-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={t('addNote')}
      className="text-left max-w-[240px] w-full group/note"
    >
      {row.lastNote ? (
        <>
          <span className="text-[12.5px] text-text-2 line-clamp-2">
            <span className="text-text-muted font-mono">{fmtDate(row.lastNoteAt)} · </span>
            {row.lastNote}
          </span>
          {row.noteCount > 1 && (
            <span className="block text-[10.5px] text-text-muted mt-0.5">{t('noteCount', { count: row.noteCount })}</span>
          )}
        </>
      ) : (
        <span className="text-[12px] text-text-muted italic flex items-center gap-1 opacity-0 group-hover/note:opacity-100 focus:opacity-100">
          <MessageSquarePlus className="w-3 h-3" /> {t('addNote')}
        </span>
      )}
    </button>
  );
}

// ─── Modal de edición ────────────────────────────────────────────────────────

interface AdjusterOpt { id: string; name: string; phone: string | null; extension: string | null }

function TrackingDialog({
  row, carriers, onClose, onSaved,
}: {
  row: Row;
  carriers: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t  = useTranslations('phoenix.edsonTracking');
  const tc = useTranslations('phoenix.common');

  const [carrierId, setCarrierId] = useState('');
  const [claimNum, setClaimNum]   = useState(row.claimNum ?? '');
  const [lossDate, setLossDate]   = useState(row.lossDate ? row.lossDate.slice(0, 10) : '');
  const [pip, setPip]             = useState<'YES' | 'NO' | 'UNKNOWN'>(row.pipAvailable);
  const [adjusterId, setAdjusterId] = useState('');
  const [chiropractor, setChiro]  = useState(row.chiropractor ?? '');
  // El bufete manda sobre el abogado: los abogados se buscan DENTRO del bufete,
  // que es como estan modelados (`Lawyer.parentFirmId`) y como ya lo hace el
  // wizard de alta de caso. Cambiar de bufete limpia el abogado a proposito.
  const [lawFirm, setLawFirm] = useState<AutoResult | null>(
    row.lawFirmId ? { id: row.lawFirmId, label: row.firmName ?? '—' } : null,
  );
  const [attorney, setAttorney] = useState<AutoResult | null>(
    row.attorneyId ? { id: row.attorneyId, label: row.attorneyName ?? '—' } : null,
  );
  const [adjusters, setAdjusters] = useState<AdjusterOpt[]>([]);
  const [notes, setNotes] = useState<{ id: string; body: string; authorName: string | null; createdAt: string }[]>([]);
  const [newNote, setNewNote] = useState('');
  // Mismo dato que el check de la grilla (`CaseTracking.completedAt`): es el
  // acto de Edson diciendo "ya tengo todo, esto pasa a facturación". No es un
  // tercer estado, es el mismo con el nombre que de verdad tiene.
  const [readyForBrunella, setReadyForBrunella] = useState(!!row.completedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Carga el detalle al abrir: la grilla trae solo lo que se ve en la fila.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ai, tr] = await Promise.all([
        fetch(`/api/admin/cases/${row.caseId}/auto-insurance`).then(r => r.json()).catch(() => null),
        fetch(`/api/admin/cases/${row.caseId}/tracking`).then(r => r.json()).catch(() => null),
      ]);
      if (cancelled) return;
      if (ai?.autoInsurance) {
        setCarrierId(ai.autoInsurance.carrierId ?? '');
        setAdjusterId(ai.autoInsurance.adjusterId ?? '');
      }
      if (tr?.notes) setNotes(tr.notes);
    })();
    return () => { cancelled = true; };
  }, [row.caseId]);

  // Los adjusters se filtran por la aseguradora elegida: mostrarle a Edson los
  // de otras compañías es ruido, y elegir uno equivocado es un error real.
  useEffect(() => {
    if (!carrierId) { setAdjusters([]); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/adjusters/by-carrier?carrierId=${encodeURIComponent(carrierId)}`);
      const json = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) setAdjusters(json.adjusters ?? []);
    })();
    return () => { cancelled = true; };
  }, [carrierId]);

  async function save() {
    setSaving(true); setError('');
    try {
      const r1 = await fetch(`/api/admin/cases/${row.caseId}/auto-insurance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrierId: carrierId || null,
          claimNum: claimNum.trim() || null,
          lossDate: lossDate || null,
          pipAvailable: pip,
          adjusterId: adjusterId || null,
        }),
      });
      if (!r1.ok) { setError(t('errSave')); return; }

      // El quiropractico, el bufete y el abogado viven en el caso, no en el
      // seguro — y se mandan en UN solo PATCH para no dejar el caso a medias si
      // la segunda llamada falla.
      const casePatch: Record<string, unknown> = {};
      if ((row.chiropractor ?? '') !== chiropractor) casePatch.chiropractor = chiropractor.trim() || null;
      if ((row.lawFirmId ?? null) !== (lawFirm?.id ?? null)) casePatch.lawFirmId = lawFirm?.id ?? null;
      if ((row.attorneyId ?? null) !== (attorney?.id ?? null)) casePatch.attorneyId = attorney?.id ?? null;
      if (Object.keys(casePatch).length > 0) {
        const r2 = await fetch(`/api/admin/cases/${row.caseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(casePatch),
        });
        if (!r2.ok) { setError(t('errSave')); return; }
      }

      if (newNote.trim()) {
        await fetch(`/api/admin/cases/${row.caseId}/tracking/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: newNote.trim() }),
        });
      }

      if (readyForBrunella !== !!row.completedAt) {
        await fetch(`/api/admin/cases/${row.caseId}/tracking`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: readyForBrunella }),
        });
      }
      onSaved();
    } catch { setError(t('errSave')); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row.patient.lastName}, {row.patient.firstName}</DialogTitle>
          <DialogDescription>
            {t('modalSubtitle', {
              caseCode: row.caseCode,
              clinic: row.appointment.clinicName ?? '—',
              date: `${fmtDate(row.appointment.scheduledFor)} ${fmtTime(row.appointment.scheduledFor)}`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="text-amber text-[10.5px] uppercase tracking-wider font-semibold">{t('groupLegal')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t('fieldFirm')}</Label>
              <Autocomplete
                endpoint="/api/admin/lawyers/autocomplete"
                placeholder={t('fieldFirmPlaceholder')}
                selected={lawFirm}
                onSelect={(r) => { setLawFirm(r); setAttorney(null); }}
              />
            </div>
            <div>
              <Label>{t('fieldAttorney')}</Label>
              {lawFirm ? (
                <Autocomplete
                  endpoint="/api/admin/lawyers/autocomplete"
                  extraParams={{ firmId: lawFirm.id }}
                  placeholder={t('fieldAttorneyPlaceholder')}
                  selected={attorney}
                  onSelect={setAttorney}
                />
              ) : (
                <div className="bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-muted italic">
                  {t('fieldAttorneyNeedsFirm')}
                </div>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="tr-chiro">{t('fieldChiropractor')}</Label>
            <Input id="tr-chiro" value={chiropractor} onChange={e => setChiro(e.target.value)} />
          </div>

          <div className="text-amber text-[10.5px] uppercase tracking-wider font-semibold pt-2">{t('groupInsurance')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tr-carrier">{t('fieldCarrier')}</Label>
              <select id="tr-carrier" value={carrierId} onChange={e => { setCarrierId(e.target.value); setAdjusterId(''); }}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                <option value="">{row.carrierName ? `${row.carrierName} (${t('fromCase')})` : '—'}</option>
                {carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="tr-loss">{t('fieldLossDate')}</Label>
              <input id="tr-loss" type="date" value={lossDate} onChange={e => setLossDate(e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 [color-scheme:dark] focus:outline-none focus:border-brand" />
            </div>
            <div>
              <Label htmlFor="tr-claim">{t('fieldClaim')}</Label>
              <Input id="tr-claim" value={claimNum} onChange={e => setClaimNum(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tr-pip">{t('fieldPip')}</Label>
              <select id="tr-pip" value={pip} onChange={e => setPip(e.target.value as 'YES' | 'NO' | 'UNKNOWN')}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                <option value="UNKNOWN">— {t('kpiNoPipSub')}</option>
                <option value="YES">Y</option>
                <option value="NO">N</option>
              </select>
            </div>
          </div>

          <div className="text-amber text-[10.5px] uppercase tracking-wider font-semibold pt-2">{t('groupAdjuster')}</div>
          <div>
            <Label htmlFor="tr-adj">{t('fieldAdjuster')}</Label>
            <select id="tr-adj" value={adjusterId} onChange={e => setAdjusterId(e.target.value)}
                    disabled={!carrierId}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand disabled:opacity-50">
              <option value="">{t('fieldAdjusterNone')}</option>
              {adjusters.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.phone ? ` — ${a.phone}${a.extension ? ` ext. ${a.extension}` : ''}` : ''}
                </option>
              ))}
            </select>
            {row.adjusterName && !adjusterId && (
              <p className="text-[11px] text-text-muted mt-1">{t('fieldAdjusterFree', { name: row.adjusterName })}</p>
            )}
          </div>

          <div className="text-amber text-[10.5px] uppercase tracking-wider font-semibold pt-2">{t('groupNotes')}</div>
          <div className="space-y-2.5">
            {notes.length === 0 && <p className="text-[12px] text-text-muted italic">{t('noNotes')}</p>}
            {notes.map(n => (
              <div key={n.id} className="border-l-2 border-border-strong pl-3">
                <div className="text-[11px] text-text-muted font-mono">
                  {fmtDate(n.createdAt)} {fmtTime(n.createdAt)}{n.authorName ? ` · ${n.authorName}` : ''}
                </div>
                <div className="text-[12.5px] text-text-2 whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
          </div>
          <div>
            <Label htmlFor="tr-note">{t('newNote')}</Label>
            <textarea id="tr-note" rows={2} value={newNote} onChange={e => setNewNote(e.target.value)}
                      placeholder={t('newNotePlaceholder')}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none" />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer rounded-lg bg-bg-1 px-3 py-2.5 mt-2">
            <input
              type="checkbox"
              checked={readyForBrunella}
              onChange={e => setReadyForBrunella(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald mt-0.5 shrink-0"
            />
            <span>
              <span className="text-sm text-text-1 font-medium">{t('readyForBrunella')}</span>
              <span className="block text-[11px] text-text-muted">{t('readyForBrunellaHint')}</span>
            </span>
          </label>

          {error && <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>{tc('cancel')}</Button>
          <Button className="w-full sm:w-auto" onClick={() => void save()} disabled={saving}>
            {saving ? tc('saving') : tc('saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
