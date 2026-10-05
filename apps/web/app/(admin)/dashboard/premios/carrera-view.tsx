'use client';

/**
 * Admin → Premios → Carrera (Erick, 2026-10-05).
 *
 * Todos los participantes en una misma pista, un carril cada uno, en vivo.
 * El caballo NO avanza por metas cumplidas como en "Mis premios": avanza con el
 * promedio de avance de SUS metas (lo que lleva ÷ su meta, tope 100%). Con metas
 * cumplidas, los primeros días del mes estarían todos quietos en la salida y no
 * se vería quién va bien. La plata sí se mueve solo con metas cumplidas: la
 * cuenta del pago es la de `calcularPeriodo`, que llega hecha del router.
 *
 * La línea punteada es el ritmo de hoy: días hábiles pasados ÷ días hábiles del
 * mes. Es dónde tendría que ir cada uno para llegar justo a fin de mes.
 *
 * Solo para admins: un empleado nunca ve la carrera de los demás.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Coins, RefreshCw, TrendingUp, Trophy } from 'lucide-react';
import { cn } from '@precision/ui';
import {
  avanceDeMetaPct, avancePromedio, diasHabiles, llegaARitmo, type RewardGoal,
} from '@precision-medical/database/premios';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';
import { KpiCard } from '../metricas/metricas-shared';

type Overview = inferRouterOutputs<AppRouter>['premios']['overview'];
type Participante = Overview['participants'][number];
type Estado = 'ahead' | 'on' | 'behind' | 'idle';

/** Lo que tarda la largada: igual que la pista de "Mis premios". */
const LARGADA_MS = 1400;

const ESTILO: Record<Estado, { dot: string; text: string }> = {
  ahead: { dot: 'bg-emerald', text: 'text-emerald-text' },
  on: { dot: 'bg-cyan', text: 'text-cyan-text' },
  behind: { dot: 'bg-amber', text: 'text-amber-text' },
  idle: { dot: 'bg-text-muted', text: 'text-text-muted' },
};

