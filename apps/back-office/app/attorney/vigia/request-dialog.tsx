'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Send, Loader2, Check, AlertTriangle, Stethoscope, ClipboardList, Receipt } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button,
} from '@precision/ui';
import { FilterPill } from '@/components/ui-phoenix';
import { ESCRITORIOS_DE_PEDIDO, TEMAS, type EscritorioDePedido as Escritorio } from '@/lib/mensajeria/escritorios';

/**
 * Portal Legal · Vigía · pedirle algo a la clínica.
 *
 * Es el compositor de la clínica en versión recortada, a propósito. Aquel tiene
 * buscador de pacientes y buscador de usuarios; los dos son listas de toda la
 * clínica y un externo no puede tenerlas. Acá el paciente y el caso vienen
 * fijados, y el destinatario lo elige el SERVIDOR — el navegador nunca manda a
 * quién le llega (ver `/api/attorney/vigia/request`).
 *
 * Lo que el abogado SÍ elige es DE QUÉ se trata (Erick, 2026-09-07: "botones,
 * sin modelo"): un escritorio —clínico, admisión, facturación— y dentro de él
 * un tema. El tema rellena asunto y cuerpo, y el abogado corrige si quiere. Si
 * el pedido nace de la cola de Vigía, el motivo ya trae escritorio y tema
 * puestos y el abogado solo confirma.
 *
 * Los botones son de TEMA, no de personas: el abogado no sabe ni tiene por qué
 * saber quién es Beatriz. Cambiar quién atiende un escritorio es cosa de
 * Configuración, no de esta pantalla.
 */

const ICONO: Record<Escritorio, React.ElementType> = {
  CLINICAL: Stethoscope,
  INTAKE:   ClipboardList,
  BILLING:  Receipt,
};

