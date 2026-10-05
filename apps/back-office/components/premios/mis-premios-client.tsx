'use client';

/**
 * "Mis premios" — cómo va cada participante en el mes.
 *
 * Todo lo que se muestra sale de `/api/premios/mio`, que devuelve SOLO lo de
 * quien pregunta (y el equipo, si es la manager). Los montos y las metas los
 * calcula `calcularPeriodo` en el servidor: esta pantalla no hace cuentas de
 * plata, solo las formatea.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Coins, RefreshCw, Target, Trophy, Trash2, TrendingUp, Users } from 'lucide-react';
import { Button, cn } from '@precision/ui';
import {
  METRICAS, USO_TOPE_DIARIO, columnasDeMetas, diasHabiles, llegaARitmo, type MetricKey, type ParticipantResult, type RewardCategory, type RewardGoal,
} from '@precision-medical/database/premios';
import {
  DataTable, EmptyState, IconAction, KpiCard, PageHeader, Skeleton, StatusPill, TagPill, useToast,
} from '@/components/ui-phoenix';
import { fechaCorta } from '@/lib/fechas';
import { PistaDelPremio } from './pista-del-premio';

interface Entry {
  id: string;
  occurredOn: string;
  categoryCode: string;
  patient: { code: string | null; name: string } | null;
  source: string | null;
  isNewPatient: boolean | null;
  points: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectReason: string | null;
  origin: 'MANUAL' | 'AUTO';
}

/** El mes anterior: se aprueba después de terminar ("En revisión" → "Aprobado"). */
interface Previous {
  month: string; approved: boolean; payoutCents: number;
  goalsHit: number; goalsTotal: number; kind: 'STAFF' | 'MANAGER'; progress: number;
}

interface Data {
  participating: true;
  month: string;
  status: string;
  approved: boolean;
  adjustments: Array<{ goalId: string; delta: number; reason: string }>;
  previous: Previous | null;
  poolCents: number;
  shareCents: number;
  participantsCount: number;
  me: ParticipantResult;
  goals: RewardGoal[];
  entries: Entry[];
  team: Array<{ userId: string; name: string; result: ParticipantResult }> | null;
  categories: RewardCategory[];
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'fuera'; previous: Previous | null }
  | { tipo: 'listo'; data: Data };

/** Cada cuánto se recalcula sola la pantalla abierta. */
const REFRESCO_MS = 90_000;

