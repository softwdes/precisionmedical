/**
 * GET /api/referrals/[id] — un referido de bufete, para precargar el wizard de
 * nuevo caso (`/patients?referral=<id>`).
 *
 * Lado clínica: cualquier interno con identidad (mismo criterio que la
 * mensajería). Devuelve el payload tal cual lo mandó el abogado más el bufete y
 * el abogado como resultados de autocomplete —así el wizard los pinta en sus
 * selectores sin buscar—, y el estado: si otro ya lo convirtió, la pantalla
 * ofrece abrir ese caso en vez de crear otro.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';
import type { ReferidoPayload, ReferidoParaWizard } from '@/lib/referidos/referido';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { id } = await ctx.params;

  const ref = await db.firmReferral.findUnique({
    where: { id },
    select: {
      id: true, status: true, payload: true, firmId: true, attorneyLawyerId: true, convertedByName: true, caseId: true,
      thread: { select: { case: { select: { id: true, caseCode: true } } } },
    },
  });
  if (!ref) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const [firm, attorney] = await Promise.all([
    db.lawyer.findUnique({ where: { id: ref.firmId }, select: { id: true, firmName: true, firstName: true, lastName: true, city: true } }),
    ref.attorneyLawyerId
      ? db.lawyer.findUnique({ where: { id: ref.attorneyLawyerId }, select: { id: true, firstName: true, lastName: true, memberRole: true } })
      : null,
  ]);

  const out: ReferidoParaWizard = {
    id: ref.id,
    status: ref.status as ReferidoParaWizard['status'],
    payload: ref.payload as unknown as ReferidoPayload,
    firm: {
      id: ref.firmId,
      label: firm?.firmName ?? (`${firm?.firstName ?? ''} ${firm?.lastName ?? ''}`.trim() || '—'),
      subtitle: firm?.city ?? undefined,
    },
    attorney: attorney
      ? { id: attorney.id, label: `${attorney.firstName ?? ''} ${attorney.lastName ?? ''}`.trim(), subtitle: attorney.memberRole ?? undefined }
      : null,
    caseCode: ref.thread.case?.caseCode ?? null,
    convertedByName: ref.convertedByName,
  };
  return NextResponse.json({ ...out, caseId: ref.caseId ?? ref.thread.case?.id ?? null });
}
