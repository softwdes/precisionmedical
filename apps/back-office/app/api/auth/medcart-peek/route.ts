/**
 * TEMPORAL — mirilla del MedCart. BORRAR al terminar el refill.
 *
 * Devuelve el carrito CRUDO del paciente tal como lo guarda ScriptSure. El plan:
 * Erick agrega un medicamento usando el flujo NATIVO de su widget (drug-list →
 * prescribe), y acá vemos la estructura exacta del ítem — incluido dónde y con
 * qué nombres vive el fármaco. Copiamos esa forma en addToMedCart y se acabó la
 * adivinanza de nombres de campo.
 *
 * Bajo /api/auth/* porque el middleware deja pasar ese prefijo; protegido por
 * token propio. Solo LEE — no modifica nada.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionToken } from '@/lib/scriptsure-client';

const TOKEN = 'pm-medcart-peek-3jz7';
const DEVIN_EMAIL = 'devin@precisionmedicalcare.com';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  const patientId = req.nextUrl.searchParams.get('patientId') ?? '288127';

  try {
    const sessionToken = await getSessionToken(DEVIN_EMAIL);
    const res = await fetch(
      `https://ssa.scriptsure.com/v3/medcart/patient/${patientId}?sessiontoken=${sessionToken}`,
    );
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* crudo */ }
    return NextResponse.json({ status: res.status, cart: body });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 502 });
  }
}
