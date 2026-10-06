import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { bloquearIp, desbloquearIp } from '@precision-medical/auth/ips-bloqueadas';

/**
 * POST   /api/seguridad/ips   — echa una IP
 * DELETE /api/seguridad/ips   — la deja volver
 *
 * ── Quién puede ────────────────────────────────────────────────────────────
 *
 * Solo `SUPER_ADMIN`, el mismo guardia que la pantalla del Centro de Seguridad
 * (`dashboard/seguridad/page.tsx`). Más cerrado que desbloquear una cuenta, que
 * también lo puede hacer un `admin`: desbloquear devuelve a alguien al estado en
 * que ya estaba, y bloquear una IP puede **dejar a la clínica entera afuera**.
 *
 * Medido el 2026-10-06: `76.8.206.26` es la salida a internet de la clínica y
 * tiene 11 ingresos buenos. Bloquearla por error es un incidente, no un error
 * de tipeo — y por eso el rol es el mismo que el de la pantalla, y no menos.
 *
 * El guardia va acá Y en la pantalla: esconder el botón sin cerrar la ruta sería
 * decoración (ver `feedback-no-esconder-la-accion-bloqueada`).
 *
 * ── Por qué no hay freno por IP en esta ruta ───────────────────────────────
 *
 * Las otras rutas de auth lo llevan porque son públicas. Esta exige una sesión
 * de super_admin, así que el límite ya es "tener la cuenta", no "cuántas
 * veces". Ponerle un freno solo serviría para que un super_admin no pueda
 * bloquear diez IPs seguidas durante un ataque, que es justo cuando haría falta.
 */

/** Devuelve el id del super_admin que llama, o null. */
async function quienLlama(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await createAdminClient()
    .from('users').select('id, role').eq('email', user.email).single();
  if (data?.role !== 'SUPER_ADMIN') return null;
  return data.id as string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await quienLlama();
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let body: { ip?: string; motivo?: string; dias?: number; pais?: string; ciudad?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const ip = body.ip?.trim();
  if (!ip) return NextResponse.json({ error: 'MISSING_IP' }, { status: 400 });

  /*
   * Un bloqueo con fecha de vencimiento es el caso normal: nadie se acuerda de
   * limpiar la lista, y una IP echada para siempre por un incidente de un
   * martes sigue echada dos años después. `dias: 0` o ausente = permanente, y
   * eso tiene que ser una decisión explícita de quien aprieta.
   */
  const hasta = body.dias && body.dias > 0
    ? new Date(Date.now() + body.dias * 86_400_000).toISOString()
    : null;

  const ok = await bloquearIp(ip, {
    motivo: body.motivo?.slice(0, 300),
    hasta,
    porUserId: actor,
    pais: body.pais ?? null,
    ciudad: body.ciudad ?? null,
  });

  return ok
    ? NextResponse.json({ ok: true, hasta })
    : NextResponse.json({ error: 'NO_SE_PUDO' }, { status: 500 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const actor = await quienLlama();
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const ip = new URL(req.url).searchParams.get('ip')?.trim();
  if (!ip) return NextResponse.json({ error: 'MISSING_IP' }, { status: 400 });

  const ok = await desbloquearIp(ip);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'NO_SE_PUDO' }, { status: 500 });
}
