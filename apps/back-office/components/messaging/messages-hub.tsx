'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Inbox, Scale, Trash2 } from 'lucide-react';
import { InboxClient } from './inbox-client';
import { FirmRequestsClient } from './firm-requests-client';
import { DeletedThreadsClient } from './deleted-threads-client';

/**
 * /messages · dos pestañas: la bandeja propia y —solo admin— TODOS los pedidos
 * que mandaron los bufetes.
 *
 * La "bandeja ajena" es por PERSONA; para ver lo que pidieron los bufetes había
 * que abrir la de Edson, después la de Beatriz, y adivinar por el `[Bufete]`
 * del asunto. La segunda pestaña mira el origen (`firmId`) y el escritorio.
 *
 * La pestaña vive en `?view=firms` para que un link a la vista llegue a la
 * vista, y para que `?case=` (el caso abierto encima) no la pierda al volver.
 */
export function MessagesHub({ currentUserId, currentUserName, isAdmin, canSeeFirmRequests = isAdmin, clinics = [] }: {
  currentUserId: string;
  currentUserName: string;
  isAdmin: boolean;
  /** Pestaña "Pedidos de bufetes": admin por rol o la casilla opt-in. */
  canSeeFirmRequests?: boolean;
  clinics?: Array<{ id: string; name: string }>;
}): React.ReactElement {
  const t = useTranslations('phoenix.messaging');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  /**
   * Las dos pestañas de admin van juntas bajo el mismo permiso: quien puede ver
   * lo que piden los bufetes es quien revisa lo que se elimino.
   */
  const pedida = sp.get('view');
  const view: 'inbox' | 'firms' | 'deleted' =
    canSeeFirmRequests && (pedida === 'firms' || pedida === 'deleted') ? pedida : 'inbox';

  function ir(v: 'inbox' | 'firms' | 'deleted'): void {
    const next = new URLSearchParams(sp.toString());
    if (v === 'inbox') next.delete('view'); else next.set('view', v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div>
      {canSeeFirmRequests && (
        <div className="px-4 sm:px-6 pt-4">
          <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar border-b border-border" role="tablist">
            {([
              { id: 'inbox', icon: Inbox, label: t('hubInbox') },
              { id: 'firms', icon: Scale, label: t('hubFirmRequests') },
              { id: 'deleted', icon: Trash2, label: t('hubDeleted') },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => ir(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                    active ? 'bg-gradient-brand text-white shadow-glow' : 'text-text-2 hover:text-text-1 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'firms' ? (
        <FirmRequestsClient currentUserId={currentUserId} clinics={clinics} />
      ) : view === 'deleted' ? (
        <DeletedThreadsClient />
      ) : (
        <InboxClient currentUserId={currentUserId} currentUserName={currentUserName} isAdmin={isAdmin} />
      )}
    </div>
  );
}
