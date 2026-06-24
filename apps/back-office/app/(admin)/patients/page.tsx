/**
 * B.4 · Lista de pacientes
 * Accesible desde el sidebar → /patients
 */

import Link from 'next/link';
import { db } from '@precision-medical/database';
import { PageHeader } from '@/components/ui-phoenix';
import { PatientsClient } from './patients-client';

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const patients = await db.patient.findMany({
    where: q
      ? {
          OR: [
            { firstName:   { contains: q, mode: 'insensitive' } },
            { lastName:    { contains: q, mode: 'insensitive' } },
            { email:       { contains: q, mode: 'insensitive' } },
            { phone:       { contains: q, mode: 'insensitive' } },
            { patientCode: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      patientCode: true,
      status: true,
      preferredLanguage: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      accidentDate: true,
      accidentType: true,
      insuranceCarrier: true,
      policyNumber: true,
      dateOfBirth: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Count cases per patient in a separate query to avoid select + _count TS conflict
  const caseCounts = await db.case.groupBy({
    by: ['patientId'],
    where: { patientId: { in: patients.map(p => p.id) } },
    _count: { _all: true },
  });
  const caseCountMap = Object.fromEntries(caseCounts.map(c => [c.patientId, c._count._all]));

  const rows = patients.map(p => ({ ...p, caseCount: caseCountMap[p.id] ?? 0 }));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Pacientes"
        subtitle={`${patients.length} paciente${patients.length !== 1 ? 's' : ''}${q ? ` · búsqueda: "${q}"` : ''}`}
      />

      {/* Search bar */}
      <form method="GET" className="flex gap-2 max-w-sm flex-wrap">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, teléfono, email o código..."
          className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-w-0"
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

      <PatientsClient patients={rows} q={q} />
    </div>
  );
}
