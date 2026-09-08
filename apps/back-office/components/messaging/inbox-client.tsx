'use client';

/**
 * InboxClient — la vista completa del inbox (M1 F2), compartida entre
 * /messages (Clínica) y /doctor/messages (portal médico).
 *
 * Calcada del inbox del legacy, y desde 2026-09-08 ordenada como Gmail:
 *  · CARPETAS: Recibidos (hilos con algo escrito por otro, no archivados),
 *    Enviados (hilos que abrí yo, con si ya tuvieron respuesta) y Archivados.
 *    Lo que antes era "quitar de mi bandeja" ahora se llama ARCHIVAR —es lo que
 *    siempre hizo— y tiene su carpeta para volver; los "quitados" de antes ya
 *    aparecen ahí. Sellar, quitar de todas las bandejas y borrar del historial
 *    NO cambian: son decisiones sobre los demás, no sobre mi lista.
 *  · buscador (paciente, caso, asunto, remitente) y chips Sin leer / Urgentes.
 *  · select "ver inbox de…" con TODOS los usuarios internos (cualquiera puede
 *    mirar cualquier bandeja — auditado server-side) + banner cuando es ajena.
 *    Las carpetas y filtros se aplican también a la bandeja ajena.
 *  · bold = hilo con entradas sin leer · urgentes marcados en rose
 *  · filtros por prioridad y tipo · paginación
 *  · checkboxes + archivar/desarchivar seleccionados (solo en MI inbox: la
 *    lista de otro no se toca desde acá)
 *  · en el teléfono la lista son tarjetas; la tabla aparece desde `sm:`
 *  · Nuevo mensaje sin paciente (el flujo minoritario del legacy)
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { CASE_PARAM, conCasoAbierto } from '@/lib/case-modal-url';
import {
  Mail, MailOpen, Lock, Plus, Eye, FileEdit, Paperclip, Trash2, Inbox, SendHorizontal, Archive, ArchiveRestore, Search, X,
} from 'lucide-react';
import { PageHeader, EmptyState, FilterPill, TagPill } from '@/components/ui-phoenix';
import { useToast } from '@/components/ui-phoenix/toast';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { anunciarLectura } from '@/lib/messaging-events';
import { ComposeMessageDialog, type ComposeDraftPayload } from './compose-message-dialog';
import { ThreadViewDialog } from './thread-view-dialog';
import { UserSelect } from './user-select';
import { AttachmentViewerDialog } from './attachment-viewer-dialog';
import { type MessagingUser } from './user-multi-select';

type Folder = 'inbox' | 'sent' | 'archived';

interface InboxRow {
  id: string;
  subject: string;
  type: string;
  category: string;
  priority: 'NORMAL' | 'URGENT';
  patient: { id: string; name: string } | null;
  lastAuthorName: string | null;
  lastEntryAt: string;
  sealedAt: string | null;
  unread: boolean;
  attachmentCount: number;
  firstAttachment: { id: string; fileName: string } | null;
  /** Lo abrió un bufete desde su portal: pastilla de origen en la fila. */
  fromFirm?: boolean;
  /** Lo abrió la persona cuya bandeja se mira. */
  mine?: boolean;
  /** Un hilo mío con respuesta: lo último no lo escribí yo. */
  answered?: boolean;
  archived?: boolean;
}

interface Props {
  currentUserId: string;
  currentUserName: string;
  isAdmin: boolean;
  /**
   * true cuando vive dentro del modal grande del top bar (como el overlay del
   * legacy): sin PageHeader ni padding de página — el contenedor los pone.
   */
  embedded?: boolean;
  /**
   * Abre el caso del hilo. Embebido en el top bar lo provee el contenedor (que
   * sí sabe a qué pantalla navegar); como página, el client lo resuelve solo
   * con `?case=` sobre su propia URL.
   */
  onOpenCase?: (caseId: string) => void;
  /**
   * Hilo abierto, CONTROLADO desde afuera. Lo usa el sobre del top bar: su
   * Dialog desmonta el contenido al replegarse (mientras el caso está encima),
   * así que el id no puede vivir acá o se pierde. El sobre vive en el layout y
   * no se desmonta nunca, así que lo recuerda él y el hilo vuelve al cerrar el
   * caso. Como página no hace falta: el estado local sobrevive al `?case=`.
   */
  openThreadId?: string | null;
  onOpenThreadChange?: (threadId: string | null) => void;
}

