import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

/** GET /api/admin/patients/:id/cases — casos de un paciente para el selector de citas */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const cases = await db.case.findMany({
    where: { patientId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      caseCode: true,
      status: true,
      specialty: { select: { id: true, name: true, color: true } },
      accidentType: true,
    },
  });

  return NextResponse.json({ cases });
}
