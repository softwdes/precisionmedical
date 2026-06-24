/**
 * B.4 · Lista de pacientes
 * Accesible desde el sidebar → /patients
 */

import Link from 'next/link';
import { db } from '@precision-medical/database';
import { PageHeader, PersonAvatar, TagPill } from '@/components/ui-phoenix';
import { Users } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  NEW:        'bg-brand/15 text-brand border-brand/30',
  ACTIVE:     'bg-emerald/15 text-emerald border-emerald/30',
  COMPLETED:  'bg-cyan/15 text-cyan border-cyan/30',
  DISCHARGED: 'bg-amber/15 text-amber border-amber/30',
  INACTIVE:   'bg-text-muted/15 text-text-muted border-text-muted/30',
};

const STATUS_LABEL: Record<string, string> = {
  NEW:        'Nuevo',
  ACTIVE:     'Activo',
  COMPLETED:  'Completado',
  DISCHARGED: 'Dado de alta',
  INACTIVE:   'Inactivo',
};

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
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName:  { contains: q, mode: 'insensitive' } },
            { email:     { contains: q, mode: 'insensitive' } },
            { phone:     { contains: q, mode: 'insensitive' } },
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

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Pacientes"
        subtitle={`${patients.length} paciente${patients.length !== 1 ? 's' : ''}${q ? ` · búsqueda: "${q}"` : ''}`}
      />

      {/* Search bar */}
      <form method="GET" className="flex gap-2 max-w-sm">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, teléfono, email o código..."
          className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
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

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-2 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Paciente</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell">Contacto</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell">Casos</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {patients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {q ? `Sin resultados para "${q}"` : 'No hay pacientes registrados'}
                </td>
              </tr>
            )}
            {patients.map((p) => (
              <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/patients/${p.id}`} className="flex items-center gap-3 group">
                    <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={8} />
                    <div>
                      <div className="text-text-1 font-medium group-hover:text-brand transition-colors">
                        {p.firstName} {p.lastName}
                      </div>
                      {p.patientCode && (
                        <div className="text-text-muted text-[10px] font-mono">{p.patientCode}</div>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="text-text-2 text-xs space-y-0.5">
                    {p.phone && <div className="font-mono">{p.phone}</div>}
                    {p.email && <div className="text-text-muted truncate max-w-[180px]">{p.email}</div>}
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-text-2">{caseCountMap[p.id] ?? 0} caso{(caseCountMap[p.id] ?? 0) !== 1 ? 's' : ''}</span>
                </td>
                <td className="px-4 py-3">
                  <TagPill
                    label={STATUS_LABEL[p.status] ?? p.status}
                    colorClass={STATUS_COLORS[p.status] ?? 'bg-bg-2 text-text-2 border-border'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
