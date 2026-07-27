/**
 * B.4 · Lista de pacientes
 * Accesible desde el sidebar → /patients
 *
 * Título + conteo se muestran dentro de PatientsClient (donde localTotal está disponible).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { Skeleton } from '@/components/ui-phoenix';
import { PatientsClient } from './patients-client';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';

// ---------------------------------------------------------------------------
// Skeleton interno para el Suspense boundary (solo la tabla)
// ---------------------------------------------------------------------------
function PatientsTableSkeleton() {
  return (
    <Skeleton.Card className="p-0 overflow-hidden mt-1">
      <div className="border-b border-border bg-bg-2/50 px-4 py-3 flex items-center gap-4">
        <Skeleton className="h-9 flex-1 min-w-[180px] max-w-sm" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-border/30 px-4 py-3 flex items-center gap-3"
          style={{ opacity: 1 - i * 0.1 }}
        >
          <Skeleton.Circle size={8} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-5 w-14 rounded-md hidden sm:block" />
          <Skeleton className="h-5 w-6 rounded" />
          <div className="flex gap-1">
            <Skeleton.Circle size={7} className="rounded-md" />
            <Skeleton.Circle size={7} className="rounded-md" />
            <Skeleton.Circle size={7} className="rounded-md" />
          </div>
        </div>
      ))}
      <div className="px-4 py-3 bg-bg-2/30 border-t border-border flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton.Circle size={7} className="rounded-md" />
          <Skeleton.Circle size={7} className="rounded-md" />
        </div>
      </div>
    </Skeleton.Card>
  );
}

// ---------------------------------------------------------------------------
// Componente async pesado — todas las queries Prisma aquí
// ---------------------------------------------------------------------------
async function PatientsData({
  q,
  page,
  inactiveOnly,
  PAGE_SIZE,
}: {
  q: string | undefined;
  page: number;
  inactiveOnly: boolean;
  PAGE_SIZE: number;
}) {
  // Obtener nombre del usuario actual para etiquetar llamadas
  let agentName: string | undefined;
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const admin = createAdminClient();
      const { data } = await admin.from('users').select('firstName, lastName').eq('email', user.email).single();
      if (data) agentName = `${data.firstName} ${data.lastName}`.trim() || undefined;
    }
  } catch { /* fallback: sin nombre */ }

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

  const latestCaseMap: Record<string, typeof latestCases[0]> = {};
  for (const c of latestCases) {
    if (!latestCaseMap[c.patientId]) latestCaseMap[c.patientId] = c;
  }

  const rows = patients.map(p => ({
    ...p,
    phone:                    dec(p.phone),
    phone2:                   dec(p.phone2),
    addressLine1:             dec(p.addressLine1),
    addressCity:              dec(p.addressCity),
    addressState:             dec(p.addressState),
    addressZip:               dec(p.addressZip),
    employer:                 dec(p.employer),
    preferredPharmacy:        dec(p.preferredPharmacy),
    socialSecurityNumber:     dec(p.socialSecurityNumber),
    emergencyContactName:     dec(p.emergencyContactName),
    emergencyContactPhone:    dec(p.emergencyContactPhone),
    emergencyContactRelation: dec(p.emergencyContactRelation),
    emergency2Name:           dec(p.emergency2Name),
    emergency2Phone:          dec(p.emergency2Phone),
    emergency2Relation:       dec(p.emergency2Relation),
    guardianName:             dec(p.guardianName),
    guardianPhone:            dec(p.guardianPhone),
    guardianRelation:         dec(p.guardianRelation),
    insuranceCarrier:         dec(p.insuranceCarrier),
    policyNumber:             dec(p.policyNumber),
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
    <PatientsClient
      key={inactiveOnly ? 'inactive' : 'active'}
      patients={rows}
      q={q}
      page={page}
      pageSize={PAGE_SIZE}
      totalPages={totalPages}
      total={total}
      inactiveTotal={inactiveTotal}
      activeTotal={activeTotal}
      specialties={specialties}
      clinics={clinics}
      providers={providers}
      inactiveOnly={inactiveOnly}
      agentName={agentName}
    />
  );
}

// ---------------------------------------------------------------------------
// Page — shell renderiza de inmediato, datos hacen streaming
// ---------------------------------------------------------------------------
export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; showInactive?: string; size?: string }>;
}) {
  const t = await getTranslations('phoenix.patients');
  const { q, page: pageParam, showInactive, size: sizeParam } = await searchParams;
  const page   = Math.max(0, parseInt(pageParam ?? '0', 10) || 0);
  const inactiveOnly = showInactive === '1';
  const PAGE_SIZE = Math.min(50, Math.max(5, parseInt(sizeParam ?? '15', 10) || 15));

  return (
    <div className="p-4 sm:p-6">
      {/* Tabla hace streaming cuando Prisma completa */}
      <Suspense fallback={<PatientsTableSkeleton />}>
        <PatientsData q={q} page={page} inactiveOnly={inactiveOnly} PAGE_SIZE={PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
