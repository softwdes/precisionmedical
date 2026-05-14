import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@precision-medical/auth/server';
import { sendPasswordResetEmail } from '@precision-medical/api';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Parse body ──────────────────────────────────────────────────────────
    let body: { email?: unknown };
    try {
      body = await request.json() as { email?: unknown };
    } catch {
      return NextResponse.json({ error: 'invalid_json', detail: 'Request body is not valid JSON' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : null;
    if (!email) {
      return NextResponse.json({ error: 'invalid_request', detail: 'email field is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const origin = request.nextUrl.origin;

    // ── 2 + 3. generateLink acts as existence check AND link generator ─────────
    // If the email is not in auth.users → Supabase returns 404/422 → we return 404.
    // If it exists → we get action_link → send email.
    // This avoids Prisma (direct Postgres) and PostgREST table queries entirely.
    const { data, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/auth/callback?next=/reset-password` },
    });

    if (linkError) {
      const msg = linkError.message.toLowerCase();
      const isNotFound =
        linkError.status === 404 ||
        linkError.status === 422 ||
        msg.includes('not found') ||
        msg.includes('user not found');

      if (isNotFound) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }

      console.error('[forgot-password] generateLink error:', linkError.status, linkError.message);
      return NextResponse.json(
        { error: 'link_generation_failed', detail: `${linkError.status}: ${linkError.message}` },
        { status: 500 },
      );
    }

    if (!data?.properties?.action_link) {
      return NextResponse.json(
        { error: 'link_generation_failed', detail: 'No action_link returned by Supabase' },
        { status: 500 },
      );
    }

    // ── 4. Send branded email via Resend (noreply@lienmaster.net) ──────────────
    try {
      await sendPasswordResetEmail({ to: email, resetLink: data.properties.action_link });
    } catch (emailErr) {
      const detail = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error('[forgot-password] email send error:', detail);
      return NextResponse.json({ error: 'email_send_failed', detail }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (unexpected) {
    const detail = unexpected instanceof Error ? unexpected.message : String(unexpected);
    console.error('[forgot-password] unexpected error:', detail);
    return NextResponse.json({ error: 'unexpected_error', detail }, { status: 500 });
  }
}
