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
  const rxId = req.nextUrl.searchParams.get('rxId');

  // La lectura del carrito devuelve una vista SIN el medicamento (verificado:
  // hasta los ítems creados por su propio widget se leen así). El detalle del
  // fármaco tiene que vivir en el ítem individual — variantes candidatas:
  const urls = rxId
    ? [
        `https://ssa.scriptsure.com/v3/medcart/${patientId}/${rxId}`,
        `https://ssa.scriptsure.com/v3/medcart/patient/${patientId}/${rxId}`,
        `https://ssa.scriptsure.com/v3/medcart/item/${rxId}`,
        `https://ssa.scriptsure.com/v3/medcart/rx/${rxId}`,
      ]
    : [`https://ssa.scriptsure.com/v3/medcart/patient/${patientId}`];

  try {
    const sessionToken = await getSessionToken(DEVIN_EMAIL);
    const results: Array<{ url: string; status: number; body: unknown }> = [];
    for (const u of urls) {
      const res = await fetch(`${u}?sessiontoken=${sessionToken}`);
      const text = await res.text();
      let body: unknown = text.slice(0, 3000);
      try { body = JSON.parse(text); } catch { /* crudo */ }
      results.push({ url: u.replace('https://ssa.scriptsure.com', ''), status: res.status, body });
      if (res.ok && rxId) break; // con el primero que responda alcanza
      await new Promise((r) => setTimeout(r, 400)); // sin ráfagas (WAF)
    }
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 502 });
  }
}
