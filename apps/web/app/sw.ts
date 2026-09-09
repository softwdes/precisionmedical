import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

/**
 * Minimal SW for the admin: enable installability + cache static
 * assets + handle Web Push. Aggressive page caching was causing
 * "no-response" errors when a navigation 401/redirected and the
 * /offline fallback wasn't reliably precached. Since the admin
 * requires login + live data, offline support isn't a goal —
 * navigation requests pass through to the network without fallback.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Supabase + API routes: always live, never cache.
    {
      matcher: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: new NetworkOnly(),
    },
    {
      matcher: /\/api\/.*/i,
      handler: new NetworkOnly(),
    },
    // Static-ish assets only. NO navigation caching, NO defaultCache
    // (which was wrapping document requests and tripping on auth
    // redirects).
    {
      matcher: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'google-fonts',
        plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'google-fonts-static',
        plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: /\/_next\/static\/.*/i,
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: /\/_next\/image\?.*/i,
      handler: new StaleWhileRevalidate({
        cacheName: 'next-image',
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
  ],
  // No fallbacks. If the network fails for a navigation, let the
  // browser show its own error. Avoids the no-response loop from
  // pre-emptively caching pages that depend on session cookies.
});

serwist.addEventListeners();

/**
 * ── Web Push ────────────────────────────────────────────────────────────────
 *
 * La cabecera de arriba ya decía "handle Web Push", pero los handlers nunca se
 * escribieron: sin esto, una suscripción se crea bien, el servidor empuja bien
 * y el teléfono no muestra NADA. El fallo es mudo de punta a punta.
 *
 * Los avisos los manda el cron `alertas-admin` del back-office (cajas bajo el
 * mínimo, pagos para revisar) y el payload lo arma `lib/push.ts` de esa app.
 * Trae SOLO un titular: sin nombre de paciente ni detalle, porque esto se
 * dibuja en la pantalla de bloqueo.
 *
 * A diferencia del worker del back-office, acá NO hay que traducir la ruta
 * según el dominio: el Admin es un solo host y no sirve tres portales.
 */
interface AvisoPush {
  titulo?: string;
  cuerpo?: string;
  url?: string;
  tag?: string;
  urgente?: boolean;
}

/**
 * Marca del icono a partir de las notificaciones que siguen abiertas.
 *
 * No hace falta que el servidor mande un número: las notificaciones vivas YA
 * son el pendiente. En iPhone pinta el número sobre el icono; en Chrome Android
 * `setAppBadge` no existe y la marca la pone el launcher solo.
 */
async function actualizarMarca(): Promise<void> {
  const nav = self.navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof nav.setAppBadge !== 'function') return;
  try {
    const abiertas = await self.registration.getNotifications();
    if (abiertas.length > 0) await nav.setAppBadge(abiertas.length);
    else await nav.clearAppBadge?.();
  } catch {
    /* La marca es un adorno: si falla, la notificación ya avisó. */
  }
}

/**
 * El aviso se dibuja SIEMPRE, también con la app en pantalla — decisión de
 * Erick al probarlo en la mano (2026-09-09, en el back-office).
 *
 * "App abierta" no quiere decir que la persona esté mirando: puede estar en
 * otra pantalla con el teléfono apoyado en el mostrador. Un contador solo se ve
 * si mirás esa esquina; el aviso se oye.
 */
self.addEventListener('push', (event) => {
  const ev = event as PushEvent;
  if (!ev.data) return;

  let aviso: AvisoPush;
  try {
    aviso = ev.data.json() as AvisoPush;
  } catch {
    return; // Un payload que no es nuestro no se dibuja.
  }

  ev.waitUntil(
    (async () => {
      await self.registration.showNotification(aviso.titulo || 'Precision Medical', {
        body: aviso.cuerpo || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        // Dos avisos con el mismo tag se REEMPLAZAN en vez de apilarse.
        tag: aviso.tag || 'pm-aviso',
        requireInteraction: false,
        silent: false,
        data: { url: aviso.url || '/' },
      });
      await actualizarMarca();
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  const ev = event as NotificationEvent;
  ev.notification.close();
  const destino = (ev.notification.data as { url?: string } | null)?.url ?? '/';

  ev.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Si la app ya está abierta se REUSA esa ventana: abrir una segunda deja
      // dos instancias peleando por el estado.
      for (const cliente of abiertas) {
        if (new URL(cliente.url).origin === self.location.origin) {
          await cliente.focus();
          await cliente.navigate(destino).catch(() => undefined);
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
  (event as NotificationEvent).waitUntil(actualizarMarca());
});
