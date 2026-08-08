/**
 * GET /api/messages/users → staff interno para el picker To/CC y el select
 * "ver inbox de…". Solo roles internos (MESSAGING_ROLES): los logins de
 * abogados/proveedores externos no participan de la mensajería clínica.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor, MESSAGING_ROLES } from '@/lib/messaging';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;

  const users = await db.user.findMany({
    where: { status: 'ACTIVE', deletedAt: null, role: { in: [...MESSAGING_ROLES] } },
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