export function RequestDialog({ caso, asunto, cuerpo, desk: deskInicial = null, topic: topicInicial = null, onClose }: {
  /** Código del caso. Null = cerrado. */
  caso: string | null;
  /** Texto sugerido por el MOTIVO de la cola (vacío si el pedido nace en blanco). */
  asunto: string;
  cuerpo: string;
  /** Escritorio y tema ya decididos por el motivo; null = el abogado elige. */
  desk?: Escritorio | null;
  topic?: string | null;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [desk, setDesk] = React.useState<Escritorio | null>(deskInicial);
  const [topic, setTopic] = React.useState<string | null>(topicInicial);
  const [subject, setSubject] = React.useState(asunto);
  const [body, setBody] = React.useState(cuerpo);
  /**
   * ¿El texto sigue siendo el que puso el sistema? Mientras sí, elegir otro
   * tema lo reemplaza. Apenas el abogado escribe algo suyo, los temas dejan de
   * pisarlo: nadie pierde tres párrafos por tocar un chip.
   */
  const [textoAutomatico, setTextoAutomatico] = React.useState(true);
  const [urgente, setUrgente] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [enviado, setEnviado] = React.useState<{ desk: Escritorio; respaldo: string | null } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Al abrir con otro caso, todo se rearma: el diálogo se reusa.
  React.useEffect(() => {
    if (!caso) return;
    setDesk(deskInicial);
    setTopic(topicInicial);
    setSubject(asunto);
    setBody(cuerpo);
    setTextoAutomatico(true);
    setUrgente(false);
    setEnviado(null);
    setError(null);
  }, [caso, asunto, cuerpo, deskInicial, topicInicial]);

  function elegirEscritorio(d: Escritorio): void {
    if (d === desk) return;
    setDesk(d);
    // El tema del escritorio anterior no vale en el nuevo.
    setTopic(null);
    if (textoAutomatico && d !== deskInicial) { setSubject(''); setBody(''); }
    if (textoAutomatico && d === deskInicial) { setTopic(topicInicial); setSubject(asunto); setBody(cuerpo); }
  }

  function elegirTema(k: string): void {
    setTopic(k);
    if (!textoAutomatico || !caso) return;
    // Volver al tema del motivo devuelve el texto del motivo, que es más rico
    // (trae los días); cualquier otro tema trae su plantilla.
    if (k === topicInicial && desk === deskInicial && asunto) {
      setSubject(asunto);
      setBody(cuerpo);
      return;
    }
    setSubject(t(`topicSubject_${k}`, { caso }));
    setBody(t(`topicBody_${k}`, { caso }));
  }

  async function enviar(): Promise<void> {
    if (!caso || !desk || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch('/api/attorney/vigia/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caso,
          desk,
          topic: topic ?? undefined,
          subject: subject.trim(),
          body: body.trim(),
          priority: urgente ? 'URGENT' : 'NORMAL',
        }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        // El 503 tiene una causa que se puede explicar; el resto, no.
        setError(d.error === 'SIN_DESTINATARIOS' ? t('vigiaReqNoRecipients') : t('vigiaError'));
        return;
      }
      const d = (await r.json()) as { respaldo: string | null };
      setEnviado({ desk, respaldo: d.respaldo });
    } catch {
      setError(t('vigiaError'));
    } finally {
      setEnviando(false);
    }
  }

  const inputCls =
    'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors';
  const labelCls = 'text-[10px] uppercase tracking-wider font-semibold text-text-muted';
  const puedeEnviar = !!desk && subject.trim().length >= 3 && body.trim().length >= 3;

  return (
    <Dialog open={!!caso} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('vigiaReqTitle')}</DialogTitle>
          <DialogDescription>{t('vigiaReqSubtitle', { caso: caso ?? '' })}</DialogDescription>
        </DialogHeader>

        {enviado ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald/30 bg-emerald/10 px-4 py-3">
            <Check className="w-4 h-4 text-emerald mt-0.5 shrink-0" />
            <div className="text-sm text-text-2">
              <span className="font-semibold text-emerald">{t('vigiaReqSentTitle')}.</span>{' '}
              {enviado.respaldo === 'respaldo'
                ? t('vigiaReqSentFallback', { desk: t(`desk_${enviado.desk}`) })
                : t('vigiaReqSentTo', { desk: t(`desk_${enviado.desk}`) })}{' '}
              {t('vigiaReqSentBody')}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Paso 1 · de qué se trata. Tres tarjetas, una columna en mobile. */}
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <label className={labelCls}>{t('vigiaReqPickDesk')}</label>
                <span className="text-[11px] text-text-muted">{t('vigiaReqPickDeskHint')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t('vigiaReqPickDesk')}>
                {ESCRITORIOS_DE_PEDIDO.map((d) => {
                  const Icon = ICONO[d];
                  const activo = desk === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => elegirEscritorio(d)}
                      className={`text-left rounded-md p-3 transition-colors border ${
                        activo
                          ? 'bg-brand/10 border-brand/40'
                          : 'bg-bg-2/40 border-transparent hover:bg-bg-2/70'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 shrink-0 ${activo ? 'text-brand-text' : 'text-text-muted'}`} />
                        <span className={`text-sm font-semibold ${activo ? 'text-text-1' : 'text-text-2'}`}>
                          {t(`desk_${d}`)}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-text-muted mt-1 leading-snug">{t(`deskSub_${d}`)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paso 2 · el tema, que rellena el texto. */}
            {desk && (
              <div className="space-y-1.5">
                <label className={labelCls}>{t('vigiaReqTopics')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {TEMAS[desk].map((k) => (
                    <FilterPill key={k} active={topic === k} onClick={() => elegirTema(k)} label={t(`topic_${k}`)} />
                  ))}
                </div>
              </div>
            )}

            {/* El destinatario se muestra, no se elige: el servidor decide. */}
            <div className="space-y-1.5">
              <label className={labelCls}>{t('vigiaReqTo')}</label>
              {desk ? (
                <div className="rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-text">
                  {t('vigiaReqToDesk', { desk: t(`desk_${desk}`) })}
                </div>
              ) : (
                <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                  {t('vigiaReqNeedDesk')}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>{t('vigiaReqSubject')}</label>
              <input
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setTextoAutomatico(false); }}
                className={inputCls}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>{t('vigiaReqBody')}</label>
              <textarea
                value={body}
                onChange={(e) => { setBody(e.target.value); setTextoAutomatico(false); }}
                rows={6}
                className={`${inputCls} resize-none`}
                maxLength={4000}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-text-2 cursor-pointer">
              <input
                type="checkbox"
                checked={urgente}
                onChange={(e) => setUrgente(e.target.checked)}
                className="accent-amber"
              />
              {t('vigiaReqUrgent')}
            </label>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose mt-0.5 shrink-0" />
                <span className="text-[11px] text-rose">{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            {enviado ? t('vigiaReqDone') : t('vigiaReqCancel')}
          </Button>
          {!enviado && (
            <Button
              onClick={() => { void enviar(); }}
              disabled={enviando || !puedeEnviar}
              className="w-full sm:w-auto"
            >
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {t('vigiaReqSend')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
