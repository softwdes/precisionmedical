'use client';

/**
 * ComposeMessageDialog — enviar mensaje interno (M1), calcado del Send Message
 * del EMR legacy: To/CC multi-usuario, tipo (Alert/Reminder/Request/Message),
 * categoría (General/Phone Message/Patient Related), prioridad Normal/Urgent,
 * asunto y cuerpo enriquecido.
 *
 * Compartido entre el módulo Clínica y el portal Doctor. El From es SIEMPRE el
 * usuario logueado (lo resuelve el server con resolveActor — acá ni se manda).
 *
 * `patient` viene pre-cargado cuando se abre desde la fila/ficha del paciente;
 * el hilo queda anclado a él y a su caso. Sin paciente, el hilo vive solo en
 * los inboxes (el flujo minoritario del legacy).
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Send, MessageSquarePlus,
  LayoutTemplate, Save, Search as SearchIcon, X as XIcon,
} from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import { RichTextEditor, Autocomplete, type AutoResult } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { useToast } from '@/components/ui-phoenix/toast';
import { UserMultiSelect, type MessagingUser } from './user-multi-select';
import { AttachmentPicker, type PendingAttachment } from './attachment-picker';
import { CaseSelect, pickDefaultCase, type MessagingCase } from './case-select';

export interface ComposePatientRef {
  id: string;
  name: string; // "APELLIDO, Nombre" para la cabecera
  /** Caso preseleccionado (al abrir desde una fila de caso). Sin él, se elige
   *  el caso vivo por defecto una vez cargada la lista. */
  caseId?: string | null;
}

/** Formulario serializado — lo que guarda un borrador (Save as Draft). */
export interface ComposeDraftPayload {
  to: MessagingUser[];
  cc: MessagingUser[];
  type: 'ALERT' | 'REMINDER' | 'REQUEST' | 'MESSAGE';
  category: 'GENERAL' | 'PHONE_MESSAGE' | 'PATIENT_RELATED';
  priority: 'NORMAL' | 'URGENT';
  subject: string;
  body: string;
  attachments: Array<{ path?: string; patientDocumentId?: string; fileName: string; description: string }>;
  patient: ComposePatientRef | null;
  caseId?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patient?: ComposePatientRef | null;
  /** Callback tras enviar OK (refrescar listas, etc.) */
  onSent?: (threadId: string) => void;
  /** Reabrir un borrador: precarga el formulario y lo elimina al enviar */
  initialDraft?: { id: string; payload: ComposeDraftPayload } | null;
  /** Aviso al guardar borrador (refrescar contadores) */
  onDraftSaved?: () => void;
}

const TYPES = ['MESSAGE', 'ALERT', 'REMINDER', 'REQUEST'] as const;
const CATEGORIES = ['GENERAL', 'PHONE_MESSAGE', 'PATIENT_RELATED'] as const;

// Fondo SÓLIDO (bg-bg-2, no /40) + appearance-none: con fondo translúcido el
// chrome nativo del <select> se ve blanco y el texto claro desaparece — mismo
// patrón que el SELECT del quick-register-dialog.
const inputCls =
  'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors';
const selectCls = `${inputCls} appearance-none [color-scheme:dark]`;
const labelCls = 'text-[10px] uppercase tracking-wider font-semibold text-text-muted';

