import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { contextoDe } from '@precision-medical/auth/freno-ip';

/**
 * DELETE /api/users/[id]/mfa — le quita el segundo factor a una persona.
 *
 * ── Por qué existe, y por qué va primero que todo lo demás del 2FA ─────────
 *
 * Hasta hoy el ÚNICO lugar que quita un factor es autoservicio: la pantalla de
 * `back-office/settings/security`, que exige estar adentro. O sea que quien
 * activaba el doble factor y perdía el teléfono **quedaba afuera para siempre**,
 * y no había nada que nadie pudiera hacer.
 *
 * Por eso no se podía obligar a nadie a activarlo: cada persona que lo activara
 * era un bloqueo permanente esperando a pasar. Esto es la red; el resto del
 * plan de 2FA cuelga de acá.
 *
 * ── Quién puede: SOLO super_admin ──────────────────────────────────────────
 *
 * A propósito más cerrado que `users/[id]/unlock`, que también lo puede hacer
 * un `admin`. Desbloquear devuelve a alguien al estado en el que ya estaba;
 * esto **le saca una protección** y, si la cuenta ya está comprometida, se la
 * saca justo a quien la necesita. Es el mismo rol que el Centro de Seguridad.
 *
 * ── Lo que pasa además, y es deseable ──────────────────────────────────────
 *
 * Borrar un factor verificado **cierra todas las sesiones activas** de esa
 * persona (lo hace Supabase, no nosotros). Para un teléfono perdido eso es
 * exactamente lo que se quiere: si alguien tenía esa sesión abierta, se cae.
 *
 * ── Queda escrito quién ────────────────────────────────────────────────────
 *
 * Una acción que baja la seguridad de una cuenta ajena tiene que dejar rastro
 * con nombre. Se escribe `MFA_REMOVED` en `audit_logs` con el actor, la víctima
 * y el contexto. La columna `action` es texto libre, así que no hizo falta
 * tocar el esquema.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: quienLlama } = await admin
    .from('users').select('id, role').eq('email', user.email).single();

  if (quienLlama?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: objetivo } = await admin
    .from('users').select('id, email').eq('id', id).single();
  if (!objetivo?.id) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  /*
   * El id de la fila de `users` NO es necesariamente el de `auth.users`.
   *
   * En este proyecto coinciden —la cuenta se crea con el mismo uuid en las dos
   * partes— pero si alguna vez dejaran de coincidir, `listFactors` devolvería
   * vacío y esto contestaría "no tenía factores" en vez de fallar. Por eso se
   * distingue abajo entre "no encontré la cuenta de auth" y "no tenía nada".
   */
  const { data: listado, error: errLista } = await admin.auth.admin.mfa.listFactors({ userId: id });
  if (errLista) {
    console.error('[mfa] no se pudieron listar los factores:', errLista.message);
    return NextResponse.json({ error: 'NO_SE_PUDO_LEER' }, { status: 500 });
  }

  const factores = listado?.factors ?? [];
  if (factores.length === 0) {
    // No es un error: puede que ya se lo hubieran quitado, o que nunca lo
    // activara. Se contesta OK con el conteo en cero para que la pantalla
    // pueda decir la verdad en vez de mostrar un fallo que no lo es.
    return NextResponse.json({ ok: true, quitados: 0 });
  }

  let quitados = 0;
  for (const f of factores) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
    if (error) {
      console.error('[mfa] no se pudo borrar el factor', f.id, error.message);
      continue;
    }
    quitados++;
  }

  if (quitados === 0) return NextResponse.json({ error: 'NO_SE_PUDO' }, { status: 500 });

  /*
   * La columna `mfaEnabled` de `users` es lo que mira el Centro de Seguridad, y
   * es una COPIA: la verdad vive en `auth.mfa_factors`. Si no se actualiza acá,
   * la pantalla sigue diciendo que esa persona tiene doble factor cuando ya no.
   */
  const { error: errCol } = await admin.from('users').update({ mfaEnabled: false }).eq('id', id);
  if (errCol) console.error('[mfa] no se pudo apagar mfaEnabled:', errCol.message);

  const ctx = contextoDe(req.headers, 'admin');
  const { error: errAud } = await admin.from('audit_logs').insert({
    // El id explícito: la columna es `text NOT NULL` sin default y el `cuid()`
    // lo genera Prisma del lado del cliente, no Postgres.
    id:          randomUUID(),
    createdAt:   new Date().toISOString(),
    actorUserId: quienLlama.id as string,
    action:      'MFA_REMOVED',
    entityType:  'user',
    entityId:    id,
    ipAddress:   ctx.ip ?? null,
    userAgent:   ctx.navegador ?? null,
    metadata: {
      app: ctx.app,
      ...(ctx.pais ? { pais: ctx.pais } : {}),
      ...(ctx.ciudad ? { ciudad: ctx.ciudad } : {}),
      objetivo: objetivo.email,
      factores: quitados,
    },
  });
  if (errAud) console.error('[mfa] no se pudo auditar:', errAud.message);

  return NextResponse.json({ ok: true, quitados });
}
