/**
 * POST /api/attorney/cases/[id]/sign — firma del lien por el abogado.
 *
 * Distinto de `/api/admin/cases/[id]/sign-attorney` en lo que importa: acá el
 * caso tiene que estar DENTRO del alcance de la sesión. Aquella ruta no valida
 * nada —cualquier usuario del back-office puede firmar cualquier caso— y eso
 * queda pendiente de cerrar.
 *
 * Firma cualquier miembro del despacho; el alcance decide QUÉ casos. Un gestor
 * solo ve —y por lo tanto solo firma— los casos donde está asignado.
 *
 * NO reutiliza el endpoint de `apps/attorney`: ese usa SQL crudo con `case_id` y
 * `signer_type`, columnas que no existen (son `caseId` y `signerType`), así que
 * revienta con un 42703 en cada intento.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';
import { resolveActor } from '@/lib/actor';

const SignSchema = z.object({
  /** Pre-cargado en la UI pero editable (decisión de Erick). */
  signerName: z.string().min(2).max(120),
  /** base64 PNG del pad de firma. */
  signatureSvg: z.string().min(20),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let input: z.infer<typeof SignSchema>;
  try {
    input = SignSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Mismo filtro que la lista: si no lo ve, no lo firma.
  const target = await db.case.findFirst({
    where: { AND: [lawyerCaseFilter(lawyer), { id }] },
    select: { id: true, caseCode: true },
  });
  if (!target) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Re-firmar está PERMITIDO (decisión de Erick, 2026-08-20). La tabla es
  // append-only y la vista del caso ya muestra la última por tipo contando las
  // anteriores, así que la firma original nunca se pierde. Se informa cuántas
  // había para que la UI pueda avisar "ya estaba firmado".
  const previous = await db.lienSignature.count({
    where: { caseId: target.id, signerType: 'ATTORNEY' },
  });

  const signature = await db.lienSignature.create({
    data: {
      caseId: target.id,
      signerType: 'ATTORNEY',
      signerName: input.signerName.trim(),
      // El nombre es editable, así que por sí solo no identifica a nadie —en la
      // base hay una firma que dice "adasdasd". El email sale de la SESIÓN y no
      // del formulario: es lo que ata el documento a una persona real.
      signerEmail: lawyer.email,
      signatureSvg: input.signatureSvg,
      ipAddress: req.headers.get('x-forwarded-for'),
      userAgent: req.headers.get('user-agent'),
    },
    select: { id: true, signedAt: true },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'ATTORNEY_SIGN_LIEN',
    entityType:  'cases',
    entityId:    target.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata: {
      caseCode:      target.caseCode,
      signerName:    input.signerName.trim(),
      signerEmail:   lawyer.email,
      signatureId:   signature.id,
      resigned:      previous > 0,
      previousCount: previous,
      source:        'ATTORNEY_PORTAL',
      firmId:        lawyer.firmId,
    },
  });

  return NextResponse.json(
    { ok: true, signatureId: signature.id, signedAt: signature.signedAt, resigned: previous > 0 },
    { status: 201 },
  );
}
