'use client';

/**
 * ThreadViewDialog — hilo de mensajería (M1) estilo conversación.
 *
 * En vez del re-citado del legacy (Fwd: Fwd: Re: con el historial duplicado en
 * cada cuerpo), el hilo se muestra como conversación cronológica: cada entrada
 * con autor, hora y tipo. Las notas (Add Note) se distinguen visualmente.
 *
 * Acciones (legacy → acá):
 *  · Reply       — responde SOLO al autor de la última entrada ajena
 *  · Reply All   — responde sin tocar la lista de destinatarios
 *  · Forward     — agrega destinatarios nuevos
 *  · Add Note    — anotación; notifica a todos igual que un mensaje
 *  · Move to Patient Folder (±nota) — SELLA: lo previo queda inmutable y el
 *    hilo sale de todos los inboxes; se puede seguir escribiendo (revive)
 *  · Delete      — solo de MI inbox · Delete From All — de todos los inboxes
 *
 * Al abrir marca leído MI fila (nunca la de otros — mirar un inbox ajeno no
 * desmarca nada, por eso el read va contra el actor del server).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Reply, ReplyAll, Forward, StickyNote, FolderLock, Trash2, Send, Lock, CalendarDays, Paperclip, Printer, Briefcase, Pencil, ArrowUpRight,
} from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import { RichTextEditor } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { useToast } from '@/components/ui-phoenix/toast';
import { UserMultiSelect, type MessagingUser } from './user-multi-select';
import { AttachmentPicker, type PendingAttachment } from './attachment-picker';
import { AttachmentViewerDialog } from './attachment-viewer-dialog';

interface EntryAttachment {
  id: string;
  fileName: string;
  fileUrl: string | null;
  patientDocumentId: string | null;
  documentType: string | null;
  description: string | null;
}

interface ThreadEntry {
  id: string;
  kind: 'MESSAGE' | 'REPLY' | 'FORWARD' | 'NOTE' | 'SEAL_NOTE';
  authorUserId: string;
  authorName: string;
  body: string;
  sentAt: string;
  editedAt: string | null;
  attachments: EntryAttachment[];
}

interface ThreadDetail {
  id: string;
  subject: string;
  type: string;
  category: string;
  priority: 'NORMAL' | 'URGENT';
  createdByUserId: string;
  createdByName: string;
  sealedAt: string | null;
  sealedByName: string | null;
  patient: { id: string; firstName: string; lastName: string; patientCode: string } | null;
  case: { id: string; caseCode: string; accidentDate: string | null } | null;
  recipients: Array<{ userId: string; userName: string; kind: 'TO' | 'CC'; lastReadAt: string | null }>;
  entries: ThreadEntry[];
  nextAppointment: { id: string; scheduledFor: string } | null;
}

type ComposerMode = 'REPLY' | 'REPLY_ALL' | 'FORWARD' | 'NOTE' | null;

/** Un hilo se marcó leído — lo escucha el badge del top bar (InboxBell). */
export const MESSAGES_READ_EVENT = 'pm:messages-read';

interface Props {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  /** users.id del usuario logueado — para saber cuál es "mi" lado del hilo */
  currentUserId: string;
  isAdmin?: boolean;
  /** Callback tras cualquier mutación (refrescar la lista de origen) */
  onChanged?: () => void;
  /**
   * Abre el detalle del CASO del hilo. El diálogo no sabe cómo: la superficie
   * que lo monta decide (hoy `?case=` sobre su propia URL). Sin este callback
   * —o sin caso en el hilo— el botón no se muestra, igual que en el panel de
   * la cita del calendario.
   */
  onOpenCase?: (caseId: string) => void;
  /**
   * Repliega el diálogo sin desmontarlo, mientras el caso está encima. Al
   * volver reaparece con su estado intacto: el hilo cargado y el borrador de la
   * respuesta a medio escribir. Es lo que evita apilar dos Dialog de Radix de
   * árboles distintos (patrón de `AppointmentDetailPanel`).
   */
  suspended?: boolean;
}

