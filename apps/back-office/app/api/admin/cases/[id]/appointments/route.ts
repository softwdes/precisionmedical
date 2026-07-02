/**
 * GET /api/admin/cases/[id]/appointments
 *
 * Lista las citas asociadas a un caso específico.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const appointments = await db.appointment.findMany({
    where: { caseId: id },
    orderBy: { scheduledFor: 'asc' },
    select: {
      id: true,
      scheduledFor: true,
      durationMinutes: true,
      type: true,
      status: true,
      notes: true,
      checkedInAt: true,
      attendanceSignedAt: true,
      clinic: { select: { id: true, name: true } },
      provider: { select: { id: true, firstName: true, lastName: true, specialty: true } },
    },
  });

  return NextResponse.json({ ok: true, appointments });
}
