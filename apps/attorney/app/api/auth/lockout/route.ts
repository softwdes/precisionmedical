/**
 * GET  /api/auth/lockout?email=...  â€” Check if an account is locked.
 * POST /api/auth/lockout            â€” Record a login attempt (success or fail).
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from '@precision-medical/auth/lockout';

function ipFromRequest(req: NextRequest): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const email = req.nextUrl.searchParams.get('email')?.trim();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const status = await checkLockout(email);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { email: string; success: boolean };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const ip = ipFromRequest(req);

  if (body.success) {
    await recordSuccessfulLogin(body.email, ip);
    return NextResponse.json({ ok: true });
  }

  // El resultado vuelve a la pantalla para que pueda AVISAR cuántos intentos
  // quedan. Antes era un `{ ok: true }` mudo y por eso nadie se enteraba de
  // que iba por el segundo de tres.
  return NextResponse.json({ ok: true, ...(await recordFailedAttempt(body.email, ip)) });
}

