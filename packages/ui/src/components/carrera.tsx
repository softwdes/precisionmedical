'use client';

/**
 * Vista "Carrera" — el ranking de trabajo como competencia.
 *
 * Vive en `packages/ui` porque la consumen DOS apps con fuentes distintas:
 *   · apps/web       → Métricas → Empleados (tRPC `metrics.employeeActivity`)
 *   · apps/back-office → /carrera, abierta a toda la clínica
 *     (`/api/metrics/carrera`, que llama a la misma fn `employee_metrics`)
 * Duplicarlo eran 360 líneas que en un mes ya no iban a ser iguales.
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
 * Los DOCTORES corren acá igual que todos (decisión de Erick 2026-08-31: Devin
 * quería verse con su uso). El comentario anterior decía que quedaban fuera,
 * pero **el filtro nunca existió** — solo la fn SQL descarta LAWYER y
 * AUDITOR_AI. Que quede dicho por qué no molesta: la vara es acciones por hora
 * de USO DEL SISTEMA, no consultas ni duración, así que no premia atender
 * rápido. Rankear la parte clínica sigue siendo mala idea y por eso vive en el
 * tab Doctores, con sus propias medidas.
 *
 * Sin librería de gráficos: la carrera son barras con `transition` de CSS, que
 * además es la forma más legible de una comparación de una sola dimensión.
 */

