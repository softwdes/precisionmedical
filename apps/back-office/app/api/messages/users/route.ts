/**
 * GET /api/messages/users → gente para el picker To/CC y el select
 * "ver inbox de…".
 *
 * Por defecto SOLO roles internos (`MESSAGING_ROLES`). Con `?withLawyers=1` se
 * suman los abogados con acceso al portal, que ahora sí participan: cobranza les
 * escribe y ellos responden (decisión de Erick, 2026-08-26).
 *
 * El agregado es opt-in y no por defecto a propósito: este mismo endpoint
 * alimenta el select de **"ver inbox de…"**, y ahí un abogado no tiene nada que
 * hacer — mirar la bandeja ajena es una herramienta interna. Los que la piden
 * son los pickers de destinatarios, no ese select.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor, MESSAGING_ROLES } from '@/lib/messaging';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const conAbogados = req.nextUrl.searchParams.get('withLawyers') === '1';
  const roles = conAbogados ? [...MESSAGING_ROLES, 'LAWYER' as const] : [...MESSAGING_ROLES];

  const users = await db.user.findMany({
    where: { status: 'ACTIVE', deletedAt: null, role: { in: roles } },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      role: u.role,
    })),
  });
}
