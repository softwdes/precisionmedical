'use client';

/**
 * Admin → Premios del Staff. Tres pestañas:
 *   · Mes:       bolsa, participantes (con la manager) y las metas del mes.
 *   · Verificar: la cola de registros manuales. Nada suma sin verificar.
 *   · Tablero:   cómo va cada uno y cuánto se pagaría si el mes cerrara hoy.
 *
 * El cierre del mes y la planilla para la nómina vienen en la etapa 4.
 *
 * Los montos NO se calculan acá: llegan del router (`premios.overview`), que usa
 * el mismo `calcularPeriodo` que "Mis premios" del back-office.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Check, ChevronLeft, ChevronRight, Coins, Loader2, Plus, Target, Trash2, TrendingUp, Trophy, Users, X,
} from 'lucide-react';
import { cn } from '@precision/ui';
import type { RewardGoal, GoalKind } from '@precision-medical/database/premios';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';
import { api } from '@/lib/trpc/client';
import { KpiCard } from '../metricas/metricas-shared';

export type PremiosTab = 'mes' | 'verificar' | 'tablero';

interface Category { code: string; nameEs: string; nameEn: string; pointsNew: number; pointsExisting: number; tracksSource: boolean; requiresPatient: boolean }
interface GoalDraft { kind: GoalKind; categoryCode: string | null; onlyNew: boolean; target: number; labelEs: string; labelEn: string }
interface PartDraft { userId: string; kind: 'STAFF' | 'MANAGER' }

function mesSiguiente(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Qué cuenta una meta, como una sola clave para el selector. */
function claveMeta(g: Pick<GoalDraft, 'kind' | 'categoryCode' | 'onlyNew'>): string {
  if (g.kind === 'CATEGORY') return `${g.categoryCode}${g.onlyNew ? ':new' : ''}`;
  return g.kind;
}

export function PremiosClient({ tab, month }: { tab: PremiosTab; month: string }): React.ReactElement {
  const t = useTranslations('rewards');
  const locale = useLocale();
  const router = useRouter();
  const overview = api.premios.overview.useQuery({ month });

  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const mesTexto = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));

  const irA = (m: string) => router.push(`/dashboard/premios?tab=${tab}&mes=${m}`);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-1 inline-flex items-center gap-2">
            <Trophy className="w-6 h-6 text-brand-text" /> {t('title')}
          </h1>
          <p className="text-sm text-text-3 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button type="button" onClick={() => irA(mesSiguiente(month, -1))} className="rounded-md p-1.5 text-text-2 hover:bg-bg-2" aria-label={t('prevMonth')}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-sm font-semibold text-text-1 min-w-[9rem] text-center">{mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1)}</span>
          <button type="button" onClick={() => irA(mesSiguiente(month, 1))} className="rounded-md p-1.5 text-text-2 hover:bg-bg-2" aria-label={t('nextMonth')}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {overview.isLoading ? (
        <div className="flex items-center gap-2 text-text-3 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</div>
      ) : overview.error || !overview.data ? (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose-text">
          {t('loadFailed')} {overview.error?.message}
        </div>
      ) : tab === 'mes' ? (
        <MesView data={overview.data} month={month} money={money} onSaved={() => void overview.refetch()} />
      ) : !overview.data.period ? (
        <div className="rounded-lg bg-bg-2/30 p-6 text-center text-sm text-text-3">{t('notOpenYet')}</div>
      ) : tab === 'verificar' ? (
        <VerificarView periodId={overview.data.period.id} categories={overview.data.categories as Category[]} onChanged={() => void overview.refetch()} />
      ) : (
        <TableroView data={overview.data} money={money} />
      )}
    </div>
  );
}

type Overview = inferRouterOutputs<AppRouter>['premios']['overview'];

// ─── Mes ─────────────────────────────────────────────────────────────────────

