'use client';

/**
 * La pista del premio: un caballo que corre hacia la plata de cada uno.
 *
 * A diferencia de la Carrera, acá no hay rivales: el carril es uno solo y la
 * meta es la PARTE de la persona (bolsa ÷ participantes). El caballo avanza un
 * tramo por cada meta cumplida, así que la pista se divide en tantos tramos
 * como metas tiene el mes, y cada poste es "+$X". La posición sale del mismo
 * `progress` que calcula el servidor: la pantalla no hace cuentas de plata.
 *
 * La manager corre con el promedio de su equipo: su caballo avanza cuando el
 * equipo avanza, y la pista lo dice.
 *
 * Detalles del caballo copiados de la Carrera (`packages/ui/.../carrera.tsx`):
 * el emoji mira a la izquierda y se espeja; el galope va en una capa aparte
 * porque los keyframes de `bounce` pisan el transform; y el `clamp` evita que
 * se salga de la pista en los extremos.
 */

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, Trophy } from 'lucide-react';
import { cn } from '@precision/ui';
import type { ParticipantResult, RewardGoal } from '@precision-medical/database/premios';

interface Props {
  me: ParticipantResult;
  goals: RewardGoal[];
  shareCents: number;
  labelMeta: (g: RewardGoal) => string;
  money: (cents: number) => string;
  /** Aprobado por el Admin: el monto ya es fijo. Antes, es "por ganar". */
  approved?: boolean;
}

/** Lo que tarda la largada. Igual que la Carrera, para que se sientan parientes. */
const LARGADA_MS = 1400;

