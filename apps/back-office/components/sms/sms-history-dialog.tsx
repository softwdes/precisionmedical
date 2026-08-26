'use client';

/**
 * Historial de SMS enviados.
 *
 * Hermano del historial de llamadas, con una diferencia clave: acá la columna
 * que importa es el ESTADO DE ENTREGA. Un SMS "enviado" no es un SMS recibido —
 * Twilio responde `queued` y el operador confirma (o rechaza) minutos después.
 * Sin esa columna, "no le llegó el link al paciente" no se puede diagnosticar.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@precision/ui';
import { ChevronLeft, ChevronRight, MessageSquare, RefreshCw, MessageSquareOff, SlidersHorizontal } from 'lucide-react';
import { EmptyState, FilterPill, PersonAvatar, StatusPill, TableFooter, Skeleton } from '@/components/ui-phoenix';
import { formatUsPhone } from '@/lib/phone';

const CLINIC_TZ = 'America/Denver';
const PAGE_SIZE = 10;

type Status = 'QUEUED' | 'SENT' | 'DELIVERED' | 'UNDELIVERED' | 'FAILED';
type StatusFilter = 'all' | 'DELIVERED' | 'NOT_DELIVERED';
type PeriodFilter = 0 | 1 | 7 | 30;
type Scope = 'mine' | 'all';

interface Row {
  id: string;
  status: Status;
  toAddress: string;
  body: string;
  errorCode: number | null;
  errorMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
  patient: { id: string; patientCode: string | null; firstName: string; lastName: string; phone: string | null } | null;
  patientMatchedByPhone: boolean;
  patientMatchCount: number;
  case: { id: string; caseCode: string } | null;
  sentByName: string | null;
  sentByMe: boolean;
}

interface Response {
  messages: Row[];
  total: number;
  totalPages: number;
  counts: { mine: number; all: number; notDelivered: number };
}

function clinicDayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

/** Solo DELIVERED prueba que llegó; el resto es "todavía no" o "no llegó". */
function statusState(s: Status) {
  if (s === 'DELIVERED')                     return 'active' as const;
  if (s === 'UNDELIVERED' || s === 'FAILED') return 'danger' as const;
  return 'warning' as const;
}

