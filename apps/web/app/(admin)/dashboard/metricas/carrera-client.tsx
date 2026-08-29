'use client';

/**
 * Métricas → Empleados → vista "Carrera".
 *
 * El mismo período y la misma data de la tabla, contados como competencia: una
 * pista con barras que avanzan, podio, medallas por área y premio a la mejora.
 *
 * **Se corre por acciones por hora ACTIVA, no por total** (decisión de Erick
 * 2026-08-27). Un ranking cambia el comportamiento, así que la vara importa
 * más que el gráfico:
 *   · por tiempo activo se premia estar conectado, no producir;
 *   · por acciones totales gana quien más clicks hace, y quien trabaja medio
 *     turno pierde por matemática y no por desempeño;
 *   · por acciones/hora se premia trabajar concentrado, que es lo más cercano
 *     a productividad real con los datos que tenemos.
 *
 * Los DOCTORES quedan fuera a propósito: rankearlos por consultas o por
 * duración premia atender rápido, y eso es mala medicina. Su tab mide otras
 * cosas.
 *
 * Sin librería de gráficos: la carrera son barras con `transition` de CSS, que
 * además es la forma más legible de una comparación de una sola dimensión.
 */

import { useMemo } from 'react';
import { cn } from '@precision/ui';
import { Crown, Medal, Radio, TrendingUp, Trophy, Zap } from 'lucide-react';
import { fmtMinutes } from './metricas-shared';

export interface RacerRow {
  userId: string;
  name: string;
  role: string;
  activeMinutes: number;
  totalActions: number;
  families: Record<string, number>;
}

/**
 * Piso para entrar a la carrera.
 *
 * Sin esto, quien entró 2 minutos e hizo 3 cosas corre a 90 acciones/hora y
 * gana la jornada sin haber trabajado. No es una barrera de mérito: es que por
 * debajo de un cuarto de hora la tasa no significa nada.
 */
const MIN_MINUTES = 15;

/** Área → etiqueta y emoji de la medalla. */
const MEDALS: Array<{ key: string; label: string; emoji: string }> = [
  { key: 'patients',     label: 'Pacientes',   emoji: '🧑‍⚕️' },
  { key: 'cases',        label: 'Casos',       emoji: '📁' },
  { key: 'appointments', label: 'Citas',       emoji: '📅' },
  { key: 'admission',    label: 'Admisión',    emoji: '🚪' },
  { key: 'charges',      label: 'Cobros',      emoji: '💵' },
  { key: 'portal',       label: 'Portal',      emoji: '✉️' },
  { key: 'externals',    label: 'Bufetes',     emoji: '⚖️' },
  { key: 'messages',     label: 'Mensajes',    emoji: '💬' },
  { key: 'clinical',     label: 'Clínico',     emoji: '🧪' },
  { key: 'followup',     label: 'Seguimiento', emoji: '📞' },
  { key: 'catalogs',     label: 'Catálogos',   emoji: '🗂️' },
  { key: 'ai',           label: 'Vigía',       emoji: '🤖' },
];

interface Racer extends RacerRow {
  /** Acciones por hora activa — la vara de la carrera. */
  rate: number;
  qualified: boolean;
}

const initials = (name: string): string =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Colores del podio; del 4º en adelante, brand. */
const LANE_COLOR = ['bg-amber', 'bg-text-3', 'bg-[#b06a2c]'] as const;

