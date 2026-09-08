'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2, Send, Mail, MailOpen, AlertCircle, Paperclip, Inbox, SendHorizontal,
  Archive, ArchiveRestore, Search, X,
} from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { EmptyState, TagPill, FilterPill, IconAction } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { useToast } from '@/components/ui-phoenix/toast';
import { AttachmentViewerDialog } from '@/components/messaging/attachment-viewer-dialog';
import { fechaHora } from '@/lib/fechas';
import { anunciarLectura } from '@/lib/messaging-events';
import type { Escritorio } from '@/lib/mensajeria/escritorios';

/**
 * Portal Legal · la bandeja del bufete, con carpetas (Gmail).
 *
 *  · Recibidos  — lo que la clínica le escribió. Es la única carpeta que cuenta
 *                 no leídos: el sobre del top bar, el menú y la pestaña muestran
 *                 el MISMO número (`lib/mensajeria/bandeja-abogado.ts`).
 *  · Enviados   — lo que pidió el bufete (pedidos por escritorio y referidos),
 *                 con su estado: sin respuesta / respondido / caso creado. Es
 *                 donde el abogado viene a CONTROLAR, no a leer.
 *  · Archivados — lo que sacó del medio. Vuelve solo si la clínica escribe.
 *
 * ## Se presenta como la bandeja de la clínica (Erick, 2026-09-08)
 *
 * Antes era lista angosta a la izquierda y hilo a la derecha; ahora es la MISMA
 * tabla que `components/messaging/inbox-client.tsx` —columnas Fecha/De/Cliente/
 * Tipo/Asunto, filtros de prioridad y tipo, casillas para archivar en lote,
 * paginación— y el hilo se abre en un DIÁLOGO. El motivo de que el hilo salga
 * del panel derecho es la tabla: con seis columnas no queda ancho para las dos
 * cosas a la vez. Las etiquetas de la tabla se leen de `phoenix.messaging`, las
 * mismas del back-office, para que las dos pantallas digan igual lo mismo.
 *
 * ## Lo que NO se trajo, y no es un olvido
 *
 * `ver inbox de…`, plantillas, el buscador de pacientes, sellar y "quitar de
 * todas las bandejas" son herramientas INTERNAS. Un externo no puede mirar la
 * bandeja de otro ni decidir sobre la lista de los demás. Tampoco hay "mensaje
 * nuevo": el abogado escribe desde Vigía, desde un referido o respondiendo, y
 * Enviados es el historial de eso.
 *
 * `?thread=<id>` abre un hilo directo: es el link que viaja en el aviso por
 * correo. Embebida en el modal del top bar (`embedded`) no toca la URL, porque
 * la pantalla de abajo es cualquiera.
 */

type Folder = 'inbox' | 'sent' | 'archived';

interface ThreadRow {
  id: string;
  subject: string;
  priority: 'NORMAL' | 'URGENT';
  type: string;
  referralStatus: 'PENDING' | 'CREATED' | 'DISCARDED' | null;
  desk: Escritorio | null;
  from: string;
  lastFrom: string;
  lastFromMe: boolean;
  mine: boolean;
  answered: boolean;
  caseCode: string | null;
  patientName: string | null;
  lastEntryAt: string;
  entries: number;
  attachments: number;
  archived: boolean;
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
  archived: boolean;
  mine: boolean;
  caseCode: string | null;
  caseId: string | null;
  patientName: string | null;
  recipients: Array<{ userName: string; kind: 'TO' | 'CC' }>;
  entries: Entry[];
}

interface Lista { folder: Folder; total: number; page: number; pageSize: number; unreadInbox: number; threads: ThreadRow[] }

/** Color por escritorio: el mismo en la lista, el hilo y la vista del admin. */
export const DESK_PILL: Record<Escritorio, string> = {
  CLINICAL:  'bg-violet/15 text-violet border-violet/30',
  INTAKE:    'bg-cyan/15 text-cyan border-cyan/30',
  BILLING:   'bg-amber/15 text-amber border-amber/30',
  REFERRALS: 'bg-emerald/15 text-emerald border-emerald/30',
};

const POLL_MS = 30_000;
const FOLDERS: Array<{ id: Folder; icon: React.ElementType; key: string }> = [
  { id: 'inbox',    icon: Inbox,          key: 'msgFolderInbox' },
  { id: 'sent',     icon: SendHorizontal, key: 'msgFolderSent' },
  { id: 'archived', icon: Archive,        key: 'msgFolderArchived' },
];

