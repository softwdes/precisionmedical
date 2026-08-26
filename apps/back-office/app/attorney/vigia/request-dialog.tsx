'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Send, Loader2, Check, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button,
} from '@precision/ui';

/**
 * Portal Legal · Vigía · pedirle algo a la clínica.
 *
 * Es el compositor de la clínica en versión recortada, a propósito. Aquel tiene
 * buscador de pacientes y buscador de usuarios; los dos son listas de toda la
 * clínica y un externo no puede tenerlas. Acá el paciente y el caso vienen
 * fijados, y el destinatario lo elige el SERVIDOR — el navegador nunca manda a
 * quién le llega (ver `/api/attorney/vigia/request`).
 *
 * Lo que sí queda editable es el texto: el pedido va con el nombre de quien lo
 * manda, así que tiene que poder decir lo que quiera decir.
 */
export function RequestDialog({ caso, asunto, cuerpo, onClose }: {
  /** Código del caso. Null = cerrado. */
  caso: string | null;
  asunto: string;
  cuerpo: string;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [subject, setSubject] = React.useState(asunto);
  const [body, setBody] = React.useState(cuerpo);
  const [urgente, setUrgente] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [enviado, setEnviado] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Al abrir con otro caso, el texto se rearma: el diálogo se reusa.
  React.useEffect(() => {
    if (!caso) return;
    setSubject(asunto);
    setBody(cuerpo);
    setEnviado(false);
    setError(null);
  }, [caso, asunto, cuerpo]);

  async function enviar(): Promise<void> {
    if (!caso || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch('/api/attorney/vigia/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caso,
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
      setEnviado(true);
    } catch {
      setError(t('vigiaError'));
    } finally {
      setEnviando(false);
    }
  }

  const inputCls =
    'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors';

  return (
    <Dialog open={!!caso} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('vigiaReqTitle')}</DialogTitle>
          <DialogDescription>{t('vigiaReqSubtitle', { caso: caso ?? '' })}</DialogDescription>
        </DialogHeader>

        {enviado ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald/30 bg-emerald/10 px-4 py-3">
            <Check className="w-4 h-4 text-emerald mt-0.5 shrink-0" />
            <div className="text-sm text-text-2">
              <span className="font-semibold text-emerald">{t('vigiaReqSentTitle')}.</span>{' '}
              {t('vigiaReqSentBody')}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* El destinatario se muestra, no se elige: el servidor decide. */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('vigiaReqTo')}
              </label>
              <div className="rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-text">
                {t('vigiaReqToValue')}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('vigiaReqSubject')}
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputCls}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('vigiaReqBody')}
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
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
              disabled={enviando || subject.trim().length < 3 || body.trim().length < 3}
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