const selectCls =
  'bg-bg-2 border border-border rounded-md px-2.5 py-1.5 text-sm text-text-1 outline-none focus:border-brand transition-colors appearance-none [color-scheme:dark]';

const FOLDERS: Array<{ id: Folder; icon: React.ElementType; key: string }> = [
  { id: 'inbox',    icon: Inbox,          key: 'folderInbox' },
  { id: 'sent',     icon: SendHorizontal, key: 'folderSent' },
  { id: 'archived', icon: Archive,        key: 'folderArchived' },
];

export function InboxClient({
  currentUserId, currentUserName, isAdmin, embedded = false, onOpenCase,
  openThreadId: controlledThreadId, onOpenThreadChange,
}: Props) {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // El caso abierto vive en `?case=` de la URL de esta pantalla. Se lee igual
  // embebido que como página: quien navega es el contenedor, pero replegarse
  // mientras el caso está encima es responsabilidad de los dos.
  const caseModalOpen = !!searchParams.get(CASE_PARAM);
  const openCaseFromThread = useCallback((caseId: string) => {
    router.push(conCasoAbierto(pathname, searchParams, caseId), { scroll: false });
  }, [router, pathname, searchParams]);

  const [users, setUsers] = useState<MessagingUser[]>([]);
  const [viewUserId, setViewUserId] = useState(currentUserId);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [q, setQ] = useState('');
  const [soloSinLeer, setSoloSinLeer] = useState(false);
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadInbox, setUnreadInbox] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  // Controlado si el contenedor lo maneja (sobre del top bar), local si no.
  const [localThreadId, setLocalThreadId] = useState<string | null>(null);
  const openThreadId = controlledThreadId !== undefined ? controlledThreadId : localThreadId;
  const setOpenThreadId = onOpenThreadChange ?? setLocalThreadId;
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Adjunto abierto desde la columna del clip, sin pasar por el hilo. */
  const [viewing, setViewing] = useState<{ id: string; fileName: string } | null>(null);

  // ─── Borradores (Save as Draft) — privados del usuario ──────────────────
  interface DraftRow { id: string; subject: string | null; patientName: string | null; updatedAt: string; payload: ComposeDraftPayload }
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [openDraft, setOpenDraft] = useState<DraftRow | null>(null);

  const loadDrafts = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/messages/drafts');
      if (res.ok) setDrafts(((await res.json()).drafts ?? []) as DraftRow[]);
    } catch { setDrafts([]); }
  }, []);

  useEffect(() => { void loadDrafts(); }, [loadDrafts]);

  const deleteDraft = async (id: string): Promise<void> => {
    await fetch(`/api/messages/drafts/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await loadDrafts();
  };

  const isOwnInbox = viewUserId === currentUserId;
  const viewUserName = isOwnInbox
    ? currentUserName
    : users.find((u) => u.id === viewUserId)?.name ?? '';

  useEffect(() => {
    fetch('/api/messages/users')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setUsers([]));
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), folder });
      if (viewUserId !== currentUserId) params.set('userId', viewUserId);
      if (priority) params.set('priority', priority);
      if (type) params.set('type', type);
      if (q.trim()) params.set('q', q.trim());
      if (soloSinLeer) params.set('unread', '1');
      if (soloUrgentes) params.set('priority', 'URGENT');
      const res = await fetch(`/api/messages?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.threads ?? []);
      setTotal(data.total ?? 0);
      setUnreadInbox(data.unreadInbox ?? 0);
      setPageSize(data.pageSize ?? 15);
      setSelected(new Set());
    } catch {
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, viewUserId, folder, priority, type, q, soloSinLeer, soloUrgentes, currentUserId]);

  // El buscador espera a que dejen de tipear; lo demás dispara al instante.
  useEffect(() => {
    const id = setTimeout(() => { void load(); }, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
      dateStyle: 'short', timeStyle: 'short',
    });

  const toggleAll = () =>
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)));

  /** Archivar (o desarchivar, en la carpeta Archivados) los seleccionados. */
  const bulkArchive = async (): Promise<void> => {
    const archived = folder !== 'archived';
    setBusy(true);
    try {
      await Promise.all(
        [...selected].map((id) => fetch(`/api/messages/${id}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived }),
        })),
      );
      toast.success(archived ? t('deleteMineOk') : t('unarchiveOk'));
      anunciarLectura();
      await load();
    } catch {
      toast.error(t('deleteError'));
    } finally {
      setBusy(false);
      setConfirmBulk(false);
    }
  };

  const cambiarCarpeta = (f: Folder) => {
    setFolder(f);
    setPage(1);
    setSelected(new Set());
    // "Sin leer" no significa nada en Enviados.
    if (f === 'sent') setSoloSinLeer(false);
  };

  /** Estado de un hilo mío en Enviados: lo que se viene a controlar. */
  const estadoEnviado = (r: InboxRow): { label: string; cls: string } =>
    r.answered
      ? { label: t('sentAnswered'), cls: 'bg-emerald/15 text-emerald border-emerald/30' }
      : { label: t('sentPending'), cls: 'bg-amber/15 text-amber border-amber/30' };

  const origenPill = (r: InboxRow) => r.fromFirm ? (
    <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border ${
      r.type === 'REFERRAL' ? 'bg-violet/15 border-violet/30 text-violet' : 'bg-cyan/15 border-cyan/30 text-cyan'
    }`}>
      {r.type === 'REFERRAL' ? t('originReferral') : t('originFirmRequest')}
    </span>
  ) : null;

  const labelCls = 'text-[10px] uppercase tracking-wider font-semibold text-text-muted';
  const hayFiltro = q.trim() !== '' || soloSinLeer || soloUrgentes || priority !== '' || type !== '';

  const newMessageBtn = (
    <button type="button" onClick={() => setComposeOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold bg-brand hover:bg-brand/90 text-white transition-colors">
      <Plus className="w-3.5 h-3.5" />
      {t('btnNewMessage')}
    </button>
  );

  return (
    <div className={embedded ? 'space-y-4' : 'p-4 sm:p-6 space-y-4'}>
      {!embedded && (
        <PageHeader
          title={t('inboxTitle')}
          subtitle={t('inboxSubtitle', { count: total })}
          action={newMessageBtn}
        />
      )}

      {/* Carpetas + buscador + chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist">
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            const activo = folder === f.id;
            const n = f.id === 'inbox' ? unreadInbox : 0;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => cambiarCarpeta(f.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                  activo ? 'bg-gradient-brand text-white shadow-glow' : 'text-text-2 hover:text-text-1 hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(f.key)}
                {n > 0 && (
                  <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${activo ? 'bg-white/25 text-white' : 'bg-emerald text-black'}`}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <label className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-8 py-1.5 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label={t('clearSearch')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-1">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        {folder !== 'sent' && <FilterPill active={soloSinLeer} onClick={() => { setSoloSinLeer((v) => !v); setPage(1); }} label={t('onlyUnread')} />}
        <FilterPill active={soloUrgentes} onClick={() => { setSoloUrgentes((v) => !v); setPage(1); }} label={t('onlyUrgent')} />
      </div>

      {/* Bandeja de… + filtros finos + acciones */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className={labelCls}>{t('inboxOf')}</label>
          <UserSelect
            users={users}
            value={viewUserId}
            onChange={(id) => { setViewUserId(id); setPage(1); }}
            currentUserId={currentUserId}
            myLabel={t('inboxMine')}
            searchPlaceholder={t('toPlaceholder')}
          />
        </div>
        {!soloUrgentes && (
          <div className="space-y-1">
            <label className={labelCls}>{t('fieldPriority')}</label>
            <select className={selectCls} value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="">{t('filterAll')}</option>
              <option value="URGENT">{t('priorityURGENT')}</option>
              <option value="NORMAL">{t('priorityNORMAL')}</option>
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label className={labelCls}>{t('fieldType')}</label>
          <select className={selectCls} value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">{t('filterAll')}</option>
            {(['MESSAGE', 'ALERT', 'REMINDER', 'REQUEST', 'REFERRAL'] as const).map((v) => (
              <option key={v} value={v}>{t(`type${v}`)}</option>
            ))}
          </select>
        </div>
        <span className="flex-1" />
        {isOwnInbox && selected.size > 0 && (
          <button type="button" disabled={busy} onClick={() => setConfirmBulk(true)}
            title={folder === 'archived' ? t('tipUnarchive') : t('tipDeleteMine')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-text-2 border border-border bg-bg-2 hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40">
            {folder === 'archived' ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
            {folder === 'archived' ? t('bulkUnarchive', { count: selected.size }) : t('bulkDelete', { count: selected.size })}
          </button>
        )}
        {drafts.length > 0 && (
          <button type="button" onClick={() => setDraftsOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-colors ${
              draftsOpen
                ? 'border-amber/40 bg-amber/15 text-amber'
                : 'border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5'
            }`}>
            <FileEdit className="w-3 h-3" />
            {t('draftsButton', { count: drafts.length })}
          </button>
        )}
        {embedded && newMessageBtn}
      </div>

      {/* Lista de borradores — clic reabre el compose precargado */}
      {draftsOpen && drafts.length > 0 && (
        <div className="rounded-lg border border-amber/30 bg-amber/[0.04] overflow-hidden">
          <div className="px-4 py-2 border-b border-amber/20 text-[10px] uppercase tracking-wider font-semibold text-amber">
            {t('draftsTitle')}
          </div>
          <ul className="divide-y divide-border/30">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 !py-1.5 hover:bg-white/[0.02] transition-colors">
                <button type="button" onClick={() => setOpenDraft(d)}
                  className="flex-1 min-w-0 text-left">
                  <span className="block text-sm text-text-1 truncate">
                    {d.subject?.trim() || t('draftNoSubject')}
                  </span>
                  <span className="block text-[10.5px] text-text-muted truncate">
                    {d.patientName ? `${d.patientName} · ` : ''}
                    {new Date(d.updatedAt).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </button>
                <button type="button" onClick={() => void deleteDraft(d.id)}
                  className="p-1.5 rounded text-text-muted hover:text-rose hover:bg-rose/10 transition-colors shrink-0"
                  aria-label={t('draftDelete')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Banner de bandeja ajena */}
      {!isOwnInbox && (
        <div className="flex items-center gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          {t('viewingOtherInbox', { name: viewUserName })}
        </div>
      )}

      {/* Lista */}
      <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
        {/* ── Tarjetas en el teléfono ─────────────────────────────────── */}
        <div className="sm:hidden">
          {loading ? (
            <EmptyState.Inline message={t('loading')} />
          ) : rows.length === 0 ? (
            <EmptyState.Inline message={hayFiltro ? t('noResults') : t(`empty_${folder}`)} />
          ) : rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpenThreadId(r.id)}
              className={`w-full text-left px-4 py-3 border-b border-row-sep last:border-0 flex gap-3 ${
                !r.unread ? '' : r.priority === 'URGENT' ? 'bg-rose/[0.10]' : 'bg-emerald/[0.08]'
              }`}
            >
              {isOwnInbox && (
                <input type="checkbox" className="accent-[#6366F1] mt-1 shrink-0"
                  checked={selected.has(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                    return next;
                  })}
                  aria-label={r.subject} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm truncate ${r.unread ? 'text-text-1 font-semibold' : 'text-text-2'}`}>{r.lastAuthorName ?? '—'}</span>
                  <span className="text-[11px] text-text-muted tabular-nums shrink-0">{fmtDt(r.lastEntryAt)}</span>
                </div>
                <div className={`text-[12.5px] truncate ${r.unread ? 'text-text-1' : 'text-text-2'}`}>{r.subject}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {r.patient && <span className="text-[11px] text-text-muted truncate">{r.patient.name}</span>}
                  {origenPill(r) ?? <span className="text-[11px] text-text-muted">{t(`type${r.type}`)}</span>}
                  {folder === 'sent' && r.mine && <TagPill label={estadoEnviado(r).label} colorClass={estadoEnviado(r).cls} />}
                  {r.priority === 'URGENT' && <TagPill label={t('priorityURGENT')} colorClass="bg-rose/10 text-rose border-rose/30" />}
                  {r.sealedAt && <Lock className="w-3 h-3 text-amber" />}
                  {r.attachmentCount > 0 && <Paperclip className="w-3 h-3 text-text-muted" />}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* ── Tabla desde tablet ──────────────────────────────────────── */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border bg-bg-2/50">
                <th className="px-3 py-2 w-8">
                  {isOwnInbox && (
                    <input type="checkbox" className="accent-[#6366F1]"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleAll} aria-label={t('selectAll')} />
                  )}
                </th>
                {[t('colDateTime'), t('colFrom'), t('colPatient'), folder === 'sent' ? t('colStatus') : t('colType'), t('colSubject')].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
                {/* sello + adjuntos: dos columnas de icono, sin encabezado */}
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><EmptyState.Inline message={t('loading')} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8}><EmptyState.Inline message={hayFiltro ? t('noResults') : t(`empty_${folder}`)} /></td></tr>
              ) : /* No leído = tinte de fondo + raya de 3px en el borde: el ojo
                     detecta el bloque de color antes de leer una palabra, y de
                     un vistazo se ve cuántos pendientes hay. Sin animación a
                     propósito — una tabla temblando no se puede leer, y el
                     movimiento queda reservado al urgente del top bar. */
                rows.map((r) => {
                /**
                 * ESCALERA DE CONTRASTE. Leídas y no leídas con el MISMO color
                 * de texto solo se distinguían por la negrita y un tinte del 6%.
                 * Lo que crea diferencia en oscuro es RESTARLE luz a lo ya leído
                 * (Gmail): lo pendiente en blanco y negrita, lo atendido en gris.
                 */
                const fuerte = r.unread ? 'text-text-1 font-semibold' : 'text-text-2';
                const suave = r.unread ? 'text-text-2' : 'text-text-muted';
                return (
                <tr key={r.id}
                  onClick={() => setOpenThreadId(r.id)}
                  className={`border-b border-border/30 last:border-b-0 transition-colors cursor-pointer ${
                    !r.unread
                      ? 'hover:bg-white/[0.02]'
                      : r.priority === 'URGENT'
                        ? 'bg-rose/[0.12] hover:bg-rose/[0.16]'
                        : 'bg-emerald/[0.10] hover:bg-emerald/[0.14]'
                  }`}>
                  <td
                    className={`px-3 !py-1.5 border-l-4 ${
                      !r.unread
                        ? 'border-l-transparent'
                        : r.priority === 'URGENT' ? 'border-l-rose' : 'border-l-emerald'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isOwnInbox && (
                      <input type="checkbox" className="accent-[#6366F1]"
                        checked={selected.has(r.id)}
                        onChange={() => setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                          return next;
                        })}
                        aria-label={r.subject} />
                    )}
                  </td>
                  <td className={`px-3 !py-1.5 text-[11px] tabular-nums whitespace-nowrap ${suave}`}>
                    {fmtDt(r.lastEntryAt)}
                  </td>
                  <td className={`px-3 !py-1.5 text-sm whitespace-nowrap ${fuerte}`}>
                    {r.lastAuthorName ?? '—'}
                  </td>
                  <td className={`px-3 !py-1.5 text-[12.5px] whitespace-nowrap ${suave}`}>
                    {r.patient?.name ?? '—'}
                  </td>
                  <td className="px-3 !py-1.5 whitespace-nowrap">
                    {folder === 'sent' && r.mine ? (
                      <TagPill label={estadoEnviado(r).label} colorClass={estadoEnviado(r).cls} />
                    ) : (
                      /* Origen bufete: pastilla propia (violeta = referido, cyan =
                         consulta de caso). Pastilla y no tinte, para que conviva
                         con el rojo de urgente. */
                      origenPill(r) ?? <span className={`text-[12.5px] ${suave}`}>{t(`type${r.type}`)}</span>
                    )}
                    {r.priority === 'URGENT' && (
                      <span className="ml-1.5 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full bg-rose/10 border border-rose/30 text-rose">
                        {t('priorityURGENT')}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 !py-1.5 text-[12.5px] max-w-[280px] ${fuerte}`}>
                    <span className="flex items-center gap-1.5">
                      {/* Mismo idioma que el badge del top bar: verde = sin
                          leer normal, rojo = urgente. */}
                      {r.unread
                        ? <Mail className={`w-3.5 h-3.5 shrink-0 ${r.priority === 'URGENT' ? 'text-rose' : 'text-emerald'}`} />
                        : <MailOpen className="w-3 h-3 shrink-0 text-text-muted opacity-60" />}
                      <span className="truncate">{r.subject}</span>
                    </span>
                  </td>
                  <td className="px-3 !py-1.5">
                    {r.sealedAt && <Lock className="w-3 h-3 text-amber" />}
                  </td>
                  {/* Adjuntos: con UNO abre el visor directo (el caso común, un
                      clic); con VARIOS abre el hilo, donde cada archivo ya es un
                      chip — no hace falta inventar un menú flotante para algo
                      que el hilo muestra mejor. */}
                  <td className="px-3 !py-1.5" onClick={(e) => e.stopPropagation()}>
                    {r.attachmentCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (r.attachmentCount === 1 && r.firstAttachment) {
                            setViewing(r.firstAttachment);
                          } else {
                            setOpenThreadId(r.id);
                          }
                        }}
                        title={r.attachmentCount === 1 && r.firstAttachment
                          ? r.firstAttachment.fileName
                          : t('attachCountTooltip', { count: r.attachmentCount })}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {r.attachmentCount > 1 && r.attachmentCount}
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="px-4 py-2.5 bg-bg-2/30 border-t border-border flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-text-muted">
            {t('pageInfo', { page, totalPages, total })}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-30">
              {t('pagePrev')}
            </button>
            <button type="button" disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-30">
              {t('pageNext')}
            </button>
          </div>
        </div>
      </div>

      <ComposeMessageDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        patient={null}
        onSent={() => void load()}
        onDraftSaved={() => void loadDrafts()}
      />

      {/* Reabrir un borrador — compose precargado; al enviar se auto-elimina */}
      <ComposeMessageDialog
        open={openDraft !== null}
        onClose={() => setOpenDraft(null)}
        initialDraft={openDraft ? { id: openDraft.id, payload: openDraft.payload } : null}
        onSent={() => { void load(); void loadDrafts(); }}
        onDraftSaved={() => void loadDrafts()}
      />

      <ThreadViewDialog
        open={openThreadId !== null}
        onClose={() => { setOpenThreadId(null); void load(); }}
        threadId={openThreadId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onChanged={() => void load()}
        onOpenCase={onOpenCase ?? openCaseFromThread}
        suspended={caseModalOpen}
      />

      {/* Visor del adjunto abierto desde la lista — el mismo que usa el hilo,
          así que la apertura queda igualmente registrada en el audit log. */}
      <AttachmentViewerDialog
        attachmentId={viewing?.id ?? null}
        fileName={viewing?.fileName ?? ''}
        onClose={() => setViewing(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        variant={folder === 'archived' ? 'info' : 'warning'}
        title={folder === 'archived' ? t('confirmBulkUnarchiveTitle', { count: selected.size }) : t('confirmBulkTitle', { count: selected.size })}
        description={folder === 'archived' ? t('confirmBulkUnarchiveDesc') : t('confirmBulkDesc')}
        confirmLabel={folder === 'archived' ? t('actUnarchive') : t('actDeleteMine')}
        cancelLabel={t('btnCancel')}
        onConfirm={() => void bulkArchive()}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  );
}
