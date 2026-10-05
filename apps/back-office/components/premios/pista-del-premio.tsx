'use client';

/**
 * La pista del premio: un caballo que corre hacia la plata de cada uno.
 *
 * A diferencia de la Carrera del Admin, acá no hay rivales: el carril es uno
 * solo y la meta es la PARTE de la persona (bolsa ÷ participantes).
 *
 * Desde 2026-10-05 (Erick, mockup aprobado) el caballo avanza con el AVANCE de
 * sus metas —lo que lleva ÷ su meta, tope 100%—, igual que en la Carrera del
 * Admin. Antes avanzaba solo con metas cumplidas, y los primeros días del mes
 * estaban todos clavados en la salida con $0: justo cuando más importa motivar.
 * La plata sigue moviéndose solo con metas cumplidas (`payoutCents` llega hecho
 * del servidor); la proyección va en gris y es solo una referencia.
 *
 * La línea punteada es el ritmo de hoy: días hábiles pasados ÷ días hábiles del
 * mes. Supervisor: mitad sus metas y mitad su equipo; sin rol, solo el equipo.
 *
 * Detalles del caballo copiados de la Carrera (`packages/ui/.../carrera.tsx`):
 * el emoji mira a la izquierda y se espeja; el galope va en una capa aparte
 * porque los keyframes de `bounce` pisan el transform; y el `clamp` evita que
 * se salga de la pista en los extremos.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, Trophy } from 'lucide-react';
import { cn } from '@precision/ui';
import {
  avanceDeMetaPct, avancePromedio, diasHabiles, llegaARitmo,
  type ParticipantResult, type RewardGoal,
} from '@precision-medical/database/premios';

interface Props {
  me: ParticipantResult;
  /** Sus metas (las de su rol, con su número propio en `me.goals`). */
  goals: RewardGoal[];
  shareCents: number;
  labelMeta: (g: RewardGoal) => string;
  money: (cents: number) => string;
  /** Aprobado por el Admin: el monto ya es fijo. Antes, es "por ganar". */
  approved?: boolean;
  /** Primer día del mes (YYYY-MM-DD): de ahí salen los días hábiles. */
  month: string;
  /** Mes abierto: con el mes cerrado no hay ritmo ni proyección que mostrar. */
  open: boolean;
  /** Supervisor: los resultados de su equipo (staff). */
  team?: ParticipantResult[] | null;
}

/** Lo que tarda la largada. Igual que la Carrera, para que se sientan parientes. */
const LARGADA_MS = 1400;

