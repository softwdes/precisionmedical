'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';

type Status = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

/**
 * Toggle that lets the user enable/disable Web Push notifications.
 * Subscribes via the Push API using the VAPID public key and posts
 * the resulting subscription to /api/push/subscribe so the backend
 * can target the user from cron jobs.
 *
 * Status states:
 *  - loading: checking SW + existing subscription
 *  - unsupported: browser has no Push API (older iOS Safari, etc.)
 *  - denied: user previously denied the permission — must unblock
 *    manually in browser settings
 *  - subscribed: ready to receive pushes
 *  - unsubscribed: ready but not yet subscribed
 */
export function PushNotificationToggle(): React.ReactElement {
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setStatus(existing ? 'subscribed' : 'unsubscribed');
    } catch {
      setStatus('unsubscribed');
    }
  }

  /**
   * VAPID public keys are base64url-encoded. The Push API expects a
   * Uint8Array, so we convert here once.
   */
  function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function subscribe(): Promise<void> {
    setBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        toast.error('Configuración faltante. Avisa al administrador del sistema.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') setStatus('denied');
        toast.error('Permiso denegado. Habilita notificaciones en Settings → Notifications de Chrome para esta página.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TS lib.dom narrowed BufferSource recently; the byte view
        // produced from a base64 string is a valid Uint8Array for the
        // browser at runtime, so we cast through unknown.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });

      // The Push API returns a PushSubscription with .toJSON() containing
      // endpoint + keys (p256dh, auth). We forward those to our API.
      const subJson = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error('Subscription returned incomplete data');
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        // Roll back the browser-side subscription so we don't leave a
        // dangling pushManager subscription that the backend doesn't know.
        await sub.unsubscribe().catch(() => {});
        throw new Error(`backend: ${res.status}`);
      }

      setStatus('subscribed');
      toast.success('Notificaciones activadas. Recibirás alertas de pagos.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`No se pudo activar notificaciones: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe(): Promise<void> {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: 'DELETE',
        });
        await sub.unsubscribe();
      }
      setStatus('unsubscribed');
      toast.success('Notificaciones desactivadas.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`No se pudo desactivar: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="text-small text-text-3 italic">Verificando estado...</div>
    );
  }

  if (status === 'unsupported') {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-small text-amber-600 dark:text-amber-400">
        Tu navegador no soporta notificaciones push. Usa Chrome o Edge en Android, o Safari 16.4+ en iPhone con la app instalada.
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2.5 text-small text-rose-600 dark:text-rose-400">
        Notificaciones bloqueadas. Habilítalas manualmente en Chrome → Settings → Site Settings → Notifications → admin.lienmaster.net.
      </div>
    );
  }

  const isSubscribed = status === 'subscribed';

  return (
    <button
      type="button"
      onClick={() => void (isSubscribed ? unsubscribe() : subscribe())}
      disabled={busy}
      className={[
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        isSubscribed
          ? 'bg-emerald-500/12 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/18'
          : 'bg-indigo-500/12 border border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/18',
        busy && 'opacity-60 cursor-not-allowed',
      ].filter(Boolean).join(' ')}
    >
      {isSubscribed ? <Bell size={14} /> : <BellOff size={14} />}
      {busy
        ? 'Procesando...'
        : isSubscribed
          ? 'Notificaciones activadas'
          : 'Activar notificaciones'}
    </button>
  );
}
