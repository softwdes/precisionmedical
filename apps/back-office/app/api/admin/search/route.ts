/**
 * B.34 — Global Search ⌘K
 *
 * GET /api/admin/search?q=<query>
 *
 * Busca en transversal: SpecialtyCatalog, Lawyer (firms+members),
 * InsuranceCarrier, ServiceCode, Diagnosis.
 *
 * Phase 1A: solo catálogos (no PHI yet).
 * Phase 2+: agrega Patient + Case (RLS-protected).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { separarFecha, clausulasDeFecha } from '@/lib/fecha-buscada';
import { idsPorTelefono } from '@/lib/telefono-buscado';

function fullNameOR(q: string) {
  const parts = q.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0]!, last = parts[parts.length - 1]!;
  return [
    { firstName: { contains: first, mode: 'insensitive' as const }, lastName: { contains: last, mode: 'insensitive' as const } },
    { firstName: { contains: last,  mode: 'insensitive' as const }, lastName: { contains: first, mode: 'insensitive' as const } },
  ];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const limit = 5; // por categoría

  // Se calcula una sola vez: el bloque de pacientes lo usa más abajo.
  const { fechas, resto: restoDelTermino } = separarFecha(q);
  const porFechaDeNacimiento = fechas.length ? [{ OR: clausulasDeFecha(fechas) }] : [];
  // El teléfono, comparado por dígitos — ver `lib/telefono-buscado.ts`.
  const idsTelefono = await idsPorTelefono(restoDelTermino);

  // Búsqueda case-insensitive con prisma `contains` + mode insensitive
  const [specialties, lawyers, insurances, services, diagnoses, patients] = await Promise.all([
    db.specialtyCatalog.findMany({
      where: {
        deletedAt: null,
        OR: [{ name: { contains: q, mode: 'insensitive' } }],
      },
      take: limit,
      select: { id: true, name: true, color: true, isActive: true },
    }),
    db.lawyer.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...fullNameOR(q),
          { firmName: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        entityType: true,
        firmName: true,
        firstName: true,
        lastName: true,
        email: true,
        memberRole: true,
        parentFirmId: true,
      },
    }),
    db.insuranceCarrier.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { legalName: { contains: q, mode: 'insensitive' } },
          { shortCode: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: { id: true, name: true, shortCode: true, color: true, type: true },
    }),
    db.serviceCode.findMany({
      where: {
        deletedAt: null,
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { shortDescription: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: { id: true, code: true, shortDescription: true, type: true, currentFee: true, category: true },
    }),
    db.diagnosis.findMany({
      where: {
        isActive: true,
        OR: [
          { icd10Code: { contains: q, mode: 'insensitive' } },
          { icd10Description: { contains: q, mode: 'insensitive' } },
          { snomedCode: { contains: q, mode: 'insensitive' } },
          { snomedDescription: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: { id: true, icd10Code: true, icd10Description: true, snomedCode: true, piRelevant: true },
    }),
    // Patients — Phase 1A: mock data only · Phase 2: RLS-protected PHI
    db.patient.findMany({
      /**
       * La fecha de nacimiento se reconoce dentro del término y acota en `AND`
       * — igual que en los otros tres buscadores de paciente, para que el
       * mismo texto encuentre lo mismo en todas las pantallas. Los demás
       * bloques de esta búsqueda global (bufetes, CPT, ICD…) no la usan: sólo
       * las personas tienen fecha de nacimiento. Ver `lib/fecha-buscada.ts`.
       */
      where: {
        AND: [
          ...porFechaDeNacimiento,
          ...(restoDelTermino
            ? [{
                OR: [
                  ...fullNameOR(restoDelTermino),
                  { firstName: { contains: restoDelTermino, mode: 'insensitive' as const } },
                  { lastName: { contains: restoDelTermino, mode: 'insensitive' as const } },
                  { patientCode: { contains: restoDelTermino, mode: 'insensitive' as const } },
                  { phone: { contains: restoDelTermino, mode: 'insensitive' as const } },
                  { email: { contains: restoDelTermino, mode: 'insensitive' as const } },
                  ...(idsTelefono.length ? [{ id: { in: idsTelefono } }] : []),
                ],
              }]
            : []),
        ],
      },
      take: limit,
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        status: true,
        dateOfBirth: true,
        // Sin `deletedAt: null` el conteo incluye los casos archivados y el
        // paciente figura con más casos de los que tiene.
        _count: { select: { cases: { where: { deletedAt: null } } } },
      },
    }),
  ]);

  return NextResponse.json({
    query: q,
    results: {
      patients: patients.map((p) => ({
        id: p.id,
        patientCode: p.patientCode,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        status: p.status,
        casesCount: p._count.cases,
      })),
      specialties,
      lawyers: lawyers.map((l) => ({
        id: l.id,
        kind: l.entityType, // FIRM or INDEPENDENT
        firmName: l.firmName,
        memberName: l.firstName || l.lastName ? `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() : null,
        email: l.email,
        memberRole: l.memberRole,
        parentFirmId: l.parentFirmId,
      })),
      insurances,
      services: services.map((s) => ({ ...s, currentFee: Number(s.currentFee) })),
      diagnoses,
    },
  });
}