export function CarreraClient({
  rows, live, onToggleLive, canGoLive,
}: {
  rows: RacerRow[];
  live: boolean;
  onToggleLive: () => void;
  /** La carrera en vivo solo tiene sentido con "Hoy": el resto es una foto. */
  canGoLive: boolean;
}) {
  const racers = useMemo<Racer[]>(() => {
    const list = rows.map((r) => {
      const qualified = r.activeMinutes >= MIN_MINUTES;
      const rate = r.activeMinutes > 0 ? (r.totalActions / r.activeMinutes) * 60 : 0;
      return { ...r, rate, qualified };
    });
    // Clasificados primero por ritmo; los que no llegan al piso, al final por
    // acciones, para que igual se vean y sepan qué les falta.
    return list.sort((a, b) => {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      return a.qualified ? b.rate - a.rate : b.totalActions - a.totalActions;
    });
  }, [rows]);

  const inRace = racers.filter((r) => r.qualified && r.totalActions > 0);
  const topRate = inRace[0]?.rate ?? 0;

  /** Ganador por área: el que más hizo en esa familia. */
  const medals = useMemo(() => {
    return MEDALS.map((m) => {
      let best: RacerRow | null = null;
      let bestN = 0;
      for (const r of rows) {
        const n = r.families?.[m.key] ?? 0;
        if (n > bestN) { bestN = n; best = r; }
      }
      return best && bestN > 0 ? { ...m, winner: best.name, n: bestN } : null;
    }).filter(Boolean) as Array<{ key: string; label: string; emoji: string; winner: string; n: number }>;
  }, [rows]);

  if (inRace.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <Trophy className="w-8 h-8 text-text-3 mx-auto mb-3" />
        <p className="text-sm text-text-3">
          Todavía no hay corredores en este período. Entran quienes acumulen al menos{' '}
          {MIN_MINUTES} minutos de uso activo — por debajo de eso el ritmo por hora no
          significa nada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Encabezado de la pista */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber" />
          <span className="text-sm font-semibold text-text-1">Ritmo de trabajo</span>
          <span className="text-[11px] text-text-3">acciones por hora activa</span>
        </div>
        {canGoLive && (
          <button
            onClick={onToggleLive}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors border',
              live
                ? 'bg-rose/10 border-rose/30 text-rose'
                : 'bg-surface border-border text-text-2 hover:text-text-1 hover:border-brand/50',
            )}
          >
            <Radio className={cn('w-3.5 h-3.5', live && 'animate-pulse')} />
            {live ? 'En vivo' : 'Seguir en vivo'}
          </button>
        )}
      </div>

      {/* La pista */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2.5">
        {racers.map((r, i) => {
          const pos = r.qualified ? i + 1 : null;
          const pct = topRate > 0 && r.qualified ? Math.max(4, Math.round((r.rate / topRate) * 100)) : 0;
          return (
            <div key={r.userId} className={cn('flex items-center gap-3', !r.qualified && 'opacity-45')}>
              {/* Posición */}
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-text-3 tabular-nums">
                {pos ?? '—'}
              </span>

              {/* Corredor */}
              <div className="flex items-center gap-2 w-40 shrink-0 min-w-0">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0',
                  pos && pos <= 3 ? LANE_COLOR[pos - 1] : 'bg-brand',
                )}>
                  {initials(r.name)}
                </div>
                <span className="text-[12px] text-text-1 truncate">{r.name}</span>
                {pos === 1 && <Crown className="w-3.5 h-3.5 text-amber shrink-0" />}
              </div>

              {/* Pista: la barra ES la carrera. La transición larga hace que en
                  vivo se vea avanzar en vez de saltar. */}
              <div className="flex-1 h-6 rounded-full bg-surface-2 overflow-hidden relative min-w-[80px]">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-1000 ease-out',
                    pos && pos <= 3 ? LANE_COLOR[pos - 1] : 'bg-brand',
                  )}
                  style={{ width: `${pct}%` }}
                />

                {/* El caballo va en la PUNTA de la barra, que es donde está el
                    corredor. Ancla con translate(-100%): en el líder (100%) su
                    borde derecho coincide con el fin de la pista y no lo recorta
                    el overflow, y en el último la barra mínima del 4% ya deja
                    lugar suficiente para que se vea entero.

                    Galopa SOLO en vivo: en una carrera terminada nadie corre, y
                    una fila de emojis rebotando sobre un reporte estático es
                    ruido. `motion-safe` respeta a quien pidió menos animación en
                    su sistema. */}
                {r.qualified && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-full transition-[left] duration-1000 ease-out pointer-events-none pr-0.5"
                    style={{ left: `max(18px, ${pct}%)` }}
                  >
                    {/* El galope va en un span APARTE: los keyframes de `bounce`
                        animan `transform`, y en el mismo elemento pisarían al
                        translate que ancla el caballo a la punta — se iría medio
                        alto y un ancho a la derecha en cuanto empezara a correr. */}
                    <span className={cn('block text-[13px] leading-none', live && 'motion-safe:animate-bounce')}>
                      🏇
                    </span>
                  </span>
                )}

                {!r.qualified && (
                  <span className="absolute inset-0 flex items-center px-3 text-[10px] text-text-3">
                    necesita {MIN_MINUTES} min de uso para clasificar
                  </span>
                )}
              </div>

              {/* Marcador */}
              <div className="w-32 shrink-0 text-right">
                <span className={cn('font-mono text-[12px] tabular-nums font-semibold',
                  pos === 1 ? 'text-amber' : 'text-text-1')}>
                  {r.qualified ? `${r.rate.toFixed(1)}/h` : '—'}
                </span>
                <div className="text-[10px] text-text-3 tabular-nums">
                  {r.totalActions} acc · {fmtMinutes(r.activeMinutes)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Medallas por área: con 12 categorías casi todos ganan algo, que es lo
          que evita que un podio de 3 desmotive a los otros quince. */}
      {medals.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-2 flex items-center gap-1.5">
            <Medal className="w-3.5 h-3.5 text-amber" />
            Mejor de cada área
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {medals.map((m) => (
              <div key={m.key} className="rounded-lg bg-surface-2 border border-border px-3 py-2">
                <div className="text-[10px] text-text-3 flex items-center gap-1">
                  <span aria-hidden>{m.emoji}</span> {m.label}
                </div>
                <div className="text-[12px] text-text-1 truncate mt-0.5">{m.winner}</div>
                <div className="text-[10px] text-text-3 font-mono tabular-nums">{m.n}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-text-3 flex items-start gap-1.5">
        <TrendingUp className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          El ritmo mide acciones registradas por hora de uso activo. No todas las
          acciones cuestan lo mismo — sirve para ver quién está trabando o
          descargado, no para comparar personas con tareas distintas.
        </span>
      </p>
    </div>
  );
}
