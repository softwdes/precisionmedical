'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Send, ArrowLeft, Mail, AlertCircle } from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import { fechaHora } from '@/lib/fechas';

/**
 * Portal Legal · la bandeja del bufete.
 *
 * Es propia y no la de la clínica: aquella trae adjuntos, plantillas, "ver
 * inbox de…" y el buscador de pacientes — herramientas internas que un externo
 * no puede tener. Acá hay lo que el abogado necesita y nada más: lo que le
 * escribieron, el hilo, y responder.
 *
 * No hay "mensaje nuevo" a propósito. El abogado responde a quien le escribió, y
 * empieza conversaciones desde Vigía, donde el pedido nace atado a un caso. Un
 * compositor en blanco lo obligaría a elegir destinatario de una lista de toda
 * la clínica, que es justo lo que no le damos.
 */

interface ThreadRow {
  id: string;
  subject: string;
  priority: 'NORMAL' | 'URGENT';
  from: string;
  caseCode: string | null;
  lastEntryAt: string;
  entries: number;
  unread: boolean;
}

interface Entry {
  id: string;
  authorName: string;
  body: string;
  sentAt: string;
  kind: string;
}

interface ThreadDetail {
  id: string;
  subject: string;
  priority: 'NORMAL' | 'URGENT';
  caseCode: string | null;
  caseId: string | null;
  entries: Entry[];
}

export function AttorneyInbox({ locale }: { locale: string }): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [rows, setRows] = React.useState<ThreadRow[] | null>(null);
  const [abierto, setAbierto] = React.useState<ThreadDetail | null>(null);
  const [cargandoHilo, setCargandoHilo] = React.useState(false);
  const [respuesta, setRespuesta] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);

  const cargarLista = React.useCallback(async () => {
    const r = await fetch('/api/attorney/messages');
    if (!r.ok) { setRows([]); return; }
    const d = (await r.json()) as { threads: ThreadRow[] };
    setRows(d.threads);
  }, []);

  React.useEffect(() => { void cargarLista(); }, [cargarLista]);

  async function abrir(id: string): Promise<void> {
    setCargandoHilo(true);
    setRespuesta('');
    try {
      const r = await fetch(`/api/attorney/messages/${id}`);
      if (!r.ok) return;
      setAbierto((await r.json()) as ThreadDetail);
      // Abrirlo lo marca leído del lado del servidor: la lista se refresca para
      // que el punto se apague sin recargar la página.
      void cargarLista();
    } finally {
      setCargandoHilo(false);
    }
  }

  async function responder(): Promise<void> {
    if (!abierto || respuesta.trim().length < 1 || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/attorney/messages/${abierto.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: respuesta.trim() }),
      });
      if (!r.ok) return;
      setRespuesta('');
      await abrir(abierto.id);
    } finally {
      setEnviando(false);
    }
  }

  // ── El hilo ────────────────────────────────────────────────────────────
  if (abierto) {
    return (
      <div className="rounded-lg bg-bg-1 p-5 space-y-4">
        <button
          type="button"
          onClick={() => setAbierto(null)}
          className="flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-1 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('msgBack')}
        </button>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="text-text-1 font-semibold">{abierto.subject}</h2>
          {abierto.caseCode && (
            <TagPill label={abierto.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />
          )}
        </div>

        <div className="space-y-3">
          {abierto.entries.map((e) => (
            <div key={e.id} className="rounded-md bg-bg-2/40 p-4 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-[12.5px] font-semibold text-text-1">{e.authorName}</span>
                <span className="text-[11px] text-text-muted font-mono">
                  {fechaHora(e.sentAt, locale)}
                </span>
              </div>
              {/* El cuerpo puede venir con saltos de línea del editor de la
                  clínica; se respetan, pero NO se interpreta HTML. */}
              <p className="text-sm text-text-2 leading-relaxed whitespace-pre-line">{e.body}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <textarea
            value={respuesta}
            onChange={(ev) => setRespuesta(ev.target.value)}
            rows={4}
            maxLength={4000}
            placeholder={t('msgReplyPlaceholder')}
            className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors resize-none"
          />
          <div className="flex justify-end">
            <Button onClick={() => { void responder(); }} disabled={enviando || respuesta.trim().length < 1}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {t('msgReply')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── La lista ───────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg bg-bg-1 overflow-hidden">
      {(!rows || cargandoHilo) && (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
        </div>
      )}

      {rows?.length === 0 && (
        <div className="py-10">
          <EmptyState.Rich icon={Mail} title={t('msgEmptyTitle')} subtitle={t('msgEmptySub')} />
        </div>
      )}

      {rows?.map((th) => (
        <button
          key={th.id}
          type="button"
          onClick={() => { void abrir(th.id); }}
          className="w-full flex items-center gap-3 px-5 py-3 border-b border-row-sep last:border-0 hover:bg-white/[0.02] transition-colors text-left"
        >
          {/* El punto es la única marca de no leído: negrita en toda la fila
              hacía que una bandeja llena se leyera como un bloque. */}
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${th.unread ? 'bg-brand' : 'bg-transparent'}`}
            aria-label={th.unread ? t('msgUnread') : undefined}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={`text-sm truncate ${th.unread ? 'font-semibold text-text-1' : 'text-text-2'}`}>
                {th.subject}
              </span>
              {th.priority === 'URGENT' && (
                <AlertCircle className="w-3.5 h-3.5 text-amber shrink-0" aria-label={t('msgUrgent')} />
              )}
            </div>
            <div className="text-[11.5px] text-text-muted truncate">
              {th.from}
              {th.caseCode && <span className="text-brand-text"> · {th.caseCode}</span>}
              {th.entries > 1 && <span> · {t('msgEntries', { n: th.entries })}</span>}
            </div>
          </div>
          <span className="text-[11px] text-text-muted font-mono shrink-0">
            {fechaHora(th.lastEntryAt, locale)}
          </span>
        </button>
      ))}
    </div>
  );
}