const TIPOS = ['MESSAGE', 'ALERT', 'REMINDER', 'REQUEST', 'REFERRAL'] as const;

const selectCls =
  'bg-bg-2 border border-border rounded-md px-2.5 py-1.5 text-sm text-text-1 outline-none focus:border-brand transition-colors appearance-none [color-scheme:dark]';
const labelCls = 'block text-[10px] uppercase tracking-wider font-semibold text-text-muted';

export function AttorneyInbox({ locale, initialThreadId = null, embedded = false }: {
  locale: string;
  initialThreadId?: string | null;
  /** Dentro del modal del top bar: sin tocar la URL de la pantalla de abajo. */
  embedded?: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  /** Chrome de la tabla: las mismas palabras que la bandeja del back-office. */
  const tm = useTranslations('phoenix.messaging');
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const loc = locale as 'es' | 'en';

  const [folder, setFolder] = React.useState<Folder>('inbox');
  const [q, setQ] = React.useState('');
  const [soloSinLeer, setSoloSinLeer] = React.useState(false);
  const [soloUrgentes, setSoloUrgentes] = React.useState(false);
  const [priority, setPriority] = React.useState('');
  const [tipo, setTipo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [lista, setLista] = React.useState<Lista | null>(null);
  const [cargandoLista, setCargandoLista] = React.useState(false);
  const [abierto, setAbierto] = React.useState<ThreadDetail | null>(null);
  const [cargandoHilo, setCargandoHilo] = React.useState(false);
  const [respuesta, setRespuesta] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [archivando, setArchivando] = React.useState(false);
  const [viendo, setViendo] = React.useState<Adjunto | null>(null);
  const [seleccion, setSeleccion] = React.useState<Set<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = React.useState(false);
  const hiloRef = React.useRef<HTMLDivElement>(null);

  /** La URL solo se toca como PÁGINA: embebida, la de abajo no es la bandeja. */
  const ponerEnUrl = React.useCallback((threadId: string | null): void => {
    if (embedded) return;
    router.replace(threadId ? `${pathname}?thread=${encodeURIComponent(threadId)}` : pathname, { scroll: false });
  }, [embedded, pathname, router]);

  const cargarLista = React.useCallback(async (silencioso = false) => {
    if (!silencioso) setCargandoLista(true);
    const vacia = { folder, total: 0, page: 1, pageSize: 25, unreadInbox: 0, threads: [] };
    try {
      const sp = new URLSearchParams({ folder, page: String(page) });
      if (q.trim()) sp.set('q', q.trim());
      if (soloSinLeer) sp.set('unread', '1');
      if (soloUrgentes) sp.set('urgent', '1');
      if (priority && !soloUrgentes) sp.set('priority', priority);
      if (tipo) sp.set('type', tipo);
      const r = await fetch(`/api/attorney/messages?${sp.toString()}`);
      if (!r.ok) { setLista((prev) => prev ?? vacia); return; }
      setLista((await r.json()) as Lista);
    } catch {
      setLista((prev) => prev ?? vacia);
    } finally {
      setCargandoLista(false);
    }
  }, [folder, q, soloSinLeer, soloUrgentes, priority, tipo, page]);

  // El buscador espera a que dejen de tipear; carpeta, chips y selects disparan
  // al instante.
  React.useEffect(() => {
    const id = setTimeout(() => { void cargarLista(); }, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [cargarLista, q]);

  // Cambiar de carpeta, de filtro o de página deja la selección sin sentido.
  React.useEffect(() => { setSeleccion(new Set()); }, [folder, page, q, soloSinLeer, soloUrgentes, priority, tipo]);

  // Sondeo liviano: una respuesta de la clínica tiene que aparecer sin F5.
  React.useEffect(() => {
    const id = setInterval(() => void cargarLista(true), POLL_MS);
    const onFocus = () => void cargarLista(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [cargarLista]);

  const abrir = React.useCallback(async (id: string): Promise<void> => {
    setCargandoHilo(true);
    setRespuesta('');
    try {
      const r = await fetch(`/api/attorney/messages/${id}`);
      if (!r.ok) { setAbierto(null); ponerEnUrl(null); return; }
      setAbierto((await r.json()) as ThreadDetail);
      ponerEnUrl(id);
      // Abrirlo lo marca leído en el servidor: la lista se refresca para que el
      // resaltado se apague, y el sobre y el menú bajan el número en el acto.
      void cargarLista(true);
      anunciarLectura();
    } finally {
      setCargandoHilo(false);
    }
  }, [cargarLista, ponerEnUrl]);

  // El link del correo trae el hilo: se abre al entrar.
  React.useEffect(() => {
    if (initialThreadId) void abrir(initialThreadId);
    // Solo al montar: si después el usuario navega, manda la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cerrarHilo(): void {
    setAbierto(null);
    ponerEnUrl(null);
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
      if (!r.ok) { toast.error(t('vigiaError')); return; }
      setRespuesta('');
      await abrir(abierto.id);
      hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight, behavior: 'smooth' });
    } finally {
      setEnviando(false);
    }
  }

  async function archivar(id: string, archived: boolean): Promise<void> {
    if (archivando) return;
    setArchivando(true);
    try {
      const r = await fetch(`/api/attorney/messages/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      if (!r.ok) { toast.error(t('vigiaError')); return; }
      toast.success(t(archived ? 'msgArchived' : 'msgUnarchived'));
      // El hilo se fue de esta carpeta: se cierra y la lista se rearma.
      if (abierto?.id === id) cerrarHilo();
      void cargarLista(true);
      anunciarLectura();
    } finally {
      setArchivando(false);
    }
  }

  /** Archivar (o devolver) los marcados. Uno por hilo, en paralelo. */
  async function archivarLote(): Promise<void> {
    const ids = [...seleccion];
    if (ids.length === 0 || archivando) return;
    const archived = folder !== 'archived';
    setArchivando(true);
    setConfirmarLote(false);
    try {
      const res = await Promise.all(ids.map((id) => fetch(`/api/attorney/messages/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      }).then((r) => r.ok).catch(() => false)));
      if (res.some((ok) => !ok)) toast.error(t('vigiaError'));
      else toast.success(t(archived ? 'msgArchived' : 'msgUnarchived'));
      setSeleccion(new Set());
      if (abierto && ids.includes(abierto.id)) cerrarHilo();
      void cargarLista(true);
      anunciarLectura();
    } finally {
      setArchivando(false);
    }
  }

  const para = abierto?.recipients.filter((r) => r.kind === 'TO').map((r) => r.userName) ?? [];
  const rows = lista?.threads ?? null;
  const hayFiltro = q.trim() !== '' || soloSinLeer || soloUrgentes || priority !== '' || tipo !== '';
  const total = lista?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / (lista?.pageSize ?? 25)));
  const hiloVisible = abierto !== null || cargandoHilo;

  /** Estado de una fila de Enviados: lo que el abogado viene a mirar. */
  function estadoEnviado(th: ThreadRow): { label: string; cls: string } {
    if (th.type === 'REFERRAL') {
      return th.referralStatus === 'CREATED'
        ? { label: t('refStatusCreated'), cls: 'bg-emerald/15 text-emerald border-emerald/30' }
        : { label: t('refStatusPending'), cls: DESK_PILL.REFERRALS };
    }
    return th.answered
      ? { label: t('msgSentAnswered'), cls: 'bg-emerald/15 text-emerald border-emerald/30' }
      : { label: t('msgSentPending'), cls: 'bg-amber/15 text-amber border-amber/30' };
  }

  /** La pastilla de la columna Tipo: estado en Enviados, origen en el resto. */
  function pastillaDeTipo(th: ThreadRow): React.ReactElement {
    if (folder === 'sent') {
      const e = estadoEnviado(th);
      return <TagPill label={e.label} colorClass={e.cls} />;
    }
    if (th.type === 'REFERRAL') {
      return (
        <TagPill
          label={th.referralStatus === 'CREATED' ? t('refStatusCreated') : t('refStatusPending')}
          colorClass={th.referralStatus === 'CREATED' ? 'bg-emerald/15 text-emerald border-emerald/30' : DESK_PILL.REFERRALS}
        />
      );
    }
    if (th.desk) return <TagPill label={t(`desk_${th.desk}`)} colorClass={DESK_PILL[th.desk]} />;
    return <span className="text-[12.5px] text-text-muted">{tm(`type${(TIPOS as readonly string[]).includes(th.type) ? th.type : 'MESSAGE'}`)}</span>;
  }

  const cabeceras = [
    tm('colDateTime'), tm('colFrom'), t('msgClient'),
    folder === 'sent' ? tm('colStatus') : tm('colType'), tm('colSubject'),
  ];

  return (
    <div className="space-y-3">
      {/* Las carpetas: pestañas, no un riel aparte — con tres, un riel queda vacío. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist">
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            const activo = folder === f.id;
            const n = f.id === 'inbox' ? (lista?.unreadInbox ?? 0) : 0;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => { setFolder(f.id); setPage(1); cerrarHilo(); }}
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
            placeholder={t('msgSearchPlaceholder')}
            className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-8 py-1.5 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label={t('msgClearSearch')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-1">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        {folder !== 'sent' && <FilterPill active={soloSinLeer} onClick={() => { setSoloSinLeer((v) => !v); setPage(1); }} label={t('msgOnlyUnread')} />}
        <FilterPill active={soloUrgentes} onClick={() => { setSoloUrgentes((v) => !v); setPage(1); }} label={t('msgOnlyUrgent')} />
      </div>

      {/* Filtros finos + archivar en lote */}
      <div className="flex items-end gap-3 flex-wrap">
        {!soloUrgentes && (
          <div className="space-y-1">
            <label className={labelCls}>{tm('fieldPriority')}</label>
            <select className={selectCls} value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="">{tm('filterAll')}</option>
              <option value="URGENT">{tm('priorityURGENT')}</option>
              <option value="NORMAL">{tm('priorityNORMAL')}</option>
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label className={labelCls}>{tm('fieldType')}</label>
          <select className={selectCls} value={tipo}
            onChange={(e) => { setTipo(e.target.value); setPage(1); }}>
            <option value="">{tm('filterAll')}</option>
            {TIPOS.map((v) => <option key={v} value={v}>{tm(`type${v}`)}</option>)}
          </select>
        </div>
        <span className="flex-1" />
        {seleccion.size > 0 && (
          <button type="button" disabled={archivando} onClick={() => setConfirmarLote(true)}
            title={t(folder === 'archived' ? 'msgUnarchive' : 'msgArchive')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-text-2 border border-border bg-bg-2 hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-40">
            {folder === 'archived' ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
            {folder === 'archived' ? tm('bulkUnarchive', { count: seleccion.size }) : tm('bulkDelete', { count: seleccion.size })}
          </button>
        )}
      </div>

      <div className="rounded-lg bg-bg-1 overflow-hidden">
        {!rows && (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
          </div>
        )}
        {rows?.length === 0 && (
          <div className="py-10">
            <EmptyState.Rich
              icon={folder === 'archived' ? Archive : folder === 'sent' ? SendHorizontal : Mail}
              title={hayFiltro ? t('msgNoResultsTitle') : t(`msgEmpty_${folder}_title`)}
              subtitle={hayFiltro ? t('msgNoResultsSub') : t(`msgEmpty_${folder}_sub`)}
            />
          </div>
        )}

        <div className={cargandoLista && rows ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* ── Teléfono: tarjetas ────────────────────────────────────────── */}
          <div className="sm:hidden">
            {rows?.map((th) => {
              const noLeido = th.unread && folder !== 'sent';
              return (
                <div key={th.id} className="flex items-start gap-2 px-4 py-3 border-b border-row-sep last:border-0">
                  <button type="button" onClick={() => { void abrir(th.id); }} className="flex-1 min-w-0 text-left">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm truncate ${noLeido ? 'font-semibold text-text-1' : 'text-text-2'}`}>
                        {th.lastFromMe ? t('msgYouPrefix', { name: th.lastFrom }) : th.lastFrom}
                      </span>
                      <span className="text-[11px] text-text-muted font-mono shrink-0">{fechaHora(th.lastEntryAt, loc)}</span>
                    </div>
                    <div className={`text-[12.5px] truncate ${noLeido ? 'text-text-1' : 'text-text-2'}`}>{th.subject}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {th.priority === 'URGENT' && <AlertCircle className="w-3 h-3 text-rose shrink-0" aria-label={t('msgUrgent')} />}
                      {th.caseCode && <TagPill label={th.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />}
                      {pastillaDeTipo(th)}
                      {th.patientName && <span className="text-[11px] text-text-muted truncate">{th.patientName}</span>}
                      {th.attachments > 0 && <Paperclip className="w-3 h-3 text-text-muted shrink-0" aria-label={t('msgAttachments', { n: th.attachments })} />}
                    </div>
                  </button>
                  <div className="shrink-0">
                    <IconAction
                      icon={th.archived ? ArchiveRestore : Archive}
                      label={t(th.archived ? 'msgUnarchive' : 'msgArchive')}
                      onClick={() => { void archivar(th.id, !th.archived); }}
                      disabled={archivando}
                      stopPropagation
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Tabla desde tablet ────────────────────────────────────────── */}
          {rows && rows.length > 0 && (
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-border bg-bg-2/50">
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox" className="accent-[#6366F1]"
                        checked={rows.length > 0 && seleccion.size === rows.length}
                        onChange={() => setSeleccion((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))}
                        aria-label={tm('selectAll')} />
                    </th>
                    {cabeceras.map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    {/* adjuntos + archivar: dos columnas de icono, sin encabezado */}
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((th) => {
                    /**
                     * ESCALERA DE CONTRASTE, igual que la bandeja del back-office:
                     * lo pendiente en blanco y negrita, lo atendido en gris, y el
                     * no leído con tinte de fondo más raya de 4px al borde. Sin
                     * animación — una tabla temblando no se puede leer.
                     */
                    const noLeido = th.unread && folder !== 'sent';
                    const fuerte = noLeido ? 'text-text-1 font-semibold' : 'text-text-2';
                    const suave = noLeido ? 'text-text-2' : 'text-text-muted';
                    return (
                      <tr key={th.id}
                        onClick={() => { void abrir(th.id); }}
                        className={`border-b border-border/30 last:border-b-0 transition-colors cursor-pointer ${
                          !noLeido
                            ? 'hover:bg-white/[0.02]'
                            : th.priority === 'URGENT'
                              ? 'bg-rose/[0.12] hover:bg-rose/[0.16]'
                              : 'bg-emerald/[0.10] hover:bg-emerald/[0.14]'
                        }`}>
                        <td
                          className={`px-3 !py-1.5 border-l-4 ${
                            !noLeido
                              ? 'border-l-transparent'
                              : th.priority === 'URGENT' ? 'border-l-rose' : 'border-l-emerald'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input type="checkbox" className="accent-[#6366F1]"
                            checked={seleccion.has(th.id)}
                            onChange={() => setSeleccion((prev) => {
                              const next = new Set(prev);
                              if (next.has(th.id)) next.delete(th.id); else next.add(th.id);
                              return next;
                            })}
                            aria-label={th.subject} />
                        </td>
                        <td className={`px-3 !py-1.5 text-[11px] tabular-nums whitespace-nowrap ${suave}`}>
                          {fechaHora(th.lastEntryAt, loc)}
                        </td>
                        <td className={`px-3 !py-1.5 text-sm whitespace-nowrap ${fuerte}`}>
                          {th.lastFromMe ? t('msgYouPrefix', { name: th.lastFrom }) : th.lastFrom}
                        </td>
                        <td className={`px-3 !py-1.5 text-[12.5px] whitespace-nowrap ${suave}`}>
                          {th.patientName ?? '—'}
                        </td>
                        <td className="px-3 !py-1.5 whitespace-nowrap">
                          {pastillaDeTipo(th)}
                          {th.priority === 'URGENT' && (
                            <span className="ml-1.5 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full bg-rose/10 border border-rose/30 text-rose">
                              {tm('priorityURGENT')}
                            </span>
                          )}
                        </td>
                        <td className={`px-3 !py-1.5 text-[12.5px] max-w-[280px] ${fuerte}`}>
                          <span className="flex items-center gap-1.5">
                            {/* Mismo idioma que el badge del top bar: verde = sin
                                leer normal, rojo = urgente. */}
                            {noLeido
                              ? <Mail className={`w-3.5 h-3.5 shrink-0 ${th.priority === 'URGENT' ? 'text-rose' : 'text-emerald'}`} />
                              : <MailOpen className="w-3 h-3 shrink-0 text-text-muted opacity-60" />}
                            <span className="truncate">{th.subject}</span>
                            {th.caseCode && <TagPill label={th.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />}
                          </span>
                        </td>
                        <td className="px-3 !py-1.5">
                          {th.attachments > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted"
                              title={tm('attachCountTooltip', { count: th.attachments })}>
                              <Paperclip className="w-3.5 h-3.5" />
                              {th.attachments > 1 && th.attachments}
                            </span>
                          )}
                        </td>
                        <td className="px-3 !py-1.5" onClick={(e) => e.stopPropagation()}>
                          <IconAction
                            icon={th.archived ? ArchiveRestore : Archive}
                            label={t(th.archived ? 'msgUnarchive' : 'msgArchive')}
                            onClick={() => { void archivar(th.id, !th.archived); }}
                            disabled={archivando}
                            stopPropagation
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {rows && rows.length > 0 && (
            <div className="px-4 py-2.5 bg-bg-2/30 border-t border-border flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-text-muted">
                {tm('pageInfo', { page: lista?.page ?? page, totalPages: totalPaginas, total })}
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-30">
                  {tm('pagePrev')}
                </button>
                <button type="button" disabled={page >= totalPaginas}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors disabled:opacity-30">
                  {tm('pageNext')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── El hilo, en diálogo ──────────────────────────────────────────── */}
      <Dialog open={hiloVisible} onOpenChange={(o) => { if (!o) cerrarHilo(); }}>
        <DialogContent className="max-w-3xl p-0 max-h-[92vh] flex flex-col">
          <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border">
            <DialogTitle className="text-text-1 text-base font-semibold leading-snug pr-8">
              {abierto?.subject ?? t('msgTitle')}
            </DialogTitle>
            {abierto && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                {abierto.priority === 'URGENT' && <TagPill label={t('msgUrgent')} colorClass="bg-rose/10 text-rose border-rose/30" />}
                {abierto.type === 'REFERRAL' ? (
                  <TagPill
                    label={abierto.referral?.status === 'CREATED' ? t('refStatusCreated') : t('refStatusPending')}
                    colorClass={abierto.referral?.status === 'CREATED' ? 'bg-emerald/15 text-emerald border-emerald/30' : DESK_PILL.REFERRALS}
                  />
                ) : abierto.desk && <TagPill label={t(`desk_${abierto.desk}`)} colorClass={DESK_PILL[abierto.desk]} />}
                {abierto.caseCode && <TagPill label={abierto.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />}
              </div>
            )}
          </DialogHeader>

          {!abierto ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
            </div>
          ) : (
            <>
              <div className="px-4 sm:px-6 py-3 space-y-2 border-b border-border">
                {abierto.referral && (
                  <p className={`text-[12px] ${abierto.referral.status === 'CREATED' ? 'text-emerald' : 'text-text-muted'}`}>
                    {abierto.referral.status === 'CREATED'
                      ? t('refDetailCreated', { name: abierto.referral.convertedByName ?? '—' })
                      : t('refDetailPending')}
                  </p>
                )}
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[12px] min-w-0">
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
                  <Button variant="secondary" size="sm" disabled={archivando} onClick={() => { void archivar(abierto.id, !abierto.archived); }}>
                    {abierto.archived ? <ArchiveRestore /> : <Archive />}
                    {t(abierto.archived ? 'msgUnarchive' : 'msgArchive')}
                  </Button>
                </div>
              </div>

              {/* Mensajes: los míos a la derecha, los de la clínica a la izquierda. */}
              <div ref={hiloRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
                {abierto.entries.map((e) => (
                  <div key={e.id} className={`rounded-md p-4 space-y-2 max-w-[92%] sm:max-w-[85%] ${e.mine ? 'ml-auto bg-brand/10' : 'mr-auto bg-bg-2/40'}`}>
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="text-[12.5px] font-semibold text-text-1">{e.mine ? t('msgYou') : e.authorName}</span>
                      <span className="text-[11px] text-text-muted font-mono">{fechaHora(e.sentAt, loc)}</span>
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

              <div className="px-4 sm:px-6 py-3 border-t border-border space-y-2">
                <textarea
                  value={respuesta}
                  onChange={(ev) => setRespuesta(ev.target.value)}
                  rows={3}
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
            </>
          )}
        </DialogContent>
      </Dialog>

      <AttachmentViewerDialog
        attachmentId={viendo?.id ?? null}
        fileName={viendo?.fileName ?? ''}
        onClose={() => setViendo(null)}
        endpoint="/api/attorney/messages/attachments"
      />

      <ConfirmDialog
        open={confirmarLote}
        variant={folder === 'archived' ? 'info' : 'warning'}
        title={folder === 'archived'
          ? tm('confirmBulkUnarchiveTitle', { count: seleccion.size })
          : tm('confirmBulkTitle', { count: seleccion.size })}
        description={t(folder === 'archived' ? 'msgBulkUnarchiveDesc' : 'msgBulkArchiveDesc')}
        confirmLabel={t(folder === 'archived' ? 'msgUnarchive' : 'msgArchive')}
        cancelLabel={tm('btnCancel')}
        onConfirm={() => void archivarLote()}
        onCancel={() => setConfirmarLote(false)}
      />
    </div>
  );
}
