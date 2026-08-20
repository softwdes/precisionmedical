/**
 * PATCH /api/admin/cases/[id]/coverage
 *
 * Responde "¿quién paga esta visita?" desde el punto de atención. La usan
 * recepción, los asistentes y los doctores — cualquiera del staff que esté con
 * el paciente delante puede resolverla, por eso no exige rol administrativo.
 *
 * Ruta propia y no un campo más del PATCH del caso porque cambia quién paga:
 * necesita su propia entrada de auditoría con el antes y el después, y su propio
 * contrato chico que no arrastre las 20 claves del wizard de edición.
 *
 * Deliberadamente NO exige el carrier normalizado. Ese peaje (elegir el
 * `InsuranceCarrier` de un autocomplete) es la razón por la que este dato estuvo
 * vacío hasta hoy: no se puede pedir con el paciente esperando. El nombre del
 * carrier viaja como texto libre y quien tenga la tarjeta a mano completa la
 * póliza después, sin bloquear a nadie.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  type: z.enum(['UNKNOWN', 'INSURANCE', 'SELF_PAY', 'LIEN']),
  /**
   * Solo aplica a INSURANCE. `VERIFIED` significa que alguien LLAMÓ y la
   * aseguradora confirmó que está activa — no "los datos están completos".
   */
  verifyMethod: z.enum(['DECLARED', 'VERIFIED']).optional(),
  carrierName: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
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
      coverageType: true,
      coverageVerifyMethod: true,
      coverageVerifiedAt: true,
      coverageCarrierName: true,
      coverageNote: true,
    },
  });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const dbUser = await db.user.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  const actorName = dbUser ? `${dbUser.firstName} ${dbUser.lastName}`.trim() : null;
  const isInsurance = body.type === 'INSURANCE';
  // El método de verificación describe un seguro. Sin seguro no hay nada que
  // verificar, y dejarlo colgado de un SELF_PAY haría que el chip mostrara
  // "verificado" sobre una cobertura que no existe.
  const verifyMethod = isInsurance ? (body.verifyMethod ?? 'DECLARED') : null;
  const answered = body.type !== 'UNKNOWN';

  const updated = await db.case.update({
    where: { id },
    data: {
      coverageType: body.type,
      coverageVerifyMethod: verifyMethod,
      // Al volver a UNKNOWN se limpia todo: la pregunta queda abierta otra vez y
      // un "verificado por Ana" viejo colgando de una cobertura sin responder es
      // peor que no tener nada.
      coverageVerifiedAt: answered ? new Date() : null,
      coverageVerifiedById: answered ? (dbUser?.id ?? null) : null,
      coverageVerifiedByName: answered ? actorName : null,
      coverageCarrierName: isInsurance ? (body.carrierName?.trim() || null) : null,
      // La nota acompaña a la respuesta: al volver a UNKNOWN se va con ella. El
      // diálogo la manda de vuelta siempre (arranca con la guardada), así que un
      // guardado que solo cambia el carrier no la pisa.
      coverageNote: answered ? (body.note?.trim() || null) : null,
    },
    select: {
      coverageType: true,
      coverageVerifyMethod: true,
      coverageVerifiedAt: true,
      coverageVerifiedByName: true,
      coverageCarrierName: true,
      coverageNote: true,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType ?? 'HUMAN_USER',
    // `actorFromHeaders` lee `x-actor-user-id`, que el cliente no manda — sin el
    // fallback las entradas quedan con actorUserId null y se pierde la
    // trazabilidad (pasó con las plantillas, ver pending-tasks).
    actorUserId: actor.actorUserId ?? dbUser?.id ?? null,
    actorRole: dbUser?.role ?? null,
    action: 'SET_CASE_COVERAGE',
    entityType: 'cases',
    entityId: id,
    before: {
      coverageType: before.coverageType,
      coverageVerifyMethod: before.coverageVerifyMethod,
      coverageCarrierName: before.coverageCarrierName,
      coverageNote: before.coverageNote,
    },
    after: {
      coverageType: updated.coverageType,
      coverageVerifyMethod: updated.coverageVerifyMethod,
      coverageCarrierName: updated.coverageCarrierName,
      coverageNote: updated.coverageNote,
    },
    metadata: { caseCode: before.caseCode },
  });

  return NextResponse.json({
    ok: true,
    coverage: {
      type: updated.coverageType,
      answered,
      verifyMethod: updated.coverageVerifyMethod,
      verifiedAt: updated.coverageVerifiedAt?.toISOString() ?? null,
      carrierName: updated.coverageCarrierName,
      note: updated.coverageNote,
      verifiedByName: updated.coverageVerifiedByName,
      suggestion: null,
      suggestionSource: null,
    },
  });
}
