'use client';

/**
 * PatientMessagesDialog — "Messages & Requests" del paciente (M1).
 *
 * El registro PERMANENTE: lista todos los hilos anclados al paciente, incluso
 * los sellados y los sacados de las bandejas (Delete From All). Bold = tengo
 * entradas sin leer (solo aplica si soy destinatario). Desde acá se abre el
 * hilo y se crea un mensaje nuevo ya vinculado al paciente.
 *
 * Abierto desde la fila de un CASO (`caseFilter`), acota el historial a ese
 * caso y el mensaje nuevo nace con él ya elegido. "Ver todos" quita el filtro
 * sin cerrar el diálogo.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Mail, MailOpen, Plus, Lock, MessagesSquare, Briefcase } from 'lucide-react';
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
  case: { id: string; caseCode: string; accidentDate: string | null } | null;
  unread: boolean;
}

export interface MessagesCaseFilter {
  id: string;
  caseCode: string;
  accidentDate: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patient: ComposePatientRef | null;
  currentUserId: string;
  isAdmin?: boolean;
  /** Abierto desde un caso: acota el historial y precarga el caso al escribir */
  caseFilter?: MessagesCaseFilter | null;
}

export function PatientMessagesDialog({ open, onClose, patient, currentUserId, isAdmin = false, caseFilter = null }: Props) {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  // Copia local del filtro: "ver todos" lo limpia sin cerrar el diálogo.
  const [activeCase, setActiveCase] = useState<MessagesCaseFilter | null>(caseFilter);

  useEffect(() => { if (open) setActiveCase(caseFilter); }, [open, caseFilter]);

  const load = useCallback(async (): Promise<void> => {
    if (!patient) return;
    setLoading(true);
    try {
      const qs = activeCase ? `?caseId=${activeCase.id}` : '';
      const res = await fetch(`/api/messages/patient/${patient.id}${qs}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [patient, activeCase]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
      dateStyle: 'short', timeStyle: 'short',
    });
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

  // El compose hereda el caso del filtro activo; sin filtro, lo elige él.
  // MEMOIZADO a propósito: el compose reinicia su formulario cuando cambia la
  // identidad de `patient`, y un objeto nuevo en cada render del padre (p. ej.
  // al recargar la lista) borraría lo que se está escribiendo.
  const composePatient = useMemo<ComposePatientRef | null>(
    () => (patient ? { id: patient.id, name: patient.name, caseId: activeCase?.id ?? null } : null),
    [patient, activeCase],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        {/* Alto FIJO (no max-h): con un solo hilo el diálogo quedaba como una
            tira de 100px. Escala estándar de mensajería — listas angostas 70vh,
            conversación 80vh, overlay del inbox 85vh. El contenido crece por
            dentro con scroll, el marco no se mueve. */}
        <DialogContent className="max-w-2xl p-0 h-[70vh] flex flex-col">
          {/* pr-12: deja libre la esquina donde Radix pinta la X — si no, el
              botón de nuevo mensaje queda pegado a ella. */}
          <DialogHeader className="px-4 sm:px-6 pr-12 sm:pr-14 pt-5 pb-3 border-b border-border">
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
            {/* Historial acotado a un caso. Sin escape al historial completo a
                propósito: el ícono del paciente ya es esa entrada, y mezclar
                los dos modos acá difuminaba qué está mostrando el diálogo. */}
            {activeCase && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-brand">
                  <Briefcase className="w-3 h-3" />
                  <span className="font-mono">{activeCase.caseCode}</span>
                  {activeCase.accidentDate && (
                    <span className="text-text-muted">
                      · {t('caseAccidentPrefix')} {fmtDate(activeCase.accidentDate)}
                    </span>
                  )}
                </span>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Con marco alto, el vacío y el "cargando" van centrados — al ras
                de arriba dejaban un hueco que parecía un error de render. */}
            {loading ? (
              <div className="h-full flex items-center justify-center text-text-muted text-sm">
                {t('loading')}
              </div>
            ) : threads.length === 0 ? (
              <div className="h-full flex items-center justify-center p-6">
                <EmptyState.Rich icon={MessagesSquare} title={t('emptyTitle')} subtitle={t('emptyDesc')} />
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {threads.map((th) => (
                  <li key={th.id}>
                    {/* Raya + tinte para los no leídos — mismo idioma que el
                        inbox (verde normal, rojo urgente), sin animación. */}
                    <button type="button" onClick={() => setOpenThreadId(th.id)}
                      className={`w-full flex items-center gap-3 px-4 sm:px-6 !py-1 min-h-[44px] text-left transition-colors border-l-[3px] ${
                        !th.unread
                          ? 'border-l-transparent hover:bg-white/[0.02]'
                          : th.priority === 'URGENT'
                            ? 'border-l-rose bg-rose/[0.07] hover:bg-rose/[0.11]'
                            : 'border-l-emerald bg-emerald/[0.06] hover:bg-emerald/[0.1]'
                      }`}>
                      {/* Verde = sin leer normal · rojo = urgente (mismo
                          código que el badge del top bar y el inbox) */}
                      {th.unread
                        ? <Mail className={`w-3.5 h-3.5 shrink-0 ${th.priority === 'URGENT' ? 'text-rose' : 'text-emerald'}`} />
                        : <MailOpen className="w-3.5 h-3.5 text-text-muted opacity-60 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${th.unread ? 'font-semibold text-text-1' : 'text-text-1'}`}>
                          {th.subject}
                        </div>
                        <div className="text-[11px] text-text-muted truncate">
                          {th.lastAuthorName ?? th.createdByName} · {t(`type${th.type}`)}
                          {/* Con filtro activo el caso es obvio; sin filtro
                              distingue los hilos de cada caso del paciente. */}
                          {!activeCase && th.case && (
                            <span className="font-mono text-brand"> · {th.case.caseCode}</span>
                          )}
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
        patient={composePatient}
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
