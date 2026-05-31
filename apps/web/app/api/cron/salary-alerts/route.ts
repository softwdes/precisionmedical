import { type NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminClient } from '@precision-medical/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily salary-alert cron. Runs at 8am Utah (14 UTC) via Vercel Cron
 * (see vercel.json). Authenticated by the CRON_SECRET bearer set in
 * Vercel env vars — public access is rejected.
 *
 * Effect: inserts rows into the `notifications` table for every
 * Super Admin user when there are pending salary payments due today
 * or in exactly 3 days (Utah local time). The admin app already
 * surfaces these via the bell icon in the topbar (badge with unread
 * count + drawer). No push or email — pure in-app.
 *
 * Idempotency: if the same (userId, title) was inserted in the last
 * 23h, we skip. That keeps a manual re-run (or a Vercel retry) from
 * spamming duplicate alerts on the same day.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Without
  // the secret, anyone could POST to /api/cron/salary-alerts and
  // pollute the notifications table.
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── 1. Compute today + today+3 in Utah local timezone ───────────
  const utahDate = (offset: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  };
  const today = utahDate(0);
  const inThreeDays = utahDate(3);

  // ── 2. Pull pending payments in a wider UTC window, then filter
  //       in JS by Utah-local date. Direct UTC range filtering used
  //       to miss payments created late-day Utah time (their UTC
  //       value rolls into the next UTC day). ─────────────────────
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + 4);

  const { data: paymentsRaw, error: pErr } = await admin
    .from('payments')
    .select('id, scheduledDate, status')
    .eq('status', 'PENDING')
    .gte('scheduledDate', windowStart.toISOString())
    .lte('scheduledDate', windowEnd.toISOString());

  if (pErr) {
    return NextResponse.json({ error: `payments query failed: ${pErr.message}` }, { status: 500 });
  }

  const allPayments = paymentsRaw ?? [];
  const utahDateOf = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

  const dueToday = allPayments.filter((p) => utahDateOf(p.scheduledDate as string) === today);
  const dueInThreeDays = allPayments.filter((p) => utahDateOf(p.scheduledDate as string) === inThreeDays);

  // ── 3. Find Super Admin recipients ──────────────────────────────
  const { data: superAdmins } = await admin
    .from('users')
    .select('id')
    .eq('role', 'SUPER_ADMIN');

  const adminIds = (superAdmins ?? []).map((u) => u.id as string);

  if (adminIds.length === 0) {
    return NextResponse.json({
      ok: true,
      today,
      inThreeDays,
      dueToday: dueToday.length,
      dueInThreeDays: dueInThreeDays.length,
      message: 'No super admin users to notify',
      inserted: 0,
      skipped: 0,
    });
  }

  // ── 4. Compose notifications to insert ──────────────────────────
  // One notification per "bucket" (today vs +3d), targeted to every
  // Super Admin. The bell drawer surfaces them with the same title/
  // body and a click takes the user to the payments tab.
  const messages: Array<{ title: string; body: string; linkUrl: string }> = [];

  if (dueToday.length > 0) {
    messages.push({
      title: `${dueToday.length} salario${dueToday.length === 1 ? '' : 's'} vence${dueToday.length === 1 ? '' : 'n'} HOY`,
      body: 'Toca para revisar y procesar los pagos pendientes.',
      linkUrl: '/dashboard/employees?tab=pagos',
    });
  }
  if (dueInThreeDays.length > 0) {
    messages.push({
      title: `${dueInThreeDays.length} salario${dueInThreeDays.length === 1 ? '' : 's'} vence${dueInThreeDays.length === 1 ? '' : 'n'} en 3 días`,
      body: 'Prepara los fondos. Toca para ver los próximos pagos.',
      linkUrl: '/dashboard/employees?tab=pagos',
    });
  }

  // ── 5. Insert with dedupe ───────────────────────────────────────
  // Skip if the same (userId, title) already exists from the last
  // 23h. Keeps reruns and Vercel retries from creating dupes.
  const dayStart = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  let inserted = 0;
  let skipped = 0;

  for (const userId of adminIds) {
    for (const msg of messages) {
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('userId', userId)
        .eq('title', msg.title)
        .gte('createdAt', dayStart)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      const { error: insErr } = await admin.from('notifications').insert({
        id: randomUUID(),
        userId,
        // SYSTEM is the generic type already supported by the UI.
        // No need to add a new enum value just for salary alerts.
        type: 'SYSTEM',
        title: msg.title,
        body: msg.body,
        linkUrl: msg.linkUrl,
      });

      if (insErr) {
        // Log but continue — one failure shouldn't kill the rest.
        // eslint-disable-next-line no-console
        console.error('[salary-alerts] insert failed:', insErr.message);
      } else {
        inserted++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    inThreeDays,
    dueToday: dueToday.length,
    dueInThreeDays: dueInThreeDays.length,
    superAdmins: adminIds.length,
    inserted,
    skipped,
  });
}
