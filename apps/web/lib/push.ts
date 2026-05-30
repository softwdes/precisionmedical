import webpush from 'web-push';

let configured = false;

/**
 * Configures web-push with VAPID credentials. Called lazily so we don't
 * crash module imports when env vars are missing (e.g. on a dev box
 * without the keys yet).
 */
function ensureConfigured(): void {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:erick@precisionmedicalcare.com';

  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys missing. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars.');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** URL the browser opens when the user taps the notification. */
  url?: string;
  /** Optional tag — same tag replaces older notifications. */
  tag?: string;
  /** Optional icon URL — defaults to /icons/icon-192.png in the SW. */
  icon?: string;
}

/**
 * Sends a push notification to a single subscription.
 *
 * Returns the status code from the push service. 410 (Gone) means the
 * subscription has expired and should be deleted from the DB.
 */
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<{ ok: boolean; statusCode: number; expired: boolean }> {
  ensureConfigured();

  try {
    const res = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 24 * 60 * 60 }, // 24h — stale by next morning if not delivered
    );
    return { ok: true, statusCode: res.statusCode, expired: false };
  } catch (err) {
    const e = err as { statusCode?: number };
    const statusCode = e.statusCode ?? 0;
    // 404 / 410 = subscription expired or unsubscribed. Caller should
    // delete the row from push_subscriptions to avoid retrying.
    const expired = statusCode === 404 || statusCode === 410;
    return { ok: false, statusCode, expired };
  }
}