import { useEffect, useMemo, useState } from 'react';
import { Crown, Medal, Radio, TrendingUp, Trophy, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

/** "1h 24m" · "43m" · "—". Copiado de metricas-shared para no atar este
 *  componente compartido a una pantalla de apps/web. */
function fmtMinutes(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export type Crew = 'CLINIC' | 'DEV' | 'COMMS';

/**
 * El chip de grupo se muestra SIEMPRE, también con el filtro en "Todos".
 *
 * Sin él, ver a un dev primero se lee como "le ganó a recepción", cuando en
 * realidad corren carreras distintas: probar módulos enteros produce acciones
 * a un ritmo que atender pacientes no puede igualar.
 */
const CREW_TONE: Record<Crew, string> = {
  CLINIC: 'bg-emerald/10 text-emerald',
  DEV:    'bg-violet/10 text-violet',
  COMMS:  'bg-cyan/10 text-cyan',
};

/**
 * Todos los textos, por prop y OBLIGATORIOS.
 *
 * `packages/ui` no depende de next-intl y no debería: es un paquete de
 * primitivos. Pero cuando este componente tenía las strings en duro y se lo
 * llevó al back-office —que sí es bilingüe— pasó lo previsible: el usuario
 * cambió a inglés y la pista siguió en español.
 *
 * Sin `?` a propósito. Con defaults en español, un consumidor nuevo que se
 * olvide de traducir no ve ningún error: ve español, que es exactamente el bug
 * que esto viene a cerrar. Obligatorio significa que el compilador lo pide.
 */
export interface CarreraLabels {
  /** "Ritmo de trabajo" */
  heading: string;
  /** "acciones por hora activa" */
  headingHint: string;
  /** Botón de refresco, encendido y apagado. */
  live: string;
  goLive: string;
  /** Vacío. Recibe el piso de minutos ya interpolado. */
  empty: string;
  /** Por debajo del piso, dentro del carril. Recibe los minutos interpolados. */
  needsMinutes: string;
  /** "Mejor de cada área" */
  bestPerArea: string;
  /** Abreviatura de acciones en el marcador: "16 acc · 17m" */
  actionsShort: string;
  /** Nota al pie sobre qué mide y qué no mide la vara. */
  footnote: string;
  /** Nombre de cada área (las llaves de `MEDALS`). */
  areas: Record<string, string>;
  /** Nombre corto de cada grupo, para el chip del carril. */
  crews: Record<Crew, string>;
}

/**
 * Piso para entrar a la carrera. Exportado para que el consumidor lo interpole
 * en sus propios textos (`empty`, `needsMinutes`) y no haya dos números.
 *
 * Sin esto, quien entró 2 minutos e hizo 3 cosas corre a 90 acciones/hora y
 * gana la jornada sin haber trabajado. No es una barrera de mérito: es que por
 * debajo de un cuarto de hora la tasa no significa nada.
 */
export const CARRERA_MIN_MINUTES = 15;

/**
 * Arma los `labels` desde un traductor, sin que este paquete conozca next-intl.
 *
 * Recibe la función `t` ya apuntada al namespace `phoenix.carrera`, así que el
 * consumidor solo escribe `carreraLabels(useTranslations('phoenix.carrera'))` y
 * no repite 30 líneas de mapeo en cada app. Es pura: nada de hooks acá.
 *
 * `min` va interpolado desde `CARRERA_MIN_MINUTES`, para que el piso viva en un
 * solo lugar y no haya un 15 escrito a mano en los textos.
 */
export function carreraLabels(
  t: (key: string, values?: Record<string, string | number>) => string,
): CarreraLabels {
  return {
    heading:      t('heading'),
    headingHint:  t('headingHint'),
    live:         t('live'),
    goLive:       t('goLive'),
    empty:        t('empty',        { min: CARRERA_MIN_MINUTES }),
    needsMinutes: t('needsMinutes', { min: CARRERA_MIN_MINUTES }),
    bestPerArea:  t('bestPerArea'),
    actionsShort: t('actionsShort'),
    footnote:     t('footnote'),
    areas: {
      patients:     t('areaPatients'),
      cases:        t('areaCases'),
      appointments: t('areaAppointments'),
      admission:    t('areaAdmission'),
      charges:      t('areaCharges'),
      portal:       t('areaPortal'),
      externals:    t('areaExternals'),
      messages:     t('areaMessages'),
      clinical:     t('areaClinical'),
      followup:     t('areaFollowup'),
      catalogs:     t('areaCatalogs'),
      ai:           t('areaAi'),
    },
    crews: {
      CLINIC: t('chipClinic'),
      DEV:    t('chipDev'),
      COMMS:  t('chipComms'),
    },
  };
}

export interface RacerRow {
  userId: string;
  name: string;
  role: string;
  crew: Crew | null;
  activeMinutes: number;
  totalActions: number;
  families: Record<string, number>;
}

const MIN_MINUTES = CARRERA_MIN_MINUTES;

/** Lo que tarda la largada: las barras salen de cero hasta su posición real. */
const INTRO_MS = 5000;

/**
 * Retraso escalonado entre carriles. Que no arranquen todos en el mismo
 * instante es lo que hace que se lea como una carrera y no como una barra de
 * progreso; el tope evita que el último salga demasiado tarde.
 */
const STAGGER_MS = 60;
const STAGGER_MAX = 600;

/** Área → etiqueta y emoji de la medalla. */
const MEDALS: Array<{ key: string; emoji: string }> = [
  { key: 'patients', emoji: '🧑‍⚕️' },
  { key: 'cases', emoji: '📁' },
  { key: 'appointments', emoji: '📅' },
  { key: 'admission', emoji: '🚪' },
  { key: 'charges', emoji: '💵' },
  { key: 'portal', emoji: '✉️' },
  { key: 'externals', emoji: '⚖️' },
  { key: 'messages', emoji: '💬' },
  { key: 'clinical', emoji: '🧪' },
  { key: 'followup', emoji: '📞' },
  { key: 'catalogs', emoji: '🗂️' },
  { key: 'ai', emoji: '🤖' },
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
  rows, live, onToggleLive, canGoLive, labels,
}: {
  rows: RacerRow[];
  labels: CarreraLabels;
  live: boolean;
  onToggleLive: () => void;
  /** La carrera en vivo solo tiene sentido con "Hoy": el resto es una foto. */
  canGoLive: boolean;
}) {
  /**
   * Largada. `started` dispara el ancho real y `introDone` devuelve la
   * transición a 1s, para que un refresco en vivo no tarde cinco segundos en
   * moverse.
   *
   * Se replica en cada carga de la página porque vive en el montaje del
   * componente: recargar, o volver a entrar a la vista Carrera, corre la
   * largada de nuevo.
   */
  const [started, setStarted] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  // La largada espera a que HAYA corredores: en la primera carga los datos
  // llegan después del montaje, y disparándola con la lista vacía las barras
  // aparecían ya llenas — sin carrera.
  const hasRacers = rows.length > 0;

  useEffect(() => {
    if (!hasRacers || started) return;

    // Quien pidió menos animación en su sistema no merece esperar 5 segundos
    // para leer un reporte: va directo al resultado.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setStarted(true);
      setIntroDone(true);
      return;
    }

    // Dos frames: el navegador tiene que PINTAR el 0% antes de que cambie el
    // ancho. Con un solo frame React agrupa ambos valores en el mismo paint y
    // no hay transición que animar — las barras aparecerían ya llenas.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setStarted(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [hasRacers, started]);

  /**
   * El fin de la largada vive en su propio efecto A PROPÓSITO.
   *
   * Puesto junto a la largada, `setStarted(true)` reejecutaba ese efecto, su
   * limpieza cancelaba este temporizador y el nuevo pase salía temprano por el
   * guard: `introDone` no llegaba nunca y cada refresco en vivo se arrastraba
   * cinco segundos en lugar de uno.
   */
  useEffect(() => {
    if (!started || introDone) return;
    const done = setTimeout(() => setIntroDone(true), INTRO_MS + STAGGER_MAX);
    return () => clearTimeout(done);
  }, [started, introDone]);

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
    }).filter(Boolean) as Array<{ key: string; emoji: string; winner: string; n: number }>;
  }, [rows]);

  if (inRace.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <Trophy className="w-8 h-8 text-text-3 mx-auto mb-3" />
        <p className="text-sm text-text-3">{labels.empty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Encabezado de la pista */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber" />
          <span className="text-sm font-semibold text-text-1">{labels.heading}</span>
          <span className="text-[11px] text-text-3">{labels.headingHint}</span>
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
            {live ? labels.live : labels.goLive}
          </button>
        )}
      </div>

      {/* La pista */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2.5">
        {racers.map((r, i) => {
          const pos = r.qualified ? i + 1 : null;
          // Tope en 92% y no 100%: el líder también tiene que dejar pista libre
          // delante para su caballo. Si su barra llegara al final, su jinete
          // quedaría montado encima del color mientras todos los demás corren
          // sobre la pista — el único que se vería distinto sería el primero.
          const pct = topRate > 0 && r.qualified ? Math.max(4, Math.round((r.rate / topRate) * 92)) : 0;
          // Largada lenta y escalonada; después, 1s parejo para los refrescos.
          const anim = introDone
            ? { transitionDuration: '1000ms', transitionDelay: '0ms' }
            : { transitionDuration: `${INTRO_MS}ms`, transitionDelay: `${Math.min(i * STAGGER_MS, STAGGER_MAX)}ms` };
          return (
            <div key={r.userId} className={cn('flex items-center gap-3', !r.qualified && 'opacity-45')}>
              {/* Posición */}
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-text-3 tabular-nums">
                {pos ?? '—'}
              </span>

              {/* Corredor */}
              <div className="flex items-center gap-2 w-48 shrink-0 min-w-0">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0',
                  pos && pos <= 3 ? LANE_COLOR[pos - 1] : 'bg-brand',
                )}>
                  {initials(r.name)}
                </div>
                <span className="text-[12px] text-text-1 truncate">{r.name}</span>
                {r.crew && (
                  <span className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide hidden sm:inline',
                    CREW_TONE[r.crew],
                  )}>
                    {labels.crews[r.crew]}
                  </span>
                )}
                {pos === 1 && <Crown className="w-3.5 h-3.5 text-amber shrink-0" />}
              </div>

              {/* Pista: la barra ES la carrera. La transición larga hace que en
                  vivo se vea avanzar en vez de saltar. */}
              <div className="flex-1 h-7 rounded-full bg-surface-2 overflow-hidden relative min-w-[80px]">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] ease-out',
                    pos && pos <= 3 ? LANE_COLOR[pos - 1] : 'bg-brand',
                  )}
                  style={{ width: started ? `${pct}%` : '0%', ...anim }}
                />

                {/* El caballo va DELANTE de la barra, sobre la pista libre:
                    encima del color se perdía, y adelante se lee como que la
                    barra es el terreno ya recorrido.

                    `clamp` en vez de un translate fijo: sin tope, el líder
                    (100%) se saldría de la pista y lo recortaría el overflow, y
                    el último en una pista angosta quedaría pegado al borde
                    izquierdo. Los dos extremos quedan siempre visibles.

                    Galopa en vivo y durante la largada, que es cuando de verdad
                    se está corriendo; en una carrera terminada nadie corre, y
                    una fila de emojis rebotando sobre un reporte estático es
                    ruido. `motion-safe` respeta a quien pidió menos animación. */}
                {r.qualified && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 -translate-y-1/2 transition-[left] ease-out pointer-events-none"
                    // Mismo tiempo y mismo retraso que su barra: si difieren, el
                    // caballo se despega de la punta durante la largada.
                    style={{
                      left: started
                        ? `clamp(2px, calc(${pct}% + 3px), calc(100% - 28px))`
                        : '2px',
                      ...anim,
                    }}
                  >
                    {/* Tres capas, una por transform, y no por gusto: los
                        keyframes de `bounce` REEMPLAZAN el transform del
                        elemento que animan. Con el galope y el espejo juntos, el
                        caballo se daba vuelta solo al empezar a correr. */}
                    <span className={cn(
                      'block',
                      (live || !introDone) && 'motion-safe:animate-bounce',
                    )}>
                      {/* El emoji del jinete mira a la IZQUIERDA en casi todas
                          las fuentes, o sea en contra de la carrera. Se espeja
                          para que corra hacia donde avanza la barra. */}
                      <span className="block text-[19px] leading-none -scale-x-100">
                        🏇
                      </span>
                    </span>
                  </span>
                )}

                {!r.qualified && (
                  <span className="absolute inset-0 flex items-center px-3 text-[10px] text-text-3">
                    {labels.needsMinutes}
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
                  {r.totalActions} {labels.actionsShort} · {fmtMinutes(r.activeMinutes)}
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
            {labels.bestPerArea}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {medals.map((m) => (
              <div key={m.key} className="rounded-lg bg-surface-2 border border-border px-3 py-2">
                <div className="text-[10px] text-text-3 flex items-center gap-1">
                  <span aria-hidden>{m.emoji}</span> {labels.areas[m.key] ?? m.key}
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
        <span>{labels.footnote}</span>
      </p>
    </div>
  );
}
