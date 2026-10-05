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

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Check, ChevronLeft, ChevronRight, Coins, Loader2, Plus, Target, Trash2, TrendingUp, Trophy, Users, X,
} from 'lucide-react';
import { cn } from '@precision/ui';
import {
  evaluarEvidencia, METRICAS, columnasDeMetas, claveDeMeta, metaAplica, type MetasPersonales, type RewardGoal, type GoalKind, type MetricKey, type RewardEvidence, type Senal, type Veredicto,
} from '@precision-medical/database/premios';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';
import { api } from '@/lib/trpc/client';
import { KpiCard } from '../metricas/metricas-shared';
import { CarreraView } from './carrera-view';

export type PremiosTab = 'mes' | 'carrera' | 'verificar' | 'tablero';

interface Category { code: string; nameEs: string; nameEn: string; pointsNew: number; pointsExisting: number; tracksSource: boolean; requiresPatient: boolean }
interface GoalDraft {
  kind: GoalKind; categoryCode: string | null; metric: MetricKey | null; roleKey: string | null;
  onlyNew: boolean; target: number; labelEs: string; labelEn: string;
}
interface PartDraft { userId: string; kind: 'STAFF' | 'MANAGER'; roleKey: string | null }

function mesSiguiente(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Qué cuenta una meta, como una sola clave para el selector. */
function claveMeta(g: Pick<GoalDraft, 'kind' | 'categoryCode' | 'onlyNew' | 'metric'>): string {
  if (g.kind === 'CATEGORY') return `${g.categoryCode}${g.onlyNew ? ':new' : ''}`;
  if (g.kind === 'METRIC') return `M:${g.metric}`;
  return g.kind;
}

export function PremiosClient({ tab, month }: { tab: PremiosTab; month: string }): React.ReactElement {
  const t = useTranslations('rewards');
  const locale = useLocale();
  const router = useRouter();
  // La Carrera va en vivo: se recalcula cada 90 s mientras la pestaña está a la
  // vista (react-query no pide nada con la ventana en segundo plano).
  const overview = api.premios.overview.useQuery({ month }, { refetchInterval: tab === 'carrera' ? 90_000 : false });

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
      ) : tab === 'carrera' ? (
        <CarreraView
          data={overview.data} money={money} updatedAt={overview.dataUpdatedAt}
          refreshing={overview.isFetching} onRefresh={() => void overview.refetch()}
        />
      ) : tab === 'verificar' ? (
        <VerificarView periodId={overview.data.period.id} month={month} categories={overview.data.categories as Category[]} onChanged={() => void overview.refetch()} />
      ) : (
        <TableroView data={overview.data} money={money} onChanged={() => void overview.refetch()} />
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
        parts: data.participants.map((p) => ({ userId: p.userId, kind: p.kind, roleKey: p.roleKey ?? null })) as PartDraft[],
        goals: (data.goals as RewardGoal[]).map(({ kind, categoryCode, metric, roleKey, onlyNew, target, labelEs, labelEn }) => ({ kind, categoryCode, metric: metric ?? null, roleKey: roleKey ?? null, onlyNew, target, labelEs, labelEn })),
      };
    }
    const prop = data.proposal!;
    return {
      pool: prop.poolAmount !== null ? String(prop.poolAmount) : '',
      parts: prop.participants.map((p) => ({ userId: p.userId, kind: p.kind === 'MANAGER' ? 'MANAGER' : 'STAFF', roleKey: p.roleKey ?? null })) as PartDraft[],
      goals: prop.goals.map(({ kind, categoryCode, metric, roleKey, onlyNew, target, labelEs, labelEn }) => ({ kind, categoryCode, metric: metric ?? null, roleKey: roleKey ?? null, onlyNew, target, labelEs, labelEn })),
    };
  }, [data]);

  const [pool, setPool] = useState(inicial.pool);
  const [parts, setParts] = useState<PartDraft[]>(inicial.parts);
  const [goals, setGoals] = useState<GoalDraft[]>(inicial.goals);
  const [addUser, setAddUser] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /**
   * Cuándo se recarga el formulario con lo guardado: al cambiar de mes, al abrir
   * uno nuevo y DESPUÉS DE GUARDAR (el guardado siempre mueve `updatedAt`).
   *
   * Antes dependía de `inicial`, que cambia con CADA refetch de la consulta, y
   * react-query refetchea al volver el foco a la ventana. Resultado: el admin
   * quitaba o agregaba participantes, cambiaba de pestaña y al volver la lista
   * se reponía sola con lo guardado. Parecía que "no guardaba" (bug reportado por
   * Erick el 30-sep); en realidad se borraba lo editado antes de guardar.
   */
  const version = `${month}|${data.period?.id ?? 'nuevo'}|${(data.period as { updatedAt?: string } | null)?.updatedAt ?? ''}`;
  useEffect(() => { setPool(inicial.pool); setParts(inicial.parts); setGoals(inicial.goals); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombres = new Map((candidates.data ?? []).map((c) => [c.id, c.name]));
  const poolNum = Number(pool);
  const share = parts.length > 0 && poolNum > 0 ? Math.round((poolNum * 100) / parts.length) : 0;

  // Qué puede contar una meta: solo lo que el sistema mide SOLO (Erick, 2026-09-29).
  // Las categorías manuales ya no se ofrecen; si un mes viejo tiene una, se sigue
  // mostrando tal cual (ver la opción extra del select).
  const opciones = [
    ...(Object.keys(METRICAS) as MetricKey[]).filter((k) => !METRICAS[k].comingSoon).map((k) => ({
      key: `M:${k}`, kind: 'METRIC' as const, categoryCode: null, metric: k, onlyNew: false, es: METRICAS[k].es, en: METRICAS[k].en,
    })),
    { key: 'USAGE', kind: 'USAGE' as const, categoryCode: null, metric: null, onlyNew: false, es: 'Uso del sistema', en: 'System usage' },
  ];
  const proximamente = (Object.keys(METRICAS) as MetricKey[]).filter((k) => METRICAS[k].comingSoon && METRICAS[k].points > 0);
  // Los roles que ya se usan en el mes, para elegirlos rápido.
  const roles = [...new Set([...parts.map((p) => p.roleKey), ...goals.map((g) => g.roleKey)].filter((x): x is string => !!x))].sort();
  // Cuántas metas tiene cada uno según su rol: define cuánto vale cada meta suya.
  const metasDe = (roleKey: string | null) => goals.filter((g) => !g.roleKey || g.roleKey === roleKey).length;

  const errores: string[] = [];
  if (!(poolNum > 0)) errores.push(t('errPool'));
  if (parts.filter((p) => p.kind === 'STAFF').length < 1 || parts.length < 2) errores.push(t('errParticipants'));
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
            {!cerrado && (parts.length < 2 || !parts.some((p) => p.kind === 'STAFF')) && (
              <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[12px] text-amber-text">{t('needMorePeople')}</div>
            )}
            <ul className="flex flex-col gap-1.5">
              {parts.map((p) => (
                <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-bg-2/40 px-3 py-1.5">
                  <span className="min-w-0 flex-1 text-sm text-text-1 truncate">{nombres.get(p.userId) ?? '…'}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {/* Rol también para supervisores: con rol, cobran 50% sus metas + 50% el equipo. */}
                    {(
                      <input
                        id={`premios-rol-${p.userId}`} list="premios-roles" value={p.roleKey ?? ''} disabled={cerrado}
                        placeholder={t('roleAll')} maxLength={40} aria-label={t('role')}
                        onChange={(e) => setParts((xs) => xs.map((x) => x.userId === p.userId ? { ...x, roleKey: e.target.value.trim() ? e.target.value : null } : x))}
                        className="w-24 rounded-md border border-border bg-bg-1 px-1.5 py-0.5 text-[11px] text-text-1"
                      />
                    )}
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
                  id="premios-add-user" value={addUser}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    // Se agrega al elegirlo: no hay un segundo paso que se pueda pasar por alto.
                    setParts((xs) => (xs.some((x) => x.userId === id) ? xs : [...xs, { userId: id, kind: 'STAFF', roleKey: null }]));
                    setAddUser('');
                  }}
                  className="flex-1 min-w-0 rounded-md border border-brand/40 bg-bg-1 px-2 py-1.5 text-sm text-text-1"
                >
                  <option value="">{t('addParticipant')}</option>
                  {(candidates.data ?? []).filter((c) => !parts.some((p) => p.userId === c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <datalist id="premios-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
          <p className="text-[11px] text-text-3">{t('roleExplain')}</p>
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
              {goals.length > 0 && share > 0 && roles.length === 0 ? t('eachGoalWorth', { amount: money(Math.round(share / goals.length)) }) : null}
              {goals.length > 0 && share > 0 && roles.length > 0 ? t('eachGoalWorthByRole', { list: [null, ...roles].map((r) => `${r ?? t('roleAll')}: ${money(Math.round(share / Math.max(1, metasDe(r))))}`).join(' · ') }) : null}
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
                    setGoals((xs) => xs.map((x, j) => j === i ? { ...x, kind: o.kind, categoryCode: o.categoryCode, metric: o.metric, onlyNew: o.onlyNew, labelEs: o.es, labelEn: o.en } : x));
                  }}
                  className="flex-1 min-w-0 rounded-md border border-border bg-bg-1 px-2 py-1 text-sm text-text-1"
                >
                  {!opciones.some((o) => o.key === claveMeta(g)) && <option value={claveMeta(g)}>{locale === 'en' ? g.labelEn : g.labelEs}</option>}
                  {opciones.map((o) => (
                    <option key={o.key} value={o.key}>{locale === 'en' ? o.en : o.es}</option>
                  ))}
                  {proximamente.map((k) => (
                    <option key={k} value={`soon:${k}`} disabled>{`${locale === 'en' ? METRICAS[k].en : METRICAS[k].es} · ${t('comingSoon')}`}</option>
                  ))}
                </select>
                {roles.length > 0 && (
                <select
                  id={`premios-goal-role-${i}`} value={g.roleKey ?? ''} disabled={cerrado} aria-label={t('appliesTo')}
                  onChange={(e) => setGoals((xs) => xs.map((x, j) => j === i ? { ...x, roleKey: e.target.value || null } : x))}
                  className="w-28 rounded-md border border-border bg-bg-1 px-1.5 py-1 text-xs text-text-1"
                >
                  <option value="">{t('roleAll')}</option>
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                )}
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
              onClick={() => setGoals((xs) => [...xs, { kind: 'METRIC', categoryCode: null, metric: 'CHECKINS', roleKey: null, onlyNew: false, target: 10, labelEs: METRICAS.CHECKINS.es, labelEn: METRICAS.CHECKINS.en }])}
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

function VerificarView({ periodId, month, categories, onChanged }: {
  periodId: string; month: string; categories: Category[]; onChanged: () => void;
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
            ) : rows.map((r) => {
              const { verdict, signals } = evaluarEvidencia(r, r.evidence as RewardEvidence | null, month);
              return (
              <Fragment key={r.id}>
              <tr className="align-top">
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
              <EvidenciaRow verdict={verdict} signals={signals} />
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-text-3">{t('verifyExplain')}</p>
    </div>
  );
}

/**
 * La comparación de un registro contra el sistema: el veredicto y, al lado,
 * cada dato que lo sostiene. Va en una fila propia debajo del registro para que
 * se lea junto a lo declarado, sin abrir nada.
 */
function EvidenciaRow({ verdict, signals }: { verdict: Veredicto; signals: Senal[] }): React.ReactElement {
  const t = useTranslations('rewards.evidence');
  const locale = useLocale();
  const pill: Record<Veredicto, string> = {
    match: 'bg-emerald/15 text-emerald-text border-emerald/30',
    review: 'bg-amber/15 text-amber-text border-amber/30',
    mismatch: 'bg-rose/15 text-rose-text border-rose/30',
    noData: 'bg-bg-2 text-text-3 border-border',
  };
  const dot: Record<Senal['tone'], string> = { ok: 'bg-emerald', warn: 'bg-amber', bad: 'bg-rose', info: 'bg-text-3' };
  const texto = (x: Senal) => {
    const clave = `signal.${x.key}`;
    const params = { ...x.params };
    if (typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      params.date = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${params.date}T00:00:00Z`));
    }
    if (x.key === 'apptOnDay' && typeof params.status === 'string') {
      const st = `status.${params.status}`;
      params.status = t.has(st) ? t(st) : params.status;
    }
    return t.has(clave) ? t(clave, params) : x.key;
  };
  return (
    <tr className="border-b border-row-sep last:border-0">
      <td colSpan={9} className="px-4 pb-3 pt-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-bg-2/40 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{t('title')}</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10.5px] font-semibold', pill[verdict])}>{t(`verdict.${verdict}`)}</span>
          {signals.map((x, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-[11.5px] text-text-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', dot[x.tone])} />
              {texto(x)}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─── Metas propias ───────────────────────────────────────────────────────────

/**
 * Las metas de UNA persona (Erick, 2026-10-03: cada uno corre contra sí mismo).
 * Vacío = la del rol; "No aplica" = esa meta no le cuenta. La parte en dinero no
 * cambia: solo el número a alcanzar.
 */
function MetasPersonalesEditor({ periodId, userId, name, goals, targets, label, onClose, onSaved, onError }: {
  periodId: string; userId: string; name: string; goals: RewardGoal[]; targets: MetasPersonales | null;
  label: (g: RewardGoal) => string; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void;
}): React.ReactElement {
  const t = useTranslations('rewards');
  const save = api.premios.setTargets.useMutation();
  const filas = columnasDeMetas(goals).map((c) => c.goal);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(filas.map((g) => { const v = targets?.[claveDeMeta(g)]; return [claveDeMeta(g), typeof v === 'number' ? String(v) : '']; })));
  const [noAplica, setNoAplica] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(filas.map((g) => [claveDeMeta(g), targets?.[claveDeMeta(g)] === null])));
  const invalido = filas.some((g) => { const v = valores[claveDeMeta(g)]; return !noAplica[claveDeMeta(g)] && v !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 1); });

  async function guardar(): Promise<void> {
    const out: MetasPersonales = {};
    for (const g of filas) {
      const k = claveDeMeta(g);
      if (noAplica[k]) out[k] = null;
      else if (valores[k] !== '' && Number(valores[k]) !== g.target) out[k] = Number(valores[k]);
    }
    try { await save.mutateAsync({ periodId, userId, targets: out }); onSaved(); } catch (e) { onError(e); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-1">{t('personalTitle', { name })}</span>
        <button type="button" onClick={onClose} className="rounded p-1 text-text-3" aria-label={t('cancel')}><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {filas.map((g) => {
          const k = claveDeMeta(g);
          return (
            <div key={k} className={cn('rounded-md bg-bg-1 p-2 flex flex-col gap-1', noAplica[k] && 'opacity-50')}>
              <label htmlFor={`premios-meta-${userId}-${k}`} className="text-[11.5px] font-semibold text-text-1">{label(g)}</label>
              <div className="flex items-center gap-2">
                <input
                  id={`premios-meta-${userId}-${k}`} type="number" min={1} disabled={noAplica[k]}
                  value={valores[k] ?? ''} placeholder={String(g.target)}
                  onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
                  className="w-20 rounded-md border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 tabular-nums"
                />
                <span className="text-[10.5px] text-text-3">{t('personalRole', { n: g.target })}</span>
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-text-2">
                <input type="checkbox" checked={!!noAplica[k]} onChange={(e) => setNoAplica((v) => ({ ...v, [k]: e.target.checked }))} />
                {t('personalNotApply')}
              </label>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-[11px] text-text-3">{t('personalHint')}</p>
        <button type="button" disabled={save.isPending || invalido} onClick={() => void guardar()}
          className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">{t('personalSave')}</button>
      </div>
    </div>
  );
}

// ─── Tablero ─────────────────────────────────────────────────────────────────

function TableroView({ data, money, onChanged }: { data: Overview; money: (c: number) => string; onChanged: () => void }): React.ReactElement {
  const t = useTranslations('rewards');
  const locale = useLocale();
  const s = data.summary!;
  const goals = data.goals as RewardGoal[];
  const label = (g: RewardGoal) => (locale === 'en' ? g.labelEn : g.labelEs);
  const periodId = data.period!.id;
  // Una columna por tipo de meta: "Citas salvadas" de Recepción y de Admisión van juntas.
  const columnas = columnasDeMetas(goals);
  const cerrado = data.period!.status === 'CLOSED';
  const terminado = !!data.monthEnded;
  const approve = api.premios.approve.useMutation();
  const unapprove = api.premios.unapprove.useMutation();
  const adjust = api.premios.adjust.useMutation();
  const removeAdj = api.premios.removeAdjustment.useMutation();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ajustando, setAjustando] = useState<string | null>(null);
  // Fila abierta con el editor de metas propias (por userId).
  const [editandoMetas, setEditandoMetas] = useState<string | null>(null);
  const [adjGoal, setAdjGoal] = useState('');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const staff = data.participants.filter((p) => p.kind === 'STAFF');
  const staffPendiente = staff.filter((p) => !p.result.approved);
  const pendientes = data.participants.filter((p) => !p.result.approved);
  const nombre = (id: string) => data.participants.find((p) => p.userId === id)?.name ?? '—';
  const goalLabel = (id: string) => { const g = goals.find((x) => x.id === id); return g ? label(g) : '—'; };

  const error = (e: unknown) => {
    const clave = `errors.${e instanceof Error ? e.message : ''}`;
    setMsg({ ok: false, text: t.has(clave) ? t(clave) : t('errors.SAVE_FAILED') });
  };
  async function aprobar(userIds: string[]): Promise<void> {
    setMsg(null);
    try {
      const r = await approve.mutateAsync({ periodId, userIds });
      setMsg({ ok: true, text: r.closed ? t('closedNow') : t('approvedOk', { n: userIds.length }) });
      onChanged();
    } catch (e) { error(e); }
  }
  async function deshacer(userId: string): Promise<void> {
    setMsg(null);
    try { await unapprove.mutateAsync({ periodId, userId }); onChanged(); } catch (e) { error(e); }
  }
  async function guardarAjuste(userId: string): Promise<void> {
    setMsg(null);
    try {
      await adjust.mutateAsync({ periodId, userId, goalId: adjGoal, delta: Number(adjDelta), reason: adjReason.trim() });
      setAjustando(null); setAdjGoal(''); setAdjDelta(''); setAdjReason('');
      onChanged();
    } catch (e) { error(e); }
  }

  /** La planilla para la nómina. `;` porque Excel en Windows de la clínica separa con punto y coma. */
  function descargarPlanilla(): void {
    const filas = [[t('csvEmployee'), t('csvType'), t('csvRole'), t('csvGoals'), t('csvPct'), t('csvAmount'), t('csvStatus')]];
    for (const p of data.participants) {
      filas.push([
        p.name,
        p.kind === 'MANAGER' ? t('kindManager') : t('kindStaff'),
        p.roleKey ?? '',
        p.kind === 'MANAGER' ? '' : `${p.result.goalsHit}/${p.result.goalsTotal}`,
        `${Math.round(p.result.progress * 1000) / 10}%`,
        (p.result.payoutCents / 100).toFixed(2),
        p.result.approved ? t('statusApproved') : t('statusPending'),
      ]);
    }
    filas.push([t('csvTotal'), '', '', '', '', (s.paidCents / 100).toFixed(2), '']);
    const csv = '﻿' + filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `premios-${data.month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const ocupado = approve.isPending || unapprove.isPending || adjust.isPending || removeAdj.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Coins} label={t('kpiPool')} value={money(s.poolCents)} sub={t('kpiPoolSub', { n: data.participants.length, share: money(s.shareCents) })} color="bg-brand/10 text-brand-text" />
        <KpiCard icon={Target} label={t('kpiGoalsHit')} value={`${s.staffHits} / ${s.staffTotal}`} sub={t('kpiGoalsHitSub')} color="bg-emerald/10 text-emerald-text" />
        <KpiCard icon={TrendingUp} label={cerrado ? t('kpiApprovedTotal') : t('kpiToPay')} value={money(s.paidCents)} sub={t('kpiToPaySub', { amount: money(s.returnedCents) })} color="bg-emerald/10 text-emerald-text" />
        <KpiCard
          icon={Check} label={t('kpiApproved')}
          value={`${data.participants.length - pendientes.length} / ${data.participants.length}`}
          sub={cerrado ? t('kpiApprovedClosed') : terminado ? t('kpiApprovedReview') : t('kpiApprovedRunning')}
          color="bg-violet/10 text-violet-text"
        />
      </div>

      {/* Estado del mes y acciones de bloque. El botón se MUESTRA siempre; si no se puede, dice por qué. */}
      <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border px-3 py-2',
        cerrado ? 'border-emerald/30 bg-emerald/10' : terminado ? 'border-amber/30 bg-amber/10' : 'border-border bg-bg-2/40')}>
        <span className={cn('text-[12.5px]', cerrado ? 'text-emerald-text' : terminado ? 'text-amber-text' : 'text-text-2')}>
          {cerrado ? t('stateClosed') : terminado ? t('stateReview') : t('stateRunning')}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={descargarPlanilla}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-text-1 hover:bg-bg-2">
            {cerrado ? t('downloadPayroll') : t('downloadDraft')}
          </button>
          {!cerrado && (
            <button
              type="button" disabled={!terminado || ocupado || staffPendiente.length === 0}
              onClick={() => void aprobar(staffPendiente.map((p) => p.userId))}
              title={!terminado ? t('approveAfterMonth') : undefined}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald/20 px-3 py-1.5 text-xs font-semibold text-emerald-text disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" /> {t('approveAllStaff', { n: staffPendiente.length })}
            </button>
          )}
          {!cerrado && (
            <button
              type="button" disabled={!terminado || ocupado || staffPendiente.length > 0 || pendientes.length === 0}
              onClick={() => void aprobar(pendientes.map((p) => p.userId))}
              title={!terminado ? t('approveAfterMonth') : staffPendiente.length > 0 ? t('supervisorsAfterStaff') : undefined}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {t('approveAndClose')}
            </button>
          )}
        </span>
      </div>
      {!cerrado && !terminado && <p className="-mt-2 text-[11px] text-text-3">{t('approveAfterMonth')}</p>}
      {!cerrado && terminado && staffPendiente.length > 0 && <p className="-mt-2 text-[11px] text-text-3">{t('supervisorsAfterStaff')}</p>}
      {msg && <div className={cn('rounded-md border px-3 py-2 text-xs', msg.ok ? 'border-emerald/30 bg-emerald/10 text-emerald-text' : 'border-rose/30 bg-rose/10 text-rose-text')}>{msg.text}</div>}

      <div className="overflow-x-auto rounded-lg bg-bg-2/30">
        <table className="w-full text-sm" style={{ minWidth: `${560 + columnas.length * 90}px` }}>
          <thead>
            <tr className="border-b border-row-sep bg-bg-2 text-text-3 text-[10px] uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left sticky left-0 bg-bg-2">{t('colParticipant')}</th>
              {columnas.map((c) => <th key={c.key} className="px-2 py-2.5 text-center">{label(c.goal)}</th>)}
              <th className="px-3 py-2.5 text-right">{t('colGoals')}</th>
              <th className="px-3 py-2.5 text-right">{t('colPoints')}</th>
              <th className="px-3 py-2.5 text-right">{t('colPayout')}</th>
              <th className="px-3 py-2.5 text-left">{t('colStatus')}</th>
              <th className="px-3 py-2.5 text-right"><span className="sr-only">{t('colActions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {data.participants.map((p) => {
              const aprobado = p.result.approved;
              const esSup = p.kind === 'MANAGER';
              return (
                <Fragment key={p.userId}>
                  <tr className={cn('border-b border-row-sep last:border-0', esSup && 'bg-violet/[0.06]')}>
                    <td className="px-4 py-2 font-semibold text-text-1 whitespace-nowrap sticky left-0 bg-bg-1">
                      {esSup && <span className="mr-1.5 rounded-full bg-violet/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-text">{t('kindManager')}</span>}
                      {p.name}
                      {p.roleKey && <span className="ml-1.5 text-[10px] font-normal text-text-3">{p.roleKey}</span>}
                    </td>
                    {esSup && p.result.goals.length === 0 ? (
                      <td colSpan={columnas.length} className="px-3 py-2 text-[12px] text-text-3">{t('managerRow', { hits: s.staffHits, total: s.staffTotal })}</td>
                    ) : columnas.map((c) => {
                      const r = p.result.goals.find((x) => c.ids.includes(x.goalId));
                      if (!r) return <td key={c.key} className="px-2 py-2 text-center text-text-3">—</td>;
                      return (
                        <td key={c.key} className="px-2 py-2 text-center">
                          <span className={cn('inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                            r.hit ? 'bg-emerald/15 text-emerald-text' : 'bg-amber/15 text-amber-text')}
                            title={r.roleTarget ? t('personalOwnTitle', { n: r.roleTarget }) : undefined}>{r.actual}/{r.target}{r.roleTarget ? '*' : ''}</span>
                          {r.adjusted ? <span className="block text-[10px] text-violet-text tabular-nums">{t('adjustedBy', { n: r.adjusted > 0 ? `+${r.adjusted}` : String(r.adjusted) })}</span> : null}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular-nums text-text-1">
                      {esSup
                        ? (p.result.goals.length > 0
                          ? t('managerMixed', { hits: p.result.goalsHit, total: p.result.goalsTotal, team: Math.round((p.result.teamProgress ?? 0) * 1000) / 10 })
                          : `${Math.round(p.result.progress * 1000) / 10}%`)
                        : `${p.result.goalsHit}/${p.result.goalsTotal}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-2">{esSup && p.result.goals.length === 0 ? '—' : p.result.points}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-text-1">{money(p.result.payoutCents)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {aprobado
                        ? <span className="rounded-full bg-emerald/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-text">{t('statusApproved')}</span>
                        : <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-text">{t('statusPending')}</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {!cerrado && (aprobado ? (
                        <button type="button" disabled={ocupado} onClick={() => void deshacer(p.userId)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-text-2 hover:bg-bg-2 disabled:opacity-40">{t('undoApprove')}</button>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          {p.roleKey && (
                            <button type="button" disabled={ocupado} onClick={() => { setEditandoMetas(editandoMetas === p.userId ? null : p.userId); setAjustando(null); }}
                              className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-text-1 hover:bg-bg-2 disabled:opacity-40">{t('personalGoals')}</button>
                          )}
                          {p.result.goals.length > 0 && (
                            <button type="button" disabled={ocupado} onClick={() => { setAjustando(ajustando === p.userId ? null : p.userId); setEditandoMetas(null); setAdjGoal(p.result.goals[0]?.goalId ?? ''); setAdjDelta(''); setAdjReason(''); }}
                              className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-text-1 hover:bg-bg-2 disabled:opacity-40">{t('adjust')}</button>
                          )}
                          <button
                            type="button"
                            disabled={!terminado || ocupado || (esSup && staffPendiente.length > 0)}
                            title={!terminado ? t('approveAfterMonth') : esSup && staffPendiente.length > 0 ? t('supervisorsAfterStaff') : undefined}
                            onClick={() => void aprobar([p.userId])}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald/15 px-2 py-1 text-xs font-semibold text-emerald-text disabled:opacity-40"
                          ><Check className="w-3.5 h-3.5" /> {t('approve')}</button>
                        </span>
                      ))}
                    </td>
                  </tr>
                  {editandoMetas === p.userId && !aprobado && !cerrado && (
                    <tr className="border-b border-row-sep">
                      <td colSpan={columnas.length + 6} className="px-4 py-3 bg-bg-2/40">
                        <MetasPersonalesEditor
                          periodId={periodId} name={p.name} userId={p.userId} label={label}
                          goals={goals.filter((g) => metaAplica(g, p.roleKey))}
                          targets={(p.targets ?? null) as MetasPersonales | null}
                          onClose={() => setEditandoMetas(null)}
                          onSaved={() => { setEditandoMetas(null); onChanged(); }}
                          onError={error}
                        />
                      </td>
                    </tr>
                  )}
                  {ajustando === p.userId && (
                    <tr className="border-b border-row-sep">
                      <td colSpan={columnas.length + 6} className="px-4 py-2 bg-bg-2/40">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-text-2">{t('adjustTitle', { name: p.name })}</span>
                          <select id={`premios-adj-goal-${p.userId}`} value={adjGoal} onChange={(e) => setAdjGoal(e.target.value)}
                            className="rounded-md border border-border bg-bg-1 px-2 py-1 text-xs text-text-1">
                            {p.result.goals.map((r) => <option key={r.goalId} value={r.goalId}>{goalLabel(r.goalId)} ({r.actual}/{r.target})</option>)}
                          </select>
                          <input id={`premios-adj-delta-${p.userId}`} type="number" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)}
                            placeholder={t('adjustDeltaPh')} className="w-24 rounded-md border border-border bg-bg-1 px-2 py-1 text-xs text-text-1 tabular-nums" />
                          <input id={`premios-adj-reason-${p.userId}`} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} maxLength={200}
                            placeholder={t('adjustReasonPh')} className="flex-1 min-w-[12rem] rounded-md border border-border bg-bg-1 px-2 py-1 text-xs text-text-1" />
                          <button type="button"
                            disabled={ocupado || !adjGoal || !Number(adjDelta) || !Number.isInteger(Number(adjDelta)) || adjReason.trim().length < 3}
                            onClick={() => void guardarAjuste(p.userId)}
                            className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">{t('adjustSave')}</button>
                          <button type="button" onClick={() => setAjustando(null)} className="rounded p-1 text-text-3" aria-label={t('cancel')}><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[11px] text-text-3">{t('adjustHint')}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {(data.adjustments ?? []).length > 0 && (
        <section className="rounded-lg bg-bg-2/30 p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-2">{t('adjustmentsTitle')}</h3>
          <ul className="flex flex-col gap-1.5">
            {(data.adjustments ?? []).map((a) => {
              const aprobado = data.participants.find((p) => p.userId === a.userId)?.result.approved;
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-bg-2/40 px-3 py-1.5 text-[12px]">
                  <span className="min-w-0 text-text-1">
                    <b>{nombre(a.userId)}</b> · {goalLabel(a.goalId)} · <span className="tabular-nums text-violet-text">{a.delta > 0 ? `+${a.delta}` : a.delta}</span>
                    <span className="text-text-3"> — {a.reason}</span>
                  </span>
                  {!cerrado && !aprobado && (
                    <button type="button" disabled={ocupado}
                      onClick={() => void removeAdj.mutateAsync({ adjustmentId: a.id }).then(onChanged).catch(error)}
                      className="shrink-0 rounded p-1 text-text-3 hover:text-rose-text" aria-label={t('remove')}><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-[11px] text-text-3">{t('boardExplain')}</p>
    </div>
  );
}
