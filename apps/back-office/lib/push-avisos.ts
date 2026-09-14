'use client';

/**
 * Estado de los avisos al celular, compartido por sus DOS caras.
 *
 * El control vive en dos lugares a propósito:
 *
 *   · un botón en la barra superior, SOLO cuando hace falta un clic
 *     (apagado o bloqueado) — ver `PushToggle`
 *   · una fila permanente en el menú del avatar, junto a idioma y tema, que es
 *     donde ya viven las preferencias personales del dispositivo
 *     — ver `PushAvisosMenuItem`
 *
 * Por qué un hook y no estado en cada componente: son dos instancias distintas
 * en el árbol y tienen que verse iguales. Si alguien lo enciende desde la barra,
 * la fila del menú lo tiene que reflejar sin recargar. Se sincronizan con un
 * evento de ventana, el mismo patrón que ya usa `messaging-events` para que el
 * sobre y el menú lateral se enteren entre sí.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui-phoenix/toast';

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
  /**
   * Rehace la suscripción de cero: baja la actual y crea una nueva.
   *
   * Existe por un fallo que NO se puede detectar desde acá. En Android,
   * desinstalar la PWA **no borra los datos del sitio en Chrome**, así que al
   * reinstalar el Service Worker y la suscripción sobreviven. `getSubscription()`
   * devuelve una suscripción, el control se pinta VERDE… y ese endpoint ya no
   * está atado a la app instalada: FCM lo sigue aceptando (`failureCount: 0`,
   * `lastSuccessAt` actualizándose) y al teléfono no llega nada.
   *
   * El verde miente y el código no tiene forma de saberlo: nunca llama a
   * `subscribe()` porque cree que está todo bien. Reportado el 2026-09-09 con la
   * reproducción exacta: instalar, activar, recibir bien, **desinstalar**,
   * reinstalar, activar → verde y nada llega.
   *
   * Un solo toque en vez de "apagá y prendé": pedirle dos pasos a alguien que no
   * sabe por qué no le llegan los avisos es pedirle que adivine, y quedarse a
   * mitad de camino lo deja peor que antes.
   */
  reactivar: () => Promise<void>;
}

export function usePushAvisos(): AvisosControl {
  const t = useTranslations('phoenix.topbar');
  const toast = useToast();
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
       * Pasa siempre en desarrollo (next-pwa apaga el SW con
       * `disable: NODE_ENV === 'development'`), y pasaría en producción si el
       * registro falla. Vencido el plazo se reporta 'no-soportado', que es la
       * verdad: sin SW no hay avisos posibles.
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
        /**
         * El motivo del servidor va a la consola con el host del endpoint.
         *
         * Antes acá solo se lanzaba "alta rechazada": el usuario veía un aviso
         * genérico, el botón no se ponía verde y no quedaba rastro de por qué.
         * El 2026-09-09 eso costó un ida y vuelta entero para descubrir que el
         * navegador de un Samsung emitía un endpoint que el servidor no aceptaba.
         */
        const detalle = await res.text().catch(() => '');
        throw new Error(`alta rechazada (${res.status}) ${detalle} · endpoint: ${new URL(sub.endpoint).hostname}`);
      }

      setEstado('encendido');
      anunciarCambio();
      toast.success(opts?.rehacer ? t('pushRedone') : t('pushOnDone'));
    } catch (e) {
      console.error('[push] alta falló', e);
      toast.error(t('pushError'));
    } finally {
      setTrabajando(false);
    }
  }, [clavePublica, toast, t]);

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
      toast.info(t('pushOffDone'));
    } catch (e) {
      console.error('[push] baja falló', e);
      toast.error(t('pushError'));
    } finally {
      setTrabajando(false);
    }
  }, [toast, t]);

  /** Ver la nota de `reactivar` en `AvisosControl`. */
  const reactivar = useCallback(() => encender({ rehacer: true }), [encender]);

  return { estado, trabajando, encender, apagar, reactivar };
}
