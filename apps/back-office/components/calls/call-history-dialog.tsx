'use client';

/**
 * Historial de llamadas (fase 2 del plan de Twilio).
 *
 * Tres pestañas que son LA MISMA tabla con distinto `scope` contra
 * `GET /api/admin/call-logs` — no son tres vistas que mantener:
 *
 *   Recibidas y perdidas → scope=inbound         (visible a todos, con "Devolver")
 *   Mis llamadas         → scope=mine            (entrantes y salientes)
 *   Que yo contesté      → scope=answered-by-me
 *
 * "Devolver" no reimplementa la llamada: cierra este diálogo y delega en el
 * flujo de llamada que ya funciona en la lista de pacientes (confirmación →
 * llamando → resultado). Cerrar antes de delegar es a propósito — un
 * ConfirmDialog encima de este Dialog se monta en otro portal, fuera del DOM
 * del padre, y dispara el `onInteractOutside` del de abajo.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@precision/ui';
import {
  ChevronLeft,
  ChevronRight,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Undo2,
  RefreshCw,
  PhoneOff,
  SlidersHorizontal,
} from 'lucide-react';
import {
  EmptyState,
  FilterPill,
  PersonAvatar,
  StatusPill,
  TableFooter,
  TagPill,
  Skeleton,
} from '@/components/ui-phoenix';
import { formatUsPhone } from '@/lib/phone';

const CLINIC_TZ = 'America/Denver';
const PAGE_SIZE = 10;

export type CallScope = 'inbound' | 'mine' | 'answered-by-me';

export interface CallLogRow {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  outcome: 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'IN_PROGRESS';
  durationSeconds: number | null;
  createdAt: string;
  counterpartNumber: string;
  patient: {
    id: string;
    patientCode: string | null;
    firstName: string;
    lastName: string;
    phone: string | null;
  } | null;
  /** El paciente se dedujo del número, no viene vinculado en el CallLog. */
  patientMatchedByPhone: boolean;
  /** Cuántos pacientes comparten ese número (familias). Solo si se dedujo. */
  patientMatchCount: number;
  case: { id: string; caseCode: string } | null;
  agentName: string | null;
  agentIsMe: boolean;
  pendingCallback: boolean;
}

/** Filtro de resultado. `MISSED` agrupa NO_ANSWER + BUSY + FAILED en la API. */
type OutcomeFilter = 'all' | 'ANSWERED' | 'MISSED';
/** Filtro de período, en días hacia atrás. `0` = sin límite. */
type PeriodFilter = 0 | 1 | 7 | 30;

interface CallLogsResponse {
  calls: CallLogRow[];
  page: number;
  total: number;
  totalPages: number;
  counts: { inbound: number; mine: number; answeredByMe: number; missedPending: number };
}

/** A quién devolverle la llamada. `patientId` null = número sin registrar. */
export interface CallBackTarget {
  name: string;
  phone: string;
  patientId: string | null;
  caseId: string | null;
}

// ─── Helpers de presentación ─────────────────────────────────────────────────

