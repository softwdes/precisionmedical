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

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { InboxClient } from './inbox-client';

interface BadgeInfo {
  total: number;
  unread: number;
  urgentUnread: number;
  userId: string;
  isAdmin: boolean;
}

const POLL_MS = 45_000;

export function InboxBell(): React.ReactElement | null {
  const t = useTranslations('phoenix.messaging');

  const [badge, setBadge] = useState<BadgeInfo | null>(null);
  const [open, setOpen] = useState(false);

  const refreshBadge = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/messages/badge');
      if (res.ok) setBadge(await res.json());
    } catch { /* informativo: si falla, el badge no cambia */ }
  }, []);

  useEffect(() => {
    void refreshBadge();
    const id = setInterval(() => void refreshBadge(), POLL_MS);
    const onFocus = () => void refreshBadge();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
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
              ? 'border-brand/40 bg-brand/10 text-text-1 hover:bg-brand/20'
              : 'border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5'
        }`}
      >
        <Mail className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('bellTitle')}</span>
        <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${
          hasUrgent
            ? 'bg-rose text-white'
            : unread > 0
              ? 'bg-brand text-white'
              : 'bg-bg-1 text-text-muted border border-border'
        }`}>
          {unread}/{total}
        </span>
      </button>

      {/* El overlay grande del legacy: inbox completo dentro del modal */}
      {badge && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) void refreshBadge(); }}>
          {/* h fijo (no max-h): el overlay del legacy es grande SIEMPRE, aunque
              la bandeja esté vacía — la tabla respira y no baila al filtrar. */}
          <DialogContent className="max-w-6xl p-0 h-[85vh] flex flex-col">
            <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border">
              <DialogTitle className="flex items-center gap-2 flex-wrap text-text-1 text-base font-semibold">
                <Mail className="w-4 h-4 text-brand" />
                {t('bellTitle')}
                {hasUrgent && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-rose/10 border border-rose/30 text-rose">
                    {t('bellUrgentPill', { count: urgent })}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              {/* key: al reabrir, recarga con el estado fresco del badge */}
              {open && (
                <InboxClient
                  embedded
                  currentUserId={badge.userId}
                  currentUserName=""
                  isAdmin={badge.isAdmin}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
