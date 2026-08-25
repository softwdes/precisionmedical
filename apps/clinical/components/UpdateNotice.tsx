'use client';

/**
 * Banner "Actualizar" + aviso de qué cambió, para clinical.
 *
 * La audiencia sale de la RUTA, no del deploy: clinical sirve al doctor
 * (`/doctor`, `/visit`) y al mostrador (`/checkin`, `/triage`), y las notas de
 * cada uno son distintas. El layout raíz es común a todas, así que se resuelve
 * con `usePathname()` en vez de montar el componente cuatro veces.
 *
 * El diálogo se escribe ACÁ y no en `@precision/release` porque el `content` de
 * Tailwind de esta app no incluye `packages/**`: una clase de utilidad escrita
 * en el paquete no se generaría. Por eso el banner compartido usa estilos
 * inline y este diálogo usa clases — cada uno donde funciona.
 *
 * Pensado para iPad, que es donde vive esta app.
 */

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles, Wrench, X } from 'lucide-react';
import { UpdateBanner, type Audience } from '@precision/release';
import { useReleaseNotes } from '@precision/release/notes';

/**
 * Ruta → audiencia. `/triage` lo cargan las MAs pero el doctor también lo lee,
 * y la nota le sirve a los dos; se resuelve como `clinic` porque es la
 * audiencia del mostrador, que es quien lo usa a diario.
 */
function audienceFor(pathname: string): Audience {
  if (pathname.startsWith('/visit') || pathname.startsWith('/doctor')) return 'doctor';
  return 'clinic';
}

export function UpdateNotice(): React.ReactElement | null {
  const pathname = usePathname();
  const t = useTranslations('updateBanner');

  // Login y no-access no son de nadie todavía: sin sesión el changelog no
  // responde, y el banner ahí sólo sería ruido.
  if (pathname.startsWith('/login') || pathname.startsWith('/no-access')) return null;

  return (
    <>
      <UpdateBanner
        audience={audienceFor(pathname)}
        labels={{ available: t('available'), apply: t('apply'), applying: t('applying') }}
      />
      <ReleaseNotesDialog />
    </>
  );
}

function ReleaseNotesDialog(): React.ReactElement | null {
  const { modules, count, dismiss } = useReleaseNotes();
  const t = useTranslations('phoenix.releaseNotes');

  if (modules.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      onClick={dismiss}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-bg-1 shadow-2xl"
      >
        <div className="flex items-start gap-2 bg-gradient-brand px-4 py-3 text-white sm:px-6">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">{t('title')}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug opacity-85">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            aria-label={t('dismiss')}
            onClick={dismiss}
            className="shrink-0 rounded-full bg-white/15 p-1.5 transition-colors hover:bg-white/25"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-3 sm:px-6">
          {modules.map((group) => (
            <div key={group.module} className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {group.moduleLabel}
              </p>
              <div className="space-y-2 rounded-md bg-bg-2/40 p-3">
                {group.notes.map((note) => (
                  <div key={note.id} className="flex items-start gap-2">
                    {note.kind === 'FEAT' ? (
                      <Sparkles className="mt-1 h-3 w-3 shrink-0 text-brand" strokeWidth={2.5} />
                    ) : (
                      <Wrench className="mt-1 h-3 w-3 shrink-0 text-violet" strokeWidth={2.5} />
                    )}
                    <p className="text-[12.5px] leading-relaxed text-text-1">{note.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2 px-4 py-3 sm:flex-row sm:px-6">
          <span className="text-[11px] text-text-muted sm:mr-auto">{t('count', { count })}</span>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-md bg-gradient-brand px-4 py-2 text-[12px] font-bold text-white sm:w-auto"
          >
            {t('dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
