'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@precision/ui';

/**
 * Portal Legal · Vigía · el panel de la respuesta.
 *
 * Entra por el costado, sobre la pantalla, como en el simulador aprobado. Se
 * intentó primero abajo de la caja de preguntar y no funciona: la respuesta
 * empuja el tablero, y cuando llega la segunda pregunta ya no se ve nada de lo
 * que había. El panel deja el tablero quieto y la conversación aparte.
 *
 * Va por `createPortal` a `document.body` — mismo camino que `floating-panel` —
 * porque cualquier ancestro con `transform` encierra a un `fixed` y el panel
 * quedaría clavado adentro de una tarjeta. Ya nos pasó con los diálogos.
 *
 * Se queda DEBAJO del modal del caso a propósito (`z-40` contra el `z-50` de
 * Radix): al tocar "Abrir el caso", el expediente tapa el panel y al cerrarlo la
 * respuesta sigue ahí.
 */

interface Step { tool: string; sources: string[]; count?: number }
interface Action { key: string; params?: Record<string, string>; href?: string; kind?: string }

export interface Answer {
  answer: string;
  steps: Step[];
  sources: string[];
  actions: Action[];
  usage: { prompt: number; completion: number; total: number };
  model: string;
}

const PASO_KEY: Record<string, string> = {
  metricas_del_bufete:  'vigiaStepMetrics',
  buscar_casos:         'vigiaStepSearch',
  resumen_de_caso:      'vigiaStepCase',
  facturacion_de_caso:  'vigiaStepBilling',
  liens_pendientes:     'vigiaStepLiens',
  casos_frenados:       'vigiaStepStalled',
  buscar_paciente:      'vigiaStepPatient',
};

const ACCION_KEY: Record<string, string> = {
  openCase:     'vigiaActionOpenCase',
  pendingLiens: 'vigiaActionPendingLiens',
  caseList:     'vigiaActionCaseList',
  stalledList:  'vigiaActionStalled',
};

export function AnswerDrawer({
  abierto, pregunta, cargando, error, res, seguimientos, onSeguir, onCerrar, onLista,
}: {
  abierto: boolean;
  pregunta: string | null;
  cargando: boolean;
  error: string | null;
  res: Answer | null;
  /** Repreguntas ya resueltas a texto por el padre. */
  seguimientos: string[];
  onSeguir: (q: string) => void;
  onCerrar: () => void;
  /** Abre la lista en un modal encima de Vigía. */
  onLista: (kind: string) => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.attorney');
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => { setMontado(true); }, []);

  React.useEffect(() => {
    if (!abierto) return undefined;
    const alTecla = (e: KeyboardEvent): void => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [abierto, onCerrar]);

  if (!montado) return null;

  const estado = cargando ? t('vigiaStateReading') : error ? t('vigiaStateFailed') : t('vigiaStateReady');

  return createPortal(
    <>
      {/* La cortina deja ver el tablero detrás: la respuesta habla DE eso. */}
      <div
        onClick={onCerrar}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          abierto ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        role="complementary"
        aria-label={t('vigiaAskLabel')}
        aria-hidden={!abierto}
        className={`fixed top-0 right-0 bottom-0 z-40 w-full sm:w-[440px] bg-bg-1 shadow-2xl shadow-black/50
          flex flex-col transition-transform duration-300 ease-out ${
            abierto ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-row-sep shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-brand-text shrink-0" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-text truncate">
              {t('vigiaTitle')} · {estado}
            </span>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('vigiaClear')}
            className="shrink-0 text-text-muted hover:text-text-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {pregunta && (
            <p className="text-[15px] font-semibold text-text-1 leading-snug">{pregunta}</p>
          )}

          {/* Lo que hizo, con su procedencia. */}
          {res && res.steps.length > 0 && (
            <div className="space-y-1">
              {res.steps.map((s, i) => (
                <div key={`${s.tool}-${i}`} className="flex items-start gap-2 text-[11px] text-text-muted font-mono">
                  <Check className="w-3 h-3 text-brand-text mt-0.5 shrink-0" />
                  <span>
                    {PASO_KEY[s.tool] ? t(PASO_KEY[s.tool]!) : s.tool}
                    <span className="text-brand-text"> {s.sources.join(' · ')}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {cargando && (
            <div className="flex items-center gap-2 text-text-muted text-[12px]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-text" />
              {t('vigiaAsking')}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose mt-0.5 shrink-0" />
              <span className="text-[11px] text-rose">{error}</span>
            </div>
          )}

          {res && (
            <>
              <p className="text-[15px] text-text-1 leading-relaxed whitespace-pre-line">{res.answer}</p>

              {res.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {res.actions.map((a, i) => {
                    const etiqueta = ACCION_KEY[a.key] ? t(ACCION_KEY[a.key]!, a.params ?? {}) : a.key;
                    const variante = i === 0 ? 'default' : 'outline';

                    // El de un caso navega —abre el expediente en esta misma
                    // pantalla— y `asChild` deja que siga siendo un link de
                    // verdad: clic del medio y "abrir en pestaña nueva" andan.
                    if (a.href) {
                      return (
                        <Button key={a.key + a.href} asChild size="sm" variant={variante}>
                          <Link href={a.href}>{etiqueta}</Link>
                        </Button>
                      );
                    }

                    // Los de lista abren el modal, sin sacar a nadie de acá.
                    return (
                      <Button
                        key={a.key}
                        size="sm"
                        variant={variante}
                        onClick={() => { if (a.kind) onLista(a.kind); }}
                      >
                        {etiqueta}
                      </Button>
                    );
                  })}
                </div>
              )}

              {seguimientos.length > 0 && (
                <div className="flex flex-col items-start gap-1.5 pt-1">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                    {t('vigiaFollowUp')}
                  </span>
                  {seguimientos.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onSeguir(q)}
                      className="text-[12.5px] text-text-2 bg-bg-2/40 rounded-full px-3.5 py-1.5 hover:text-brand-text transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {res && (
          <footer className="shrink-0 border-t border-row-sep px-5 py-3">
            {/* Las tablas que se leyeron, sin adornos: es lo que hace auditable
                el número de arriba. */}
            <span className="text-[10px] text-text-muted font-mono">
              {res.sources.join(' · ')} · {res.usage.total} {t('vigiaTokens')}
            </span>
          </footer>
        )}
      </aside>
    </>,
    document.body,
  );
}
