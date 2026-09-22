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
              /**
               * Cuántas veces se firmó. Más de una = la clínica la corrigió
               * DESPUÉS de que el bufete pudo haberla leído o descargado.
               *
               * Devin, 2026-09-21 (punto 4D): *"The alert to the biller could
               * also go to the attorney portal signifying theres been a change
               * and they need to re-download the new version"*.
               *
               * El versionado deja el expediente correcto, pero no le avisa a
               * quien ya leyó — son dos problemas distintos, y este es el
               * segundo. Sin canal nuevo: la marca aparece sobre la nota misma,
               * que es lo que el abogado está mirando.
               */
              _count: { select: { versions: true } },
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

  /**
   * `_count.versions` es el número de FIRMAS; lo que el abogado necesita saber
   * es cuántas veces se CORRIGIÓ, que es una menos. Se traduce acá y no en la
   * pantalla para que el portal no tenga que conocer cómo guardamos las
   * versiones — si mañana cambia, cambia de este lado.
   */
  const caso = {
    ...c,
    appointments: c.appointments.map((a) => ({
      ...a,
      visitNote: a.visitNote
        ? { ...a.visitNote, revisiones: Math.max(0, (a.visitNote._count?.versions ?? 1) - 1) }
        : null,
    })),
  };

  return NextResponse.json({ ok: true, case: caso, signatures: sigs });
}
