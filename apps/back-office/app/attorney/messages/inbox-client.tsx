'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Send, ArrowLeft, Mail, AlertCircle, Paperclip, MailOpen } from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import { AttachmentViewerDialog } from '@/components/messaging/attachment-viewer-dialog';
import { fechaHora } from '@/lib/fechas';
import type { Escritorio } from '@/lib/mensajeria/escritorios';

/**
 * Portal Legal · la bandeja del bufete.
 *
 * Es propia y no la de la clínica: aquella trae plantillas, "ver inbox de…" y
 * el buscador de pacientes — herramientas internas que un externo no puede
 * tener. Acá hay lo que el abogado necesita: lo que le escribieron, el hilo con
 * sus adjuntos, y responder.
 *
 * Tipo correo: en desktop la lista queda a la izquierda y el hilo abre a la
 * derecha sin perder la lista; en el teléfono son dos pantallas con "volver".
 * Con una mediana de 1 hilo por caso y 2 mensajes por hilo (medido), dos
 * columnas alcanzan — un panel de chat habría quedado vacío casi siempre.
 *
 * `?thread=<id>` abre un hilo directo: es el link que viaja en el aviso por
 * correo, y se mantiene en la URL mientras el hilo está abierto para que F5 y
 * "compartir el link" vuelvan al mismo lugar.
 *
 * No hay "mensaje nuevo" a propósito. El abogado responde a quien le escribió, y
 * empieza conversaciones desde Vigía, donde el pedido nace atado a un caso y a
 * un escritorio. Un compositor en blanco lo obligaría a elegir destinatario de
 * una lista de toda la clínica, que es justo lo que no le damos.
 */

interface ThreadRow {
  id: string;
  subject: string;
  priority: 'NORMAL' | 'URGENT';
  type: string;
  referralStatus: 'PENDING' | 'CREATED' | 'DISCARDED' | null;
  desk: Escritorio | null;
  from: string;
  lastFrom: string;
  caseCode: string | null;
  patientName: string | null;
  lastEntryAt: string;
  entries: number;
  attachments: number;
  unread: boolean;
}

interface Adjunto { id: string; fileName: string; documentType: string | null }

interface Entry {
  id: string;
  authorName: string;
  body: string;
  sentAt: string;
  kind: string;
  mine: boolean;
  attachments: Adjunto[];
}

interface ThreadDetail {
  id: string;
  subject: string;
  priority: 'NORMAL' | 'URGENT';
  type: string;
  referral: { status: 'PENDING' | 'CREATED' | 'DISCARDED'; convertedByName: string | null; convertedAt: string | null } | null;
  desk: Escritorio | null;
  topic: string | null;
  createdAt: string;
  caseCode: string | null;
  caseId: string | null;
  patientName: string | null;
  recipients: Array<{ userName: string; kind: 'TO' | 'CC' }>;
  entries: Entry[];
}

/** Color por escritorio: el mismo en la lista, el hilo y la vista del admin. */
export const DESK_PILL: Record<Escritorio, string> = {
  CLINICAL:  'bg-violet/15 text-violet border-violet/30',
  INTAKE:    'bg-cyan/15 text-cyan border-cyan/30',
  BILLING:   'bg-amber/15 text-amber border-amber/30',
  REFERRALS: 'bg-emerald/15 text-emerald border-emerald/30',
};

const POLL_MS = 30_000;

