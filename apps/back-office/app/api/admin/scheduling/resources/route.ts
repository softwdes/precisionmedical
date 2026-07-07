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

// Mapeo: nombre del catálogo (SpecialtyCatalog.name normalizado) →
// valores del enum Specialty del Provider que cubren esa línea de servicio.
// Usado para filtrar providers por el tipo de caso al agendar.
const CATALOG_TO_SPECIALTY_ENUM: Record<string, string[]> = {
  'auto accidents':    ['CHIROPRACTIC', 'ORTHOPEDICS', 'PAIN_MANAGEMENT', 'PHYSICAL_THERAPY', 'NEUROLOGY', 'RADIOLOGY'],
  'pain management':  ['PAIN_MANAGEMENT'],
  'family practice':  ['GENERAL'],
  'surgery':          ['ORTHOPEDICS'],
  'urgent care':      ['GENERAL', 'OTHER'],
  'chiropractic':     ['CHIROPRACTIC'],
  'physical therapy': ['PHYSICAL_THERAPY'],
  'orthopedics':      ['ORTHOPEDICS'],
  'neurology':        ['NEUROLOGY'],
  'radiology':        ['RADIOLOGY'],
  'psychology':       ['PSYCHOLOGY'],
};

export async function GET(): Promise<NextResponse> {
  const [clinics, providers, specialties] = await Promise.all([
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, phone: true },
    }),
    db.provider.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, specialty: true, licenseNumber: true },
    }),
    db.specialtyCatalog.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, color: true },
    }),
  ]);

  // Construye un mapa inverso: Specialty enum → [catalogId, ...]
  const enumToCatalogIds: Record<string, string[]> = {};
  for (const cat of specialties) {
    const key = cat.name.toLowerCase().trim();
    const enums = CATALOG_TO_SPECIALTY_ENUM[key] ?? [];
    for (const e of enums) {
      enumToCatalogIds[e] ??= [];
      enumToCatalogIds[e].push(cat.id);
    }
  }

  return NextResponse.json({
    clinics,
    providers: providers.map((p) => ({
      id:                 p.id,
      firstName:          p.firstName,
      lastName:           p.lastName,
      specialty:          p.specialty,
      licenseNumber:      p.licenseNumber,
      specialtyCatalogIds: enumToCatalogIds[p.specialty] ?? [],
    })),
    specialties,
  });
}
