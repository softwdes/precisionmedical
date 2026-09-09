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

import { useState, useEffect, useCallback } from 'react';
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
  encender: () => Promise<void>;
  /** Da de baja la suscripción de este navegador. */
  apagar: () => Promise<void>;
}

export function usePushAvisos(): AvisosControl {
  const t = useTranslations();
  const [estado, setEstado] = useState<EstadoAvisos>('cargando');
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
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      if (!reg) {
        setEstado('no-soportado');
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

  const encender = useCallback(async (): Promise<void> => {
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
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveABytes(clavePublica),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        // El motivo del servidor va a la consola con el host del endpoint: sin
        // eso, un navegador cuyo endpoint no se acepta se ve como "el botón no
        // se enciende" y no hay forma de saber por qué sin adivinar. Le costó
        // un ida y vuelta entero a la versión del back-office (Samsung, 9-sep).
        const detalle = await res.text().catch(() => '');
        throw new Error(`alta rechazada (${res.status}) ${detalle} · endpoint: ${new URL(sub.endpoint).hostname}`);
      }

      setEstado('encendido');
      anunciarCambio();
      toast.success(t('push.onDone'));
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

  return { estado, trabajando, encender, apagar };
}
