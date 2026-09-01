'use client';

/**
 * ReleaseBell — "Novedades del sistema" en la barra superior.
 *
 * Reemplaza el boton de campana que estaba ahi de adorno: sin `onClick`, sin
 * consultar nada, con un `2` escrito en duro que ningun usuario podia apagar
 * —incluido el `aria-label`, que le leia "2 sin leer" al lector de pantalla
 * siempre. Y como los tres portales montan el mismo `AdminShell`, ese `2`
 * fantasma se veia igual en clinica, en el portal medico y en el legal.
 *
 * Lo que muestra son las notas de release: lo que fuimos cambiando, agrupado por
 * modulo y filtrado por audiencia. Hasta ahora eso solo existia en el modal que
 * salta UNA vez despues de apretar "Actualizar" y que se autodestruye —
 * `useReleaseNotes` borra la marca ANTES de pintar—, asi que quien lo cerraba
 * sin leer perdia esa informacion para siempre. Este panel es su casa
 * permanente: el modal pasa a ser un atajo, no la unica oportunidad.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@precision/ui';
import type { ReleaseModuleGroup } from '@precision/release/types';
import { ReleaseNotesContent } from '@/components/ui-phoenix/release-notes-dialog';

/**
 * Cada cuanto se vuelve a preguntar.
 *
 * 10 minutos y no 20 segundos como el sobre de mensajes: un mensaje de un
 * companero es urgente y una nota de release no. Ademas se refresca al volver a
 * la pestaña, que es cuando de verdad importa —quien deja la app abierta toda la
 * tarde se entera al volver, sin sondear de gusto mientras no mira.
 */
const POLL_MS = 10 * 60 * 1000;

interface InboxResponse {
  audience: string;
  unseen: number;
  count: number;
  modules: ReleaseModuleGroup[];
  debut: boolean;
}

/**
 * En que portal esta parado el usuario.
 *
 * Sale del pathname porque el layout no recibe la URL y este componente vive
 * dentro del layout. Es una PISTA para el server, no una decision: la ruta la
 * valida contra la sesion con `resolverAudiencia()` y cae a la audiencia
 * principal si no corresponde. Un abogado que mande `admin` recibe `attorney`.
 */
function portalDe(pathname: string): 'admin' | 'doctor' | 'attorney' {
  if (pathname.startsWith('/doctor')) return 'doctor';
  if (pathname.startsWith('/attorney')) return 'attorney';
  return 'admin';
}

export function ReleaseBell(): React.ReactElement {
  const t = useTranslations('phoenix.releaseNotes');
  const pathname = usePathname();
  const portal = portalDe(pathname);

  const [data, setData] = useState<InboxResponse | null>(null);
  const [fallo, setFallo] = useState(false);
  const [open, setOpen] = useState(false);

  const cargar = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/changelog/inbox?portal=${portal}`, { cache: 'no-store' });
      if (!res.ok) {
        // Ruidoso a proposito. El modal de novedades del portal legal estuvo
        // roto meses porque el middleware le devolvia 403 y el unico sintoma
        // era un warning que nadie miraba.
        console.warn('[release-bell] /api/changelog/inbox respondio', res.status);
        setFallo(true);
        return;
      }
      setData((await res.json()) as InboxResponse);
      setFallo(false);
    } catch {
      setFallo(true);
    }
  }, [portal]);

  useEffect(() => {
    void cargar();
    const id = setInterval(() => void cargar(), POLL_MS);
    const onFocus = (): void => void cargar();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [cargar]);

  /**
   * Se sella al ABRIR, no al cerrar.
   *
   * Quien cierra la pestaña mientras lee igual lo vio, y el costo de
   * equivocarse es cero: la nota no se destruye, sigue en la historia del
   * panel. Es lo contrario de lo que hacia el modal del banner.
   */
  const abrir = (): void => {
    setOpen(true);
    if ((data?.unseen ?? 0) > 0) {
      setData((prev) => (prev === null ? prev : { ...prev, unseen: 0 }));
      void fetch('/api/changelog/seen', { method: 'POST' }).catch(() => {
        /* si falla, el contador vuelve en el proximo sondeo */
      });
    }
  };

  const unseen = data?.unseen ?? 0;
  const etiqueta = unseen > 0 ? t('bellUnseen', { count: unseen }) : t('bellNone');

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={`${t('bellLabel')}, ${etiqueta}`}
        title={etiqueta}
        className="relative w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-text-1 transition-colors"
      >
        <Sparkles className="w-4 h-4" aria-hidden="true" />
        {/*
          El contador NO es rojo y no se anima.
          El rojo de esta barra es del sobre de mensajes, y ahi significa
          "alguien espera una respuesta". Una nota de release no exige nada:
          avisa. Si las dos gritan igual, la que importa deja de leerse — es la
          regla que ya esta escrita en `InboxBell`: si todo parpadea, nada
          parpadea.
        */}
        {unseen > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-brand/25 border border-brand/40 text-brand-text text-[9px] font-bold flex items-center justify-center tabular-nums"
          >
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
            <DialogTitle className="flex items-center gap-2 text-text-1">
              <Sparkles className="w-4 h-4 text-brand shrink-0" />
              {t('panelTitle')}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-text-2">
              {t('panelSubtitle')}
            </DialogDescription>
          </DialogHeader>

          {fallo ? (
            <div className="px-4 sm:px-6 py-6 text-[12.5px] text-text-2">{t('panelError')}</div>
          ) : data === null ? (
            <div className="px-4 sm:px-6 py-6 text-[12.5px] text-text-muted">{t('panelLoading')}</div>
          ) : data.modules.length === 0 ? (
            <div className="px-4 sm:px-6 py-6 text-[12.5px] text-text-2">{t('panelEmpty')}</div>
          ) : (
            <ReleaseNotesContent modules={data.modules} />
          )}

          <div className="flex items-center px-4 sm:px-6 pb-4 sm:pb-6 pt-2">
            <span className="text-[11px] text-text-muted">
              {data === null ? '' : t('count', { count: data.count })}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