export function ThreadViewDialog({
  open, onClose, threadId, currentUserId, isAdmin = false, onChanged,
  onOpenCase, suspended = false,
}: Props) {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();
  const toast = useToast();

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<MessagingUser[]>([]);
  const [mode, setMode] = useState<ComposerMode>(null);
  const [draft, setDraft] = useState('');
  const [fwdTo, setFwdTo] = useState<MessagingUser[]>([]);
  /** Adjuntos de la respuesta — la ruta de entradas ya los aceptaba. */
  const [entryFiles, setEntryFiles] = useState<PendingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'SEAL' | 'DELETE_ALL' | 'DELETE_HISTORY'>(null);

  // ─── Corregir un mensaje propio ─────────────────────────────────────────
  // Permitido mientras NADIE MÁS lo haya leído. El server manda; acá solo se
  // decide si mostrar el lápiz, para no ofrecer algo que va a ser rechazado.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSubject, setEditSubject] = useState('');

  const canEditEntry = (e: ThreadEntry): boolean => {
    if (!thread || e.authorUserId !== currentUserId) return false;
    if (thread.sealedAt && new Date(e.sentAt) <= new Date(thread.sealedAt)) return false;
    return !thread.recipients.some(
      (r) => r.userId !== currentUserId && r.lastReadAt !== null &&
             new Date(r.lastReadAt) >= new Date(e.sentAt),
    );
  };

  const startEdit = (e: ThreadEntry, isFirst: boolean): void => {
    setEditingId(e.id);
    setEditBody(e.body);
    setEditSubject(isFirst ? (thread?.subject ?? '') : '');
  };

  const saveEdit = async (isFirst: boolean): Promise<void> => {
    if (!thread || !editingId) return;
    const plain = editBody.replace(/<[^>]*>/g, '').trim();
    if (plain === '') return;
    setBusy(true);
    try {
      const res = await fetch(`/api/messages/${thread.id}/entries/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody, ...(isFirst ? { subject: editSubject } : {}) }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; readerName?: string };
        // El caso interesante: alguien lo leyó entre que se abrió el lápiz y se
        // guardó. Se explica con nombre y se ofrece la salida correcta.
        toast.error(err.error === 'YA_LEIDO'
          ? t('editBlockedRead', { name: err.readerName ?? '' })
          : err.error === 'SELLADO' ? t('editBlockedSealed') : t('editError'));
        return;
      }
      setEditingId(null);
      toast.success(t('editOk'));
      onChanged?.();
      await load();
    } catch {
      toast.error(t('editError'));
    } finally {
      setBusy(false);
    }
  };
  const [sealNote, setSealNote] = useState('');
  const [askSealNote, setAskSealNote] = useState(false);

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
      dateStyle: 'short', timeStyle: 'short',
    });
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

  const load = useCallback(async (): Promise<void> => {
    if (!threadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/${threadId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setThread(data.thread);
      // Marca leído MI fila — dispara después de pintar, no bloquea. Al
      // confirmar, avisa al badge del top bar: el rojo de un urgente tiene que
      // apagarse en el momento en que lo atienden, no en el próximo sondeo.
      // Evento global porque el hilo se abre desde 4 lugares distintos.
      fetch(`/api/messages/${threadId}/read`, { method: 'POST' })
        .then(() => window.dispatchEvent(new CustomEvent(MESSAGES_READ_EVENT)))
        .catch(() => undefined);
    } catch {
      toast.error(t('loadError'));
      onClose();
    } finally {
      setLoading(false);
    }
  }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) { setThread(null); setMode(null); setDraft(''); setFwdTo([]); return; }
    load();
    fetch('/api/messages/users')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setUsers([]));
  }, [open, load]);

  const plainDraft = draft.replace(/<[^>]*>/g, '').trim();

  const submitEntry = async (): Promise<void> => {
    if (!thread || !mode || plainDraft === '') return;
    setBusy(true);
    try {
      // Reply simple: al autor de la última entrada que no sea mía (fallback:
      // creador del hilo). El server lo suma como destinatario si faltaba.
      let to: string[] = [];
      if (mode === 'REPLY') {
        const lastOther = [...thread.entries].reverse().find((e) => e.authorUserId !== currentUserId);
        to = [lastOther?.authorUserId ?? thread.createdByUserId];
      } else if (mode === 'FORWARD') {
        to = fwdTo.map((u) => u.id);
      }
      const kind = mode === 'NOTE' ? 'NOTE' : mode === 'FORWARD' ? 'FORWARD' : 'REPLY';
      const res = await fetch(`/api/messages/${thread.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: draft, kind, to,
          attachments: entryFiles.map((a) => ({
            path: a.path,
            patientDocumentId: a.patientDocumentId,
            fileName: a.fileName,
            description: a.description || null,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setMode(null); setDraft(''); setFwdTo([]); setEntryFiles([]);
      toast.success(t('entryOk'));
      onChanged?.();
      await load();
    } catch {
      toast.error(t('entryError'));
    } finally {
      setBusy(false);
    }
  };

  const seal = async (withNote: boolean): Promise<void> => {
    if (!thread) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/messages/${thread.id}/seal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withNote ? { note: sealNote } : {}),
      });
      if (!res.ok) throw new Error();
      toast.success(t('sealOk'));
      setAskSealNote(false); setSealNote('');
      onChanged?.();
      await load();
    } catch {
      toast.error(t('sealError'));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (which: 'MINE' | 'ALL' | 'HISTORY'): Promise<void> => {
    if (!thread) return;
    setBusy(true);
    try {
      const url =
        which === 'HISTORY'
          ? `/api/messages/${thread.id}`
          : `/api/messages/${thread.id}/inbox${which === 'ALL' ? '?all=1' : ''}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      // El aviso enseña la regla en el momento exacto en que importa: el que
      // borra de su bandeja cree que borró para todos.
      toast.success(which === 'MINE' ? t('deleteMineOk') : t('deleteOk'));
      onChanged?.();
      onClose();
    } catch {
      toast.error(t('deleteError'));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  /**
   * Print: el hilo plano (autor, fecha, cuerpo) con CSS propio inline, para que
   * imprima legible sin arrastrar el tema oscuro de la app.
   *
   * Se imprime desde un IFRAME OCULTO, no desde `window.open`. La primera
   * versión abría una ventana y quedaba en blanco: pasarle `noopener` en las
   * opciones hace que `window.open` devuelva `null` por spec, así que el código
   * se salía sin escribir nada y dejaba la ventana vacía. El iframe además no
   * lo tocan los bloqueadores de pop-ups.
   */
  const printThread = (): void => {
    if (!thread) return;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const entriesHtml = thread.entries.map((e) => `
      <div class="entry${e.kind === 'NOTE' || e.kind === 'SEAL_NOTE' ? ' note' : ''}">
        <div class="meta"><strong>${esc(e.authorName)}</strong> · ${esc(fmtDt(e.sentAt))}${
          e.kind === 'NOTE' || e.kind === 'SEAL_NOTE' ? ` · ${esc(t('kindNote'))}` : ''
        }</div>
        <div class="body">${e.body}</div>
        ${e.attachments.length > 0
          ? `<div class="atts">📎 ${e.attachments.map((a) => esc(a.fileName)).join(' · ')}</div>`
          : ''}
      </div>`).join('');
    const html = `<!doctype html><html><head><title>${esc(thread.subject)}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #111; margin: 24px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .head { font-size: 12px; color: #555; margin-bottom: 16px; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
        .entry { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; }
        .entry.note { background: #fdf6e3; }
        .meta { font-size: 11px; color: #555; margin-bottom: 6px; }
        .body { font-size: 13px; line-height: 1.5; }
        .atts { font-size: 11px; color: #555; margin-top: 6px; }
      </style></head><body>
      <h1>${esc(thread.subject)}</h1>
      <div class="head">
        ${esc(t('fieldTo'))}: ${esc(toNames.join(', '))}
        ${ccNames.length > 0 ? ` · CC: ${esc(ccNames.join(', '))}` : ''}
        ${thread.patient ? ` · ${esc(`${thread.patient.lastName}, ${thread.patient.firstName}`)} (${esc(thread.patient.patientCode)})` : ''}
      </div>
      ${entriesHtml}
      </body></html>`;

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); toast.error(t('printError')); return; }
    doc.open();
    doc.write(html);
    doc.close();

    // Un tick para que el iframe pinte antes de abrir el diálogo de impresión,
    // y baja diferida: quitarlo de inmediato cancela la impresión en Firefox.
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    }, 50);
  };

  /**
   * Adjunto abierto en el visor embebido. Antes se hacía `window.open` con la
   * URL firmada: sacaba al usuario del hilo y dejaba esa URL en la barra de
   * direcciones y en el historial, que para PHI es mejor evitar. El pedido de
   * la URL (y su registro en el audit log) lo hace el visor.
   */
  const [viewing, setViewing] = useState<{ id: string; fileName: string } | null>(null);

  const sealedAtMs = thread?.sealedAt ? new Date(thread.sealedAt).getTime() : null;
  const toNames = thread?.recipients.filter((r) => r.kind === 'TO').map((r) => r.userName) ?? [];
  const ccNames = thread?.recipients.filter((r) => r.kind === 'CC').map((r) => r.userName) ?? [];

  const actionBtn =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  /** Destructivo — rose siempre visible, no recién al pasar el mouse: borrar no
   *  debería descubrirse por accidente. Mismo criterio que el ámbar del sello. */
  const dangerBtn =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-rose hover:bg-rose/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <>
      {/* `!suspended`: mientras el caso está encima el diálogo se repliega sin
          desmontarse, y el onOpenChange no cuenta eso como un cierre. */}
      <Dialog open={open && !suspended} onOpenChange={(v) => { if (!v && !suspended && !busy) onClose(); }}>
        {/* Alto FIJO — ver la nota de escala en patient-messages-dialog: la
            conversación siempre ocupa el mismo marco y crece por dentro. */}
        <DialogContent className="max-w-3xl p-0 h-[80vh] flex flex-col">
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b border-border space-y-2">
            <DialogTitle className="flex items-center gap-2 flex-wrap text-text-1 text-base font-semibold">
              {thread?.priority === 'URGENT' && (
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-rose/10 border border-rose/30 text-rose">
                  {t('priorityURGENT')}
                </span>
              )}
              <span className="truncate">{thread?.subject ?? '…'}</span>
              {thread?.sealedAt && <Lock className="w-3.5 h-3.5 text-amber shrink-0" />}
            </DialogTitle>
            {thread && (
              <div className="text-[11px] text-text-muted space-y-0.5">
                <div><span className="font-semibold">{t('fieldTo')}:</span> {toNames.join(', ') || '—'}</div>
                {ccNames.length > 0 && <div><span className="font-semibold">{t('fieldCc')}:</span> {ccNames.join(', ')}</div>}
                <div className="flex items-center gap-3 flex-wrap">
                  <span>{t(`type${thread.type}`)} · {t(`category${thread.category}`)}</span>
                  {thread.patient && (
                    <span className="text-brand-text">
                      {thread.patient.lastName}, {thread.patient.firstName} · {thread.patient.patientCode}
                    </span>
                  )}
                  {/* El caso es una elección deliberada del que escribe — se
                      muestra para saber sobre qué se está consultando. Si la
                      pantalla puede abrirlo, el chip ES el botón: hacés clic en
                      el caso para ver el caso. Con la etiqueta visible, porque
                      un chip que parece texto no invita al clic. */}
                  {thread.case && (
                    onOpenCase ? (
                      /* Tres señales de "esto abre algo", porque una pastilla
                         de color sola se lee como etiqueta informativa: la
                         flecha diagonal (convención universal de abrir), el
                         relleno más presente que un tinte decorativo, y el
                         subrayado de la etiqueta al pasar el mouse. */
                      <button
                        type="button"
                        onClick={() => onOpenCase(thread.case!.id)}
                        title={t('openCaseTooltip')}
                        className="group inline-flex items-center gap-1 px-2 py-0.5 -my-0.5 rounded-full bg-brand/15 border border-brand/40 text-brand-text hover:bg-brand/25 hover:border-brand/70 transition-colors"
                      >
                        <Briefcase className="w-3 h-3" />
                        <span className="font-mono">{thread.case.caseCode}</span>
                        {thread.case.accidentDate && (
                          <span className="text-text-muted">
                            · {t('caseAccidentPrefix')} {fmtDate(thread.case.accidentDate)}
                          </span>
                        )}
                        <span className="font-semibold underline-offset-2 group-hover:underline">
                          · {t('openCase')}
                        </span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        <span className="font-mono text-text-2">{thread.case.caseCode}</span>
                        {thread.case.accidentDate && (
                          <span>· {t('caseAccidentPrefix')} {fmtDate(thread.case.accidentDate)}</span>
                        )}
                      </span>
                    )
                  )}
                  {thread.patient && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {thread.nextAppointment
                        ? t('nextAppt', { date: fmtDt(thread.nextAppointment.scheduledFor) })
                        : t('nextApptNone')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </DialogHeader>

          {/* Barra de acciones */}
          {thread && (
            <div className="flex items-center gap-1 flex-wrap px-3 sm:px-5 py-2 border-b border-border/60">
              <button type="button" className={actionBtn} disabled={busy} onClick={() => setMode('REPLY')}>
                <Reply className="w-3.5 h-3.5" />{t('actReply')}
              </button>
              <button type="button" className={actionBtn} disabled={busy} onClick={() => setMode('REPLY_ALL')}>
                <ReplyAll className="w-3.5 h-3.5" />{t('actReplyAll')}
              </button>
              <button type="button" className={actionBtn} disabled={busy} onClick={() => setMode('FORWARD')}>
                <Forward className="w-3.5 h-3.5" />{t('actForward')}
              </button>
              <button type="button" className={actionBtn} disabled={busy} onClick={() => setMode('NOTE')}>
                <StickyNote className="w-3.5 h-3.5" />{t('actNote')}
              </button>
              {/* Ámbar SIEMPRE visible (no solo en hover): es la única acción
                  de la barra con consecuencias —sella y saca de las bandejas— y
                  el ámbar ya es el idioma del sello en todo el módulo (candado,
                  banda del hilo, nota de cierre). Rojo queda para los Delete;
                  archivar no destruye nada. */}
              {!thread.sealedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAskSealNote(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-amber hover:bg-amber/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FolderLock className="w-3.5 h-3.5" />{t('actSeal')}
                </button>
              )}
              <button type="button" className={actionBtn} disabled={busy} onClick={printThread}>
                <Printer className="w-3.5 h-3.5" />{t('actPrint')}
              </button>
              <span className="flex-1" />
              {/* Quitar de MI bandeja no es destructivo —el hilo sigue en el
                  historial del paciente y vuelve si alguien responde— así que va
                  en gris. El rojo se reserva para los dos que sí afectan a
                  otros: si todo fuera rojo, el nombre nuevo no alcanzaría para
                  sacarle el miedo. Cada uno declara su alcance en el tooltip. */}
              <button type="button" className={actionBtn} disabled={busy}
                title={t('tipDeleteMine')} onClick={() => doDelete('MINE')}>
                <Trash2 className="w-3.5 h-3.5" />{t('actDeleteMine')}
              </button>
              <button type="button" className={dangerBtn} disabled={busy}
                title={t('tipDeleteAll')} onClick={() => setConfirm('DELETE_ALL')}>
                {t('actDeleteAll')}
              </button>
              {isAdmin && thread.patient && (
                <button type="button" className={dangerBtn} disabled={busy}
                  title={t('tipDeleteHistory')} onClick={() => setConfirm('DELETE_HISTORY')}>
                  {t('actDeleteHistory')}
                </button>
              )}
            </div>
          )}

          {/* Conversación */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
            {loading && <div className="text-text-muted text-sm">{t('loading')}</div>}
            {thread?.entries.map((e, i) => {
              const sealed = sealedAtMs !== null && new Date(e.sentAt).getTime() <= sealedAtMs;
              const isNote = e.kind === 'NOTE' || e.kind === 'SEAL_NOTE';
              const prevSealed = i > 0 && sealedAtMs !== null &&
                new Date(thread.entries[i - 1].sentAt).getTime() <= sealedAtMs;
              return (
                <div key={e.id}>
                  {/* Banda de sello entre lo inmutable y lo nuevo */}
                  {i > 0 && prevSealed && !sealed && (
                    <div className="flex items-center gap-2 my-3 text-[10px] uppercase tracking-wider font-semibold text-amber">
                      <div className="flex-1 h-px bg-amber/30" />
                      <Lock className="w-3 h-3" />
                      {t('sealedBanner', { name: thread.sealedByName ?? '', date: fmtDt(thread.sealedAt!) })}
                      <div className="flex-1 h-px bg-amber/30" />
                    </div>
                  )}
                  <div className={`rounded-md border p-3 ${
                    isNote
                      ? 'border-amber/30 bg-amber/10'
                      : e.authorUserId === currentUserId
                        ? 'border-brand/30 bg-brand/[0.06]'
                        : 'border-border/40 bg-bg-2/40'
                  }`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-text-1">{e.authorName}</span>
                      {isNote && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-amber/10 border border-amber/30 text-amber">
                          {e.kind === 'SEAL_NOTE' ? t('kindSealNote') : t('kindNote')}
                        </span>
                      )}
                      {e.kind === 'FORWARD' && (
                        <span className="text-[10px] uppercase tracking-wider text-text-muted">{t('kindForward')}</span>
                      )}
                      {e.editedAt && (
                        <span className="text-[10px] italic text-text-muted" title={fmtDt(e.editedAt)}>
                          {t('editedMark')}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-text-muted">{fmtDt(e.sentAt)}</span>
                      {/* El lápiz solo aparece mientras la corrección es segura:
                          es mío y nadie más lo leyó todavía. */}
                      {editingId !== e.id && canEditEntry(e) && (
                        <button type="button" disabled={busy}
                          onClick={() => startEdit(e, i === 0)}
                          className="p-1 rounded text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors disabled:opacity-40"
                          title={t('editTooltip')} aria-label={t('editTooltip')}>
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {editingId === e.id ? (
                      <div className="space-y-2">
                        {i === 0 && (
                          <input
                            value={editSubject}
                            onChange={(ev) => setEditSubject(ev.target.value)}
                            maxLength={200}
                            disabled={busy}
                            placeholder={t('fieldSubject')}
                            className="w-full bg-bg-2 border border-border rounded-md px-3 py-1.5 text-sm text-text-1 outline-none focus:border-brand transition-colors"
                          />
                        )}
                        <RichTextEditor value={editBody} onChange={setEditBody} minHeight={90}
                          placeholder={t('bodyPlaceholder')} disabled={busy} />
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" onClick={() => setEditingId(null)} disabled={busy}>
                            {t('btnCancel')}
                          </Button>
                          <button type="button" onClick={() => void saveEdit(i === 0)}
                            disabled={busy || editBody.replace(/<[^>]*>/g, '').trim() === ''}
                            className="px-4 py-2 rounded-md text-sm font-semibold bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            {t('btnSaveEdit')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[12.5px] text-text-1 leading-relaxed break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        dangerouslySetInnerHTML={{ __html: e.body }} />
                    )}
                    {e.attachments.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border/40">
                        {e.attachments.map((a) => (
                          <button key={a.id} type="button"
                            onClick={() => setViewing({ id: a.id, fileName: a.fileName })}
                            title={a.description ?? a.fileName}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-bg-2/60 border border-border/60 text-text-1 hover:border-brand/50 hover:text-brand-text transition-colors">
                            <Paperclip className="w-3 h-3" />
                            <span className="truncate max-w-[180px]">{a.fileName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer inline */}
          {mode && thread && (
            <div className="border-t border-border px-4 sm:px-6 py-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t(`composer${mode}`)}
              </div>
              {mode === 'FORWARD' && (
                <UserMultiSelect users={users} selected={fwdTo} onChange={setFwdTo}
                  excludeIds={thread.recipients.map((r) => r.userId)}
                  placeholder={t('toPlaceholder')} disabled={busy} />
              )}
              <RichTextEditor value={draft} onChange={setDraft} minHeight={100}
                placeholder={t('bodyPlaceholder')} disabled={busy} />
              {/* Adjuntar también al responder: mismo componente que el compose,
                  en modo compacto (sin descripción, que acá sería ruido). */}
              <AttachmentPicker
                compact
                attachments={entryFiles}
                onChange={setEntryFiles}
                patientId={thread.patient?.id ?? null}
                disabled={busy}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => { setMode(null); setDraft(''); setFwdTo([]); setEntryFiles([]); }} disabled={busy}>
                  {t('btnCancel')}
                </Button>
                <button type="button" onClick={submitEntry}
                  disabled={busy || plainDraft === '' || (mode === 'FORWARD' && fwdTo.length === 0)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <Send className="w-3.5 h-3.5" />
                  {busy ? t('btnSending') : t('btnSend')}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sellar: ¿con nota final? */}
      <Dialog open={askSealNote} onOpenChange={(v) => { if (!v) setAskSealNote(false); }}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-text-1 text-base font-semibold">
              <FolderLock className="w-4 h-4 text-amber" />
              {t('sealTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 space-y-2">
            <p className="text-text-muted text-sm leading-relaxed">{t('sealDescription')}</p>
            <textarea
              value={sealNote} onChange={(e) => setSealNote(e.target.value)}
              placeholder={t('sealNotePlaceholder')} rows={3}
              className="w-full rounded-md border border-border bg-bg-2/40 px-3 py-2 text-sm text-text-1 outline-none focus:border-amber/50 resize-none" />
          </div>
          <DialogFooter className="px-6 py-5 flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setAskSealNote(false)} disabled={busy} className="w-full sm:w-auto">
              {t('btnCancel')}
            </Button>
            <button type="button" disabled={busy} onClick={() => seal(sealNote.trim() !== '')}
              className="w-full sm:w-auto px-4 py-2 rounded-md text-sm font-semibold bg-amber hover:bg-amber/90 text-black transition-colors disabled:opacity-40">
              {sealNote.trim() ? t('btnSealWithNote') : t('btnSeal')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visor del adjunto — diálogo anidado del MISMO árbol, así que Radix lo
          apila sin el conflicto de foco que tienen dos diálogos de árboles
          distintos (el problema que resolvimos con el caso). */}
      <AttachmentViewerDialog
        attachmentId={viewing?.id ?? null}
        fileName={viewing?.fileName ?? ''}
        onClose={() => setViewing(null)}
      />

      <ConfirmDialog
        open={confirm === 'DELETE_ALL'}
        variant="danger"
        title={t('confirmDeleteAllTitle')}
        description={t('confirmDeleteAllDesc')}
        confirmLabel={t('actDeleteAll')}
        cancelLabel={t('btnCancel')}
        onConfirm={() => doDelete('ALL')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'DELETE_HISTORY'}
        variant="danger"
        title={t('confirmDeleteHistoryTitle')}
        description={t('confirmDeleteHistoryDesc')}
        confirmLabel={t('actDeleteHistory')}
        cancelLabel={t('btnCancel')}
        onConfirm={() => doDelete('HISTORY')}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