function MesView({ data, month, money, onSaved }: {
  data: Overview; month: string; money: (c: number) => string; onSaved: () => void;
}): React.ReactElement {
  const t = useTranslations('rewards');
  const locale = useLocale();
  const candidates = api.premios.candidates.useQuery();
  const save = api.premios.savePeriod.useMutation();
  const categories = data.categories as Category[];
  const cerrado = data.period?.status === 'CLOSED';

  const inicial = useMemo(() => {
    if (data.period) {
      return {
        pool: String(data.period.poolAmount),
        parts: data.participants.map((p) => ({ userId: p.userId, kind: p.kind })) as PartDraft[],
        goals: (data.goals as RewardGoal[]).map(({ kind, categoryCode, onlyNew, target, labelEs, labelEn }) => ({ kind, categoryCode, onlyNew, target, labelEs, labelEn })),
      };
    }
    const prop = data.proposal!;
    return {
      pool: prop.poolAmount !== null ? String(prop.poolAmount) : '',
      parts: prop.participants.map((p) => ({ userId: p.userId, kind: p.kind === 'MANAGER' ? 'MANAGER' : 'STAFF' })) as PartDraft[],
      goals: prop.goals.map(({ kind, categoryCode, onlyNew, target, labelEs, labelEn }) => ({ kind, categoryCode, onlyNew, target, labelEs, labelEn })),
    };
  }, [data]);

  const [pool, setPool] = useState(inicial.pool);
  const [parts, setParts] = useState<PartDraft[]>(inicial.parts);
  const [goals, setGoals] = useState<GoalDraft[]>(inicial.goals);
  const [addUser, setAddUser] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setPool(inicial.pool); setParts(inicial.parts); setGoals(inicial.goals); setMsg(null); }, [inicial]);

  const nombres = new Map((candidates.data ?? []).map((c) => [c.id, c.name]));
  const poolNum = Number(pool);
  const share = parts.length > 0 && poolNum > 0 ? Math.round((poolNum * 100) / parts.length) : 0;

  // Opciones de "qué cuenta": cada categoría, membresías solo NEW, llamadas y uso.
  const opciones = [
    ...categories.map((c) => ({ key: c.code, kind: 'CATEGORY' as const, categoryCode: c.code, onlyNew: false, es: c.nameEs, en: c.nameEn })),
    { key: 'C01:new', kind: 'CATEGORY' as const, categoryCode: 'C01', onlyNew: true, es: 'Membresías nuevas', en: 'New memberships' },
    { key: 'CALLS', kind: 'CALLS' as const, categoryCode: null, onlyNew: false, es: 'Llamadas', en: 'Calls' },
    { key: 'USAGE', kind: 'USAGE' as const, categoryCode: null, onlyNew: false, es: 'Uso del sistema', en: 'System usage' },
  ];

  const errores: string[] = [];
  if (!(poolNum > 0)) errores.push(t('errPool'));
  if (parts.filter((p) => p.kind === 'STAFF').length < 1 || parts.length < 2) errores.push(t('errParticipants'));
  if (parts.filter((p) => p.kind === 'MANAGER').length > 1) errores.push(t('errOneManager'));
  if (goals.length < 1) errores.push(t('errGoals'));

  async function guardar(): Promise<void> {
    setMsg(null);
    try {
      await save.mutateAsync({ month, poolAmount: poolNum, participants: parts, goals });
      setMsg({ ok: true, text: data.period ? t('saved') : t('opened') });
      onSaved();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const clave = `errors.${code}`;
      setMsg({ ok: false, text: t.has(clave) ? t(clave) : t('errors.SAVE_FAILED') });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!data.period && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber-text">
          {data.proposal?.copiedFrom ? t('notOpenCopied', { month: data.proposal.copiedFrom }) : t('notOpenDefaults')}
        </div>
      )}
      {cerrado && (
        <div className="rounded-md border border-border bg-bg-2/40 px-3 py-2 text-sm text-text-2">{t('closedReadOnly')}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <section className="lg:col-span-2 rounded-lg bg-bg-2/30 p-4 flex flex-col gap-4">
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-text" /> {t('poolAndPeople')}
          </h2>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{t('pool')}</span>
            <input
              id="premios-pool" type="number" min={0} step="0.01" inputMode="decimal" value={pool} disabled={cerrado}
              onChange={(e) => setPool(e.target.value)}
              className="rounded-md border border-border bg-bg-1 px-3 py-2 text-sm text-text-1 tabular-nums"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{t('participants')}</span>
            {parts.length === 0 && <span className="text-xs text-text-3">{t('noParticipants')}</span>}
            <ul className="flex flex-col gap-1.5">
              {parts.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2 rounded-md bg-bg-2/40 px-3 py-1.5">
                  <span className="text-sm text-text-1 truncate">{nombres.get(p.userId) ?? '…'}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button" disabled={cerrado}
                      onClick={() => setParts((xs) => xs.map((x) => x.userId === p.userId ? { ...x, kind: x.kind === 'MANAGER' ? 'STAFF' : 'MANAGER' } : x))}
                      className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                        p.kind === 'MANAGER' ? 'bg-violet/15 text-violet-text border-violet/30' : 'bg-brand/10 text-brand-text border-brand/20')}
                      title={t('toggleKind')}
                    >
                      {p.kind === 'MANAGER' ? t('kindManager') : t('kindStaff')}
                    </button>
                    {!cerrado && (
                      <button type="button" onClick={() => setParts((xs) => xs.filter((x) => x.userId !== p.userId))}
                        className="rounded p-1 text-text-3 hover:text-rose-text" aria-label={t('remove')}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {!cerrado && (
              <div className="flex gap-2">
                <select
                  id="premios-add-user" value={addUser} onChange={(e) => setAddUser(e.target.value)}
                  className="flex-1 min-w-0 rounded-md border border-border bg-bg-1 px-2 py-1.5 text-sm text-text-1"
                >
                  <option value="">{t('addParticipant')}</option>
                  {(candidates.data ?? []).filter((c) => !parts.some((p) => p.userId === c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button" disabled={!addUser}
                  onClick={() => { setParts((xs) => [...xs, { userId: addUser, kind: 'STAFF' }]); setAddUser(''); }}
                  className="rounded-md border border-border px-3 text-sm text-text-1 disabled:opacity-40 hover:bg-bg-2"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md bg-bg-2/40 px-3 py-2">
            <span className="text-xs text-text-3">{t('sharePerPerson')}</span>
            <span className="text-lg font-bold text-text-1 tabular-nums">{money(share)}</span>
          </div>
        </section>

        <section className="lg:col-span-3 rounded-lg bg-bg-2/30 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
              <Target className="w-4 h-4 text-brand-text" /> {t('goalsOfMonth', { n: goals.length })}
            </h2>
            <span className="text-[11px] text-text-3">
              {goals.length > 0 && share > 0 ? t('eachGoalWorth', { amount: money(Math.round(share / goals.length)) }) : null}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {goals.map((g, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md bg-bg-2/40 px-2 py-1.5">
                <span className="w-5 text-center text-[11px] text-text-3 tabular-nums">{i + 1}</span>
                <select
                  id={`premios-goal-${i}`} value={claveMeta(g)} disabled={cerrado}
                  onChange={(e) => {
                    const o = opciones.find((x) => x.key === e.target.value);
                    if (!o) return;
                    setGoals((xs) => xs.map((x, j) => j === i ? { ...x, kind: o.kind, categoryCode: o.categoryCode, onlyNew: o.onlyNew, labelEs: o.es, labelEn: o.en } : x));
                  }}
                  className="flex-1 min-w-0 rounded-md border border-border bg-bg-1 px-2 py-1 text-sm text-text-1"
                >
                  {!opciones.some((o) => o.key === claveMeta(g)) && <option value={claveMeta(g)}>{locale === 'en' ? g.labelEn : g.labelEs}</option>}
                  {opciones.map((o) => (
                    <option key={o.key} value={o.key}>{locale === 'en' ? o.en : o.es}</option>
                  ))}
                </select>
                <input
                  id={`premios-goal-target-${i}`} type="number" min={1} value={g.target} disabled={cerrado}
                  onChange={(e) => setGoals((xs) => xs.map((x, j) => j === i ? { ...x, target: Math.max(1, Number(e.target.value) || 1) } : x))}
                  className="w-20 rounded-md border border-border bg-bg-1 px-2 py-1 text-sm text-text-1 tabular-nums text-right"
                  aria-label={t('target')}
                />
                {g.kind === 'USAGE' && <span className="hidden sm:inline text-[10px] text-text-3">{t('usageUnit')}</span>}
                {!cerrado && (
                  <button type="button" onClick={() => setGoals((xs) => xs.filter((_, j) => j !== i))}
                    className="rounded p-1 text-text-3 hover:text-rose-text" aria-label={t('remove')}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!cerrado && goals.length < 12 && (
            <button
              type="button"
              onClick={() => setGoals((xs) => [...xs, { kind: 'CATEGORY', categoryCode: 'C06', onlyNew: false, target: 1, labelEs: 'Reseña 5 estrellas', labelEn: '5-Star Review' }])}
              className="self-start inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-text-1 hover:bg-bg-2"
            >
              <Plus className="w-3.5 h-3.5" /> {t('addGoal')}
            </button>
          )}
          <p className="text-[11px] text-text-3">{t('usageExplain')}</p>
        </section>
      </div>

      {!cerrado && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-end">
          {errores.length > 0 && <span className="text-xs text-amber-text">{errores.join(' · ')}</span>}
          {msg && <span className={cn('text-xs', msg.ok ? 'text-emerald-text' : 'text-rose-text')}>{msg.text}</span>}
          <button
            type="button" onClick={() => void guardar()} disabled={errores.length > 0 || save.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {data.period ? t('saveChanges') : t('openMonth')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Verificar ───────────────────────────────────────────────────────────────

function VerificarView({ periodId, categories, onChanged }: {
  periodId: string; categories: Category[]; onChanged: () => void;
}): React.ReactElement {
  const t = useTranslations('rewards');
  const locale = useLocale();
  const pending = api.premios.pending.useQuery({ periodId });
  const review = api.premios.review.useMutation();
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const nombreCat = (code: string) => {
    const c = categories.find((x) => x.code === code);
    return c ? (locale === 'en' ? c.nameEn : c.nameEs) : code;
  };
  const fecha = (d: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));

  async function decidir(entryId: string, decision: 'VERIFIED' | 'REJECTED'): Promise<void> {
    setError(null);
    try {
      await review.mutateAsync({ entryId, decision, reason: decision === 'REJECTED' ? motivo.trim() : null });
      setRechazando(null); setMotivo('');
      await pending.refetch();
      onChanged();
    } catch (e) {
      const clave = `errors.${e instanceof Error ? e.message : ''}`;
      setError(t.has(clave) ? t(clave) : t('errors.SAVE_FAILED'));
    }
  }

  if (pending.isLoading) return <div className="flex items-center gap-2 text-text-3 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</div>;
  const rows = pending.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose-text">{error}</div>}
      <div className="overflow-x-auto rounded-lg bg-bg-2/30">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-row-sep bg-bg-2 text-text-3 text-[10px] uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left">{t('colEmployee')}</th>
              <th className="px-4 py-2.5 text-left">{t('colDate')}</th>
              <th className="px-4 py-2.5 text-left">{t('colAchievement')}</th>
              <th className="px-4 py-2.5 text-left">{t('colPatient')}</th>
              <th className="px-4 py-2.5 text-left">{t('colSource')}</th>
              <th className="px-4 py-2.5 text-left">{t('colType')}</th>
              <th className="px-4 py-2.5 text-right">{t('colPoints')}</th>
              <th className="px-4 py-2.5 text-left">{t('colNote')}</th>
              <th className="px-4 py-2.5 text-right"><span className="sr-only">{t('colActions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-text-3 text-sm">{t('nothingPending')}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-row-sep last:border-0 align-top">
                <td className="px-4 py-2 font-semibold text-text-1 whitespace-nowrap">{r.userName}</td>
                <td className="px-4 py-2 text-text-2 whitespace-nowrap tabular-nums">{fecha(r.occurredOn)}</td>
                <td className="px-4 py-2 text-text-1">{nombreCat(r.categoryCode)}</td>
                <td className="px-4 py-2 text-[12.5px] text-text-2">
                  {r.patient ? <>{r.patient.name || '—'}{r.patient.code && <span className="text-text-3"> · {r.patient.code}</span>}</> : '—'}
                </td>
                <td className="px-4 py-2 text-[12.5px] text-text-2">{r.source ? t(`source.${r.source}`) : '—'}</td>
                <td className="px-4 py-2 text-[12.5px] text-text-2">{r.isNewPatient === null ? '—' : r.isNewPatient ? 'NEW' : 'EXISTING'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text-1">{r.points}</td>
                <td className="px-4 py-2 text-[12px] text-text-3 max-w-[16rem]">{r.notes ?? ''}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {rechazando === r.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        id={`premios-motivo-${r.id}`} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
                        placeholder={t('rejectReason')} maxLength={200}
                        className="w-44 rounded-md border border-border bg-bg-1 px-2 py-1 text-xs text-text-1"
                      />
                      <button type="button" disabled={!motivo.trim() || review.isPending} onClick={() => void decidir(r.id, 'REJECTED')}
                        className="rounded-md bg-rose/15 px-2 py-1 text-xs font-semibold text-rose-text disabled:opacity-40">{t('confirmReject')}</button>
                      <button type="button" onClick={() => { setRechazando(null); setMotivo(''); }} className="rounded p-1 text-text-3" aria-label={t('cancel')}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <button type="button" disabled={review.isPending} onClick={() => void decidir(r.id, 'VERIFIED')}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald/15 px-2 py-1 text-xs font-semibold text-emerald-text disabled:opacity-40">
                        <Check className="w-3.5 h-3.5" /> {t('approve')}
                      </button>
                      <button type="button" disabled={review.isPending} onClick={() => { setRechazando(r.id); setMotivo(''); }}
                        className="inline-flex items-center gap-1 rounded-md bg-rose/10 px-2 py-1 text-xs font-semibold text-rose-text disabled:opacity-40">
                        <X className="w-3.5 h-3.5" /> {t('reject')}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-text-3">{t('verifyExplain')}</p>
    </div>
  );
}

// ─── Tablero ─────────────────────────────────────────────────────────────────

function TableroView({ data, money }: { data: Overview; money: (c: number) => string }): React.ReactElement {
  const t = useTranslations('rewards');
  const locale = useLocale();
  const s = data.summary!;
  const goals = data.goals as RewardGoal[];
  const label = (g: RewardGoal) => (locale === 'en' ? g.labelEn : g.labelEs);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Coins} label={t('kpiPool')} value={money(s.poolCents)} sub={t('kpiPoolSub', { n: data.participants.length, share: money(s.shareCents) })} color="bg-brand/10 text-brand-text" />
        <KpiCard icon={Target} label={t('kpiGoalsHit')} value={`${s.staffHits} / ${s.staffTotal}`} sub={t('kpiGoalsHitSub')} color="bg-emerald/10 text-emerald-text" />
        <KpiCard icon={TrendingUp} label={t('kpiToPay')} value={money(s.paidCents)} sub={t('kpiToPaySub', { amount: money(s.returnedCents) })} color="bg-emerald/10 text-emerald-text" />
        <KpiCard icon={Trophy} label={t('kpiPending')} value={data.pendingCount} sub={t('kpiPendingSub')} color="bg-amber/10 text-amber-text" />
      </div>

      <div className="overflow-x-auto rounded-lg bg-bg-2/30">
        <table className="w-full text-sm" style={{ minWidth: `${360 + goals.length * 90}px` }}>
          <thead>
            <tr className="border-b border-row-sep bg-bg-2 text-text-3 text-[10px] uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left sticky left-0 bg-bg-2">{t('colParticipant')}</th>
              {goals.map((g) => <th key={g.id} className="px-2 py-2.5 text-center">{label(g)}</th>)}
              <th className="px-3 py-2.5 text-right">{t('colGoals')}</th>
              <th className="px-3 py-2.5 text-right">{t('colPoints')}</th>
              <th className="px-4 py-2.5 text-right">{t('colPayout')}</th>
            </tr>
          </thead>
          <tbody>
            {data.participants.map((p) => (
              <tr key={p.userId} className={cn('border-b border-row-sep last:border-0', p.kind === 'MANAGER' && 'bg-violet/[0.06]')}>
                <td className="px-4 py-2 font-semibold text-text-1 whitespace-nowrap sticky left-0 bg-bg-1">
                  {p.kind === 'MANAGER' && <span className="mr-1.5 rounded-full bg-violet/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-text">{t('kindManager')}</span>}
                  {p.name}
                </td>
                {p.kind === 'MANAGER' ? (
                  <td colSpan={goals.length} className="px-3 py-2 text-[12px] text-text-3">{t('managerRow', { hits: s.staffHits, total: s.staffTotal })}</td>
                ) : p.result.goals.map((r) => (
                  <td key={r.goalId} className="px-2 py-2 text-center">
                    <span className={cn('inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                      r.hit ? 'bg-emerald/15 text-emerald-text' : 'bg-amber/15 text-amber-text')}>{r.actual}/{r.target}</span>
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums text-text-1">
                  {p.kind === 'MANAGER' ? `${Math.round(p.result.progress * 1000) / 10}%` : `${p.result.goalsHit}/${p.result.goalsTotal}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-2">{p.kind === 'MANAGER' ? '—' : p.result.points}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-text-1">{money(p.result.payoutCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-text-3">{t('boardExplain')}</p>
    </div>
  );
}
