'use client';

/**
 * Estado de los avisos al celular, compartido por sus DOS caras.
 *
 * Puerto del que ya funciona en `apps/back-office/lib/push-avisos.ts`. Se copió
 * en vez de compartirse porque las dos apps difieren justo en lo que este
 * archivo toca: el toast (acá `sonner`, allá el primitivo `ui-phoenix`) y el
 * i18n (acá claves planas, allá el namespace `phoenix.topbar`). Extraer un
 * paquete para eso habría dejado un helper con dos ramas y ninguna de las dos
 * app la usaría entera.
 *
 * ── Lo que SÍ es compartido, y por eso no se toca ───────────────────────────
 *
 * La suscripción se guarda en `push_subscriptions` de **Phoenix**, contra el id
 * de Phoenix de la persona. Es la misma tabla que lee el cron
 * `alertas-admin` del back-office, y por eso encender esto desde el Admin sirve
 * de algo: el aviso lo manda aquella app, no esta. Ver la ruta
 * `/api/push/subscribe`, que resuelve el puente por email.
 *
 * La clave VAPID también tiene que ser la MISMA de back-office: el navegador
 * ata la suscripción a la clave pública con la que se creó, y quien empuja
 * firma con la privada que le corresponde. Con claves distintas la suscripción
 * se crea igual y el envío falla después, en silencio.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export type EstadoAvisos =
  | 'cargando'
  | 'no-soportado'
  | 'apagado'
  | 'encendido'
  | 'bloqueado';

/** Alguien encendió o apagó los avisos: la otra cara del control se refresca. */
export const PUSH_AVISOS_EVENT = 'pm:push-avisos';

function anunciarCambio(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PUSH_AVISOS_EVENT));
}

/**
 * La clave pública VAPID viaja como bytes, no como texto: `subscribe()` pide un
 * Uint8Array y el navegador la sirve en base64url (con `-` y `_`).
 *
 * El tipo de retorno lleva `<ArrayBuffer>` explícito: `applicationServerKey`
 * exige un buffer propio, y un `Uint8Array` sin parametrizar puede estar
 * respaldado por un `SharedArrayBuffer`, que TypeScript rechaza ahí.
 */
function claveABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(normal);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

export interface AvisosControl {
  estado: EstadoAvisos;
  trabajando: boolean;
  /** Pide el permiso y suscribe este navegador. */
  encender: (opts?: { rehacer?: boolean }) => Promise<void>;
  /** Da de baja la suscripción de este navegador. */
  apagar: () => Promise<void>;
  /**
   * Rehace la suscripción de este navegador: la borra y la crea de nuevo.
   *
   * Es la salida manual para cuando los avisos dejan de llegar sin que nada lo
   * diga. Pasa de verdad: Chrome rota la suscripción por su cuenta, o alguien
   * desinstala y reinstala la app, y la fila guardada queda apuntando a un
   * endpoint muerto que FCM sigue aceptando sin error. En la base se ve sana.
   *
   * Apagar y volver a prender NO alcanza: `subscribe()` devuelve la MISMA
   * suscripción que ya existe. Por eso esto da de baja primero.
   */
  reactivar: () => Promise<void>;
}

/**
 * Cuánto se espera al Service Worker antes de dar una primera respuesta.
 *
 * No es un "si no llegó, no hay": es cuánto se tolera sin decir nada. Cuando
 * llega tarde, el estado se corrige — ver la nota en `leerEstado`.
 */
const ESPERA_MS = 3000;

