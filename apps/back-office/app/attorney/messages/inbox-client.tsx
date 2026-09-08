'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2, Send, ArrowLeft, Mail, MailOpen, AlertCircle, Paperclip, Inbox, SendHorizontal, Archive, ArchiveRestore, Search, X,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState, TagPill, FilterPill, IconAction } from '@/components/ui-phoenix';
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
 * Es propia y no la de la clínica: aquella trae plantillas, "ver inbox de…" y
 * el buscador de pacientes — herramientas internas que un externo no puede
 * tener. Tipo correo: en escritorio la lista a la izquierda y el hilo a la
 * derecha; en el teléfono son dos pantallas con "volver".
 *
 * `?thread=<id>` abre un hilo directo: es el link que viaja en el aviso por
 * correo. No hay "mensaje nuevo" a propósito: el abogado escribe desde Vigía,
 * desde un referido o respondiendo. Enviados es el historial de eso.
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

export function AttorneyInbox({ locale, initialThreadId = null }: {
  locale: string;
  initialThreadId?: string | null;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const loc = locale as 'es' | 'en';

  const [folder, setFolder] = React.useState<Folder>('inbox');
  const [q, setQ] = React.useState('');
  const [soloSinLeer, setSoloSinLeer] = React.useState(false);
  const [soloUrgentes, setSoloUrgentes] = React.useState(false);
  const [lista, setLista] = React.useState<Lista | null>(null);
  const [cargandoLista, setCargandoLista] = React.useState(false);
  const [abierto, setAbierto] = React.useState<ThreadDetail | null>(null);
  const [cargandoHilo, setCargandoHilo] = React.useState(false);
  const [respuesta, setRespuesta] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [archivando, setArchivando] = React.useState(false);
  const [viendo, setViendo] = React.useState<Adjunto | null>(null);
  const hiloRef = React.useRef<HTMLDivElement>(null);

  const cargarLista = React.useCallback(async (silencioso = false) => {
    if (!silencioso) setCargandoLista(true);
    try {
      const sp = new URLSearchParams({ folder });
      if (q.trim()) sp.set('q', q.trim());
      if (soloSinLeer) sp.set('unread', '1');
      if (soloUrgentes) sp.set('urgent', '1');
      const r = await fetch(`/api/attorney/messages?${sp.toString()}`);
      if (!r.ok) { setLista((prev) => prev ?? { folder, total: 0, page: 1, pageSize: 25, unreadInbox: 0, threads: [] }); return; }
      setLista((await r.json()) as Lista);
    } catch {
      setLista((prev) => prev ?? { folder, total: 0, page: 1, pageSize: 25, unreadInbox: 0, threads: [] });
    } finally {
      setCargandoLista(false);
    }
  }, [folder, q, soloSinLeer, soloUrgentes]);

  // El buscador espera a que dejen de tipear; carpeta y chips disparan al instante.
  React.useEffect(() => {
    const id = setTimeout(() => { void cargarLista(); }, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [cargarLista, q]);

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
      if (!r.ok) { setAbierto(null); router.replace(pathname, { scroll: false }); return; }
      setAbierto((await r.json()) as ThreadDetail);
      router.replace(`${pathname}?thread=${encodeURIComponent(id)}`, { scroll: false });
      // Abrirlo lo marca leído en el servidor: la lista se refresca para que el
      // punto se apague, y el sobre y el menú bajan el número en el acto.
      void cargarLista(true);
      anunciarLectura();
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
      if (abierto?.id === id) volver();
      void cargarLista(true);
      anunciarLectura();
    } finally {
      setArchivando(false);
    }
  }

  const para = abierto?.recipients.filter((r) => r.kind === 'TO').map((r) => r.userName) ?? [];
  const rows = lista?.threads ?? null;
  const hayFiltro = q.trim() !== '' || soloSinLeer || soloUrgentes;

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

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-4 lg:items-start">
        {/* ── Carpetas + lista ─────────────────────────────────────────────── */}
        <div className={`space-y-3 ${abierto ? 'hidden lg:block' : ''}`}>
          {/* Las carpetas: pestañas, no un riel aparte — con tres, un riel queda vacío. */}
          <div className="flex gap-1 border-b border-border pb-1 overflow-x-auto no-scrollbar" role="tablist">
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
                  onClick={() => { setFolder(f.id); setAbierto(null); router.replace(pathname, { scroll: false }); }}
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

          {/* Buscador + chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('msgSearchPlaceholder')}
                className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-8 py-1.5 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label={t('msgClearSearch')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            {folder !== 'sent' && <FilterPill active={soloSinLeer} onClick={() => setSoloSinLeer((v) => !v)} label={t('msgOnlyUnread')} />}
            <FilterPill active={soloUrgentes} onClick={() => setSoloUrgentes((v) => !v)} label={t('msgOnlyUrgent')} />
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
              {rows?.map((th) => {
                const activo = abierto?.id === th.id;
                const estado = folder === 'sent' ? estadoEnviado(th) : null;
                return (
                  <div
                    key={th.id}
                    className={`group relative flex items-start gap-3 px-4 py-3 border-b border-row-sep last:border-0 transition-colors ${
                      activo ? 'bg-brand/[0.06]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <button type="button" onClick={() => { void abrir(th.id); }} aria-current={activo ? 'true' : undefined} className="flex-1 min-w-0 flex items-start gap-3 text-left">
                      {/* El punto es la única marca de no leído: negrita en toda la fila
                          hacía que una bandeja llena se leyera como un bloque. */}
                      <span
                        className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${th.unread && folder !== 'sent' ? 'bg-brand' : 'bg-transparent'}`}
                        aria-label={th.unread ? t('msgUnread') : undefined}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`text-sm truncate ${th.unread && folder !== 'sent' ? 'font-semibold text-text-1' : 'text-text-2'}`}>
                            {th.lastFromMe ? t('msgYouPrefix', { name: th.lastFrom }) : th.lastFrom}
                          </span>
                          <span className="text-[11px] text-text-muted font-mono shrink-0">{fechaHora(th.lastEntryAt, loc)}</span>
                        </div>
                        <div className={`text-[12.5px] truncate ${th.unread && folder !== 'sent' ? 'text-text-1' : 'text-text-2'}`}>{th.subject}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {th.priority === 'URGENT' && <AlertCircle className="w-3 h-3 text-rose shrink-0" aria-label={t('msgUrgent')} />}
                          {th.caseCode && <TagPill label={th.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />}
                          {estado
                            ? <TagPill label={estado.label} colorClass={estado.cls} />
                            : th.type === 'REFERRAL'
                              ? <TagPill label={th.referralStatus === 'CREATED' ? t('refStatusCreated') : t('refStatusPending')} colorClass={th.referralStatus === 'CREATED' ? 'bg-emerald/15 text-emerald border-emerald/30' : DESK_PILL.REFERRALS} />
                              : th.desk && <TagPill label={t(`desk_${th.desk}`)} colorClass={DESK_PILL[th.desk]} />}
                          {th.patientName && <span className="text-[11px] text-text-muted truncate">{th.patientName}</span>}
                          {th.attachments > 0 && <Paperclip className="w-3 h-3 text-text-muted shrink-0" aria-label={t('msgAttachments', { n: th.attachments })} />}
                          {th.entries > 1 && <span className="text-[11px] text-text-muted">· {t('msgEntries', { n: th.entries })}</span>}
                        </div>
                      </div>
                    </button>
                    {/* Archivar / desarchivar sin abrir el hilo. */}
                    <div className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
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
          </div>
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
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={volver} className="lg:hidden flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-1 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('msgBack')}
                </button>
                <span className="hidden lg:block" />
                <Button variant="secondary" size="sm" disabled={archivando} onClick={() => { void archivar(abierto.id, !abierto.archived); }}>
                  {abierto.archived ? <ArchiveRestore /> : <Archive />}
                  {t(abierto.archived ? 'msgUnarchive' : 'msgArchive')}
                </Button>
              </div>

              {/* Cabecera: asunto y contexto del expediente */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h2 className="text-text-1 font-semibold leading-snug">{abierto.subject}</h2>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {abierto.priority === 'URGENT' && <TagPill label={t('msgUrgent')} colorClass="bg-rose/10 text-rose border-rose/30" />}
                    {abierto.type === 'REFERRAL' ? (
                      <TagPill
                        label={abierto.referral?.status === 'CREATED' ? t('refStatusCreated') : t('refStatusPending')}
                        colorClass={abierto.referral?.status === 'CREATED' ? 'bg-emerald/15 text-emerald border-emerald/30' : DESK_PILL.REFERRALS}
                      />
                    ) : abierto.desk && <TagPill label={t(`desk_${abierto.desk}`)} colorClass={DESK_PILL[abierto.desk]} />}
                    {abierto.caseCode && <TagPill label={abierto.caseCode} colorClass="bg-brand/15 text-brand-text border-brand/30" mono />}
                  </div>
                </div>
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
