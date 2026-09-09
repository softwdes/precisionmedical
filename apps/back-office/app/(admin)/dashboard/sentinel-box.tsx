'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, ArrowRight, Lock, X } from 'lucide-react';
import { Button } from '@precision/ui';
import { usePreguntar } from '@/lib/agente/use-preguntar';

/**
 * Sentinel · la caja de preguntar del panel de recepción.
 *
 * Va ARRIBA del titular y de los números, en columna angosta y centrada. Es el
 * mismo lugar donde funcionó en el portal legal, y por la misma razón: a todo el
 * ancho se lee como un buscador flaco pegado a los chips; contenida se lee como
 * lo que es.
 *
 * La respuesta entra en un cajón por el costado y no debajo de la caja: abajo
 * empuja el panel entero, y con la segunda pregunta la pantalla ya no se parece
 * a la que la persona abrió.
 *
 * El lector del streaming NO está acá: vive en `lib/agente/use-preguntar.ts`,
 * compartido con Vigía. Acá está el chrome, que es lo único distinto entre los
 * dos agentes.
 */

/** Herramienta → cómo se llama en la pantalla. Sin mapa, se muestra el nombre crudo. */
const PASO_KEY: Record<string, string> = {
  pulso_del_dia: 'sentinelStepPulse',
  cola_de_intake: 'sentinelStepIntake',
  notas_sin_firmar: 'sentinelStepNotes',
  atrasos_de_recepcion: 'sentinelStepDelays',
  saldos_y_cobros: 'sentinelStepMoney',
  pedidos_de_bufetes: 'sentinelStepFirms',
  resumen_de_caso: 'sentinelStepCase',
};

const ACCION_KEY: Record<string, string> = {
  workQueue: 'sentinelActWorkQueue',
  openCase: 'sentinelActOpenCase',
  notesBoard: 'sentinelActNotes',
  firmRequests: 'sentinelActFirms',
};

/**
 * Las repreguntas salen de qué herramientas corrieron, NO del modelo.
 *
 * Pedirle sugerencias costaría otra vuelta de tokens y podría ofrecer algo que
 * después no sabe responder. Cada una se cae de la lista si su herramienta ya
 * corrió: ofrecer justo lo que la persona acaba de preguntar es ruido.
 */
const SEGUIMIENTOS: Array<{ tool: string; key: string }> = [
  { tool: 'cola_de_intake', key: 'sentinelSuggest2' },
  { tool: 'notas_sin_firmar', key: 'sentinelSuggest3' },
  { tool: 'atrasos_de_recepcion', key: 'sentinelSuggest4' },
  { tool: 'pulso_del_dia', key: 'sentinelSuggest1' },
];

