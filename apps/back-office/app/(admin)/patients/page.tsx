/**
 * B.4 · Lista de pacientes
 * Accesible desde el sidebar → /patients
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { PageHeader } from '@/components/ui-phoenix';
import { PatientsClient } from './patients-client';

const PAGE_SIZE = 25;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const t = await getTranslations('phoenix.patients');
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
        id: true, firstName: true, lastName: true, email: true, phone: true, phone2: true,
        patientCode: true, status: true, preferredLanguage: true,
        sex: true, maritalStatus: true, employer: true, preferredPharmacy: true,
        communicationPreference: true, referralSource: true,
        race: true, ethnicity: true, socialSecurityNumber: true,
        addressLine1: true, addressCity: true, addressState: true, addressZip: true,
        emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
        emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
        dateOfBirth: true, guardianName: true, guardianPhone: true, guardianRelation: true,
        accidentDate: true, accidentType: true, insuranceCarrier: true, policyNumber: true,
        medicalHistory: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip:  page * PAGE_SIZE,
      take:  PAGE_SIZE,
    }),
    db.patient.count({ where }),
  ]);

  const patientIds = patients.map(p => p.id);

  const [caseCounts, latestCases] = await Promise.all([
    db.case.groupBy({
      by: ['patientId'],
      where: { patientId: { in: patientIds }, deletedAt: null },
      _count: { _all: true },
    }),
    db.case.findMany({
      where: { patientId: { in: patientIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        patientId: true,
        id: true,
        caseCode: true,
        caseType: true,
        status: true,
        portalToken: true,
        intakeFormSentAt: true,
        intakeFormCompletedAt: true,
        consentsData: true,
      },
    }),
  ]);

  const caseCountMap = Object.fromEntries(caseCounts.map(c => [c.patientId, c._count._all]));

  // Keep only the most-recent case per patient
  const latestCaseMap: Record<string, typeof latestCases[0]> = {};
  for (const c of latestCases) {
    if (!latestCaseMap[c.patientId]) latestCaseMap[c.patientId] = c;
  }

  const rows = patients.map(p => ({
    ...p,
    caseCount: caseCountMap[p.id] ?? 0,
    latestCase: latestCaseMap[p.id]
      ? {
          id:                    latestCaseMap[p.id].id,
          caseCode:              latestCaseMap[p.id].caseCode,
          caseType:              latestCaseMap[p.id].caseType,
          portalToken:           latestCaseMap[p.id].portalToken ?? null,
          status:                latestCaseMap[p.id].status,
          intakeFormSentAt:      latestCaseMap[p.id].intakeFormSentAt?.toISOString() ?? null,
          intakeFormCompletedAt: latestCaseMap[p.id].intakeFormCompletedAt?.toISOString() ?? null,
          consentsData:          latestCaseMap[p.id].consentsData as Record<string, unknown> | null,
        }
      : null,
  }));

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title={t('listTitle')}
        subtitle={`${total} ${total === 1 ? t('colPatient').toLowerCase() : t('colPatient').toLowerCase() + 's'}${q ? ` · ${t('btnSearch').toLowerCase()}: "${q}"` : ''}`}
      />

      {/* Barra de búsqueda + botón crear */}
      <div className="flex flex-wrap items-center gap-2">
        <form method="GET" className="flex gap-2 flex-1 min-w-0 flex-wrap">
          <input
            name="q"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            className="flex-1 min-w-[200px] bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            autoComplete="off"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            {t('btnSearch')}
          </button>
          {q && (
            <Link
              href="/patients"
              className="px-3 py-2 rounded-md border border-border text-sm text-text-2 hover:border-border-strong transition-colors"
            >
              {t('btnClear')}
            </Link>
          )}
        </form>

      </div>

      <PatientsClient patients={rows} q={q} page={page} totalPages={totalPages} total={total} />
    </div>
  );
}