export function SmsHistoryDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t      = useTranslations('phoenix.sms');
  const locale = useLocale();

  const [scope, setScope]       = useState<Scope>('mine');
  const [status, setStatus]     = useState<StatusFilter>('all');
  const [period, setPeriod]     = useState<PeriodFilter>(0);
  const [page, setPage]         = useState(0);
  const [data, setData]         = useState<Response | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(false);
  const [openBody, setOpenBody] = useState<string | null>(null);

  const filtered = status !== 'all' || period !== 0;

  const load = useCallback(async (s: Scope, p: number, st: StatusFilter, per: PeriodFilter) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ scope: s, page: String(p), size: String(PAGE_SIZE) });
      if (st !== 'all') params.set('status', st);
      if (per !== 0) {
        // El día se corta en la zona de la clínica, no en UTC.
        const since = new Date(Date.now() - (per - 1) * 86_400_000);
        params.set('from', since.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ }));
      }
      const res = await fetch(`/api/admin/message-logs?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json() as Response);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(scope, page, status, period);
  }, [open, scope, page, status, period, load]);

  const rows       = data?.messages ?? [];
  const totalPages = data?.totalPages ?? 1;
  const counts     = data?.counts;

  const whenLabel = (iso: string) => {
    const d    = new Date(iso);
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: CLINIC_TZ });
    const day  = clinicDayKey(d);
    if (day === clinicDayKey(new Date()))                        return `${t('today')} ${time}`;
    if (day === clinicDayKey(new Date(Date.now() - 86_400_000))) return `${t('yesterday')} ${time}`;
    return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: CLINIC_TZ })} ${time}`;
  };

  const statusLabel = (s: Status) => {
    switch (s) {
      case 'DELIVERED':   return t('statusDelivered');
      case 'UNDELIVERED': return t('statusUndelivered');
      case 'FAILED':      return t('statusFailed');
      case 'SENT':        return t('statusSent');
      case 'QUEUED':      return t('statusQueued');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 shrink-0">
          <DialogTitle className="text-text-1 flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4 text-brand-text" />
            {t('title')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">{t('subtitle')}</DialogDescription>
        </DialogHeader>

        {/* Filtros — pills, no un formulario: son decisiones rápidas */}
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('filterWho')}</span>
            {([['mine', t('filterMine'), counts?.mine], ['all', t('filterAll'), counts?.all]] as [Scope, string, number | undefined][]).map(([k, l, n]) => (
              <FilterPill key={k} active={scope === k} onClick={() => { setScope(k); setPage(0); }} label={l} count={n} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('filterStatus')}</span>
            {([['all', t('filterAllStatus')], ['DELIVERED', t('statusDelivered')], ['NOT_DELIVERED', t('filterNotDelivered')]] as [StatusFilter, string][]).map(([k, l]) => (
              <FilterPill key={k} active={status === k} onClick={() => { setStatus(k); setPage(0); }} label={l} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {([[1, t('filterToday')], [7, t('filterDays', { n: 7 })], [30, t('filterDays', { n: 30 })], [0, t('filterAllTime')]] as [PeriodFilter, string][]).map(([k, l]) => (
              <FilterPill key={k} active={period === k} onClick={() => { setPeriod(k); setPage(0); }} label={l} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-2 pb-4">
          {loading && !data ? (
            <SmsSkeleton />
          ) : error ? (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-center justify-between gap-3 flex-wrap">
              <span>{t('loadError')}</span>
              <button
                type="button"
                onClick={() => void load(scope, page, status, period)}
                className="inline-flex items-center gap-1.5 font-semibold hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                {t('retry')}
              </button>
            </div>
          ) : rows.length === 0 ? (
            filtered
              ? <EmptyState.Rich icon={SlidersHorizontal} title={t('emptyFilteredTitle')} subtitle={t('emptyFilteredHint')} />
              : <EmptyState.Rich icon={MessageSquareOff} title={t('emptyTitle')} subtitle={t('emptyHint')} />
          ) : (
            <>
              {/* Desktop — la 1ra columna fija; el mensaje es lo que puede crecer */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <div className={`overflow-x-auto transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>
                  <table className="w-full text-sm min-w-[820px] table-fixed">
                    <thead>
                      <tr className="border-b border-row-sep bg-bg-2 text-text-muted text-[10px] uppercase tracking-wider">
                        <th className="sticky left-0 z-10 bg-bg-2 text-left px-4 py-2.5 font-semibold w-[230px]">{t('colTo')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold w-[130px]">{t('colStatus')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold w-[150px]">{t('colSentBy')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold w-[130px]">{t('colWhen')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold">{t('colMessage')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} className="border-b border-row-sep hover:bg-white/[0.02] transition-colors align-top">
                          <td className="sticky left-0 z-10 bg-bg-0 px-4 py-2">
                            <Recipient row={r} unknownLabel={t('unregistered')} />
                          </td>
                          <td className="px-4 py-2">
                            <StatusPill state={statusState(r.status)} label={statusLabel(r.status)} />
                            {/* El código de Twilio es lo que permite diagnosticar:
                                30007 = filtrado por el operador · 21610 = se dio de baja */}
                            {r.errorCode != null && (
                              <div className="mt-1 font-mono text-[9.5px] text-rose">#{r.errorCode}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-text-2 truncate">
                            {r.sentByName ?? <span className="text-text-muted">—</span>}
                            {r.sentByMe && <span className="text-text-muted"> ({t('me')})</span>}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-text-muted whitespace-nowrap">{whenLabel(r.createdAt)}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => setOpenBody(openBody === r.id ? null : r.id)}
                              className="text-left text-[11.5px] text-text-2 hover:text-text-1 transition-colors"
                            >
                              {openBody === r.id
                                ? <span className="whitespace-pre-wrap">{r.body}</span>
                                : <span className="line-clamp-2">{r.body}</span>}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TableFooter
                  left={t('footerCount', { shown: rows.length, total: data?.total ?? 0 })}
                  right={counts && counts.notDelivered > 0
                    ? <span className="text-rose font-semibold">{t('footerNotDelivered', { count: counts.notDelivered })}</span>
                    : undefined}
                />
              </div>

              {/* Mobile — cards: 5 columnas no entran en 375px */}
              <ul className={`md:hidden space-y-2 transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>
                {rows.map(r => (
                  <li key={r.id} className="rounded-lg border border-border bg-bg-1 p-3 space-y-2">
                    <Recipient row={r} unknownLabel={t('unregistered')} />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusPill state={statusState(r.status)} label={statusLabel(r.status)} />
                      {r.errorCode != null && <span className="font-mono text-[9.5px] text-rose">#{r.errorCode}</span>}
                      <span className="text-[11px] text-text-muted ml-auto">{whenLabel(r.createdAt)}</span>
                    </div>
                    <p className="text-[11.5px] text-text-2 whitespace-pre-wrap">{r.body}</p>
                    {r.sentByName && <p className="text-[11px] text-text-muted">{r.sentByName}</p>}
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
                      className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || loading}
                      aria-label={t('nextPage')}
                      className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

/**
 * A quién se le mandó. Con paciente reconocido: nombre + código. Sin reconocer:
 * el número en ámbar — mismo criterio que el historial de llamadas.
 */
function Recipient({ row, unknownLabel }: { row: Row; unknownLabel: string }) {
  const phone = formatUsPhone(row.toAddress);

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

  return (
    <div className="flex items-center gap-2 min-w-0">
      <PersonAvatar firstName={row.patient.firstName} lastName={row.patient.lastName} size={6} />
      <div className="min-w-0">
        <div className="font-semibold text-text-1 text-[12.5px] truncate">
          {row.patient.firstName} {row.patient.lastName}
        </div>
        <div className="font-mono text-[10px] text-text-muted truncate">
          {[row.patient.patientCode, phone].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );
}

function SmsSkeleton() {
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
          <Skeleton className="h-4 w-20 rounded-md hidden sm:block" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
