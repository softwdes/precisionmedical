import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

export const runtime = 'nodejs';

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/**
 * Saves a Web Push subscription for the authenticated user.
 *
 * The client sends the result of
 *   registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
 * along with the user agent for diagnostics. Endpoints are unique:
 * re-subscribing from the same browser updates the existing row via
 * ON CONFLICT — needed because some browsers rotate the auth/p256dh
 * keys silently and we'd otherwise duplicate.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve user_id from email (we don't store auth.uid in public.users).
  const { data: dbUser } = await admin
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single();

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Upsert by endpoint — same browser re-subscribing replaces the row
  // instead of erroring on the UNIQUE constraint.
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        user_id: dbUser.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: body.userAgent ?? req.headers.get('user-agent') ?? null,
      },
      { onConflict: 'endpoint' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Removes a Web Push subscription. The client sends the endpoint to
 * unsubscribe; we only delete if it belongs to the authenticated user
 * (admin client + manual user_id check, since service_role bypasses RLS).
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const endpoint = req.nextUrl.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

  const admin = createAdminClient();
  const { data: dbUser } = await admin
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single();

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', dbUser.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
