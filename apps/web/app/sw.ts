import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cache Supabase or API routes — always live data
    {
      matcher: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: new NetworkOnly(),
    },
    {
      matcher: /\/api\/.*/i,
      handler: new NetworkOnly(),
    },
    // Google Fonts
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
    // Next.js static assets
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
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();

// ─── Web Push Notifications ────────────────────────────────────────
// Listens for push events from the salary-alerts cron (and any other
// future backend push sender) and renders a system notification.

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    // If the backend ever sends a plain string, use it as the body.
    payload = { title: 'LM Admin', body: event.data.text() };
  }

  const notificationPromise = self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: payload.tag ?? 'lm-admin',
    // Surfaces the destination URL to the click handler below.
    data: { url: payload.url ?? '/dashboard' },
    // Keep the notification visible until the user interacts. Critical
    // alerts like "salaries due today" shouldn't auto-dismiss.
    requireInteraction: true,
  });

  event.waitUntil(notificationPromise);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/dashboard';

  // Focus an existing tab if one is already open on the app; otherwise
  // open a new window. Avoids stacking duplicate tabs every tap.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const url = new URL(client.url);
          if (url.origin === self.location.origin && 'focus' in client) {
            void (client as WindowClient).focus();
            void (client as WindowClient).navigate(targetUrl).catch(() => {});
            return;
          }
        }
        void self.clients.openWindow(targetUrl);
      }),
  );
});