export function usePushAvisos(): AvisosControl {
  const t = useTranslations();
  const [estado, setEstado] = useState<EstadoAvisos>('cargando');
  /** El componente sigue montado: la corrección tardía no escribe en un fantasma. */
  const vivo = useRef(true);
  // Se repone en el montaje, no solo se apaga en el desmontaje: con StrictMode
  // el efecto corre dos veces y sin esto quedaba apagado para siempre.
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);
  const [trabajando, setTrabajando] = useState(false);

  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const leerEstado = useCallback(async (): Promise<void> => {
    // Sin SW, sin PushManager o sin claves configuradas no hay nada que
    // ofrecer: el control no se dibuja en vez de prometer algo que no funciona.
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !clavePublica
    ) {
      setEstado('no-soportado');
      return;
    }
    if (Notification.permission === 'denied') {
      setEstado('bloqueado');
      return;
    }
    try {
      /**
       * `serviceWorker.ready` NO rechaza: si no hay Service Worker registrado
       * se queda pendiente para siempre. Sin la carrera contra el reloj, el
       * estado quedaba en 'cargando' eternamente y el control **no se dibujaba
       * nunca**, sin un solo error en consola.
       *
       * En desarrollo pasa siempre —serwist no registra SW con `next dev`—, y
       * pasaría en producción si el registro falla. Vencido el plazo se reporta
       * 'no-soportado', que es la verdad: sin SW no hay avisos posibles.
       */
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), ESPERA_MS)),
      ]);

      if (!reg) {
        /**
         * Vencido el plazo NO se abandona: se sigue escuchando.
         *
         * Acá antes se declaraba 'no-soportado' y se cortaba, y eso escondía el
         * control **durante toda la sesión** en el caso que más importa: la
         * primera visita, cuando el Service Worker todavía se está instalando.
         * Medido en producción el 2026-09-13, `ready` tardó **5,7 segundos** en
         * un escritorio con buena conexión — casi el doble del plazo.
         *
         * El que recién instala la app es justo el que no va a ver el botón, y
         * el síntoma es mudo: no hay error, el icono simplemente no está.
         *
         * Así que el plazo sigue existiendo para no dejar la barra en blanco
         * mientras se decide, pero cuando el SW por fin queda activo el estado
         * se corrige solo.
         */
        setEstado('no-soportado');
        void navigator.serviceWorker.ready.then(async (tardio) => {
          if (!vivo.current) return;
          const sub = await tardio.pushManager.getSubscription().catch(() => null);
          setEstado(sub ? 'encendido' : 'apagado');
        });
        return;
      }

      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? 'encendido' : 'apagado');
    } catch {
      setEstado('apagado');
    }
  }, [clavePublica]);

  useEffect(() => {
    void leerEstado();
    const onCambio = (): void => { void leerEstado(); };
    window.addEventListener(PUSH_AVISOS_EVENT, onCambio);
    return () => window.removeEventListener(PUSH_AVISOS_EVENT, onCambio);
  }, [leerEstado]);

  const encender = useCallback(async (opts?: { rehacer?: boolean }): Promise<void> => {
    if (!clavePublica) return;
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'apagado');
        anunciarCambio();
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      /**
       * Rehacer: se da de baja la suscripción actual ANTES de crear la nueva.
       *
       * Sin esto, `subscribe()` devuelve la MISMA suscripción que ya existe
       * —incluida la que quedó muerta tras un desinstalar/reinstalar— y el
       * problema no se mueve. Se avisa al servidor primero: si el `unsubscribe`
       * fallara después, la fila muerta ya está borrada y no queda basura
       * recibiendo envíos al vacío.
       */
      if (opts?.rehacer) {
        const vieja = await reg.pushManager.getSubscription();
        if (vieja) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: vieja.endpoint }),
          }).catch(() => undefined);
          await vieja.unsubscribe().catch(() => undefined);
        }
      }

      const crear = (): Promise<PushSubscription> => reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveABytes(clavePublica),
      });

      /**
       * Si ya hay una suscripción atada a OTRA clave pública, se rehace sola.
       *
       * El navegador se niega a crear una segunda suscripción con una
       * `applicationServerKey` distinta de la que usó la primera: tira
       * `InvalidStateError` y ahí muere. Y pasa de verdad — el 2026-09-13 medí
       * las dos claves en producción y **no coincidían**: el Admin firmaba con
       * una y la clínica con otra. El día que se empareja una de las dos, todo
       * el que ya había aceptado queda atado a la clave vieja.
       *
       * Sin esto la persona queda en un callejón: le sale "no se pudieron
       * cambiar los avisos" cada vez, y la única salida sería borrar los datos
       * del sitio — que nadie hace ni tiene por qué saber.
       *
       * Así que ante CUALQUIER fallo del alta se mira si hay una vieja, se la
       * da de baja (avisándole al servidor primero, para no dejar una fila
       * apuntando a un endpoint muerto) y se intenta una sola vez más. Si vuelve
       * a fallar, se propaga: dos intentos ya no son un problema de estado.
       */
      let sub: PushSubscription;
      try {
        sub = await crear();
      } catch (e) {
        const vieja = await reg.pushManager.getSubscription();
        if (!vieja) throw e;

        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: vieja.endpoint }),
        }).catch(() => undefined);
        await vieja.unsubscribe().catch(() => undefined);

        sub = await crear();
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      /**
       * Si el servidor no la guardó, la suscripción del navegador NO se queda.
       *
       * Es el detalle que convirtió un error en un bug mudo: el navegador ya
       * había creado la suscripción, el servidor fallaba, y al releer el estado
       * el control la encontraba y lo daba por ENCENDIDO. En el Admin, encendido
       * esconde el icono — así que la persona veía un error, el botón
       * desaparecía, y quedaba en el peor lugar posible: parece activado y no
       * puede llegar nada, porque el servidor no sabe que existe.
       *
       * Reportado en el teléfono (Erick, 2026-09-13). Se deshace la suscripción
       * para que el estado diga la verdad y el botón siga estando.
       */
      const deshacer = async (): Promise<void> => {
        await sub.unsubscribe().catch(() => undefined);
        setEstado('apagado');
        anunciarCambio();
      };

      if (!res.ok) {
        // El motivo del servidor va a la consola con el host del endpoint: sin
        // eso, un navegador cuyo endpoint no se acepta se ve como "el botón no
        // se enciende" y no hay forma de saber por qué sin adivinar. Le costó
        // un ida y vuelta entero a la versión del back-office (Samsung, 9-sep).
        const detalle = await res.text().catch(() => '');
        /**
         * El 409 tiene su propio cartel porque tiene ARREGLO y lo hace la
         * persona: significa que su cuenta todavía no existe en la base de la
         * clínica, y se provisiona sola entrando una vez al back-office. Con el
         * "no se pudieron cambiar los avisos" genérico veía un botón que no
         * prende y el motivo se quedaba en la consola — la misma lección del
         * Samsung, repetida en la otra app.
         */
        if (res.status === 409) {
          await deshacer();
          toast.error(t('push.noClinicAccount'));
          return;
        }
        await deshacer();
        throw new Error(`alta rechazada (${res.status}) ${detalle} · endpoint: ${new URL(sub.endpoint).hostname}`);
      }

      setEstado('encendido');
      anunciarCambio();
      toast.success(opts?.rehacer ? t('push.redone') : t('push.onDone'));
    } catch (e) {
      console.error('[push] alta falló', e);
      toast.error(t('push.error'));
    } finally {
      setTrabajando(false);
    }
  }, [clavePublica, t]);

  const apagar = useCallback(async (): Promise<void> => {
    setTrabajando(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Primero el servidor: si se desuscribe el navegador y falla el borrado,
        // queda una fila que va a recibir 410 en el próximo envío. Al revés no
        // se pierde nada.
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setEstado('apagado');
      anunciarCambio();
      toast.info(t('push.offDone'));
    } catch (e) {
      console.error('[push] baja falló', e);
      toast.error(t('push.error'));
    } finally {
      setTrabajando(false);
    }
  }, [t]);

  const reactivar = useCallback(async (): Promise<void> => {
    await encender({ rehacer: true });
  }, [encender]);

  return { estado, trabajando, encender, apagar, reactivar };
}
