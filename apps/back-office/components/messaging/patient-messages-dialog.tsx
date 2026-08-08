'use client';

/**
 * PatientMessagesDialog — "Messages & Requests" del paciente (M1).
 *
 * El registro PERMANENTE: lista todos los hilos anclados al paciente, incluso
 * los sellados y los sacados de las bandejas (Delete From All). Bold = tengo
 * entradas sin leer (solo aplica si soy destinatario). Desde acá se abre el
 * hilo y se crea un mensaje nuevo ya vinculado al paciente.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Mail, MailOpen, Plus, Lock, MessagesSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { EmptyState } from '@/components/ui-phoenix';
import { ComposeMessageDialog, type ComposePatientRef } from './compose-message-dialog';
import { ThreadViewDialog } from './thread-view-dialog';

interface ThreadRow {
  id: string;
  subject: string;
  type: string;
  priority: 'NORMAL' | 'URGENT';
  createdByName: string;
  lastAuthorName: string | null;
  lastEntryAt: string;
  sealedAt: string | null;
  unread: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patient: ComposePatientRef | null;
  currentUserId: string;
  isAdmin?: boolean;
}

export function PatientMessagesDialog({ open, onClose, patient, currentUserId, isAdmin = false }: Props) {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!patient) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/patient/${patient.id}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
      dateStyle: 'short', timeStyle: 'short',
    });

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl p-0 max-h-[92vh] flex flex-col">
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 flex-wrap text-text-1 text-base font-semibold">
              <MessagesSquare className="w-4 h-4 text-brand" />
              {t('patientMessagesTitle')}
              {patient && <span className="text-text-muted font-normal text-sm">— {patient.name}</span>}
              <button type="button" onClick={() => setComposeOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-brand hover:bg-brand/90 text-white transition-colors">
                <Plus className="w-3 h-3" />
                {t('btnNewMessage')}
              </button>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-6 py-8 text-text-muted text-sm">{t('loading')}</div>
            ) : threads.length === 0 ? (
              <div className="p-6">
                <EmptyState.Rich icon={MessagesSquare} title={t('emptyTitle')} subtitle={t('emptyDesc')} />
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {threads.map((th) => (
                  <li key={th.id}>
                    <button type="button" onClick={() => setOpenThreadId(th.id)}
                      className="w-full flex items-center gap-3 px-4 sm:px-6 !py-1 min-h-[44px] text-left hover:bg-white/[0.02] transition-colors">
                      {th.unread
                        ? <Mail className="w-3.5 h-3.5 text-brand shrink-0" />
                        : <MailOpen className="w-3.5 h-3.5 text-text-muted opacity-60 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${th.unread ? 'font-semibold text-text-1' : 'text-text-1'}`}>
                          {th.subject}
                        </div>
                        <div className="text-[11px] text-text-muted truncate">
                          {th.lastAuthorName ?? th.createdByName} · {t(`type${th.type}`)}
                        </div>
                      </div>
                      {th.priority === 'URGENT' && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-rose/10 border border-rose/30 text-rose">
                          {t('priorityURGENT')}
                        </span>
                      )}
                      {th.sealedAt && <Lock className="w-3 h-3 text-amber shrink-0" />}
                      <span className="shrink-0 text-[11px] text-text-muted hidden sm:inline">
                        {fmtDt(th.lastEntryAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ComposeMessageDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        patient={patient}
        onSent={() => load()}
      />

      <ThreadViewDialog
        open={openThreadId !== null}
        onClose={() => setOpenThreadId(null)}
        threadId={openThreadId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onChanged={() => load()}
      />
    </>
  );
}