export function SentinelBox({ configurado, casoEjemplo }: {
  /** ¿Hay clave del proveedor en este entorno? Lo resuelve el SERVIDOR. */
  configurado: boolean;
  /** Un código de caso REAL para la cuarta sugerencia. Null = no se ofrece. */
  casoEjemplo: string | null;
}): React.ReactElement {
  const t = useTranslations('phoenix.dashboard');
  const router = useRouter();
  const [texto, setTexto] = React.useState('');
  const [abierto, setAbierto] = React.useState(false);
  const { preguntada, cargando, parcial, pasos, res, error, preguntar, limpiar } =
    usePreguntar('/api/sentinel/ask');

  const lanzar = React.useCallback(async (q: string) => {
    if (q.trim().length < 3) return;
    setTexto('');
    setAbierto(true);
    await preguntar(q);
  }, [preguntar]);

  const cerrar = (): void => { setAbierto(false); limpiar(); };

  const sugerencias = [
    t('sentinelSuggest1'),
    t('sentinelSuggest2'),
    t('sentinelSuggest3'),
    ...(casoEjemplo ? [`${t('sentinelStepCase')} ${casoEjemplo}`] : []),
  ];

  const usadas = new Set((res?.steps ?? pasos).map((s) => s.tool));
  const seguir = SEGUIMIENTOS.filter((s) => !usadas.has(s.tool)).slice(0, 2);

  const estado = error
    ? t('sentinelFailed')
    : cargando
      ? (parcial ? t('sentinelWriting') : t('sentinelReading'))
      : t('sentinelReady');

  return (
    <>
      <div className="mx-auto w-full max-w-[680px] flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-bg-1 px-3.5 py-2.5">
            {configurado
              ? <Sparkles className="w-4 h-4 text-brand-text shrink-0" />
              : <Lock className="w-4 h-4 text-text-muted shrink-0" />}
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void lanzar(texto); }}
              disabled={!configurado}
              placeholder={configurado ? t('sentinelPlaceholder') : t('sentinelNotConfigured')}
              aria-label={t('sentinelPlaceholder')}
              className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted outline-none disabled:cursor-not-allowed"
            />
            {cargando && <Loader2 className="w-3.5 h-3.5 text-brand-text animate-spin shrink-0" />}
          </div>
          <Button
            onClick={() => void lanzar(texto)}
            disabled={!configurado || texto.trim().length < 3 || cargando}
          >
            {t('sentinelAsk')}
            <ArrowRight />
          </Button>
        </div>

        {/* Las sugerencias son botones, no texto de ayuda: se aprietan. */}
        {configurado && (
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void lanzar(s)}
                disabled={cargando}
                className="rounded-md bg-bg-2/60 px-2.5 py-1 text-[11.5px] text-text-2 hover:text-text-1 hover:bg-bg-2 transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── El cajón ─────────────────────────────────────────────────────────
          `fixed` a la derecha, por encima de todo. No usa Dialog a propósito:
          el panel de abajo tiene que seguir leyéndose mientras la respuesta
          está abierta, y un overlay modal lo tapa. */}
      {abierto && (
        <div
          role="complementary"
          aria-label="Sentinel"
          className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[440px] bg-bg-1 shadow-2xl flex flex-col"
        >
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-brand-text" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-1">
              Sentinel · {estado}
            </span>
            <button
              type="button"
              onClick={cerrar}
              aria-label={t('sentinelClose')}
              className="ml-auto rounded p-1 text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {preguntada && (
              <p className="text-[13px] text-text-muted italic">{preguntada}</p>
            )}

            {/* Los pasos son las herramientas que DE VERDAD corrieron, con las
                tablas que leyeron. Nada de una barra que avanza sola. */}
            {(res?.steps ?? pasos).length > 0 && (
              <div className="flex flex-col gap-1">
                {(res?.steps ?? pasos).map((s, i) => (
                  <div key={`${s.tool}-${i}`} className="flex items-center gap-2 text-[11.5px] text-text-muted">
                    <span className="w-1 h-1 rounded-full bg-emerald shrink-0" />
                    <span className="text-text-2">{PASO_KEY[s.tool] ? t(PASO_KEY[s.tool]!) : s.tool}</span>
                    {typeof s.count === 'number' && <span className="tabular-nums">· {s.count}</span>}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-[13px] text-rose">
                {error === 'config' ? t('sentinelNotConfigured') : t('sentinelError')}
              </p>
            )}

            {/* Mientras escribe, el parcial; cuando cierra, la respuesta final. */}
            {!error && (res?.answer || parcial) && (
              <p className="text-sm text-text-1 leading-relaxed whitespace-pre-wrap">
                {res?.answer ?? parcial}
              </p>
            )}

            {!error && !res && !parcial && cargando && (
              <p className="text-[13px] text-text-muted">{t('sentinelAsking')}</p>
            )}

            {/* Los botones NO los elige el modelo: se derivan de qué corrió. */}
            {res && res.actions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {res.actions.map((a, i) => {
                  const etiqueta = ACCION_KEY[a.key] ? t(ACCION_KEY[a.key]!, a.params ?? {}) : a.key;
                  const ir = (): void => {
                    if (a.href) { router.push(a.href); return; }
                    // Sin href, el botón trabaja sobre esta misma pantalla.
                    if (a.kind === 'intake') {
                      cerrar();
                      document.getElementById('cola-intake')?.scrollIntoView({ behavior: 'smooth' });
                    }
                  };
                  return (
                    <Button key={`${a.key}-${i}`} variant={i === 0 ? 'default' : 'secondary'} onClick={ir}>
                      {etiqueta}
                    </Button>
                  );
                })}
              </div>
            )}

            {res && seguir.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  {t('sentinelFollowUp')}
                </span>
                {seguir.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => void lanzar(t(s.key))}
                    className="text-left text-[12.5px] text-brand-text hover:underline"
                  >
                    {t(s.key)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* El pie es lo que hace auditable la respuesta: de dónde salió y
              cuánto costó. Y el recordatorio de que no maneja nombres. */}
          <div className="shrink-0 px-5 py-3 border-t border-border flex flex-col gap-1">
            {res && (
              <span className="text-[10.5px] text-text-muted tabular-nums">
                {res.sources.join(' · ')} · {res.usage.total} {t('sentinelTokens')}
              </span>
            )}
            <span className="text-[10.5px] text-text-muted">{t('sentinelScope')}</span>
          </div>
        </div>
      )}
    </>
  );
}
