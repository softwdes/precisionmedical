/**
 * GET  /api/auth/lockout?email=...  — ¿esta cuenta está cerrada?
 * POST /api/auth/lockout            — registra un intento (bueno o malo).
 *
 * Gemelo del de las otras cuatro apps. Toda la política vive en
 * `@precision-medical/auth/lockout`: 3 intentos y la cuenta queda cerrada hasta
 * la medianoche de la clínica.
 *
 * ── Por qué el Admin no tenía candado hasta hoy ────────────────────────────
 *
 * Porque la política estaba escrita contra Prisma, que acá apunta a Phoenix —
 * la base clínica— y el Admin trabaja contra su propio proyecto. Desde el
 * 2026-10-03 el candado vive en la tabla `users` del Admin, que es donde está
 * la cuenta, y se escribe por REST: el mismo camino que ya usa
 * `api/auth/record-login`, que es el vecino de esta carpeta.
 *
 * El import va por el subpath `/lockout` y no por el índice del paquete para
 * no arrastrar los módulos que sí usan Prisma.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from '@precision-medical/auth/lockout';

function ipDelPedido(req: NextRequest): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const email = req.nextUrl.searchParams.get('email')?.trim();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  return NextResponse.json(await checkLockout(email));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { email?: string; success?: boolean };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const ip = ipDelPedido(req);
  if (body.success) await recordSuccessfulLogin(body.email, ip);
  else await recordFailedAttempt(body.email, ip);

  return NextResponse.json({ ok: true });
}
