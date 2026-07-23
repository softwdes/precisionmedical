/**
 * B.4 · Lista de pacientes
 * Accesible desde el sidebar → /patients
 */

import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { PageHeader } from '@/components/ui-phoenix';
import { PatientsClient } from './patients-client';
import { decryptField } from '@/lib/decrypt';

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; showInactive?: string; size?: string }>;
}) {
  const t = await getTranslations('phoenix.patients');
  const { q, page: pageParam, showInactive, size: sizeParam } = await searchParams;
  const page = Math.max(0, parseInt(pageParam ?? '0', 10) || 0);
  const inactiveOnly = showInactive === '1';
  const PAGE_SIZE = Math.min(50, Math.max(5, parseInt(sizeParam ?? '15', 10) || 15));

  const statusFilter = inactiveOnly
    ? { status: 'INACTIVE' as const }
    : { NOT: { status: 'INACTIVE' as const } };

  const qParts = q ? q.trim().split(/\s+/).filter(Boolean) : [];
  const fullNameClauses = qParts.length >= 2
    ? [
        { firstName: { contains: qParts[0]!, mode: 'insensitive' as const }, lastName: { contains: qParts[qParts.length - 1]!, mode: 'insensitive' as const } },
        { firstName: { contains: qParts[qParts.length - 1]!, mode: 'insensitive' as const }, lastName: { contains: qParts[0]!, mode: 'insensitive' as const } },
      ]
    : [];

  const where = q
    ? {
        AND: [
          statusFilter,
          {
            OR: [
              ...fullNameClauses,
              { firstName:   { contains: q, mode: 'insensitive' as const } },
              { lastName:    { contains: q, mode: 'insensitive' as const } },
              { email:       { contains: q, mode: 'insensitive' as const } },
              { phone:       { contains: q, mode: 'insensitive' as const } },
              { patientCode: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        ],
      }
    : statusFilter;

  const [patients, total, inactiveTotal, activeTotal, specialties, clinics, providers] = await Promise.all([
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
    db.patient.count({ where: { status: 'INACTIVE' } }),
    db.patient.count({ where: { NOT: { status: 'INACTIVE' as const } } }),
    db.specialtyCatalog.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true },
    }),
    db.provider.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ specialty: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, specialty: true },
    }),
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
        accidentDate: true,
        status: true,
        portalToken: true,
        intakeFormSentAt: true,
        intakeFormCompletedAt: true,
        consentsData: true,
        intakeSubmission: { select: { id: true } },
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
    phone:                    decryptField(p.phone) ?? p.phone,
    addressCity:              decryptField(p.addressCity) ?? p.addressCity,
    addressState:             decryptField(p.addressState) ?? p.addressState,
    addressZip:               decryptField(p.addressZip) ?? p.addressZip,
    emergencyContactName:     decryptField(p.emergencyContactName) ?? p.emergencyContactName,
    emergencyContactPhone:    decryptField(p.emergencyContactPhone) ?? p.emergencyContactPhone,
    emergencyContactRelation: decryptField(p.emergencyContactRelation) ?? p.emergencyContactRelation,
    employer:                 decryptField(p.employer),
    caseCount: caseCountMap[p.id] ?? 0,
    latestCase: latestCaseMap[p.id]
      ? {
          id:                    latestCaseMap[p.id].id,
          caseCode:              latestCaseMap[p.id].caseCode,
          caseType:              latestCaseMap[p.id].caseType,
          accidentDate:          latestCaseMap[p.id].accidentDate?.toISOString() ?? null,
          portalToken:           latestCaseMap[p.id].portalToken ?? null,
          status:                latestCaseMap[p.id].status,
          intakeFormSentAt:      latestCaseMap[p.id].intakeFormSentAt?.toISOString() ?? null,
          intakeFormCompletedAt: latestCaseMap[p.id].intakeFormCompletedAt?.toISOString() ?? null,
          consentsData:          latestCaseMap[p.id].consentsData as Record<string, unknown> | null,
          hasIntakeSubmission:   !!latestCaseMap[p.id].intakeSubmission,
        }
      : null,
  }));

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 space-y-2">
      <PageHeader
        title={t('listTitle')}
        subtitle={`${total} ${total === 1 ? t('colPatient').toLowerCase() : t('colPatient').toLowerCase() + 's'}${q ? ` · ${t('btnSearch').toLowerCase()}: "${q}"` : ''}`}
      />

      <PatientsClient patients={rows} q={q} page={page} pageSize={PAGE_SIZE} totalPages={totalPages} total={total} inactiveTotal={inactiveTotal} activeTotal={activeTotal} specialties={specialties} clinics={clinics} providers={providers} inactiveOnly={inactiveOnly} />
    </div>
  );
}
