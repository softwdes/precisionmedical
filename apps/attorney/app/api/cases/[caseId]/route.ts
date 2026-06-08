/**
 * GET /api/cases/[caseId]
 * B.22 — Detalle de caso para el abogado
 */
import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ caseId: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { caseId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const c = await db.case.findUnique({
    where: { id: caseId, deletedAt: null },
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, phone: true },
      },
      lawFirm:  { select: { id: true, firmName: true } },
      attorney: { select: { id: true, firstName: true, lastName: true } },
      primaryInsurance:   { select: { id: true, name: true } },
      secondaryInsurance: { select: { id: true, name: true } },
      appointments: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          visitNote: {
            select: {
              id: true, status: true, signedAt: true, signedByName: true,
              chiefComplaint: true, assessment: true, plan: true,
              diagnoses: { select: { icd10Code: true, icd10Label: true } },
            },
          },
          provider: { select: { firstName: true, lastName: true } },
          clinic:   { select: { name: true } },
          labOrders: {
            select: { id: true, studyName: true, orderType: true, status: true, urgency: true, orderedAt: true },
          },
        },
        orderBy: { scheduledFor: 'desc' },
      },
    },
  });

  if (!c) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  // Fetch lien signatures for this case
  interface RawSig {
    id: string;
    signer_type: string;
    signer_name: string;
    signed_at: Date;
  }
  const sigs = await db.$queryRaw<RawSig[]>`
    SELECT id, signer_type, signer_name, signed_at
    FROM   lien_signatures
    WHERE  case_id = ${caseId}
    ORDER BY signed_at ASC
  `;

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'ATTORNEY_VIEW_CASE_DETAIL',
    entityType:  'case',
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { caseCode: c.caseCode },
  });

  return NextResponse.json({ ok: true, case: c, signatures: sigs });
}