export function CarreraView({ data, money, updatedAt, refreshing, onRefresh }: {
  data: Overview; money: (c: number) => string;
  updatedAt: number; refreshing: boolean; onRefresh: () => void;
}): React.ReactElement {
  const t = useTranslations('rewards.race');
  const locale = useLocale();
  const goals = data.goals as RewardGoal[];
  const label = (id: string) => { const g = goals.find((x) => x.id === id); return g ? (locale === 'en' ? g.labelEn : g.labelEs) : '—'; };
  const s = data.summary!;
  const share = s.shareCents;

  // El reloj del "hace X min" y del ritmo: se mueve solo, aunque no llegue nada nuevo.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(i); }, []);
  useEffect(() => { setAhora(Date.now()); }, [updatedAt]);
  const dias = useMemo(() => diasHabiles(data.period!.month, new Date(ahora)), [data.period, ahora]);
  const ritmo = dias.total > 0 ? dias.pasados / dias.total : 0;
  const haceMin = Math.max(0, Math.floor((ahora - updatedAt) / 60_000));

  const filas = useMemo(() => {
    const staff = data.participants.filter((p) => p.kind === 'STAFF');
    const staffGoals = staff.flatMap((p) => p.result.goals);
    const equipo = avancePromedio(staffGoals) ?? 0;
    const equipoProy = staffGoals.filter((g) => llegaARitmo(g, dias)).length;
    const nEquipo = Math.max(1, staffGoals.length);
    return data.participants.map((p) => {
      const gs = p.result.goals;
      const sup = p.kind === 'MANAGER';
      const propio = avancePromedio(gs);
      const avance = sup ? (propio === null ? equipo : (propio + equipo) / 2) : (propio ?? 0);
      const proyHits = gs.filter((g) => llegaARitmo(g, dias)).length;
      // La proyección replica las reglas de `calcularPeriodo` con las metas que llegarían.
      const proyCents = !sup
        ? (gs.length ? Math.round((share * proyHits) / gs.length) : 0)
        : gs.length
          ? Math.round((share * (proyHits / gs.length + equipoProy / nEquipo)) / 2)
          : Math.round((share * equipoProy) / nEquipo);
      const activo = sup && !gs.length ? true : gs.some((g) => g.actual > 0);
      const estado: Estado = p.result.approved ? 'on'
        : !activo ? 'idle'
        : avance >= ritmo * 1.1 ? 'ahead'
        : avance >= ritmo * 0.8 ? 'on'
        : 'behind';
      return { p, sup, propio, avance, proyHits, proyCents, estado, equipo, equipoProy, nEquipo: staffGoals.length };
    }).sort((a, b) => b.avance - a.avance);
  }, [data.participants, dias, share, ritmo]);

  const [elegido, setElegido] = useState<string | null>(null);
  const sel = filas.find((f) => f.p.userId === elegido) ?? filas[0];

  // La largada: arrancan en la salida y corren a su lugar al montar. Después,
  // con cada recarga, se mueven solos con la transición.
  const [salio, setSalio] = useState(false);
  const [corriendo, setCorriendo] = useState(true);
  useEffect(() => {
    const r = requestAnimationFrame(() => setSalio(true));
    const fin = setTimeout(() => setCorriendo(false), LARGADA_MS + 200);
    return () => { cancelAnimationFrame(r); clearTimeout(fin); };
  }, []);

  const proyTotal = filas.reduce((acc, f) => acc + f.proyCents, 0);
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Coins} label={t('kpiPool')} value={money(s.poolCents)} sub={t('kpiPoolSub', { n: data.participants.length, share: money(share) })} color="bg-brand/10 text-brand-text" />
        <KpiCard icon={Trophy} label={t('kpiEarned')} value={money(s.paidCents)} sub={t('kpiEarnedSub')} color="bg-emerald/10 text-emerald-text" />
        <KpiCard icon={TrendingUp} label={t('kpiProjected')} value={money(proyTotal)} sub={t('kpiProjectedSub', { n: dias.pasados })} color="bg-violet/10 text-violet-text" />
        <KpiCard icon={Calendar} label={t('kpiDay')} value={t('kpiDayValue', { n: dias.pasados, total: dias.total })} sub={t('kpiDaySub', { pct: pct(ritmo) })} color="bg-cyan/10 text-cyan-text" />
      </div>

      <section className="rounded-lg bg-bg-2/30 p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">🏁 {t('title')}</h2>
            <p className="text-[12px] text-text-3 mt-1 max-w-2xl">{t('explain')}</p>
          </div>
          <button
            type="button" onClick={onRefresh} disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-text-3 hover:text-text-1 hover:bg-bg-2 disabled:opacity-60"
            aria-label={t('refresh')}
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald" />
            </span>
            {haceMin === 0 ? t('updatedNow') : t('updatedAgo', { n: haceMin })}
            <RefreshCw className={cn('w-3 h-3', refreshing && 'motion-safe:animate-spin')} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-3">
          {(['ahead', 'on', 'behind', 'idle'] as Estado[]).map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', ESTILO[e].dot)} />{t(`state.${e}`)}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 border-l border-dashed border-text-2" />{t('paceLine')}</span>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {filas.map((f, i) => {
            const x = Math.round(f.avance * 1000) / 10;
            const pos = salio ? x : 0;
            const est = ESTILO[f.estado];
            const elegida = sel?.p.userId === f.p.userId;
            return (
              <button
                key={f.p.userId} type="button" onClick={() => setElegido(f.p.userId)}
                aria-pressed={elegida}
                aria-label={t('laneAria', { name: f.p.name, pct: pct(f.avance), amount: money(f.p.result.payoutCents) })}
                className="group flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                <div className="sm:w-40 shrink-0 flex sm:flex-col items-baseline sm:items-start gap-x-2 min-w-0">
                  <span className="text-[13px] font-semibold text-text-1 truncate">
                    <span className="text-text-muted tabular-nums mr-1">{i + 1}.</span>{f.p.name}
                  </span>
                  <span className="text-[10.5px] truncate inline-flex items-center gap-1">
                    {f.sup && <span className="rounded-full bg-violet/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-text">{t('supervisor')}</span>}
                    <span className="text-text-3">{f.p.roleKey ?? ''}</span>
                  </span>
                </div>
                <div className={cn(
                  'relative h-11 w-full sm:w-auto sm:flex-1 shrink-0 rounded-full bg-bg-2 transition-shadow',
                  elegida ? 'shadow-[inset_0_0_0_1px_rgba(99,102,241,.7)]' : 'group-hover:shadow-[inset_0_0_0_1px_rgba(99,102,241,.35)]',
                )}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald/5 to-emerald/25 transition-[width] ease-out" style={{ width: `${pos}%`, transitionDuration: `${LARGADA_MS}ms` }} />
                  <div className="absolute left-4 right-8 top-1/2 -translate-y-1/2 border-t border-dashed border-border-strong" aria-hidden />
                  <div className="absolute inset-y-1 border-l border-dashed border-text-2/60" style={{ left: `${ritmo * 100}%` }} aria-hidden />
                  <div
                    className="absolute inset-y-0 right-0 w-2.5 rounded-r-full opacity-70"
                    style={{ background: 'repeating-conic-gradient(var(--text-1) 0 25%, transparent 0 50%) 0 0 / 5px 5px' }}
                    aria-hidden
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1 transition-[left] ease-out pointer-events-none"
                    style={{ left: `clamp(2px, calc(${pos}% - 18px), calc(100% - 52px))`, transitionDuration: `${LARGADA_MS}ms` }}
                    aria-hidden
                  >
                    <span className={cn('block', corriendo && 'motion-safe:animate-bounce')}>
                      <span className="block text-[24px] leading-none -scale-x-100">🏇</span>
                    </span>
                    <span className="whitespace-nowrap rounded bg-bg-0/80 px-1 text-[10px] font-bold tabular-nums text-text-2">{x}%</span>
                  </div>
                </div>
                <div className="sm:w-48 shrink-0 flex sm:flex-col items-baseline sm:items-end gap-x-2 justify-between">
                  <span className="text-[14px] font-bold tabular-nums text-emerald-text">
                    {money(f.p.result.payoutCents)}{' '}
                    <span className="text-[10.5px] font-normal text-text-3">
                      {f.sup && !f.p.result.goals.length ? t('team') : t('goalsShort', { hit: f.p.result.goalsHit, total: f.p.result.goalsTotal })}
                    </span>
                  </span>
                  <span className={cn('inline-flex items-center gap-1.5 text-[10.5px]', est.text)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', est.dot)} />
                    {f.p.result.approved ? t('approved') : t(`state.${f.estado}`)}
                    <span className="text-text-3">· {t('projShort', { amount: money(f.proyCents) })}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {sel && <Detalle f={sel} share={share} staffHits={s.staffHits} staffTotal={s.staffTotal} ritmo={ritmo} dias={dias} money={money} label={label} pct={pct} />}

      <p className="text-[11px] text-text-3">{t('privacy')}</p>
    </div>
  );
}

function Detalle({ f, share, staffHits, staffTotal, ritmo, dias, money, label, pct }: {
  f: {
    p: Participante; sup: boolean; propio: number | null; avance: number; proyHits: number; proyCents: number;
    estado: Estado; equipo: number; equipoProy: number; nEquipo: number;
  };
  share: number; staffHits: number; staffTotal: number; ritmo: number; dias: { total: number; pasados: number };
  money: (c: number) => string; label: (id: string) => string; pct: (x: number) => string;
}): React.ReactElement {
  const t = useTranslations('rewards.race');
  const r = f.p.result;
  const gs = r.goals;
  const est = ESTILO[f.estado];

  const cuenta = !f.sup
    ? t('howStaff', { share: money(share), n: gs.length, per: money(gs.length ? Math.round(share / gs.length) : 0), hit: r.goalsHit, amount: money(r.payoutCents) })
    : !gs.length
      ? t('howTeam', { share: money(share), hit: staffHits, total: staffTotal, amount: money(r.payoutCents) })
      : t('howMixed', { share: money(share), hit: r.goalsHit, n: gs.length, teamHit: staffHits, teamTotal: staffTotal, amount: money(r.payoutCents) });
  const proy = f.sup && !gs.length
    ? t('projTeam', { hit: f.equipoProy, total: f.nEquipo, amount: money(f.proyCents) })
    : t('projOwn', { hit: f.proyHits, total: gs.length, amount: money(f.proyCents) });

  return (
    <section className="rounded-lg bg-bg-2/30 p-4 sm:p-5 flex flex-col gap-3" aria-live="polite">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">🏇 {f.p.name}</h2>
          <p className="text-[12px] text-text-3 mt-1">
            {f.sup ? t('supervisor') : t('staff')}{f.p.roleKey ? ` · ${f.p.roleKey}` : ''}
            {' · '}<span className={est.text}>{r.approved ? t('approved') : t(`state.${f.estado}`)}</span>
            {' · '}{t('progressVsPace', { pct: pct(f.avance), pace: pct(ritmo) })}
            {f.sup && ` · ${t('ownAndTeam', { own: f.propio === null ? '—' : pct(f.propio), team: pct(f.equipo) })}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-3">{r.approved ? t('approved') : t('toEarn')}</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-text">{money(r.payoutCents)}</div>
        </div>
      </div>

      <div className="rounded-md bg-bg-2/40 p-3 flex flex-col gap-1 text-[12.5px] text-text-2">
        <div><span className="text-[10px] uppercase tracking-wider font-semibold text-text-3 mr-2">{t('howTitle')}</span>{cuenta}</div>
        {!r.approved && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-3 mr-2">{t('projTitle')}</span>{proy}
            {dias.pasados < 5 && <span className="text-text-3"> {t('projEarly', { n: dias.pasados })}</span>}
          </div>
        )}
      </div>

      {gs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {gs.map((g) => {
            const a = avanceDeMetaPct(g);
            const llega = llegaARitmo(g, dias);
            const deberia = Math.ceil(g.target * ritmo);
            return (
              <div key={g.goalId} className="rounded-md bg-bg-2/40 p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-text-1">{label(g.goalId)}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
                    g.hit ? 'bg-emerald/15 text-emerald-text' : llega ? 'bg-cyan/15 text-cyan-text' : 'bg-amber/15 text-amber-text')}>
                    {g.hit ? t('goalHit') : llega ? t('goalOnTrack') : t('goalOffTrack')}
                  </span>
                </div>
                <div className="text-lg font-bold tabular-nums text-text-1">
                  {g.actual}<span className="text-xs font-semibold text-text-3"> / {g.target}</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-bg-3">
                  <div className={cn('h-full rounded-full', g.hit ? 'bg-emerald' : 'bg-amber')} style={{ width: `${a * 100}%` }} />
                  <div className="absolute -top-1 -bottom-1 border-l border-dashed border-text-2/70" style={{ left: `${ritmo * 100}%` }} aria-hidden />
                </div>
                <span className="text-[10.5px] text-text-3">
                  {t('shouldHave', { n: deberia })}
                  {g.roleTarget ? ` · ${t('ownGoal', { n: g.roleTarget })}` : ''}
                  {g.adjusted ? ` · ${t('adjusted', { n: g.adjusted > 0 ? `+${g.adjusted}` : String(g.adjusted) })}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[12px] text-text-3">{t('noOwnGoals', { pct: pct(f.equipo) })}</p>
      )}
    </section>
  );
}
