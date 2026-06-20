/**
 * GET  /api/auth/lockout?email=...  — Check if an account is locked.
 * POST /api/auth/lockout            — Record a login attempt (success or fail).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import {
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from '@precision-medical/auth';

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

  const status = await checkLockout(db, email);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { email: string; success: boolean };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const ip = ipFromRequest(req);

  if (body.success) {
    await recordSuccessfulLogin(db, body.email, ip);
  } else {
    await recordFailedAttempt(db, body.email, ip);
  }

  return NextResponse.json({ ok: true });
}
