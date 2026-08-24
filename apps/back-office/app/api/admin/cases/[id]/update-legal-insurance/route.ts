import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  primaryInsuranceId:  z.string().cuid().nullable().optional(),
  primaryPolicyNumber: z.string().max(60).nullable().optional(),
  lawFirmId:           z.string().cuid().nullable().optional(),
  attorneyId:          z.string().cuid().nullable().optional(),
  /** Abogado escrito a mano: no es cuid, es texto. Ver `Case.attorneyNameRaw`. */
  attorneyNameRaw:     z.string().max(200).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id: caseId } = await ctx.params;

  /*
   * Se lee el estado ANTERIOR completo, no solo el id.
   *
   * El audit log guardaba unicamente los nombres de los campos tocados, asi
   * que "quien cambio el abogado de este caso y que decia antes" no se podia
   * responder. Con `before`/`after` el historial existe de verdad — que es
   * justo lo que la grilla de tracking muestra al costado de la celda.
   */
  const existing = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true, primaryInsuranceId: true, primaryPolicyNumber: true,
      lawFirmId: true, attorneyId: true, attorneyNameRaw: true,
    },
  });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });

  const { primaryInsuranceId, primaryPolicyNumber, lawFirmId, attorneyId, attorneyNameRaw } = parsed.data;

  const updated = await db.case.update({
    where: { id: caseId },
    data: {
      ...(primaryInsuranceId  !== undefined ? { primaryInsuranceId }  : {}),
      ...(primaryPolicyNumber !== undefined ? { primaryPolicyNumber } : {}),
      ...(lawFirmId           !== undefined ? { lawFirmId }           : {}),
      // Elegir del catalogo borra el texto libre: si no, la grilla mostraria el
      // nombre viejo escrito a mano y nadie sabria cual de los dos manda.
      ...(attorneyId          !== undefined ? { attorneyId, ...(attorneyId ? { attorneyNameRaw: null } : {}) } : {}),
      ...(attorneyNameRaw     !== undefined ? { attorneyNameRaw }     : {}),
    },
    select: {
      id: true, primaryInsuranceId: true, primaryPolicyNumber: true,
      lawFirmId: true, attorneyId: true, attorneyNameRaw: true,
    },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'UPDATE_CASE_INSURANCE_LEGAL',
    entityType:  'cases',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    before:      existing,
    after:       updated,
    metadata:    { fields: Object.keys(parsed.data), source: 'back-office' },
  });

  return NextResponse.json({ ok: true });
}
