import { createServerClient } from '@precision-medical/auth/server';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/logout
 *
 * Signs out from Supabase, clears PM session cookies, redirects to /login.
 * Called by middleware on inactivity expiry or by explicit user action.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const reason = searchParams.get('reason') ?? 'manual';

  const supabase = await createServerClient();
  await supabase.auth.signOut();

  const loginUrl = new URL('/login', origin);
  if (reason !== 'manual') loginUrl.searchParams.set('reason', reason);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete('pm_last_active');
  response.cookies.delete('pm_role');

  return response;
}
