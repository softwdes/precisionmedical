import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { sendPush, type PushSubscriptionRecord } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily salary-alert cron. Runs at 8am Utah time via Vercel Cron
 * (see vercel.json). Authenticated by the CRON_SECRET header set by
 * Vercel — public access is rejected.
 *
 * Logic:
 *  1. Compute "today" and "today + 3 days" in Utah local timezone.
 *  2. Find Payment rows where status = PENDING and scheduledDate
 *     falls on either of those two dates.
 *  3. Group by date and push a single notification per group to the
 *     super admin's subscriptions.
 *  4. Clean up expired subscriptions returned by the push service.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Reject any
  // request without it — otherwise anyone could trigger pushes.
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── 1. Today / +3 days in Utah local TZ ────────────────────────
  // We compute YYYY-MM-DD strings the same way the timeclock writes
  // attendance dates, so the date filter matches what the admin app
  // already considers "today".
  const utahDate = (offset: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  };
  const today = utahDate(0);
  const inThreeDays = utahDate(3);

  // ── 2. Query pending payments scheduled for either date ────────
  // Payment.scheduledDate is a timestamp — we range-match each day.
  async function findPaymentsForDate(dateStr: string) {
    const start = `${dateStr}T00:00:00.000Z`;
    const end = `${dateStr}T23:59:59.999Z`;
    const { data, error } = await admin
      .from('payments')
      .select('id, employeeId, amountLocal, currencyLocal, scheduledDate, status, period')
      .eq('status', 'PENDING')
      .gte('scheduledDate', start)
      .lte('scheduledDate', end);
    if (error) throw new Error(`payments query failed: ${error.message}`);
    return data ?? [];
  }

  const [dueToday, dueInThreeDays] = await Promise.all([
    findPaymentsForDate(today),
    findPaymentsForDate(inThreeDays),
  ]);

  // ── 3. Resolve super admin subscriptions ───────────────────────
  const { data: superAdmins } = await admin
    .from('users')
    .select('id')
    .eq('role', 'SUPER_ADMIN');

  const superAdminIds = (superAdmins ?? []).map((u) => u.id as string);
  if (superAdminIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'No super admin users found', dueToday: dueToday.length, dueInThreeDays: dueInThreeDays.length });
  }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', superAdminIds);

  const subscriptions = (subs ?? []) as Array<{
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;

  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No push subscriptions for super admin', dueToday: dueToday.length, dueInThreeDays: dueInThreeDays.length });
  }

  // ── 4. Compose + send notifications ────────────────────────────
  const messages: PushPayload[] = [];

  if (dueToday.length > 0) {
    messages.push({
      title: `${dueToday.length} salario${dueToday.length === 1 ? '' : 's'} vence${dueToday.length === 1 ? '' : 'n'} HOY`,
      body: 'Toca para revisar y procesar los pagos pendientes.',
      url: '/dashboard/employees?tab=pagos',
      tag: 'salary-today',
    });
  }

  if (dueInThreeDays.length > 0) {
    messages.push({
      title: `${dueInThreeDays.length} salario${dueInThreeDays.length === 1 ? '' : 's'} vence${dueInThreeDays.length === 1 ? '' : 'n'} en 3 días`,
      body: 'Prepara los fondos. Toca para ver los próximos pagos.',
      url: '/dashboard/employees?tab=pagos',
      tag: 'salary-3days',
    });
  }

  const results = {
    sent: 0,
    failed: 0,
    expired: 0,
  };

  for (const sub of subscriptions) {
    const subRecord: PushSubscriptionRecord = {
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    };
    for (const msg of messages) {
      const result = await sendPush(subRecord, msg);
      if (result.ok) results.sent++;
      else if (result.expired) {
        results.expired++;
        // Cleanup: remove dead subscription so we stop trying it.
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
        break; // no point trying more messages on a dead endpoint
      } else {
        results.failed++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dueToday: dueToday.length,
    dueInThreeDays: dueInThreeDays.length,
    subscriptionsTargeted: subscriptions.length,
    ...results,
  });
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}
