'use client';

/**
 * InboxBell — el botón "Mensajes (no leídos/total)" del top bar (M1 F2),
 * calcado del `Msgs (67/178)` del legacy: etiqueta + contador SIEMPRE
 * visibles, no un iconito. Con al menos un URGENTE sin leer, el botón entero
 * pulsa en rojo — y como color/animación solos no bastan (a11y), el
 * aria-label y el tooltip lo dicen en texto.
 *
 * Clic → modal GRANDE con el inbox completo (InboxClient embebido: filtros,
 * select "bandeja de…", checkboxes, paginación) — el overlay del legacy.
 * Polling ligero a /api/messages/badge (~45s + al volver el foco).
 *
 * Compartido por el módulo Clínica y el portal Doctor vía el Topbar común.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Mail, Volume2, VolumeX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { useToast } from '@/components/ui-phoenix/toast';
import { CASE_PARAM, conCasoAbierto } from '@/lib/case-modal-url';
import { playInboxChime, inboxSoundMuted, setInboxSoundMuted } from './notification-sound';
import { InboxClient } from './inbox-client';
import { MESSAGES_READ_EVENT } from './thread-view-dialog';

/**
 * Pantallas que montan <CaseUrlModal> y por lo tanto pueden abrir un caso con
 * `?case=`. El sobre vive en el layout —que no recibe los parámetros de la
 * URL— así que no puede montarlo él mismo: navega a una pantalla que sí puede.
 * Estando ya en una de estas, se queda donde está para no mover al usuario.
 */
const PANTALLAS_CON_CASO = [
  '/patients', '/calendar', '/messages',
  '/doctor/patients', '/doctor/calendar', '/doctor/messages',
];

interface BadgeInfo {
  total: number;
  unread: number;
  urgentUnread: number;
  latestAuthor: string | null;
  userId: string;
  isAdmin: boolean;
}

/**
 * 20s y no 45s: el reporte de los usuarios ("la llegada no es notoria") era en
 * buena parte un problema de RETARDO — el mensaje llegaba y el contador tardaba
 * hasta 45 segundos en enterarse, así que el cambio ocurría cuando nadie
 * miraba. Es una sola consulta agregada, sin filas.
 *
 * El paso natural cuando haga falta es tiempo real (Realtime/SSE) y sacar el
 * sondeo; con 20s el aviso ya se siente inmediato.
 */
const POLL_MS = 20_000;

/** Cuánto dura el parpadeo de llegada antes de quedarse quieto. */
const BLINK_MS = 9_000;

