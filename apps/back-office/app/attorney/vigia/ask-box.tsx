'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@precision/ui';
import { AnswerDrawer, type Answer } from './answer-drawer';
import { CaseListDialog, type ListKind } from './case-list-dialog';

/**
 * Portal Legal · Vigía · la caja de preguntar.
 *
 * Acá SOLO se pregunta. La respuesta vive en `AnswerDrawer`, que entra por el
 * costado como en el simulador aprobado. Se probó abajo de la caja y no
 * funciona: la respuesta empuja el tablero entero, y con la segunda pregunta la
 * pantalla ya no se parece a la que el abogado abrió.
 *
 * Una decisión sobre honestidad: **mientras piensa no inventamos progreso**. No
 * hay streaming todavía, así que no sabemos en qué paso va; se muestra
 * "consultando" y listo. Los pasos aparecen DESPUÉS, con las herramientas que de
 * verdad corrieron y las tablas que leyeron — es lo que hace auditable la
 * respuesta: el número viene con su procedencia.
 */

/**
 * Las repreguntas.
 *
 * Salen de qué herramientas corrieron, NO del modelo. Pedirle sugerencias
 * costaría otra vuelta de tokens y podría ofrecer algo que después no sabe
 * responder; esto es barato y siempre lleva a una pregunta que sí funciona.
 * Cada una se cae de la lista si su herramienta ya corrió: ofrecer justo lo que
 * el abogado acaba de preguntar es ruido.
 */
const SEGUIMIENTOS: Array<{ tool: string; key: string }> = [
  { tool: 'casos_frenados',      key: 'vigiaSuggest2' },
  { tool: 'liens_pendientes',    key: 'vigiaSuggest3' },
  { tool: 'metricas_del_bufete', key: 'vigiaSuggest1' },
];

export function AskBox({ sugerencias, alcance, configurado }: {
  sugerencias: string[];
  /** Cuántos casos alcanza esta sesión — se muestra al pie de la caja. */
  alcance: number;
  /** ¿Hay clave del modelo en este entorno? Lo resuelve el servidor. */
  configurado: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [texto, setTexto] = React.useState('');
  const [preguntada, setPreguntada] = React.useState<string | null>(null);
  const [abierto, setAbierto] = React.useState(false);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [res, setRes] = React.useState<Answer | null>(null);

  const preguntar = React.useCallback(async (pregunta: string): Promise<void> => {
    const limpia = pregunta.trim();
    if (limpia.length < 3) return;

    setTexto('');
    setPreguntada(limpia);
    setAbierto(true);
    setCargando(true);
    setError(null);
    setRes(null);

    try {
      const r = await fetch('/api/attorney/vigia/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: limpia }),
      });
      if (!r.ok) {
        // El 503 es el único que tiene una causa que la persona puede entender.
        setError(r.status === 503 ? t('vigiaNotConfigured') : t('vigiaError'));
        return;
      }
      setRes((await r.json()) as Answer);
    } catch {
      setError(t('vigiaError'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  const cerrar = React.useCallback(() => { setAbierto(false); }, []);
  const [lista, setLista] = React.useState<ListKind | null>(null);

  const corridas = new Set((res?.steps ?? []).map((s) => s.tool));
  const seguimientos = SEGUIMIENTOS
    .filter((s) => !corridas.has(s.tool))
    .slice(0, 2)
    .map((s) => t(s.key));

  /**
   * Sin clave, la caja se MUESTRA y se explica — no se esconde.
   *
   * Y sobre todo: no se deja preguntar. Antes se podía escribir, esperar la
   * vuelta y recién ahí enterarse de que no estaba configurado; el aviso llegaba
   * después del esfuerzo. Las sugerencias quedan a la vista en gris porque
   * cuentan para qué sirve esto cuando se encienda.
   */
  if (!configurado) {
    return (
      <>
        <div className="rounded-lg bg-bg-1 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-text" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-text">
              {t('vigiaAskLabel')}
            </span>
          </div>

          <div className="rounded-md bg-bg-2/40 px-4 py-3 text-[15px] text-text-muted">
            {t('vigiaAskPlaceholder')}
          </div>

          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-amber mt-0.5 shrink-0" />
            <div className="text-[11px] leading-relaxed">
              <span className="text-amber font-semibold">{t('vigiaAskLockedTitle')}.</span>{' '}
              <span className="text-text-2">{t('vigiaAskLockedBody')}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {t('vigiaScope', { n: alcance })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 opacity-50">
          {sugerencias.map((s) => (
            <span key={s} className="text-[12.5px] text-text-muted bg-bg-1 rounded-full px-3.5 py-1.5">
              {s}
            </span>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="rounded-lg bg-bg-1 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-text" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-text">
            {t('vigiaAskLabel')}
          </span>
        </div>

        {/* El campo es una caja RECOGIDA sobre el fondo de la tarjeta, no un
            input de línea: el escalón de fondo lo define sin agregar otra
            línea al lado del borde de la tarjeta. */}
        <form
          className="flex items-center gap-3 rounded-md bg-bg-2/40 pl-4 pr-2 py-2"
          onSubmit={(e) => { e.preventDefault(); void preguntar(texto); }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t('vigiaAskPlaceholder')}
            disabled={cargando}
            aria-label={t('vigiaAskLabel')}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-text-1 placeholder:text-text-muted disabled:opacity-60"
          />
          <Button
            type="submit"
            size="icon"
            disabled={cargando || texto.trim().length < 3}
            aria-label={t('vigiaSend')}
            className="shrink-0"
          >
            {cargando ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          </Button>
        </form>

        {/* El pie dice QUÉ ALCANZA. El template tenía acá "Adjuntar archivo",
            copiado de Finch — no lo pongo: no soportamos adjuntos y un control
            muerto en la pantalla principal es peor que un hueco. */}
        <div className="flex justify-end">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
            {t('vigiaScope', { n: alcance })}
          </span>
        </div>
      </div>

      {/* Las sugerencias quedan SIEMPRE a la vista: con la respuesta en un panel
          aparte, ya no compiten con nada. */}
      <div className="flex flex-wrap justify-center gap-2">
        {sugerencias.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void preguntar(s)}
            disabled={cargando}
            className="text-[12.5px] text-text-2 bg-bg-1 rounded-full px-3.5 py-1.5 hover:text-brand-text transition-colors text-left disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <AnswerDrawer
        abierto={abierto}
        pregunta={preguntada}
        cargando={cargando}
        error={error}
        res={res}
        seguimientos={seguimientos}
        onSeguir={(q) => { void preguntar(q); }}
        onCerrar={cerrar}
        onLista={(k) => setLista(k as ListKind)}
      />

      <CaseListDialog kind={lista} onClose={() => setLista(null)} />
    </>
  );
}
