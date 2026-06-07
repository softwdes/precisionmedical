/**
 * B.10 — Recursos para agendar: clínicas activas + providers activos.
 *
 * GET /api/admin/scheduling/resources
 *   → { clinics: [{id, name, ...}], providers: [{id, firstName, lastName, specialty, ...}] }
 *
 * Phase 1A: devuelve todos los activos sin filtrar por clinic-provider relation
 * (en legacy schema no hay relación many-to-many entre clinic y provider).
 * Phase 2: si se agrega ProviderClinic table, filtramos providers por clinic.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(): Promise<NextResponse> {
  const [clinics, providers] = await Promise.all([
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, phone: true },
    }),
    db.provider.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ specialty: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        licenseNumber: true,
      },
    }),
  ]);

  return NextResponse.json({ clinics, providers });
}
