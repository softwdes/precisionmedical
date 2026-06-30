/**
 * B.10 — Recursos para agendar: clínicas + providers activos + especialidades del catálogo.
 *
 * GET /api/admin/scheduling/resources
 *   → { clinics, providers, specialties }
 *
 * Los providers vienen del modelo Provider (que usa Appointment.providerId).
 * Las especialidades son del SpecialtyCatalog para el selector del UI.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

export async function GET(): Promise<NextResponse> {
  const [clinics, providers, specialties] = await Promise.all([
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, phone: true },
    }),
    db.provider.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
        licenseNumber: true,
      },
    }),
    db.specialtyCatalog.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, color: true },
    }),
  ]);

  return NextResponse.json({
    clinics,
    // specialtyCatalogIds vacío — el filtro es por specialty enum del provider vs del caso
    providers: providers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      specialty: p.specialty,
      licenseNumber: p.licenseNumber,
      specialtyCatalogIds: [] as string[],
    })),
    specialties,
  });
}
