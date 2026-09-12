/**
 * PATCH /api/admin/cases/[id]/policy-number
 *
 * Carga el número de póliza del seguro primario del caso desde el punto de
 * atención. Nace de un freno concreto: una orden de laboratorio que paga el
 * seguro no se emite sin este número (ver la ruta `requisition`), y el que la
 * está pidiendo es el doctor o el asistente, con el paciente delante.
 *
 * ── Por qué una ruta para UN campo ─────────────────────────────────────────
 * Porque es lo único que falta. De los 834 casos marcados con seguro, 829
 * tienen la aseguradora cargada y solo 17 la póliza (medido 2026-09-11). Un
 * formulario de seguro sería seis campos ya llenos alrededor del que importa.
 *
 * Misma lección que dejó escrita `coverage/route.ts`: el peaje es lo que dejó
 * ese dato vacío hasta hoy. Ahí se sacó la exigencia del carrier normalizado;
 * acá se pide un campo y nada más.
 *
 * ── Quién puede ────────────────────────────────────────────────────────────
 * Cualquiera del staff con sesión (Erick, 2026-09-11), igual que la cobertura:
 * quien tiene al paciente delante es quien puede leer la tarjeta. Queda
 * auditado con nombre y hora, que es lo que hace revisable el permiso ancho.
 *
 * NO toca la aseguradora. Elegir el `InsuranceCarrier` normalizado es un
 * autocomplete con su catálogo, y meterlo acá convertiría esto en el formulario
 * que justamente estamos evitando. Cuando el caso no tiene aseguradora —5 de
 * 834— la pantalla lo dice y ofrece la otra salida: pasar la orden a que la
 * pague la clínica.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  /**
   * `null` borra el número. Se permite porque cargar el de otro paciente y no
   * poder sacarlo sería peor: una póliza ajena factura contra alguien que no
   * es. Borrarla vuelve a frenar la emisión, que es el estado correcto.
   *
   * 60 caracteres: las pólizas reales más largas de esta base tienen 20, y el
   * campo del código de barras no las corta antes.
   */
  policyNumber: z.string().trim().max(60).nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const before = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseCode: true,
      primaryPolicyNumber: true,
      primaryInsurance: { select: { name: true } },
    },
  });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  // Vacío y `null` son lo mismo acá: un string en blanco guardado se lee como
  // "hay póliza" en cualquier chequeo de presencia y volvería a dejar pasar la
  // orden que este campo existe para frenar.
  const numero = body.policyNumber?.trim() || null;

  const updated = await db.case.update({
    where: { id },
    data: { primaryPolicyNumber: numero },
    select: { primaryPolicyNumber: true, primaryInsurance: { select: { name: true } } },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType ?? 'HUMAN_USER',
    actorUserId: actor.actorUserId ?? dbUser?.id ?? null,
    actorRole: dbUser?.role ?? null,
    action: 'SET_CASE_POLICY_NUMBER',
    entityType: 'cases',
    entityId: id,
    before: { primaryPolicyNumber: before.primaryPolicyNumber },
    after: { primaryPolicyNumber: updated.primaryPolicyNumber },
    metadata: {
      caseCode: before.caseCode,
      carrierName: before.primaryInsurance?.name ?? null,
      // Qué disparó la carga. Sin esto, en el historial del caso aparece un
      // número que se cargó solo; con esto se ve que salió de una hoja de
      // laboratorio frenada.
      origen: 'LAB_REQUISITION',
    },
  }).catch((e) => { console.error('[audit] no se pudo registrar:', e); });

  return NextResponse.json({
    ok: true,
    policyNumber: updated.primaryPolicyNumber,
    carrierName: updated.primaryInsurance?.name ?? null,
  });
}