export function PistaDelPremio({ me, goals, shareCents, labelMeta, money, approved = false, month, open, team }: Props): React.ReactElement {
  const t = useTranslations('phoenix.rewards.track');
  const locale = useLocale();
  // Los pesos tienen medios puntos (confirmar una cita vale 0.5).
  const pts = (n: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es', { maximumFractionDigits: 1 }).format(n);
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const esManager = me.kind === 'MANAGER';
  const gs = me.goals;
  const conMetas = gs.length > 0;
  const soloEquipo = esManager && !conMetas;

  // El ritmo se recalcula solo: si la pantalla queda abierta de un día para otro, avanza.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setAhora(Date.now()), 5 * 60_000); return () => clearInterval(i); }, []);
  const dias = useMemo(() => diasHabiles(month, new Date(ahora)), [month, ahora]);
  const ritmo = dias.total > 0 ? dias.pasados / dias.total : 0;

  const c = useMemo(() => {
    const equipoGoals = (team ?? []).flatMap((r) => r.goals);
    const equipo = avancePromedio(equipoGoals) ?? 0;
    const equipoProy = equipoGoals.filter((g) => llegaARitmo(g, dias)).length;
    const propio = avancePromedio(gs);
    const avance = !esManager ? (propio ?? 0) : propio === null ? equipo : (propio + equipo) / 2;
    const proyHits = gs.filter((g) => llegaARitmo(g, dias)).length;
    // La proyección replica las reglas de `calcularPeriodo` con las metas que llegarían.
    const nEq = Math.max(1, equipoGoals.length);
    const proyCents = !esManager
      ? (conMetas ? Math.round((shareCents * proyHits) / gs.length) : 0)
      : conMetas
        ? Math.round((shareCents * (proyHits / gs.length + equipoProy / nEq)) / 2)
        : Math.round((shareCents * equipoProy) / nEq);
    const activo = soloEquipo ? equipoGoals.some((g) => g.actual > 0) : gs.some((g) => g.actual > 0);
    const estado: 'ahead' | 'on' | 'behind' | 'idle' = !activo ? 'idle'
      : avance >= ritmo * 1.1 ? 'ahead' : avance >= ritmo * 0.8 ? 'on' : 'behind';
    return { avance, proyHits, proyCents, estado };
  }, [team, gs, esManager, conMetas, soloEquipo, shareCents, dias, ritmo]);

  // Lo que vale cumplir una meta propia: la parte entera ÷ sus metas; un
  // supervisor con rol cobra la mitad por lo suyo.
  const porMeta = conMetas ? Math.round(shareCents / gs.length / (esManager ? 2 : 1)) : 0;
  // Opción B (Erick, 2026-10-05): si a este ritmo no llega a nada, en vez de
  // "$0" se le muestra la meta que tiene más cerca y lo que suma cumplirla.
  const masCerca = useMemo(() => {
    const pendientes = gs.filter((g) => !g.hit);
    if (!pendientes.length) return null;
    const r = [...pendientes].sort((a, b) => avanceDeMetaPct(b) - avanceDeMetaPct(a))[0]!;
    const g = goals.find((x) => x.id === r.goalId);
    return g ? { g, r } : null;
  }, [gs, goals]);
  const mostrarCerca = open && !approved && c.proyCents === 0 && !!masCerca;

  // Para ponerse al día hoy: las metas que van más atrás del ritmo (hasta tres).
  const atrasos = gs
    .filter((g) => !g.hit)
    .map((g) => ({ r: g, falta: Math.ceil(g.target * ritmo) - g.actual, g: goals.find((x) => x.id === g.goalId) }))
    .filter((a) => a.falta > 0 && a.g)
    .sort((a, b) => b.falta / b.r.target - a.falta / a.r.target)
    .slice(0, 3)
    .map((a) => (a.g!.kind === 'USAGE' ? t('deficitUsage', { n: a.falta }) : t('deficitItem', { n: a.falta, goal: labelMeta(a.g!).toLowerCase() })));

  const llego = conMetas && gs.every((g) => g.hit) && !soloEquipo;
  const enCurso = open && !approved;

  // La largada: arranca en la salida y corre hasta su lugar al montar.
  const [salio, setSalio] = useState(false);
  const [corriendo, setCorriendo] = useState(true);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSalio(true));
    const fin = setTimeout(() => setCorriendo(false), LARGADA_MS + 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(fin); };
  }, []);

  const anim = { transitionDuration: `${LARGADA_MS}ms` };
  const x = Math.round(c.avance * 1000) / 10;
  const posicion = salio ? x : 0;

  const mensaje = !enCurso ? null : llego ? (
    <div className="rounded-md border border-emerald/30 bg-emerald/10 px-3 py-2 text-[12.5px] text-emerald-text">
      <span className="font-semibold">{t('done')}</span> {t('doneSub', { n: gs.length })}
    </div>
  ) : soloEquipo ? (
    <div className={cn('rounded-md border px-3 py-2 text-[12.5px]',
      c.estado === 'behind' ? 'border-amber/30 bg-amber/10 text-amber-text' : 'border-cyan/30 bg-cyan/10 text-cyan-text')}>
      {c.estado === 'ahead' ? t('msgTeamAhead') : c.estado === 'behind' ? t('msgTeamBehind') : t('msgTeamOn')}
    </div>
  ) : c.estado === 'ahead' ? (
    <div className="rounded-md border border-emerald/30 bg-emerald/10 px-3 py-2 text-[12.5px] text-emerald-text">
      <span className="font-semibold">{t('msgAheadTitle')}</span> {t('msgAhead', { hit: c.proyHits, total: gs.length })}
      {esManager && ` ${t('msgTeamHalf')}`}
    </div>
  ) : c.estado === 'on' ? (
    <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[12.5px] text-cyan-text">
      <span className="font-semibold">{t('msgOnTitle')}</span> {t('msgOn')}
    </div>
  ) : c.estado === 'behind' ? (
    <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[12.5px] text-amber-text">
      <span className="font-semibold">{t('msgBehindTitle')}</span>{' '}
      {atrasos.length ? t('msgBehind', { list: atrasos.join(', '), days: dias.total - dias.pasados }) : t('msgBehindNoList', { days: dias.total - dias.pasados })}
    </div>
  ) : (
    <div className="rounded-md bg-bg-2/40 px-3 py-2 text-[12.5px] text-text-2">
      <span className="font-semibold">{t('msgIdleTitle')}</span> {t('msgIdle')}
    </div>
  );

  return (
    <section className="rounded-lg bg-bg-1 p-5 flex flex-col gap-4" aria-label={t('aria', { earned: money(me.payoutCents), total: money(shareCents) })}>
      {/* Encabezado: dónde va y cuánto lleva, antes que la pista. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 max-w-md">
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
            <Flag className="w-4 h-4 text-emerald" /> {t('title')}
          </h2>
          <p className="text-[12px] text-text-muted mt-1">{soloEquipo ? t('subtitleTeamPace') : t('subtitlePace')}</p>
        </div>
        <div className="flex items-end gap-5 flex-wrap">
          <Dato label={t('points')} className="text-amber-text">{pts(me.points)}</Dato>
          <Dato label={approved ? t('approved') : t('earned')} className="text-emerald-text">{money(me.payoutCents)}</Dato>
          {enCurso && (mostrarCerca ? (
            <Dato label={t('closest')} className="text-text-muted" sub={t('closestSub', { goal: labelMeta(masCerca!.g), actual: masCerca!.r.actual, target: masCerca!.r.target })}>
              ≈ +{money(porMeta)}
            </Dato>
          ) : (
            <Dato label={t('projected')} className="text-text-muted">{money(c.proyCents)}</Dato>
          ))}
          <Dato label={t('goalFull')} className="text-text-1">
            <span className="inline-flex items-center gap-1.5"><Trophy className="w-5 h-5 text-amber" /> {money(shareCents)}</span>
          </Dato>
        </div>
      </div>

      {/* La pista */}
      <div className="pt-7 pb-1">
        <div className="relative h-14 rounded-full bg-bg-2 ring-1 ring-inset ring-white/[0.03]">
          {/* Lo ya recorrido. */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] ease-out',
              llego ? 'bg-gradient-to-r from-emerald/30 to-amber/40' : 'bg-gradient-to-r from-emerald/10 to-emerald/35',
            )}
            style={{ width: `${posicion}%`, ...anim }}
          />

          {/* La línea del carril, punteada, de punta a punta. */}
          <div className="absolute left-5 right-10 top-1/2 -translate-y-1/2 border-t border-dashed border-border-strong" aria-hidden />

          {/* El ritmo de hoy. */}
          {enCurso && <div className="absolute inset-y-1 border-l-2 border-dashed border-text-2/70" style={{ left: `${ritmo * 100}%` }} aria-hidden />}

          {/* Meta: bandera a cuadros y el trofeo. */}
          <div
            className="absolute inset-y-0 right-0 w-3 rounded-r-full opacity-80"
            style={{ background: 'repeating-conic-gradient(var(--text-1) 0 25%, transparent 0 50%) 0 0 / 6px 6px' }}
            aria-hidden
          />
          <span className={cn('absolute -right-2 -top-6 text-xl', llego && 'motion-safe:animate-bounce')} aria-hidden>🏆</span>

          {/* El caballo, con su globito arriba. */}
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-[left] ease-out pointer-events-none"
            style={{ left: `clamp(4px, calc(${posicion}% - 22px), calc(100% - 52px))`, ...anim }}
            aria-hidden
          >
            {/* Al llegar se esconde: el globito pisaría el trofeo. */}
            {!llego && (
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald px-1.5 py-0.5 text-[10.5px] font-bold text-white tabular-nums shadow-sm">
                {pct(c.avance)} · {pts(me.points)} {t('ptsShort')}
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-emerald" />
              </div>
            )}
            <span className={cn('block', corriendo && 'motion-safe:animate-bounce')}>
              <span className="block text-[30px] leading-none -scale-x-100">🏇</span>
            </span>
          </div>
        </div>

        {/* Abajo: el ritmo de hoy, y la salida y la meta en días hábiles. */}
        {enCurso && (
          <div className="relative mt-1.5 h-4 text-[10px] font-semibold text-text-2">
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `clamp(48px, ${ritmo * 100}%, calc(100% - 48px))` }}>▲ {t('pace')}</span>
          </div>
        )}
        <div className="relative mt-1 h-4 text-[10px] text-text-muted tabular-nums">
          <span className="absolute left-0">{t('startDay')}</span>
          <span className="absolute right-0 font-semibold text-text-2">{t('finishDay', { n: dias.total })}</span>
        </div>
      </div>

      {mensaje}
      {enCurso && !llego && dias.pasados < 5 && (
        <p className="-mt-2 text-[11px] text-text-muted">{t('projEarly', { n: dias.pasados })}</p>
      )}
      {enCurso && (
        <p className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber-text">{t('notFixed')}</p>
      )}
    </section>
  );
}

function Dato({ label, className, sub, children }: {
  label: string; className: string; sub?: string; children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{label}</div>
      <div className={cn('text-2xl font-bold tabular-nums leading-tight', className)}>{children}</div>
      {sub && <div className="text-[10.5px] text-text-muted max-w-[11rem] truncate" title={sub}>{sub}</div>}
    </div>
  );
}
