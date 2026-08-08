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
  Reply, ReplyAll, Forward, StickyNote, FolderLock, Trash2, Send, Lock, CalendarDays, Paperclip, Printer,
} from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import { RichTextEditor } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { useToast } from '@/components/ui-phoenix/toast';
import { UserMultiSelect, type MessagingUser } from './user-multi-select';

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
  case: { id: string; caseCode: string } | null;
  recipients: Array<{ userId: string; userName: string; kind: 'TO' | 'CC'; lastReadAt: string | null }>;
  entries: ThreadEntry[];
  nextAppointment: { id: string; scheduledFor: string } | null;
}

type ComposerMode = 'REPLY' | 'REPLY_ALL' | 'FORWARD' | 'NOTE' | null;

interface Props {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  /** users.id del usuario logueado — para saber cuál es "mi" lado del hilo */
  currentUserId: string;
  isAdmin?: boolean;
  /** Callback tras cualquier mutación (refrescar la lista de origen) */
  onChanged?: () => void;
}

export function ThreadViewDialog({ open, onClose, threadId, currentUserId, isAdmin = false, onChanged }: Props) {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();
  const toast = useToast();

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<MessagingUser[]>([]);
  const [mode, setMode] = useState<ComposerMode>(null);
  const [draft, setDraft] = useState('');
  const [fwdTo, setFwdTo] = useState<MessagingUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'SEAL' | 'DELETE_ALL' | 'DELETE_HISTORY'>(null);
  const [sealNote, setSealNote] = useState('');
  const [askSealNote, setAskSealNote] = useState(false);

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
      dateStyle: 'short', timeStyle: 'short',
    });

  const load = useCallback(async (): Promise<void> => {
    if (!threadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/${threadId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setThread(data.thread);
      // Marca leído MI fila — dispara después de pintar, no bloquea.
      fetch(`/api/messages/${threadId}/read`, { method: 'POST' }).catch(() => undefined);
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
        body: JSON.stringify({ body: draft, kind, to }),
      });
      if (!res.ok) throw new Error();
      setMode(null); setDraft(''); setFwdTo([]);
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
      toast.success(t('deleteOk'));
      onChanged?.();
      onClose();
    } catch {
      toast.error(t('deleteError'));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // Print: ventana propia con el hilo plano (autor, fecha, cuerpo) — sin traer
  // estilos de la app; el CSS mínimo va inline para que imprima legible.
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
    const w = window.open('', '_blank', 'noopener,width=800,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${esc(thread.subject)}</title>
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
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // Bucket privado: cada apertura pide su URL firmada (15 min) y queda auditada.
  const openAttachment = async (attachmentId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/messages/attachments/${attachmentId}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { url: string };
      window.open(data.url, '_blank', 'noopener');
    } catch {
      toast.error(t('attachOpenError'));
    }
  };

  const sealedAtMs = thread?.sealedAt ? new Date(thread.sealedAt).getTime() : null;
  const toNames = thread?.recipients.filter((r) => r.kind === 'TO').map((r) => r.userName) ?? [];
  const ccNames = thread?.recipients.filter((r) => r.kind === 'CC').map((r) => r.userName) ?? [];

  const actionBtn =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
        <DialogContent className="max-w-3xl p-0 max-h-[92vh] flex flex-col">
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
                    <span className="text-brand">
                      {thread.patient.lastName}, {thread.patient.firstName} · {thread.patient.patientCode}
                    </span>
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
              {!thread.sealedAt && (
                <button type="button" className={actionBtn} disabled={busy} onClick={() => setAskSealNote(true)}>
                  <FolderLock className="w-3.5 h-3.5" />{t('actSeal')}
                </button>
              )}
              <button type="button" className={actionBtn} disabled={busy} onClick={printThread}>
                <Printer className="w-3.5 h-3.5" />{t('actPrint')}
              </button>
              <span className="flex-1" />
              <button type="button" className={`${actionBtn} hover:!text-rose`} disabled={busy} onClick={() => doDelete('MINE')}>
                <Trash2 className="w-3.5 h-3.5" />{t('actDeleteMine')}
              </button>
              <button type="button" className={`${actionBtn} hover:!text-rose`} disabled={busy} onClick={() => setConfirm('DELETE_ALL')}>
                {t('actDeleteAll')}
              </button>
              {isAdmin && thread.patient && (
                <button type="button" className={`${actionBtn} hover:!text-rose`} disabled={busy} onClick={() => setConfirm('DELETE_HISTORY')}>
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
                      <span className="ml-auto text-[11px] text-text-muted">{fmtDt(e.sentAt)}</span>
                    </div>
                    <div className="text-[12.5px] text-text-1 leading-relaxed break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                      dangerouslySetInnerHTML={{ __html: e.body }} />
                    {e.attachments.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border/40">
                        {e.attachments.map((a) => (
                          <button key={a.id} type="button" onClick={() => void openAttachment(a.id)}
                            title={a.description ?? a.fileName}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-bg-2/60 border border-border/60 text-text-1 hover:border-brand/50 hover:text-brand transition-colors">
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
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => { setMode(null); setDraft(''); setFwdTo([]); }} disabled={busy}>
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