export function AttorneyInbox({ locale, initialThreadId = null }: {
  locale: string;
  initialThreadId?: string | null;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = React.useState<ThreadRow[] | null>(null);
  const [abierto, setAbierto] = React.useState<ThreadDetail | null>(null);
  const [cargandoHilo, setCargandoHilo] = React.useState(false);
  const [respuesta, setRespuesta] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [viendo, setViendo] = React.useState<Adjunto | null>(null);
  const hiloRef = React.useRef<HTMLDivElement>(null);

  const cargarLista = React.useCallback(async () => {
    try {
      const r = await fetch('/api/attorney/messages');
      if (!r.ok) { setRows((prev) => prev ?? []); return; }
      const d = (await r.json()) as { threads: ThreadRow[] };
      setRows(d.threads);
    } catch { setRows((prev) => prev ?? []); }
  }, []);

  // Sondeo liviano: una respuesta de la clínica tiene que aparecer sin F5.
  React.useEffect(() => {
    void cargarLista();
    const id = setInterval(() => void cargarLista(), POLL_MS);
    const onFocus = () => void cargarLista();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [cargarLista]);

  const abrir = React.useCallback(async (id: string): Promise<void> => {
    setCargandoHilo(true);
    setRespuesta('');
    try {
      const r = await fetch(`/api/attorney/messages/${id}`);
      if (!r.ok) { setAbierto(null); router.replace(pathname, { scroll: false }); return; }
      setAbierto((await r.json()) as ThreadDetail);
      router.replace(`${pathname}?thread=${encodeURIComponent(id)}`, { scroll: false });
      // Abrirlo lo marca leído del lado del servidor: la lista se refresca para
      // que el punto se apague sin recargar la página.
      void cargarLista();
    } finally {
      setCargandoHilo(false);
    }
  }, [cargarLista, pathname, router]);

  // El link del correo trae el hilo: se abre al entrar.
  React.useEffect(() => {
    if (initialThreadId) void abrir(initialThreadId);
    // Solo al montar: si después el usuario navega, manda la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function volver(): void {
    setAbierto(null);
    router.replace(pathname, { scroll: false });
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
      hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight, behavior: 'smooth' });
    } finally {
      setEnviando(false);
    }
  }

  const para = abierto?.recipients.filter((r) => r.kind === 'TO').map((r) => r.userName) ?? [];

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-4 lg:items-start">
        {/* ── La lista ─────────────────────────────────────────────────────── */}
        <div className={`rounded-lg bg-bg-1 overflow-hidden ${abierto ? 'hidden lg:block' : ''}`}>
          {!rows && (
            <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
            </div>
          )}
          {rows?.length === 0 && (
            <div className="py-10">
              <EmptyState.Rich icon={Mail} title={t('msgEmptyTitle')} subtitle={t('msgEmptySub')} />
            </div>
          )}
          {rows?.map((th) => {
            const activo = abierto?.id === th.id;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => { void abrir(th.id); }}
                aria-current={activo ? 'true' : undefined}
                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-row-sep last:border-0 text-left transition-colors ${
                  activo ? 'bg-brand/[0.06]' : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* El punto es la única marca de no leído: negrita en toda la fila
                    hacía que una bandeja llena se leyera como un bloque. */}
                <span
                  className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${th.unread ? 'bg-brand' : 'bg-transparent'}`}
                  aria-label={th.unread ? t('msgUnread') : undefined}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm truncate ${th.unread ? 'font-semibold text-text-1' : 'text-text-2'}`}>
                      {th.lastFrom}
                    </span>
                    <span className="text-[11px] text-text-muted font-mono shrink-0">
                      {fechaHora(th.lastEntryAt, locale as 'es' | 'en')}
                    </span>
                  </div>
                  <div className={`text-[12.5px] truncate ${th.unread ? 'text-text-1' : 'text-text-2'}`}>
                    {th.subject}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {th.priority === 'URGENT' && (
                      <AlertCircle className="w-3 h-3 text-amber shrink-0" aria-label={t('msgUrgent')} />
                    )}
                    {th.caseCode && (
                      <TagPill label={th.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />
                    )}
                    {th.type === 'REFERRAL' ? (
                      <TagPill
                        label={th.referralStatus === 'CREATED' ? t('refStatusCreated') : t('refStatusPending')}
                        colorClass={th.referralStatus === 'CREATED' ? 'bg-emerald/15 text-emerald border-emerald/30' : DESK_PILL.REFERRALS}
                      />
                    ) : th.desk && <TagPill label={t(`desk_${th.desk}`)} colorClass={DESK_PILL[th.desk]} />}
                    {th.patientName && (
                      <span className="text-[11px] text-text-muted truncate">{th.patientName}</span>
                    )}
                    {th.attachments > 0 && (
                      <Paperclip className="w-3 h-3 text-text-muted shrink-0" aria-label={t('msgAttachments', { n: th.attachments })} />
                    )}
                    {th.entries > 1 && (
                      <span className="text-[11px] text-text-muted">· {t('msgEntries', { n: th.entries })}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── El hilo ──────────────────────────────────────────────────────── */}
        <div className={abierto || cargandoHilo ? '' : 'hidden lg:block'}>
          {!abierto && (
            <div className="rounded-lg bg-bg-1 min-h-[320px] flex items-center justify-center">
              {cargandoHilo
                ? <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
                : <EmptyState.Rich icon={MailOpen} title={t('msgPickOne')} subtitle={t('msgPickOneSub')} />}
            </div>
          )}

          {abierto && (
            <div className="rounded-lg bg-bg-1 p-5 space-y-4">
              <button
                type="button"
                onClick={volver}
                className="lg:hidden flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('msgBack')}
              </button>

              {/* Cabecera: asunto y contexto del expediente */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h2 className="text-text-1 font-semibold leading-snug">{abierto.subject}</h2>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {abierto.priority === 'URGENT' && (
                      <TagPill label={t('msgUrgent')} colorClass="bg-amber/15 text-amber border-amber/30" />
                    )}
                    {abierto.type === 'REFERRAL' ? (
                      <TagPill
                        label={abierto.referral?.status === 'CREATED' ? t('refStatusCreated') : t('refStatusPending')}
                        colorClass={abierto.referral?.status === 'CREATED' ? 'bg-emerald/15 text-emerald border-emerald/30' : DESK_PILL.REFERRALS}
                      />
                    ) : abierto.desk && <TagPill label={t(`desk_${abierto.desk}`)} colorClass={DESK_PILL[abierto.desk]} />}
                    {abierto.caseCode && (
                      <TagPill label={abierto.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />
                    )}
                  </div>
                </div>
                {/* El referido le cuenta al abogado en qué está: pendiente en la
                    clínica, o ya con caso (y quién lo creó). */}
                {abierto.referral && (
                  <p className={`text-[12px] ${abierto.referral.status === 'CREATED' ? 'text-emerald' : 'text-text-muted'}`}>
                    {abierto.referral.status === 'CREATED'
                      ? t('refDetailCreated', { name: abierto.referral.convertedByName ?? '—' })
                      : t('refDetailPending')}
                  </p>
                )}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                  {abierto.patientName && (
                    <div className="flex gap-2 min-w-0">
                      <dt className="text-text-muted shrink-0">{t('msgClient')}</dt>
                      <dd className="text-text-1 truncate">{abierto.patientName}</dd>
                    </div>
                  )}
                  {para.length > 0 && (
                    <div className="flex gap-2 min-w-0">
                      <dt className="text-text-muted shrink-0">{t('msgTo')}</dt>
                      <dd className="text-text-2 truncate">{para.join(', ')}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Mensajes: los míos a la derecha, los de la clínica a la izquierda. */}
              <div ref={hiloRef} className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {abierto.entries.map((e) => (
                  <div
                    key={e.id}
                    className={`rounded-md p-4 space-y-2 max-w-[92%] sm:max-w-[85%] ${
                      e.mine ? 'ml-auto bg-brand/10' : 'mr-auto bg-bg-2/40'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="text-[12.5px] font-semibold text-text-1">
                        {e.mine ? t('msgYou') : e.authorName}
                      </span>
                      <span className="text-[11px] text-text-muted font-mono">
                        {fechaHora(e.sentAt, locale as 'es' | 'en')}
                      </span>
                    </div>
                    {/* El cuerpo puede venir con saltos de línea del editor de la
                        clínica; se respetan, pero NO se interpreta HTML. */}
                    <p className="text-sm text-text-2 leading-relaxed whitespace-pre-line">{e.body}</p>
                    {e.attachments.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5 pt-1">
                        {e.attachments.map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => setViendo(a)}
                              title={t('msgOpenAttachment')}
                              className="inline-flex items-center gap-1.5 max-w-full rounded-md bg-bg-1 px-2.5 py-1.5 text-[12px] text-text-1 hover:bg-white/5 transition-colors"
                            >
                              <Paperclip className="w-3 h-3 text-brand-text shrink-0" />
                              <span className="truncate">{a.fileName}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
          )}
        </div>
      </div>

      <AttachmentViewerDialog
        attachmentId={viendo?.id ?? null}
        fileName={viendo?.fileName ?? ''}
        onClose={() => setViendo(null)}
        endpoint="/api/attorney/messages/attachments"
      />
    </>
  );
}
