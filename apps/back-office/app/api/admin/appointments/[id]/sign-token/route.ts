/**
 * POST /api/admin/appointments/[id]/sign-token
 *
 * Emite el link/QR que el paciente escanea al llegar para revisar sus datos y
 * FIRMAR la confirmación de la cita, antes de pasar a triaje. Reemplaza el
 * "QR de cita" del v2.
 *
 * Tres decisiones que no son obvias:
 *
 *  1. **El token vive en la cita, no en el caso.** El documento que se firma es
 *     de ESTA visita: un token por caso serviría para firmar cualquier cita.
 *
 *  2. **Se REUSA mientras siga vivo.** Emitir uno nuevo en cada apertura del
 *     modal parece más limpio, pero rompe el caso real: recepción muestra el QR,
 *     el paciente lo escanea, recepción reabre el modal → el token del paciente
 *     queda huérfano y su firma falla con la página ya abierta. Solo se emite
 *     otro si no hay ninguno o el que había venció.
 *
 *  3. **`crypto.randomBytes`, no `Date.now()+Math.random()`** como
 *     `generate-portal-token`. Esta página muestra la ficha completa (DOB,
 *     dirección, seguros): el token es la única puerta y tiene que ser
 *     imposible de adivinar.
 *
 * Una cita ya firmada devuelve 409: en el panel el botón desaparece y en su
 * lugar queda el impreso (mismo comportamiento que el v2).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolveActor } from '@/lib/actor';
import { puedeEscribirLaCita } from '@/lib/appointment-scope';
import { emitirTokenDeFirma } from '@/lib/sign-token';

/**
 * La emision vive en `lib/sign-token.ts` desde el 2026-10-08: ahora hay DOS
 * puertas al mismo token —este modal y el envio por SMS/correo— y la ventana de
 * validez tiene que ser una sola.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  /**
   * El token abre una pagina PUBLICA con la ficha completa del paciente. Emitir
   * el link no es "leer la cita", es abrirle la puerta a un tercero, asi que se
   * gobierna con el guard de ESCRITURA y no con el de lectura.
   */
  if (!(await puedeEscribirLaCita(id))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const actor = await resolveActor(req.headers);
  const r = await emitirTokenDeFirma(id, actor);

  if (!r.ok) {
    if (r.motivo === 'APPOINTMENT_NOT_FOUND') {
      return NextResponse.json({ ok: false, error: r.motivo }, { status: 404 });
    }
    if (r.motivo === 'ALREADY_SIGNED') {
      return NextResponse.json(
        { ok: false, error: r.motivo, signedAt: r.signedAt!.toISOString() },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: r.motivo, status: r.status },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok:        true,
    signUrl:   r.token.signUrl,
    // El modal calcula lo que falta a partir de esto, no de la ventana de 4 h:
    // un token reusado se emitio antes y le queda menos.
    expiresAt: r.token.expiresAt.toISOString(),
    reused:    r.token.reused,
  });
}