function formatDuration(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Día del año en la zona de la clínica — para decidir "Hoy" / "Ayer". */
function clinicDayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

const MISSED_OUTCOMES = new Set(['NO_ANSWER', 'BUSY', 'FAILED']);

function outcomeState(outcome: CallLogRow['outcome']) {
  if (outcome === 'ANSWERED')    return 'success' as const;
  if (outcome === 'IN_PROGRESS') return 'info' as const;
  return 'danger' as const;
}

function initialsOf(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.length > 1 ? parts[parts.length - 1]! : '' };
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function CallHistoryDialog({
  open,
  onOpenChange,
  onCallBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCallBack: (target: CallBackTarget) => void;
}) {
  const t      = useTranslations('phoenix.calls');
  const locale = useLocale();

  const [scope, setScope]     = useState<CallScope>('inbound');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [period, setPeriod]   = useState<PeriodFilter>(0);
  const [page, setPage]       = useState(0);
  const [data, setData]       = useState<CallLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(false);

  const filtered = outcome !== 'all' || period !== 0;

  const load = useCallback(async (
    nextScope: CallScope, nextPage: number,
    nextOutcome: OutcomeFilter, nextPeriod: PeriodFilter,
  ) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({
        scope: nextScope,
        page:  String(nextPage),
        size:  String(PAGE_SIZE),
      });
      if (nextOutcome !== 'all') params.set('outcome', nextOutcome);
      if (nextPeriod !== 0) {
        // El día se corta en la zona de la clínica, no en UTC: con `1` el
        // usuario espera "hoy", y en Denver UTC ya cambió de fecha a las 17:00.
        const since = new Date(Date.now() - (nextPeriod - 1) * 86_400_000);
        params.set('from', since.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ }));
      }
      const res = await fetch(`/api/admin/call-logs?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json() as CallLogsResponse);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(scope, page, outcome, period);
  }, [open, scope, page, outcome, period, load]);

  const switchScope = (next: CallScope) => {
    if (next === scope) return;
    setScope(next);
    setPage(0);
  };

  const calls      = data?.calls ?? [];
  const counts     = data?.counts;
  const totalPages = data?.totalPages ?? 1;

  const whenLabel = (iso: string): string => {
    const d     = new Date(iso);
    const time  = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: CLINIC_TZ });
    const today = clinicDayKey(new Date());
    const yest  = clinicDayKey(new Date(Date.now() - 86_400_000));
    const day   = clinicDayKey(d);
    if (day === today) return `${t('today')} ${time}`;
    if (day === yest)  return `${t('yesterday')} ${time}`;
    return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: CLINIC_TZ })} ${time}`;
  };

  const directionLabel = (d: CallLogRow['direction']) => d === 'INBOUND' ? t('inbound') : t('outbound');

  const outcomeLabel = (o: CallLogRow['outcome']) => {
    switch (o) {
      case 'ANSWERED':    return t('outcomeAnswered');
      case 'NO_ANSWER':   return t('outcomeNoAnswer');
      case 'BUSY':        return t('outcomeBusy');
      case 'FAILED':      return t('outcomeFailed');
      case 'IN_PROGRESS': return t('outcomeInProgress');
    }
  };

  const emptySubtitle = () => {
    switch (scope) {
      case 'mine':           return t('emptyMine');
      case 'answered-by-me': return t('emptyAnsweredByMe');
      case 'inbound':        return t('emptyInbound');
    }
  };

  const callBackTargetFor = (row: CallLogRow): CallBackTarget => ({
    name: row.patient
      ? `${row.patient.firstName} ${row.patient.lastName}`.trim()
      : formatUsPhone(row.counterpartNumber),
    // Se devuelve al número que llamó, no al primario del paciente — es el que
    // la persona está usando ahora mismo.
    phone: row.counterpartNumber || row.patient?.phone || '',
    patientId: row.patient?.id ?? null,
    caseId: row.case?.id ?? null,
  });

  const handleCallBack = (row: CallLogRow) => {
    onOpenChange(false);
    onCallBack(callBackTargetFor(row));
  };

  const TABS: { key: CallScope; label: string; count?: number; alert?: boolean }[] = [
    { key: 'inbound',        label: t('tabInbound'),      count: counts?.inbound,      alert: (counts?.missedPending ?? 0) > 0 },
    { key: 'mine',           label: t('tabMine'),         count: counts?.mine },
    { key: 'answered-by-me', label: t('tabAnsweredByMe'), count: counts?.answeredByMe },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 shrink-0">
          <DialogTitle className="text-text-1 flex items-center gap-2 text-base">
            <PhoneIncoming className="w-4 h-4 text-brand" />
            {t('historyTitle')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {t('historySubtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Pestañas — mismo filtro, misma tabla */}
        <div className="flex items-center gap-1 border-b border-border px-2 sm:px-4 overflow-x-auto shrink-0">
          {TABS.map(tab => {
            const on = tab.key === scope;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchScope(tab.key)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  on ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text-1'
                }`}
              >
                {tab.label}
                {tab.count != null && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 tabular-nums font-bold ${
                    tab.alert && tab.key === 'inbound'
                      ? 'bg-rose/15 text-rose'
                      : on ? 'bg-brand/10 text-brand' : 'bg-bg-2 text-text-muted'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filtros — aplican a la pestaña activa. Pills, no un formulario:
            son 2 decisiones rápidas, no una búsqueda avanzada. */}
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">
              {t('filterOutcome')}
            </span>
            {([
              ['all',      t('filterAll')],
              ['ANSWERED', t('outcomeAnswered')],
              ['MISSED',   t('filterMissed')],
            ] as [OutcomeFilter, string][]).map(([key, label]) => (
              <FilterPill
                key={key}
                active={outcome === key}
                onClick={() => { setOutcome(key); setPage(0); }}
                label={label}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">
              {t('filterPeriod')}
            </span>
            {([
              [1,  t('filterToday')],
              [7,  t('filterDays', { n: 7 })],
              [30, t('filterDays', { n: 30 })],
              [0,  t('filterAllTime')],
            ] as [PeriodFilter, string][]).map(([key, label]) => (
              <FilterPill
                key={key}
                active={period === key}
                onClick={() => { setPeriod(key); setPage(0); }}
                label={label}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-2 pb-4">
          {loading && !data ? (
            <CallHistorySkeleton />
          ) : error ? (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-center justify-between gap-3 flex-wrap">
              <span>{t('loadError')}</span>
              <button
                type="button"
                onClick={() => void load(scope, page, outcome, period)}
                className="inline-flex items-center gap-1.5 font-semibold hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                {t('retry')}
              </button>
            </div>
          ) : calls.length === 0 ? (
            // Con filtros puestos, "Sin llamadas todavía" miente: sí las hay,
            // pero no en este recorte.
            filtered
              ? <EmptyState.Rich
                  icon={SlidersHorizontal}
                  title={t('emptyFilteredTitle')}
                  subtitle={t('emptyFilteredHint')}
                />
              : <EmptyState.Rich icon={PhoneOff} title={t('emptyTitle')} subtitle={emptySubtitle()} />
          ) : (
            <>
              {/* Desktop / tablet — tabla con la 1ra y la última columna fijas.
                  Contenedor plano (no DataTable.Card): las celdas sticky se
                  pintan con `bg-bg-0` y sobre el `bg-bg-1` de la Card quedarían
                  como una franja de otro color. */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <div className={`overflow-x-auto transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>
                    <table className="w-full text-sm min-w-[880px] table-fixed">
                      <thead>
                        <tr className="border-b border-row-sep bg-bg-2 text-text-muted text-[10px] uppercase tracking-wider">
                          <th className="sticky left-0 z-10 bg-bg-2 text-left px-4 py-2.5 font-semibold w-[230px]">{t('colWho')}</th>
                          <th className="text-left px-4 py-2.5 font-semibold w-[110px]">{t('colType')}</th>
                          <th className="text-left px-4 py-2.5 font-semibold w-[115px]">{t('colOutcome')}</th>
                          <th className="text-left px-4 py-2.5 font-semibold w-[160px]">{t('colAgent')}</th>
                          <th className="text-right px-4 py-2.5 font-semibold w-[85px]">{t('colDuration')}</th>
                          <th className="text-left px-4 py-2.5 font-semibold w-[130px]">{t('colWhen')}</th>
                          <th className="sticky right-0 z-10 bg-bg-2 text-right px-4 py-2.5 font-semibold w-[120px]">
                            <span className="sr-only">{t('colActions')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {calls.map(row => (
                          <tr key={row.id} className="border-b border-row-sep hover:bg-white/[0.02] transition-colors">
                            <td className="sticky left-0 z-10 bg-bg-0 px-4 py-2">
                              <CallerCell row={row} unknownLabel={t('unregistered')} sharedLabel={(n) => t('sharedNumber', { count: n })} />
                            </td>
                            <td className="px-4 py-2"><DirectionPill direction={row.direction} label={directionLabel(row.direction)} /></td>
                            <td className="px-4 py-2"><OutcomePill outcome={row.outcome} label={outcomeLabel(row.outcome)} /></td>
                            <td className="px-4 py-2"><AgentCell row={row} meLabel={t('me')} /></td>
                            <td className="px-4 py-2 text-right font-mono text-[11.5px] tabular-nums text-text-2">
                              {formatDuration(row.durationSeconds) ?? <span className="text-text-muted">—</span>}
                            </td>
                            <td className="px-4 py-2 text-[11px] text-text-muted whitespace-nowrap">{whenLabel(row.createdAt)}</td>
                            <td className="sticky right-0 z-10 bg-bg-0 px-4 py-2 text-right">
                              {row.pendingCallback && (
                                <button
                                  type="button"
                                  onClick={() => handleCallBack(row)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-[11px] font-semibold text-emerald hover:bg-emerald/20 transition-colors whitespace-nowrap"
                                >
                                  <Undo2 className="w-3 h-3" />
                                  {t('callBack')}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
                <TableFooter
                  left={t('footerCount', { shown: calls.length, total: data?.total ?? 0 })}
                  right={counts && counts.missedPending > 0
                    ? <span className="text-rose font-semibold">{t('footerPending', { count: counts.missedPending })}</span>
                    : undefined}
                />
              </div>

              {/* Mobile — cards: la tabla de 7 columnas no entra en 375px */}
              <ul className={`md:hidden space-y-2 transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>
                {calls.map(row => (
                  <li key={row.id} className="rounded-lg border border-border bg-bg-1 p-3 space-y-2">
                    <CallerCell row={row} unknownLabel={t('unregistered')} sharedLabel={(n) => t('sharedNumber', { count: n })} />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <DirectionPill direction={row.direction} label={directionLabel(row.direction)} />
                      <OutcomePill outcome={row.outcome} label={outcomeLabel(row.outcome)} />
                      {formatDuration(row.durationSeconds) && (
                        <span className="font-mono text-[11px] tabular-nums text-text-2">
                          {formatDuration(row.durationSeconds)}
                        </span>
                      )}
                      <span className="text-[11px] text-text-muted ml-auto">{whenLabel(row.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <AgentCell row={row} meLabel={t('me')} />
                      {row.pendingCallback && (
                        <button
                          type="button"
                          onClick={() => handleCallBack(row)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald/40 bg-emerald/10 px-2 py-1 text-[11px] font-semibold text-emerald hover:bg-emerald/20 transition-colors"
                        >
                          <Undo2 className="w-3 h-3" />
                          {t('callBack')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <nav aria-label={t('paginationNav')} className="flex items-center justify-between gap-2 pt-3">
                  <span className="text-[11px] text-text-muted" aria-live="polite">
                    {t('pageInfo', { page: page + 1, total: totalPages })}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0 || loading}
                      aria-label={t('prevPage')}
                      className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || loading}
                      aria-label={t('nextPage')}
                      className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Celdas ──────────────────────────────────────────────────────────────────

/**
 * Quién llamó. Con paciente vinculado: nombre + código + teléfono. Sin
 * vincular: el número crudo en ámbar — además de identificar la llamada,
 * señala visualmente cuáles conviene dar de alta.
 */
function CallerCell({
  row, unknownLabel, sharedLabel,
}: {
  row: CallLogRow;
  unknownLabel: string;
  /** "compartido por N pacientes" — cuando el número no identifica a uno solo. */
  sharedLabel: (n: number) => string;
}) {
  // El número de ESTA llamada, no el teléfono principal del paciente: si llamó
  // desde su segunda línea, mostrar el primario haría que la fila mienta sobre
  // qué número sonó.
  const phone = formatUsPhone(row.counterpartNumber);

  if (!row.patient) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 shrink-0 rounded-full bg-amber/20 border border-amber/40 flex items-center justify-center text-[10px] font-bold text-amber">
          ?
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[12px] text-amber truncate">{phone}</div>
          <div className="text-[10px] text-text-muted">{unknownLabel}</div>
        </div>
      </div>
    );
  }

  const shared = row.patientMatchedByPhone && row.patientMatchCount > 1;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <PersonAvatar firstName={row.patient.firstName} lastName={row.patient.lastName} size={6} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-text-1 text-[12.5px] truncate">
            {row.patient.firstName} {row.patient.lastName}
          </span>
          {/* El paciente se dedujo del número y ese número lo comparten varios
              (familias). Sin el aviso, la fila afirmaría algo que no sabemos. */}
          {shared && (
            <span
              title={sharedLabel(row.patientMatchCount)}
              className="shrink-0 rounded-full bg-amber/15 border border-amber/30 px-1.5 text-[9px] font-bold text-amber tabular-nums"
            >
              +{row.patientMatchCount - 1}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-text-muted truncate">
          {[row.patient.patientCode, phone].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );
}

function AgentCell({ row, meLabel }: { row: CallLogRow; meLabel: string }) {
  if (!row.agentName) {
    return <span className="text-text-muted text-[12px]">—</span>;
  }
  const { first, last } = initialsOf(row.agentName);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {/* Violet plano (no gradient): el sistema no tiene `gradient-violet` y
          Regla #0 prefiere fondo plano antes que inventar un token. Distingue
          al usuario que atendió del avatar brand del paciente. */}
      <PersonAvatar firstName={first} lastName={last} size={6} gradientClass="bg-violet" />
      <span className="text-[12px] text-text-2 truncate">
        {row.agentName}
        {row.agentIsMe && <span className="text-text-muted"> ({meLabel})</span>}
      </span>
    </div>
  );
}

function DirectionPill({ direction, label }: { direction: CallLogRow['direction']; label: string }) {
  return direction === 'INBOUND'
    ? <TagPill label={label} colorClass="bg-cyan/12 text-cyan border-cyan/35"   icon={<PhoneIncoming className="w-3 h-3" />} />
    : <TagPill label={label} colorClass="bg-brand/12 text-brand border-brand/35" icon={<PhoneOutgoing className="w-3 h-3" />} />;
}

function OutcomePill({ outcome, label }: { outcome: CallLogRow['outcome']; label: string }) {
  return (
    <StatusPill
      state={outcomeState(outcome)}
      label={label}
      icon={MISSED_OUTCOMES.has(outcome) ? <PhoneMissed className="w-3 h-3" /> : undefined}
    />
  );
}

function CallHistorySkeleton() {
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-row-sep px-4 py-2.5 flex items-center gap-3"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <Skeleton.Circle size={6} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-2.5 w-44" />
          </div>
          <Skeleton className="h-4 w-16 rounded-md hidden sm:block" />
          <Skeleton className="h-4 w-16 rounded-md hidden sm:block" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
