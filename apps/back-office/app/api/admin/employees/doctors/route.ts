/**
 * GET /api/admin/employees/doctors
 * Lista empleados con position=DOCTOR para el selector de vinculación en Providers.
 */
import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(): Promise<NextResponse> {
  const doctors = await db.employee.findMany({
    where: {
      position: 'DOCTOR',
      status: 'ACTIVE',
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      providerProfile: { select: { id: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return NextResponse.json({
    doctors: doctors.map(d => ({
      id: d.id,
      name: `${d.firstName} ${d.lastName}`,
      linkedProviderId: d.providerProfile?.id ?? null,
    })),
  });
}
