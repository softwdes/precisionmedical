'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { usePreguntar } from '@precision-medical/agente/use-preguntar';

/**
 * La caja para preguntarle a CIFO en el Admin.
 *
 * ── Qué reemplaza ──────────────────────────────────────────────────────────
 *
 * Al chat flotante que vivía pegado al costado de todas las pantallas. Erick lo
 * sacó (2026-09-12) para que el Admin tenga el mismo patrón que el back-office:
 * una tarjeta en el panel, no un widget que flota encima de todo.
 *
 * ── Es una TARJETA, no un buscador ─────────────────────────────────────────
 *
 * Misma anatomía que la de la clínica, y por la misma razón que se aprendió ahí:
 * un campo flaco con un botón al lado se lee como un buscador y nadie le
 * pregunta nada. Tarjeta, etiqueta con la chispa, el campo como una caja
 * recogida sobre el fondo, el botón redondo adentro, y el pie que dice QUÉ
 * ALCANZA — que acá importa el doble, porque el alcance incluye sueldos.
 *
 * El lector del stream es el mismo hook del back-office: el formato NDJSON es
 * idéntico porque los dos agentes corren sobre el mismo motor.
 */
export function CifoBox({ configurado }: {
  /**
   * Lo decide el SERVIDOR mirando si está la clave del proveedor. Si falta, la
   * caja se dibuja bloqueada desde el arranque en vez de dejar preguntar y
   * fallar después del clic.
   */
  configurado: boolean;
}): React.ReactElement {
  const t = useTranslations('cifo');
  const router = useRouter();
  const [texto, setTexto] = React.useState('');
  // El hook devuelve el estado PLANO, no envuelto: `cargando`, `parcial`, `res`…
  const { cargando, parcial, res, error, preguntar: lanzar } = usePreguntar('/api/cifo/ask');

  /** Mientras escribe se muestra `parcial`; al cerrar, la respuesta final. */
  const texto_visible = res?.answer ?? parcial;

  return (
    <div className="mx-auto w-full max-w-[760px] flex flex-col gap-3">
      <div className="rounded-lg bg-bg-1 p-5 space-y-3">
        <div className="flex items-center gap-2">
          {configurado
            ? <Sparkles className="w-4 h-4 text-brand" />
            : <Lock className="w-4 h-4 text-amber" />}
          <span className={`text-[10px] uppercase tracking-wider font-semibold ${configurado ? 'text-brand' : 'text-amber'}`}>
            {t('label')}
          </span>
        </div>

        <form
          className="flex items-center gap-3 rounded-md bg-bg-2/40 pl-4 pr-2 py-2"
          onSubmit={(e) => { e.preventDefault(); void lanzar(texto); }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!configurado || cargando}
            placeholder={t('placeholder')}
            aria-label={t('label')}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-text-1 placeholder:text-text-muted disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!configurado || cargando || texto.trim().length < 3}
            aria-label={t('ask')}
            className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-brand text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        {/* Sin la clave del proveedor se avisa ANTES de preguntar, no después
            del clic. Es el mismo aviso ámbar que usan Vigía y CIFO clínica. */}
        {!configurado && (
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-amber mt-0.5 shrink-0" />
            <span className="text-[11px] leading-relaxed text-text-2">{t('notConfigured')}</span>
          </div>
        )}

        <p className="text-[11px] text-text-muted">{t('scope')}</p>
      </div>

      {/* La respuesta, debajo de la caja. Aparece solo cuando hay algo. */}
      {(cargando || res || error) && (
        <div className="rounded-lg bg-bg-1 p-5 space-y-3">
          {error && (
            <p className="text-[13px] text-rose">{t('error')}</p>
          )}

          {texto_visible && (
            <p className="text-sm text-text-1 whitespace-pre-wrap leading-relaxed">{texto_visible}</p>
          )}

          {/* Los botones salen de las herramientas que usó, no de adivinar la
              intención — ver `armarAcciones` en `lib/cifo/agente.ts`. */}
          {res?.actions?.length ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* `href` es opcional en el tipo compartido —hay agentes cuyos
                  botones no navegan— así que las que no lo traen no se pintan.
                  Un botón sin destino es peor que no tenerlo. */}
              {res.actions.filter((a) => !!a.href).map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => router.push(a.href!)}
                  className="h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold bg-brand/15 text-brand hover:bg-brand/25 transition-colors"
                >
                  {t(`action.${a.key}`)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
