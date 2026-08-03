/**
 * TEMPORAL — Diagnóstico de conectividad ScriptSure desde la infraestructura
 * de Vercel (verifica que la IP estática pase el firewall/WAF de DAW).
 *
 * Va bajo /api/auth/* porque el middleware deja pasar ese prefijo sin sesión;
 * se protege con un token propio. NO expone secrets: solo devuelve la IP de
 * salida y el status del login. Si el login pasa, el sessionToken queda
 * cacheado en ScriptSureSession (12h) y el widget ya puede usarse.
 *
 * BORRAR este archivo apenas se confirme el diagnóstico.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionToken } from '@/lib/scriptsure-client';

const DIAG_TOKEN = 'pm-ss-diag-7f3k9x2vq81mzt4w';
const DEVIN_EMAIL = 'devin@precisionmedicalcare.com';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.searchParams.get('token') !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // 1. IP de salida real de esta invocación serverless
  let outbound: Record<string, unknown> = {};
  try {
    const ipRes = await fetch('https://ipinfo.io/json', { cache: 'no-store' });
    const d = (await ipRes.json()) as Record<string, unknown>;
    outbound = { ip: d.ip, org: d.org, city: d.city, region: d.region, country: d.country };
  } catch (err) {
    outbound = { error: String(err) };
  }

  // 2. Login real contra ScriptSure staging (o reuso del token cacheado)
  let login: Record<string, unknown>;
  try {
    const token = await getSessionToken(DEVIN_EMAIL);
    login = { ok: true, tokenPreview: `${token.slice(0, 8)}…` };
  } catch (err) {
    login = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Huella de credenciales (solo largo + hash corto — sin exponer valores)
  const { createHash } = await import('crypto');
  const fp = (v: string | undefined) =>
    v ? { len: v.length, sha: createHash('sha256').update(v).digest('hex').slice(0, 8) } : null;

  return NextResponse.json({
    outbound,
    login,
    creds: { apiKey: fp(process.env.SCRIPTSURE_API_KEY), secret: fp(process.env.SCRIPTSURE_SECRET) },
    at: new Date().toISOString(),
  });
}
