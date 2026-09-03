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

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, Check } from 'lucide-react';
import { SideDrawer } from '@/components/ui-phoenix';
import type { ReleaseNote } from '@precision/release/types';
import { ReleaseTimeline } from './release-timeline';

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
  notes: ReleaseNote[];
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
  /**
   * "Al dia" con la historia escondida detras de un boton.
   *
   * Sin esto, alguien que ya leyo todo abre el panel y ve quince modulos
   * plegados de cosas que ya vio: tecnicamente ordenado, pero no se siente
   * limpio. Con nada nuevo, el panel no deberia tener nada que mostrar.
   */
  const [verHistorial, setVerHistorial] = useState(false);

  /**
   * `open` se lee por REF y no entra en las dependencias del efecto.
   *
   * Estaba en el array y eso rompia justo lo que el guardia queria evitar: al
   * abrir el panel, `open` cambiaba, el efecto se volvia a montar y su primera
   * linea —`void cargar()`— disparaba una consulta nueva. Como el `POST /seen`
   * ya habia sellado la marca, la respuesta volvia con todo en `isNew: false`,
   * `hayNuevas` pasaba a falso y el panel saltaba a "Al dia" a los dos segundos,
   * con el usuario mirando. Reporte de Erick el 2026-09-02: "mostraba 5, le di
   * clic, se vio el contenido dos segundos y desaparecio".
   *
   * Con la ref, el intervalo y el `focus` leen el valor actual sin obligar al
   * efecto a re-ejecutarse.
   */
  const abiertoRef = useRef(open);
  useEffect(() => { abiertoRef.current = open; }, [open]);

  const cargar = useCallback(async (): Promise<void> => {
    /**
     * Con el panel abierto NO se pisa lo que el usuario esta leyendo.
     *
     * El guardia vive aca y no en cada llamador a proposito: ya se rompio una vez
     * por olvidarlo en uno solo —`open` entro en las dependencias del efecto y el
     * remontaje disparo una consulta— y el sintoma fue que el contenido se
     * mostraba dos segundos y saltaba a "Al dia". Adentro de la funcion no hay
     * llamador que pueda saltearselo.
     */
    if (abiertoRef.current) return;

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
    // Con el panel ABIERTO no se vuelve a consultar: la marca ya se sello, asi
    // que una respuesta nueva apagaria las negritas mientras se leen.
    const id = setInterval(() => { if (!abiertoRef.current) void cargar(); }, POLL_MS);
    const onFocus = (): void => { if (!abiertoRef.current) void cargar(); };
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
  /**
   * Sale de las banderas de las notas y NO de `unseen`, que se pone en cero
   * apenas se abre el panel: si dependiera de el, "Al dia" aparecia de golpe
   * tapando lo que el usuario acababa de abrir para leer.
   */
  const hayNuevas = (data?.notes ?? []).some((n) => n.isNew);
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
        <Bell className="w-4 h-4" aria-hidden="true" />
        {/*
          El contador va en rojo, igual que el del admin.

          Al principio lo puse apagado para no competir con el sobre de
          Mensajes, pero ese razonamiento estaba mal: el sobre es un SOBRE y
          esto es una CAMPANA, asi que ya no compiten por color sino que se
          distinguen por forma. Lo que SI queda reservado para lo urgente es
          el MOVIMIENTO: el sobre entero pulsa cuando hay un urgente sin leer,
          este nunca. Rojo quieto contra rojo que late si es una jerarquia que
          se lee de un vistazo.
        */}
        {unseen > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-rose text-white text-[9px] font-bold flex items-center justify-center tabular-nums"
          >
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      <SideDrawer
        open={open}
        onClose={() => { setOpen(false); setVerHistorial(false); }}
        title={t('panelTitle')}
        icon={<Bell className="h-4 w-4 text-text-2 shrink-0" />}
        closeLabel={t('panelClose')}
        /*
          El pie lleva el total y no un boton. El admin tiene ahi "marcar
          todas como leidas", pero aca seria un adorno: el panel sella la
          marca solo al abrirse, asi que ese boton no tendria nada que hacer.
        */
        footer={
          <span className="text-[11px] text-text-muted">
            {data === null ? '' : t('count', { count: data.count })}
          </span>
        }
      >
        <p className="px-4 pt-3 pb-1 text-[12px] text-text-2">{t('panelSubtitle')}</p>

        {fallo ? (
          <div className="px-4 py-6 text-[12.5px] text-text-2">{t('panelError')}</div>
        ) : data === null ? (
          <div className="px-4 py-6 text-[12.5px] text-text-muted">{t('panelLoading')}</div>
        ) : data.notes.length === 0 ? (
          <div className="px-4 py-6 text-[12.5px] text-text-2">{t('panelEmpty')}</div>
        ) : hayNuevas || verHistorial ? (
          <ReleaseTimeline
            notes={data.notes}
            labels={{ today: t('today'), yesterday: t('yesterday') }}
          />
        ) : (
          <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
            <Check className="w-7 h-7 text-emerald opacity-70" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-semibold text-text-1">{t('seenAll')}</p>
              <p className="text-[11.5px] text-text-muted mt-0.5">{t('panelUpToDateHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => setVerHistorial(true)}
              className="text-[11.5px] font-semibold text-brand-text hover:underline"
            >
              {t('panelSeeRecent')}
            </button>
          </div>
        )}
      </SideDrawer>
    </>
  );
}
