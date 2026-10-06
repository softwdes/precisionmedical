import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { contextoDe } from '@precision-medical/auth/freno-ip';

/**
 * POST   /api/users/[id]/suspender — la saca del sistema AHORA
 * DELETE /api/users/[id]/suspender — la deja volver
 *
 * ── Qué resuelve, y por qué no es lo mismo que el candado ──────────────────
 *
 * El candado es para quien se equivocó de contraseña y se abre solo a la
 * medianoche. Esto es para cuando una cuenta está comprometida y hay que
 * cortarla ya, sin fecha de vuelta.
 *
 * Era el agujero que quedaba: si se filtraba una contraseña, no había ningún
 * botón que dijera "sacá a esta persona ahora". Había que ir a Usuarios a
 * cambiarle el estado, y eso NO cerraba su sesión abierta.
 *
 * ── Por qué se hacen las DOS cosas ─────────────────────────────────────────
 *
 * 1. `ban_duration` en Supabase: bloquea el ingreso y hace que `getUser()`
 *    rechace el token que ya tenía.
 * 2. `users.status = 'SUSPENDED'`: es lo que mira nuestro propio middleware
 *    (`BLOCKING_STATUSES`), que no todas las apps resuelven igual.
 *
 * Con las dos, da igual por dónde entre y qué chequeo haga esa app.
 *
 * **Por qué el corte es inmediato:** el middleware llama a `getUser()` en cada
 * pedido, que es una llamada de red a Supabase y no una lectura local del
 * token. Eso es lo que hace lenta la app —está medido— y es exactamente lo que
 * acá juega a favor: en el próximo pedido ya está afuera, sin esperar a que le
 * venza nada.
 *
 * Medido el 2026-10-06 contra una cuenta sin uso: poner el bloqueo deja
 * `banned_until` con fecha, y `'none'` lo devuelve a `null`. Es reversible.
 *
 * ── Quién puede, y el límite que importa ───────────────────────────────────
 *
 * Solo `SUPER_ADMIN`. Y **no puede suspenderse a sí mismo**: esta ruta es la
 * única que puede deshacerlo, así que hacerlo sobre la propia cuenta sería
 * tirar la llave adentro de la habitación que se acaba de cerrar. Hoy hay un
 * solo super_admin que use el sistema, así que no habría quién lo rescate.
 */

async function quienLlama(): Promise<{ id: string } | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await createAdminClient()
    .from('users').select('id, role').eq('email', user.email).single();
  if (data?.role !== 'SUPER_ADMIN') return null;
  return { id: data.id as string };
}

/**
 * Cien años. GoTrue pide una duración, no un "para siempre", y lo que se busca
 * es "hasta que alguien lo deshaga a mano".
 */
const PARA_SIEMPRE = '876000h';

async function aplicar(
  req: NextRequest,
  params: Promise<{ id: string }>,
  suspender: boolean,
): Promise<NextResponse> {
  const actor = await quienLlama();
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { id } = await params;

  if (suspender && id === actor.id) {
    return NextResponse.json({ error: 'NO_A_VOS_MISMO' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: objetivo } = await admin
    .from('users').select('id, email').eq('id', id).single();
  if (!objetivo?.id) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // 1 — Supabase: bloquea el ingreso y tumba el token que ya tenía.
  const { error: errBan } = await admin.auth.admin.updateUserById(id, {
    ban_duration: suspender ? PARA_SIEMPRE : 'none',
  });
  if (errBan) {
    console.error('[suspender] no se pudo cambiar el bloqueo:', errBan.message);
    return NextResponse.json({ error: 'NO_SE_PUDO' }, { status: 500 });
  }

  /*
   * 2 — Nuestra tabla. Si esto falla, la cuenta QUEDA suspendida en Supabase
   * (lo de arriba ya se aplicó) pero la pantalla la muestra activa. Se avisa
   * con un 500 en vez de contestar que todo salió bien: media operación
   * reportada como completa es peor que un error.
   */
  const { error: errEstado } = await admin
    .from('users')
    .update({ status: suspender ? 'SUSPENDED' : 'ACTIVE' })
    .eq('id', id);

  if (errEstado) {
    console.error('[suspender] el bloqueo se aplicó pero el estado no:', errEstado.message);
    return NextResponse.json({ error: 'A_MEDIAS', bloqueada: suspender }, { status: 500 });
  }

  const ctx = contextoDe(req.headers, 'admin');
  const { error: errAud } = await admin.from('audit_logs').insert({
    id:          randomUUID(),
    createdAt:   new Date().toISOString(),
    actorUserId: actor.id,
    action:      suspender ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REACTIVATED',
    entityType:  'user',
    entityId:    id,
    ipAddress:   ctx.ip ?? null,
    userAgent:   ctx.navegador ?? null,
    metadata: {
      app: ctx.app,
      ...(ctx.pais ? { pais: ctx.pais } : {}),
      ...(ctx.ciudad ? { ciudad: ctx.ciudad } : {}),
      objetivo: objetivo.email,
    },
  });
  if (errAud) console.error('[suspender] no se pudo auditar:', errAud.message);

  return NextResponse.json({ ok: true, suspendida: suspender });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return aplicar(req, params, true);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return aplicar(req, params, false);
}
