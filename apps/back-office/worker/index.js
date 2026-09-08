/**
 * Worker propio de la PWA — la parte que despierta con la app CERRADA.
 *
 * next-pwa lo detecta solo: `customWorkerSrc` ya apunta a `worker/` por
 * defecto, así que esto se concatena al `sw.js` generado sin tocar
 * `next.config.mjs`. Eso es a propósito: el `sw.js` es lo único de lo que
 * depende que Chrome ofrezca instalar la app, y no se toca su configuración.
 *
 * Va en `.js` y no en `.ts` para que el `tsc` del app no lo levante: acá `self`
 * es un ServiceWorkerGlobalScope y no el `window` que espera el tsconfig.
 *
 * ── Lo que hace ─────────────────────────────────────────────────────────────
 *
 *   push              → dibuja la notificación (agrupada por hilo)
 *   notificationclick → enfoca la ventana que ya está abierta, o abre una
 *   notificationclose → recalcula la marca del icono
 *
 * El payload lo arma `lib/push.ts` y trae SOLO el remitente: sin asunto ni
 * paciente, porque esto se dibuja en la pantalla de bloqueo.
 */

/* eslint-disable no-undef */

/**
 * A qué bandeja lleva el toque, según el dominio en el que vive ESTE worker.
 *
 * El servidor manda `/messages?thread=X` sin prefijo porque no puede saberlo:
 * el mismo hilo lo leen la clínica en `/messages`, el provider en
 * `/doctor/messages` y el abogado en `/attorney/messages`. Cada worker vive en
 * un dominio y sí lo sabe. Mismos patrones que el middleware y el manifest.
 */
function rutaDelPortal(url) {
  const host = self.location.hostname;
  if (/^providers?\./.test(host)) return url.replace(/^\/messages/, '/doctor/messages');
  if (/^attorney\./.test(host)) return url.replace(/^\/messages/, '/attorney/messages');
  return url;
}

/**
 * Marca del icono a partir de las notificaciones que siguen abiertas.
 *
 * No hace falta que el servidor mande un número: las notificaciones vivas YA
 * son el pendiente. En iPhone esto pinta el número exacto sobre el icono; en
 * Chrome Android `setAppBadge` no existe, y ahí la marca la pone el launcher
 * solo (punto en Pixel, número en Samsung) — de eso no decidimos nosotros.
 */
async function actualizarMarca() {
  if (!self.navigator || typeof self.navigator.setAppBadge !== 'function') return;
  try {
    const abiertas = await self.registration.getNotifications();
    if (abiertas.length > 0) await self.navigator.setAppBadge(abiertas.length);
    else await self.navigator.clearAppBadge();
  } catch {
    /* La marca es un adorno: si falla, la notificación ya avisó. */
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let aviso;
  try {
    aviso = event.data.json();
  } catch {
    return; // Un payload que no es nuestro no se dibuja.
  }

  const titulo = aviso.titulo || 'Precision Medical';

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(titulo, {
        body: aviso.cuerpo || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        // Dos avisos con el mismo tag se REEMPLAZAN: cinco respuestas al mismo
        // hilo dejan una notificación, no cinco apiladas.
        tag: aviso.tag || 'pm-aviso',
        renotify: Boolean(aviso.urgente),
        requireInteraction: false,
        silent: false,
        data: { url: rutaDelPortal(aviso.url || '/') },
        vibrate: aviso.urgente ? [200, 100, 200] : undefined,
      });
      await actualizarMarca();
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si la app ya está abierta se REUSA esa ventana: abrir una segunda deja
      // dos instancias de la misma bandeja peleando por el estado.
      for (const cliente of abiertas) {
        if (new URL(cliente.url).origin === self.location.origin) {
          await cliente.focus();
          if ('navigate' in cliente) {
            await cliente.navigate(destino).catch(() => undefined);
          }
          await actualizarMarca();
          return;
        }
      }

      await self.clients.openWindow(destino);
      await actualizarMarca();
    })(),
  );
});

self.addEventListener('notificationclose', (event) => {
  event.waitUntil(actualizarMarca());
});