export function InboxBell(): React.ReactElement | null {
  const t = useTranslations('phoenix.messaging');

  const [badge, setBadge] = useState<BadgeInfo | null>(null);
  const [unlinked, setUnlinked] = useState(false);
  const [open, setOpen] = useState(false);
  /**
   * El hilo abierto vive ACÁ y no dentro del inbox: el Dialog desmonta su
   * contenido al replegarse (mientras el caso está encima) y el id se perdía —
   * al cerrar el caso volvía el inbox pero sin el mensaje. Este componente vive
   * en el layout y no se desmonta nunca, así que lo recuerda por los dos.
   */
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  // ─── Llegada de mensajes ────────────────────────────────────────────────
  const toast = useToast();
  /** Conteo del sondeo anterior — null hasta la primera respuesta. */
  const prevUnread = useRef<number | null>(null);
  const [justArrived, setJustArrived] = useState(false);
  const blinkTimer = useRef<number | undefined>(undefined);
  const [muted, setMuted] = useState(false);

  // localStorage se lee en el cliente, después del montaje (SSR no lo tiene).
  useEffect(() => { setMuted(inboxSoundMuted()); }, []);
  useEffect(() => () => window.clearTimeout(blinkTimer.current), []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // El sobre vive en el layout, así que sobrevive a la navegación: se puede
  // navegar a una pantalla que monte el caso y el inbox sigue abierto encima.
  const caseModalOpen = !!searchParams.get(CASE_PARAM);
  const openCase = useCallback((caseId: string) => {
    const soportada = PANTALLAS_CON_CASO.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (soportada) {
      router.push(conCasoAbierto(pathname, searchParams, caseId), { scroll: false });
      return;
    }
    const destino = pathname.startsWith('/doctor') ? '/doctor/messages' : '/messages';
    router.push(`${destino}?${CASE_PARAM}=${caseId}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const refreshBadge = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/messages/badge');
      if (res.ok) {
        const data = (await res.json()) as BadgeInfo;
        /**
         * ¿Llegó algo? Se compara contra el conteo ANTERIOR. La primera carga
         * no avisa (prevUnread arranca en null): si no, sonaría un "ding" en
         * cada navegación y cada F5, que es la forma más rápida de que pidan
         * apagar el sonido para siempre.
         */
        const anterior = prevUnread.current;
        if (anterior !== null && data.unread > anterior) {
          const urgente = data.urgentUnread > 0;
          playInboxChime(urgente);
          setJustArrived(true);
          window.clearTimeout(blinkTimer.current);
          blinkTimer.current = window.setTimeout(() => setJustArrived(false), BLINK_MS);
          toast.info(
            data.latestAuthor
              ? t('arrivedFrom', { name: data.latestAuthor })
              : t('arrivedGeneric'),
            { onClick: () => setOpen(true), durationMs: 8000 },
          );
        }
        prevUnread.current = data.unread;
        setBadge(data);
        setUnlinked(false);
        return;
      }
      // 401 = el usuario autenticó pero la app no lo reconoce (no tenía fila en
      // `users`). Ya no debería pasar —resolveActor lo provisiona al vuelo— pero
      // si vuelve a pasar, el botón lo DICE en vez de quedarse inerte.
      if (res.status === 401) setUnlinked(true);
    } catch { /* informativo: si falla, el badge no cambia */ }
  }, [toast, t]);

  useEffect(() => {
    void refreshBadge();
    const id = setInterval(() => void refreshBadge(), POLL_MS);
    const onFocus = () => void refreshBadge();
    // Alguien abrió un hilo (desde el inbox, el paciente, el caso o /messages):
    // el contador —y el rojo del urgente— se actualizan al instante.
    const onRead = () => void refreshBadge();
    window.addEventListener('focus', onFocus);
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(MESSAGES_READ_EVENT, onRead);
    };
  }, [refreshBadge]);

  const unread = badge?.unread ?? 0;
  const total = badge?.total ?? 0;
  const urgent = badge?.urgentUnread ?? 0;
  const hasUrgent = urgent > 0;
  const label = hasUrgent
    ? t('bellUrgentLabel', { count: urgent })
    : t('bellLabel', { count: unread });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-semibold transition-colors ${
          hasUrgent
            ? 'border-rose/50 bg-rose/15 text-rose animate-pulse'
            : unread > 0
              ? 'border-emerald/40 bg-emerald/10 text-text-1 hover:bg-emerald/20'
              : 'border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5'
        } ${
          /* Parpadeo TRANSITORIO de llegada: 9 segundos y se queda quieto. Un
             número que cambia de 0/13 a 1/13 no lo nota nadie; una animación
             permanente cansa y le roba el significado al rojo del urgente.
             Esto avisa en el momento y después desaparece. */
          justArrived && !hasUrgent ? 'animate-pulse ring-2 ring-emerald/50' : ''
        }`}
      >
        <Mail className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('bellTitle')}</span>
        {/* Pastilla RELLENA: es la única mancha de color saturado de la barra
            y por eso se lee de un vistazo sin necesidad de animarla. El
            movimiento queda reservado para lo urgente — si todo parpadea,
            nada parpadea. */}
        <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${
          hasUrgent
            ? 'bg-rose text-white'
            : unread > 0
              ? 'bg-emerald text-black'
              : 'bg-bg-1 text-text-muted border border-border'
        }`}>
          {unread}/{total}
        </span>
      </button>

      {/* El overlay grande del legacy: inbox completo dentro del modal.
          Se monta SIEMPRE — antes dependía de que el badge hubiera cargado, y
          un 401 dejaba el botón sin respuesta: parecía que "solo el admin podía
          abrirlo". Si la identidad no se resuelve, el modal lo explica. */}
      {/* Se repliega mientras el caso está encima, sin desmontarse: al cerrar
          el caso el inbox y el hilo vuelven como estaban. */}
      <Dialog open={open && !caseModalOpen}
        onOpenChange={(v) => { if (caseModalOpen) return; setOpen(v); if (!v) void refreshBadge(); }}>
          {/* h fijo (no max-h): el overlay del legacy es grande SIEMPRE, aunque
              la bandeja esté vacía — la tabla respira y no baila al filtrar. */}
          <DialogContent className="max-w-6xl p-0 h-[85vh] flex flex-col">
            <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border">
              <DialogTitle className="flex items-center gap-2 flex-wrap text-text-1 text-base font-semibold">
                <Mail className="w-4 h-4 text-brand-text" />
                {t('bellTitle')}
                {hasUrgent && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-rose/10 border border-rose/30 text-rose">
                    {t('bellUrgentPill', { count: urgent })}
                  </span>
                )}
                {/* Silenciar el aviso sonoro. Vive acá porque es donde el
                    usuario va cuando el sonido le molesta; se recuerda por
                    navegador (localStorage), no es una preferencia de cuenta. */}
                <button
                  type="button"
                  onClick={() => { const v = !muted; setMuted(v); setInboxSoundMuted(v); if (!v) playInboxChime(); }}
                  title={muted ? t('soundOff') : t('soundOn')}
                  aria-label={muted ? t('soundOff') : t('soundOn')}
                  className="ml-auto p-1.5 rounded text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              {open && badge ? (
                <InboxClient
                  embedded
                  currentUserId={badge.userId}
                  currentUserName=""
                  isAdmin={badge.isAdmin}
                  onOpenCase={openCase}
                  openThreadId={openThreadId}
                  onOpenThreadChange={setOpenThreadId}
                />
              ) : open && unlinked ? (
                <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                  {t('bellUnlinked')}
                </div>
              ) : (
                <div className="text-text-muted text-sm">{t('loading')}</div>
              )}
            </div>
          </DialogContent>
      </Dialog>
    </>
  );
}
