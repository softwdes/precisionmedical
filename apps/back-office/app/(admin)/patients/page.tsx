/**
 * B.4 · Lista de pacientes
 * Accesible desde el sidebar → /patients
 */

import Link from 'next/link';
import { db } from '@precision-medical/database';
import { PageHeader } from '@/components/ui-phoenix';
import { PatientsClient } from './patients-client';

const PAGE_SIZE = 25;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(0, parseInt(pageParam ?? '0', 10) || 0);

  const where = q
    ? {
        OR: [
          { firstName:   { contains: q, mode: 'insensitive' as const } },
          { lastName:    { contains: q, mode: 'insensitive' as const } },
          { email:       { contains: q, mode: 'insensitive' as const } },
          { phone:       { contains: q, mode: 'insensitive' as const } },
          { patientCode: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [patients, total] = await Promise.all([
    db.patient.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        patientCode: true, status: true, preferredLanguage: true,
        emergencyContactName: true, emergencyContactPhone: true,
        accidentDate: true, accidentType: true,
        insuranceCarrier: true, policyNumber: true,
        dateOfBirth: true, guardianName: true, guardianPhone: true,
        guardianRelation: true, createdAt: true, updatedAt: true,
        // New fields
        phone2: true, addressCity: true, addressState: true,
        sex: true, referralSource: true,
      },
      orderBy: { createdAt: 'desc' },
      skip:  page * PAGE_SIZE,
      take:  PAGE_SIZE,
    }),
    db.patient.count({ where }),
  ]);

  const caseCounts = await db.case.groupBy({
    by: ['patientId'],
    where: { patientId: { in: patients.map(p => p.id) } },
    _count: { _all: true },
  });
  const caseCountMap = Object.fromEntries(caseCounts.map(c => [c.patientId, c._count._all]));
  const rows = patients.map(p => ({ ...p, caseCount: caseCountMap[p.id] ?? 0 }));

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Pacientes"
        subtitle={`${total} paciente${total !== 1 ? 's' : ''}${q ? ` · búsqueda: "${q}"` : ''}`}
      />

      {/* Barra de búsqueda + botón crear */}
      <div className="flex flex-wrap items-center gap-2">
        <form method="GET" className="flex gap-2 flex-1 min-w-0 flex-wrap">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, teléfono, email o código..."
            className="flex-1 min-w-[200px] bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            autoComplete="off"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            Buscar
          </button>
          {q && (
            <Link
              href="/patients"
              className="px-3 py-2 rounded-md border border-border text-sm text-text-2 hover:border-border-strong transition-colors"
            >
              Limpiar
            </Link>
          )}
        </form>

        {/* Botón crear — client component */}
        <PatientsClient.CreateButton />
      </div>

      <PatientsClient patients={rows} q={q} page={page} totalPages={totalPages} total={total} />
    </div>
  );
}