export function PistaDelPremio({ me, goals, shareCents, labelMeta, money, approved = false }: Props): React.ReactElement {
  const t = useTranslations('phoenix.rewards.track');
  const locale = useLocale();
  // Los pesos tienen medios puntos (confirmar una cita vale 0.5).
  const pts = (n: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es', { maximumFractionDigits: 1 }).format(n);
  const esManager = me.kind === 'MANAGER';
  const total = Math.max(1, me.goalsTotal);
  const pct = Math.max(0, Math.min(100, me.progress * 100));
  const llego = pct >= 99.999;
  const faltaCents = Math.max(0, shareCents - me.payoutCents);
  const porMeta = Math.round(shareCents / total);
  const pendientes = esManager ? [] : goals
    // Por id y no por posición: con metas por rol, `me.goals` trae solo las suyas.
    .map((g) => ({ g, r: me.goals.find((x) => x.goalId === g.id) }))
    .filter((x) => x.r && !x.r.hit);

  // La largada: arranca en la salida y corre hasta su lugar al montar.
  const [salio, setSalio] = useState(false);
  const [corriendo, setCorriendo] = useState(true);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSalio(true));
    const fin = setTimeout(() => setCorriendo(false), LARGADA_MS + 200);
    return () => { cancelAnimationFrame(raf); clearTimeout(fin); };
  }, []);

  const anim = { transitionDuration: `${LARGADA_MS}ms` };
  const posicion = salio ? pct : 0;

  return (
    <section className="rounded-lg bg-bg-1 p-5 flex flex-col gap-4" aria-label={t('aria', { earned: money(me.payoutCents), total: money(shareCents) })}>
      {/* Encabezado: dónde va y cuánto le falta, antes que la pista. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
            <Flag className="w-4 h-4 text-emerald" /> {t('title')}
          </h2>
          <p className="text-[12px] text-text-muted mt-1">
            {esManager ? t('subtitleManager') : t('subtitle', { amount: money(porMeta) })}
          </p>
        </div>
        <div className="flex items-end gap-5 flex-wrap">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('points')}</div>
            <div className="text-2xl font-bold text-amber-text tabular-nums leading-tight">{pts(me.points)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{approved ? t('approved') : t('earned')}</div>
            <div className="text-2xl font-bold text-emerald-text tabular-nums leading-tight">{money(me.payoutCents)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('goalFull')}</div>
            <div className="text-2xl font-bold text-text-1 tabular-nums leading-tight inline-flex items-center gap-1.5">
              <Trophy className="w-5 h-5 text-amber" /> {money(shareCents)}
            </div>
          </div>
        </div>
      </div>

      {/* La pista */}
      <div className="pt-7 pb-1">
        <div className="relative h-14 rounded-full bg-bg-2 ring-1 ring-inset ring-white/[0.03]">
          {/* Lo ya recorrido: el terreno que ganó. */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] ease-out',
              llego ? 'bg-gradient-to-r from-emerald/30 to-amber/40' : 'bg-gradient-to-r from-emerald/10 to-emerald/35',
            )}
            style={{ width: `${posicion}%`, ...anim }}
          />

          {/* La línea del carril, punteada, de punta a punta. */}
          <div className="absolute left-5 right-10 top-1/2 -translate-y-1/2 border-t border-dashed border-border-strong" aria-hidden />

          {/* Postes: uno por meta. Verde el que ya cumplió. */}
          {Array.from({ length: total - 1 }, (_, i) => {
            const k = i + 1;
            const x = (k / total) * 100;
            const pasado = pct >= x - 0.001;
            return (
              <div key={k} className="absolute inset-y-2 w-px" style={{ left: `${x}%` }} aria-hidden>
                <div className={cn('h-full w-px', pasado ? 'bg-emerald/50' : 'bg-border-strong')} />
                <div className={cn(
                  'absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full ring-2 ring-bg-1',
                  pasado ? 'bg-emerald' : 'bg-bg-3',
                )} />
              </div>
            );
          })}

          {/* Meta: bandera a cuadros y el trofeo. */}
          <div
            className="absolute inset-y-0 right-0 w-3 rounded-r-full opacity-80"
            style={{
              background: 'repeating-conic-gradient(var(--text-1) 0 25%, transparent 0 50%) 0 0 / 6px 6px',
            }}
            aria-hidden
          />
          <span className={cn('absolute -right-2 -top-6 text-xl', llego && 'motion-safe:animate-bounce')} aria-hidden>🏆</span>

          {/* El caballo, con su globito de plata arriba. */}
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-[left] ease-out pointer-events-none"
            style={{ left: `clamp(4px, calc(${posicion}% - 22px), calc(100% - 52px))`, ...anim }}
            aria-hidden
          >
            {/* Al llegar se esconde: el monto ya está arriba y el globito pisaría el trofeo. */}
            {!llego && (
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald px-1.5 py-0.5 text-[10.5px] font-bold text-white tabular-nums shadow-sm">
                {money(me.payoutCents)} · {pts(me.points)} {t('ptsShort')}
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-emerald" />
              </div>
            )}
            <span className={cn('block', corriendo && 'motion-safe:animate-bounce')}>
              <span className="block text-[30px] leading-none -scale-x-100">🏇</span>
            </span>
          </div>
        </div>

        {/* Regla de abajo: salida, cada tramo y la meta. */}
        <div className="relative mt-3 h-4 text-[10px] text-text-muted tabular-nums">
          <span className="absolute left-0">{t('start')} · {money(0)}</span>
          {Array.from({ length: total - 1 }, (_, i) => {
            const k = i + 1;
            return (
              <span key={k} className="absolute hidden md:block -translate-x-1/2" style={{ left: `${(k / total) * 100}%` }}>
                {k}
              </span>
            );
          })}
          <span className="absolute right-0 font-semibold text-text-2">{t('finish')} · {money(shareCents)}</span>
        </div>
      </div>

      {/* Lo que le falta, dicho en plata y en metas. */}
      {llego ? (
        <div className="rounded-md border border-emerald/30 bg-emerald/10 px-3 py-2 text-[12.5px] text-emerald-text">
          <span className="font-semibold">{t('done')}</span> {esManager ? t('doneSubManager') : t('doneSub', { n: total })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-[12.5px] text-text-1">
            <span className="font-semibold text-amber-text">{t('missing', { amount: money(faltaCents) })}</span>
            {!esManager && <span className="text-text-muted"> · {t('missingGoals', { n: pendientes.length })}</span>}
          </div>
          {!esManager && pendientes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendientes.map(({ g, r }) => (
                <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full bg-bg-2/60 px-2.5 py-1 text-[11px] text-text-2">
                  {labelMeta(g)}
                  <span className="tabular-nums text-text-muted">{r!.actual}/{r!.target}</span>
                  <span className="font-semibold text-emerald-text tabular-nums">+{money(porMeta)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