export function MisPremiosClient(): React.ReactElement {
  const t = useTranslations('phoenix.rewards');
  const locale = useLocale();
  const toast = useToast();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  // En vivo (Erick, 2026-10-03): la pantalla se recalcula sola mientras está abierta.
  const [actualizado, setActualizado] = useState<number | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  // Un pedido a la vez, y cuándo salió el último: el evento de "volví a la pestaña"
  // puede dispararse muchas veces seguidas, y sin esto cada uno era un pedido más.
  const enCurso = useRef(false);
  const ultimo = useRef(0);

  /**
   * `enVivo`: la recarga de fondo. Si falla, se queda lo que ya se ve —un corte
   * de red no tiene que borrar la pantalla—; el próximo intento lo resuelve.
   */
  const cargar = useCallback(async (enVivo = false) => {
    if (enCurso.current) return;
    enCurso.current = true;
    ultimo.current = Date.now();
    if (enVivo) setRefrescando(true);
    try {
      const res = await fetch('/api/premios/mio', { cache: 'no-store' });
      if (!res.ok) { if (!enVivo) setEstado({ tipo: 'error' }); return; }
      const body = (await res.json()) as Data | { participating: false; previous: Previous | null };
      setEstado(body.participating ? { tipo: 'listo', data: body } : { tipo: 'fuera', previous: body.previous ?? null });
      setActualizado(Date.now());
    } catch {
      if (!enVivo) setEstado({ tipo: 'error' });
    } finally {
      enCurso.current = false;
      if (enVivo) setRefrescando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // Cada 90 s con la pestaña a la vista, y al volver a ella si pasó más de un
  // minuto. Con la pestaña escondida no se pide nada: nadie lo está mirando.
  useEffect(() => {
    const visible = () => document.visibilityState === 'visible';
    const tic = setInterval(() => { setAhora(Date.now()); if (visible()) void cargar(true); }, REFRESCO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    const alVolver = () => {
      if (!visible()) return;
      setAhora(Date.now());
      if (Date.now() - ultimo.current > 60_000) void cargar(true);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(tic); clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);
  const haceMin = actualizado ? Math.max(0, Math.floor((ahora - actualizado) / 60_000)) : 0;

  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const mesTexto = (mes: string) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${mes}T00:00:00Z`));
  const labelMeta = (g: RewardGoal) => (locale === 'en' ? g.labelEn : g.labelEs);

  const MesAnterior = ({ p }: { p: Previous }) => (
    <div className={cn('rounded-md border px-4 py-3 flex flex-wrap items-center justify-between gap-2',
      p.approved ? 'border-emerald/30 bg-emerald/10' : 'border-amber/30 bg-amber/10')}>
      <div className="min-w-0">
        <div className={cn('text-[10px] uppercase tracking-wider font-semibold', p.approved ? 'text-emerald-text' : 'text-amber-text')}>
          {mesTexto(p.month)} · {p.approved ? t('prevApproved') : t('prevInReview')}
        </div>
        <div className="text-[12.5px] text-text-2">
          {p.kind === 'MANAGER'
            ? t('prevTeam', { pct: Math.round(p.progress * 1000) / 10 })
            : t('prevGoals', { hit: p.goalsHit, total: p.goalsTotal })}
          {' · '}{p.approved ? t('prevApprovedHint') : t('prevInReviewHint')}
        </div>
      </div>
      <div className={cn('text-2xl font-bold tabular-nums', p.approved ? 'text-emerald-text' : 'text-amber-text')}>{money(p.payoutCents)}</div>
    </div>
  );

  async function borrar(id: string): Promise<void> {
    const res = await fetch(`/api/premios/registros/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success(t('deleted')); void cargar(); }
    else toast.error(t('errors.DELETE_FAILED'));
  }

  if (estado.tipo === 'cargando') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (estado.tipo === 'error') {
    return (
      <EmptyState.Rich
        icon={Trophy}
        title={t('loadFailed')}
        action={<Button variant="secondary" onClick={() => { setEstado({ tipo: 'cargando' }); void cargar(); }}>{t('retry')}</Button>}
      />
    );
  }
  if (estado.tipo === 'fuera') {
    return (
      <div className="flex flex-col gap-4">
        {estado.previous && <MesAnterior p={estado.previous} />}
        <EmptyState.Rich icon={Trophy} title={t('notParticipatingTitle')} subtitle={t('notParticipatingSub')} />
      </div>
    );
  }

  const d = estado.data;
  const me = d.me;
  const esManager = me.kind === 'MANAGER';
  const porMeta = Math.round(d.shareCents / Math.max(1, me.goalsTotal));
  const resDe = (id: string) => me.goals.find((r) => r.goalId === id);
  // Metas por rol: cada uno ve solo las suyas; la manager ve todas las del equipo.
  // Las metas propias: las de su rol. Un supervisor sin rol no tiene (cobra por su equipo).
  const misMetas = d.goals.filter((g) => !!resDe(g.id));
  const mixto = esManager && misMetas.length > 0;
  // La tabla del equipo: una columna por tipo de meta, aunque cada rol tenga la suya.
  const columnas = columnasDeMetas(d.goals);
  const faltan = misMetas.filter((g) => !resDe(g.id)?.hit).map(labelMeta);
  // Las métricas que todavía no suman (membresías): se anuncian, no se miden.
  const proximamente = (Object.keys(METRICAS) as MetricKey[]).filter((k) => METRICAS[k].comingSoon && METRICAS[k].points > 0);
  const abierto = d.status === 'OPEN';
  const dias = diasHabiles(d.month, new Date(ahora));
  const ritmo = dias.total > 0 ? dias.pasados / dias.total : 0;
  const nombreCat = (code: string) => {
    const c = d.categories.find((x) => x.code === code);
    return c ? (locale === 'en' ? c.nameEn : c.nameEs) : code;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {t('title')}
            {esManager && <TagPill label={t('managerBadge')} colorClass="bg-violet/15 text-violet-text border-violet/30" />}
          </span>
        }
        subtitle={esManager ? `${mesTexto(d.month)} · ${mixto ? t('managerExplainMixed') : t('managerExplain')}` : mesTexto(d.month)}
        action={abierto ? (
          <button
            type="button" onClick={() => void cargar(true)} disabled={refrescando}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-text-muted hover:text-text-1 hover:bg-bg-2 disabled:opacity-60"
            aria-label={t('refresh')}
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald" />
            </span>
            {haceMin === 0 ? t('updatedNow') : t('updatedAgo', { n: haceMin })}
            <RefreshCw className={cn('w-3 h-3', refrescando && 'motion-safe:animate-spin')} />
          </button>
        ) : undefined}
      />

      {d.previous && <MesAnterior p={d.previous} />}

      <PistaDelPremio
        me={me} goals={misMetas} shareCents={d.shareCents} labelMeta={labelMeta} money={money} approved={d.approved}
        month={d.month} open={abierto} team={d.team?.map((m) => m.result) ?? null}
      />

      {d.adjustments.length > 0 && (
        <div className="rounded-md border border-violet/30 bg-violet/10 px-3 py-2 text-[12px] text-text-1 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-violet-text">{t('adjustmentsTitle')}</span>
          {d.adjustments.map((a, i) => {
            const g = d.goals.find((x) => x.id === a.goalId);
            return (
              <span key={i}>
                <b>{g ? labelMeta(g) : '—'}</b> <span className="tabular-nums text-violet-text">{a.delta > 0 ? `+${a.delta}` : a.delta}</span>
                <span className="text-text-muted"> — {a.reason}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiShare')}
          value={money(d.shareCents)}
          sub={t('kpiShareSub', { pool: money(d.poolCents), n: d.participantsCount })}
          icon={Coins} iconBg="bg-brand/10" iconColor="text-brand-text"
        />
        {esManager ? (
          <KpiCard
            label={t('teamProgress')}
            value={`${Math.round((me.teamProgress ?? me.progress) * 1000) / 10}%`}
            sub={t('teamProgressSub', { hits: (d.team ?? []).reduce((s, m) => s + m.result.goalsHit, 0), total: (d.team ?? []).reduce((s, m) => s + m.result.goalsTotal, 0) })}
            icon={Users} iconBg="bg-violet/10" iconColor="text-violet-text"
          />
        ) : (
          <KpiCard
            label={t('kpiGoals')}
            value={`${me.goalsHit} / ${me.goalsTotal}`}
            sub={faltan.length ? t('kpiGoalsMissing', { list: faltan.join(', ') }) : t('kpiGoalsAll')}
            icon={Target} iconBg="bg-emerald/10" iconColor="text-emerald-text"
          />
        )}
        <KpiCard
          label={d.approved ? t('kpiApproved') : t('kpiEarning')}
          value={money(me.payoutCents)}
          sub={d.approved ? t('kpiApprovedSub') : t('kpiEarningSub')}
          color="text-emerald-text"
          icon={TrendingUp} iconBg="bg-emerald/10" iconColor="text-emerald-text"
        />
        <KpiCard
          label={t('kpiPoints')}
          value={me.points}
          sub={t('kpiPointsAuto')}
          icon={Trophy} iconBg="bg-amber/10" iconColor="text-amber-text"
        />
      </div>

      {misMetas.length > 0 && (
        <section className="rounded-lg bg-bg-1 p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
              <Target className="w-4 h-4 text-brand" /> {t('goalsTitle')}
            </h2>
            <span className="text-[11px] text-text-muted">
              {mixto ? t('goalEachMixed', { amount: money(Math.round(porMeta / 2)) }) : t('goalEach', { amount: money(porMeta) })}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {misMetas.map((g) => {
              const r = resDe(g.id);
              const actual = r?.actual ?? 0;
              const hit = !!r?.hit;
              // La meta es la de la persona: puede tener una propia, distinta a la del rol.
              const meta = r?.target ?? g.target;
              const pct = Math.min(100, Math.round((actual / meta) * 100));
              // A este ritmo, ¿llega? Y cuánto debería llevar hoy (días hábiles pasados ÷ del mes).
              const llega = !!r && llegaARitmo(r, dias);
              const deberia = Math.ceil(meta * ritmo);
              return (
                <div key={g.id} className={cn('rounded-md p-3 flex flex-col gap-1.5', hit ? 'bg-emerald/10' : 'bg-bg-2/40')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-text-1">{labelMeta(g)}</span>
                    {hit
                      ? <StatusPill state="success" label={t('goalDone')} />
                      : !abierto
                        ? <StatusPill state="warning" label={t('goalMissing', { n: meta - actual })} />
                        : llega
                          ? <StatusPill state="info" label={t('goalOnTrack')} />
                          : <StatusPill state="warning" label={t('goalSpeedUp')} />}
                  </div>
                  <div className="text-lg font-bold text-text-1 tabular-nums">
                    {actual}<span className="text-text-muted text-xs font-semibold"> / {meta}{g.kind === 'USAGE' ? ` ${t('pts')}` : ''}</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-bg-3">
                    <div className={cn('h-full rounded-full', hit ? 'bg-emerald' : abierto && llega ? 'bg-cyan' : 'bg-amber')} style={{ width: `${pct}%` }} />
                    {abierto && !hit && <div className="absolute -top-1 -bottom-1 border-l border-dashed border-text-2/70" style={{ left: `${ritmo * 100}%` }} aria-hidden />}
                  </div>
                  {abierto && (
                    <span className="text-[10.5px] text-text-muted">
                      {hit ? t('goalHave') : t('goalShouldHave', { n: deberia })}
                      {' · '}<span className="font-semibold text-emerald-text">+{money(mixto ? Math.round(porMeta / 2) : porMeta)}</span>
                    </span>
                  )}
                  {g.kind === 'USAGE' && <span className="text-[10.5px] text-text-muted">{t('goalUsageHint', { cap: USO_TOPE_DIARIO })}</span>}
                  {(g.kind === 'CALLS' || g.kind === 'METRIC') && <span className="text-[10.5px] text-text-muted">{t('goalAuto')}</span>}
                </div>
              );
            })}
            {proximamente.map((k) => (
              <div key={k} className="rounded-md p-3 flex flex-col gap-1.5 bg-bg-2/20 border border-dashed border-border-strong">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-text-2">{locale === 'en' ? METRICAS[k].en : METRICAS[k].es}</span>
                  <StatusPill state="neutral" label={t('comingSoon')} />
                </div>
                <span className="text-[10.5px] text-text-muted">{t('comingSoonHint')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {esManager && d.team && (
        <DataTable.Card>
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-violet" /> {t('teamTitle')}
            </h2>
          </div>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('colName')}</DataTable.Th>
                {columnas.map((c) => <DataTable.Th key={c.key} align="center">{labelMeta(c.goal)}</DataTable.Th>)}
                <DataTable.Th align="right" sticky="right">{t('colGoals')}</DataTable.Th>
              </DataTable.Head>
              <tbody>
                {d.team.map((m) => (
                  <DataTable.Row key={m.userId}>
                    <DataTable.Td sticky="left" className="font-semibold">{m.name}</DataTable.Td>
                    {columnas.map((c) => {
                      const g = c.goal;
                      const r = m.result.goals.find((x) => c.ids.includes(x.goalId));
                      return (
                        <DataTable.Td key={g.id} align="center">
                          {r ? (
                            <span className={cn(
                              'inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                              r.hit ? 'bg-emerald/15 text-emerald-text' : 'bg-amber/15 text-amber-text',
                            )}>{r.actual}/{r.target}</span>
                          ) : <span className="text-text-muted">—</span>}
                        </DataTable.Td>
                      );
                    })}
                    <DataTable.Td align="right" sticky="right" className="tabular-nums">{m.result.goalsHit}/{m.result.goalsTotal}</DataTable.Td>
                  </DataTable.Row>
                ))}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
        </DataTable.Card>
      )}

      {d.entries.length > 0 && (
      <DataTable.Card>
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
            <Trophy className="w-4 h-4 text-brand" /> {t('entriesTitle')}
          </h2>
        </div>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('colDate')}</DataTable.Th>
              <DataTable.Th>{t('colAchievement')}</DataTable.Th>
              <DataTable.Th>{t('colPatient')}</DataTable.Th>
              <DataTable.Th>{t('colSource')}</DataTable.Th>
              <DataTable.Th>{t('colType')}</DataTable.Th>
              <DataTable.Th align="right">{t('colPoints')}</DataTable.Th>
              <DataTable.Th>{t('colStatus')}</DataTable.Th>
              <DataTable.Th align="right" sticky="right"><span className="sr-only">{t('colActions')}</span></DataTable.Th>
            </DataTable.Head>
            <tbody>
              {d.entries.length === 0 ? (
                <tr><td colSpan={8}><EmptyState.Inline message={t('entriesEmpty')} /></td></tr>
              ) : d.entries.map((e) => (
                <DataTable.Row key={e.id} muted={e.status === 'REJECTED'}>
                  <DataTable.Td sticky="left" className="tabular-nums whitespace-nowrap">{fechaCorta(`${e.occurredOn}T12:00:00Z`)}</DataTable.Td>
                  <DataTable.Td>{nombreCat(e.categoryCode)}</DataTable.Td>
                  <DataTable.Td className="text-[12.5px]">
                    {e.patient ? <>{e.patient.name}{e.patient.code && <span className="text-text-muted"> · {e.patient.code}</span>}</> : <span className="text-text-muted">—</span>}
                  </DataTable.Td>
                  <DataTable.Td className="text-[12.5px]">{e.source ? t(`source.${e.source}`) : <span className="text-text-muted">—</span>}</DataTable.Td>
                  <DataTable.Td className="text-[12.5px]">
                    {e.isNewPatient === null ? <span className="text-text-muted">—</span> : e.isNewPatient ? t('typeNew') : t('typeExisting')}
                  </DataTable.Td>
                  <DataTable.Td align="right" className={cn('tabular-nums', e.status !== 'VERIFIED' && 'text-text-muted')}>
                    {e.status === 'VERIFIED' ? `+${e.points}` : e.points}
                  </DataTable.Td>
                  <DataTable.Td>
                    {e.origin === 'AUTO'
                      ? <StatusPill state="success" label={t('status.AUTO')} />
                      : e.status === 'VERIFIED'
                        ? <StatusPill state="success" label={t('status.VERIFIED')} />
                        : e.status === 'REJECTED'
                          ? <StatusPill state="danger" label={e.rejectReason ? t('rejectedWith', { reason: e.rejectReason }) : t('status.REJECTED')} />
                          : <StatusPill state="warning" label={t('status.PENDING')} />}
                  </DataTable.Td>
                  <DataTable.Td align="right" sticky="right">
                    {e.status === 'PENDING' && e.origin === 'MANUAL' && abierto && (
                      <IconAction icon={Trash2} label={t('delete')} variant="danger" onClick={() => void borrar(e.id)} />
                    )}
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
      </DataTable.Card>
      )}
    </div>
  );
}