export function ComposeMessageDialog({ open, onClose, patient, onSent, initialDraft, onDraftSaved }: Props) {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();
  const toast = useToast();

  // Paciente elegido a mano — solo aplica cuando el compose se abre SIN
  // contexto (el "Nuevo mensaje" del inbox). Desde un paciente o un caso el
  // dato ya viene decidido y el campo es de lectura.
  const [pickedPatient, setPickedPatient] = useState<AutoResult | null>(null);

  const contextPatient = initialDraft?.payload.patient ?? patient ?? null;
  const effectivePatient: ComposePatientRef | null =
    contextPatient ??
    (pickedPatient ? { id: pickedPatient.id, name: pickedPatient.label } : null);

  const [users, setUsers] = useState<MessagingUser[]>([]);
  const [to, setTo] = useState<MessagingUser[]>([]);
  const [cc, setCc] = useState<MessagingUser[]>([]);
  const [type, setType] = useState<(typeof TYPES)[number]>('MESSAGE');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('GENERAL');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // ─── Caso del paciente ──────────────────────────────────────────────────
  // Todo mensaje con paciente va anclado a un caso (decisión de Erick
  // 2026-08-08: sin caso no hay nada que consultar). Se preselecciona el caso
  // vivo; si vino uno explícito (abierto desde la fila de un caso), manda ese.
  const [cases, setCases] = useState<MessagingCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

  // ─── Adjuntos: se suben al elegirse (el hilo aún no existe) y el POST final
  //     referencia las keys. La UI vive en AttachmentPicker, compartida con el
  //     composer del hilo.
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  // Staff una sola vez por apertura; reset del form al abrir — o precarga
  // completa si se está reabriendo un borrador.
  useEffect(() => {
    if (!open) return;
    const d = initialDraft?.payload;
    setTo(d?.to ?? []); setCc(d?.cc ?? []);
    setType(d?.type ?? 'MESSAGE'); setCategory(d?.category ?? 'GENERAL');
    setPriority(d?.priority ?? 'NORMAL');
    setSubject(d?.subject ?? ''); setBody(d?.body ?? '');
    setAttachments((d?.attachments ?? []).map((a) => ({ ...a, description: a.description ?? '' })));
    setConfirmDiscard(false);
    // Caso explícito (fila de caso o borrador). Si no hay, lo elige el efecto
    // de abajo cuando llegue la lista.
    setCaseId(d?.caseId ?? patient?.caseId ?? null);
    setCases([]);
    setPickedPatient(null);
    // Con abogados: son destinatarios válidos desde que cobranza les escribe.
    fetch('/api/messages/users?withLawyers=1')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d2) => setUsers(d2.users ?? []))
      .catch(() => setUsers([]));
  }, [open, initialDraft, patient]);

  // Casos del paciente — misma fuente que la fila expandible de pacientes.
  // Depende del ID y no del objeto: cuando el paciente sale del buscador, el
  // objeto se recrea en cada render y el efecto se dispararía en bucle.
  const effectivePatientId = effectivePatient?.id ?? null;
  useEffect(() => {
    if (!open || !effectivePatientId) { setCases([]); return; }
    let cancelled = false;
    setCasesLoading(true);
    fetch(`/api/admin/patients/${effectivePatientId}/cases`)
      .then((r) => (r.ok ? r.json() : { cases: [] }))
      .then((data) => {
        if (cancelled) return;
        const list: MessagingCase[] = (data.cases ?? []).map((c: {
          id: string; caseCode: string; caseType: string | null; status: string;
          accidentDate: string | null; lastAppointment: { scheduledFor: string } | null;
          firstAppointment: { scheduledFor: string } | null;
        }) => ({
          id: c.id,
          caseCode: c.caseCode,
          caseType: c.caseType,
          status: c.status,
          accidentDate: c.accidentDate,
          lastAppointmentAt: c.lastAppointment?.scheduledFor ?? c.firstAppointment?.scheduledFor ?? null,
        }));
        setCases(list);
        // Solo elige por defecto si nadie fijó un caso explícito, o si el que
        // vino ya no existe en la lista.
        setCaseId((prev) => (prev && list.some((c) => c.id === prev) ? prev : pickDefaultCase(list)?.id ?? null));
      })
      .catch(() => { if (!cancelled) setCases([]); })
      .finally(() => { if (!cancelled) setCasesLoading(false); });
    return () => { cancelled = true; };
  }, [open, effectivePatientId]);

  // ─── Plantillas (panel del legacy) ─────────────────────────────────────
  interface Template { id: string; title: string; body: string; createdByName: string }
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplQuery, setTplQuery] = useState('');
  const [tplSaveOpen, setTplSaveOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplBusy, setTplBusy] = useState(false);

  const loadTemplates = async (): Promise<void> => {
    try {
      const res = await fetch('/api/messages/templates');
      if (res.ok) setTemplates(((await res.json()).templates ?? []) as Template[]);
    } catch { setTemplates([]); }
  };

  const applyTemplate = (tpl: Template): void => {
    // Si ya hay texto, la plantilla se AGREGA debajo (no pisa lo escrito).
    setBody((prev) => {
      const plain = prev.replace(/<[^>]*>/g, '').trim();
      return plain === '' ? tpl.body : `${prev}<p></p>${tpl.body}`;
    });
    setTplOpen(false);
  };

  const saveTemplate = async (): Promise<void> => {
    const title = tplTitle.trim();
    const plain = body.replace(/<[^>]*>/g, '').trim();
    if (!title || plain === '') return;
    setTplBusy(true);
    try {
      const res = await fetch('/api/messages/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('tplSavedOk'));
      setTplSaveOpen(false); setTplTitle('');
      await loadTemplates();
    } catch {
      toast.error(t('tplSavedError'));
    } finally {
      setTplBusy(false);
    }
  };

  // Attach From Chart vive ahora en AttachmentPicker, junto con la subida.

  // ─── Borrador (Save as Draft) ───────────────────────────────────────────
  const [savingDraft, setSavingDraft] = useState(false);

  const saveDraft = async (): Promise<void> => {
    setSavingDraft(true);
    try {
      const payload: ComposeDraftPayload = {
        to, cc, type, category, priority, subject, body, attachments,
        patient: effectivePatient, caseId,
      };
      const res = await fetch('/api/messages/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: initialDraft?.id, payload }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('draftSavedOk'));
      onDraftSaved?.();
      onClose();
    } catch {
      toast.error(t('draftSavedError'));
    } finally {
      setSavingDraft(false);
    }
  };

  const plainBody = body.replace(/<[^>]*>/g, '').trim();
  // Con paciente, el caso es OBLIGATORIO: el mensaje siempre consulta algo de
  // un caso concreto. Sin paciente (mensaje suelto del inbox) no aplica.
  const caseMissing = !!effectivePatient && !caseId;
  const canSend = to.length > 0 && subject.trim() !== '' && plainBody !== '' && !caseMissing && !sending;

  // ─── Cierre protegido: un mensaje a medio escribir no se tira por un clic
  //     accidental. El clic AFUERA nunca cierra; Cancelar/X/Esc con contenido
  //     piden confirmación antes de descartar.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isDirty =
    to.length > 0 || cc.length > 0 || subject.trim() !== '' || plainBody !== '' ||
    attachments.length > 0 || pickedPatient !== null;
  const requestClose = (): void => {
    if (sending) return;
    if (isDirty) setConfirmDiscard(true);
    else onClose();
  };

  const send = async (): Promise<void> => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body,
          type, category, priority,
          to: to.map((u) => u.id),
          cc: cc.map((u) => u.id),
          patientId: effectivePatient?.id ?? null,
          caseId: effectivePatient ? caseId : null,
          attachments: attachments.map((a) => ({
            path: a.path,
            patientDocumentId: a.patientDocumentId,
            fileName: a.fileName,
            description: a.description || null,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { id: string };
      // Si esto era un borrador, ya se envió — se limpia de la lista.
      if (initialDraft?.id) {
        fetch(`/api/messages/drafts/${initialDraft.id}`, { method: 'DELETE' }).catch(() => undefined);
      }
      toast.success(t('sentOk'));
      onSent?.(data.id);
      onClose();
    } catch {
      toast.error(t('sentError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) requestClose(); }}>
      <DialogContent
        ref={contentRef}
        className="max-w-4xl p-0 max-h-[92vh] flex flex-col"
        // Clic afuera NUNCA cierra el compose — solo Cancelar/X/Esc (con
        // confirmación si hay contenido). Un mensaje no se pierde por un clic.
        onInteractOutside={(e) => e.preventDefault()}
        // Sin autofoco en el primer campo: Radix enfocaría el buscador de
        // paciente y su lista se abriría sola al montar el diálogo. El foco va
        // al contenedor (tabIndex -1) para no romper la trampa de foco ni Esc.
        onOpenAutoFocus={(e) => { e.preventDefault(); contentRef.current?.focus(); }}
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-text-1 text-base font-semibold">
            <MessageSquarePlus className="w-4 h-4 text-brand-text" />
            {t('composeTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 space-y-3">
          {/* Contexto del mensaje: paciente + caso. Todo mensaje con paciente
              pertenece a un caso concreto. Abierto desde un paciente/caso el
              primero es de lectura; desde el inbox se busca. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>{t('fieldPatient')}</label>
              {contextPatient ? (
                <div className="rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand-text truncate">
                  {contextPatient.name}
                </div>
              ) : (
                <Autocomplete
                  endpoint="/api/admin/patients/autocomplete"
                  // Al hacer clic ya muestra los pacientes más recientes;
                  // escribir filtra. Evita el campo vacío que no dice nada.
                  extraParams={{ allowEmpty: '1' }}
                  placeholder={t('patientSearchPlaceholder')}
                  selected={pickedPatient}
                  onSelect={(r) => {
                    setPickedPatient(r);
                    // Paciente distinto ⇒ el caso anterior ya no aplica.
                    setCaseId(null);
                  }}
                  // Sin casos no hay nada que consultar: visible pero vetado.
                  isBlocked={(r) => (r.caseCount ?? 0) === 0}
                  blockedBadge={t('patientNoCasesBadge')}
                  emptyHint={t('patientSearchEmpty')}
                />
              )}
            </div>
            {effectivePatient && (
              <div className="space-y-1.5">
                <label className={labelCls}>{t('fieldCase')}</label>
                <CaseSelect
                  cases={cases}
                  value={caseId}
                  onChange={setCaseId}
                  disabled={sending}
                  loading={casesLoading}
                  formatDate={fmtDate}
                  labels={{
                    placeholder: t('casePlaceholder'),
                    searchPlaceholder: t('caseSearchPlaceholder'),
                    pastCases: t('casePastGroup'),
                    accidentPrefix: t('caseAccidentPrefix'),
                    loading: t('loading'),
                  }}
                />
              </div>
            )}
          </div>

          {/* Para + CC lado a lado: ahorran una fila y el editor gana alto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>{t('fieldTo')}</label>
              <UserMultiSelect users={users} selected={to} onChange={setTo}
                excludeIds={cc.map((u) => u.id)} placeholder={t('toPlaceholder')} disabled={sending} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t('fieldCc')}</label>
              <UserMultiSelect users={users} selected={cc} onChange={setCc}
                excludeIds={to.map((u) => u.id)} placeholder={t('ccPlaceholder')} disabled={sending} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>{t('fieldType')}</label>
              <select className={selectCls} value={type} disabled={sending}
                onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
                {TYPES.map((v) => <option key={v} value={v}>{t(`type${v}`)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t('fieldCategory')}</label>
              <select className={selectCls} value={category} disabled={sending}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
                {CATEGORIES.map((v) => <option key={v} value={v}>{t(`category${v}`)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t('fieldPriority')}</label>
              <div className="flex items-center gap-3 h-[38px]">
                {(['NORMAL', 'URGENT'] as const).map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm text-text-1 cursor-pointer">
                    <input type="radio" name="msg-priority" value={p} checked={priority === p}
                      disabled={sending} onChange={() => setPriority(p)}
                      className="accent-[var(--rose,#f43f5e)]" />
                    <span className={p === 'URGENT' ? 'text-rose font-medium' : ''}>
                      {t(`priority${p}`)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>{t('fieldSubject')}</label>
            <input className={inputCls} value={subject} disabled={sending}
              onChange={(e) => setSubject(e.target.value)} placeholder={t('subjectPlaceholder')} maxLength={200} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <label className={labelCls}>{t('fieldMessage')}</label>
              <button type="button" disabled={sending}
                onClick={() => { setTplOpen((v) => !v); if (!tplOpen) void loadTemplates(); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-brand-text hover:bg-brand/10 transition-colors disabled:opacity-40">
                <LayoutTemplate className="w-3.5 h-3.5" />
                {t('tplButton')}
              </button>
              <button type="button" disabled={sending || plainBody === ''}
                onClick={() => setTplSaveOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40">
                <Save className="w-3.5 h-3.5" />
                {t('tplSaveButton')}
              </button>
            </div>

            {/* Panel de plantillas (el buscador + lista del legacy) */}
            {tplOpen && (
              <div className="rounded-md bg-bg-2/40 overflow-hidden">
                <div className="relative border-b border-border/40">
                  <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={tplQuery} onChange={(e) => setTplQuery(e.target.value)}
                    placeholder={t('tplSearchPlaceholder')}
                    className="w-full bg-transparent outline-none text-sm text-text-1 placeholder:text-text-muted pl-8 pr-8 py-2"
                  />
                  <button type="button" onClick={() => setTplOpen(false)} aria-label={t('btnCancel')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-1">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {templates
                    .filter((tp) => tp.title.toLowerCase().includes(tplQuery.trim().toLowerCase()))
                    .map((tp) => (
                      <button key={tp.id} type="button" onClick={() => applyTemplate(tp)}
                        className="w-full flex items-center justify-between gap-2 px-3 !py-1.5 text-left hover:bg-white/5 transition-colors">
                        <span className="text-[12.5px] text-brand-text truncate">{tp.title}</span>
                        <span className="shrink-0 text-[10px] text-text-muted">{tp.createdByName}</span>
                      </button>
                    ))}
                  {templates.length === 0 && (
                    <div className="px-3 py-3 text-text-muted text-xs text-center">{t('tplEmpty')}</div>
                  )}
                </div>
              </div>
            )}

            <RichTextEditor value={body} onChange={setBody} minHeight={220}
              placeholder={t('bodyPlaceholder')} disabled={sending} />
          </div>

          {/* Adjuntos (los que hagan falta, como el legacy) — el mismo
              componente que usa el composer del hilo al responder. */}
          <AttachmentPicker
            attachments={attachments}
            onChange={setAttachments}
            patientId={effectivePatient?.id ?? null}
            disabled={sending}
          />
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t border-border flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={requestClose} disabled={sending || savingDraft} className="w-full sm:w-auto">
            {t('btnCancel')}
          </Button>
          <button type="button" onClick={() => void saveDraft()} disabled={sending || savingDraft || !isDirty}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border border-border text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Save className="w-3.5 h-3.5" />
            {savingDraft ? t('draftSaving') : t('btnSaveDraft')}
          </button>
          <button type="button" onClick={send} disabled={!canSend}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Send className="w-3.5 h-3.5" />
            {sending ? t('btnSending') : t('btnSend')}
          </button>
        </DialogFooter>
      </DialogContent>

      {/* Guardar el cuerpo actual como plantilla compartida */}
      <Dialog open={tplSaveOpen} onOpenChange={(v) => { if (!v) setTplSaveOpen(false); }}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-text-1 text-base font-semibold">
              <LayoutTemplate className="w-4 h-4 text-brand-text" />
              {t('tplSaveTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 space-y-2">
            <p className="text-text-muted text-sm leading-relaxed">{t('tplSaveDesc')}</p>
            <input
              value={tplTitle} onChange={(e) => setTplTitle(e.target.value)}
              placeholder={t('tplTitlePlaceholder')} maxLength={120} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') void saveTemplate(); }}
              className={inputCls}
            />
          </div>
          <DialogFooter className="px-6 py-5 flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setTplSaveOpen(false)} disabled={tplBusy} className="w-full sm:w-auto">
              {t('btnCancel')}
            </Button>
            <button type="button" disabled={tplBusy || tplTitle.trim() === ''} onClick={() => void saveTemplate()}
              className="w-full sm:w-auto px-4 py-2 rounded-md text-sm font-semibold bg-brand hover:bg-brand/90 text-white transition-colors disabled:opacity-40">
              {tplBusy ? t('draftSaving') : t('tplSaveButton')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        variant="warning"
        title={t('confirmDiscardTitle')}
        description={t('confirmDiscardDesc')}
        confirmLabel={t('btnDiscard')}
        cancelLabel={t('btnKeepWriting')}
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </Dialog>
  );
}
