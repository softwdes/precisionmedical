/**
 * PatientsData — server component compartido de la lista de pacientes (B.4).
 *
 * Usado por:
 *   - /patients          (admin, sin scope)
 *   - /doctor/patients   (portal médico, scopeProviderId = doctor de sesión)
 *
 * Con `scopeProviderId`, la lista se limita a pacientes con al menos una cita
 * de ese provider y el client oculta las acciones administrativas.
 */

import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { Skeleton } from '@/components/ui-phoenix';
import { PatientsClient } from './patients-client';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';

/** Skeleton del Suspense boundary — compartido por /patients y /doctor/patients */
export function PatientsTableSkeleton() {
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

export async function PatientsData({
  q,
  page,
  inactiveOnly,
  PAGE_SIZE,
  scopeProviderId,
  basePath,
}: {
  q: string | undefined;
  page: number;
  inactiveOnly: boolean;
  PAGE_SIZE: number;
  scopeProviderId?: string;
  basePath?: string;
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

  // Portal médico: solo pacientes con cita de este doctor
  const providerScope = scopeProviderId
    ? { appointments: { some: { providerId: scopeProviderId } } }
    : {};

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
          providerScope,
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
    : { AND: [statusFilter, providerScope] };

  const [patients, total, inactiveTotal, activeTotal, specialties, clinics, providers] = await Promise.all([
    db.patient.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, phone2: true,
        patientCode: true, status: true, preferredLanguage: true,
        sex: true, maritalStatus: true, employer: true, preferredPharmacy: true,
        communicationPreference: true, referralSource: true, referralSourceOther: true,
        race: true, ethnicity: true, socialSecurityNumber: true,
        addressLine1: true, addressCity: true, addressState: true, addressZip: true,
        emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
        emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
        dateOfBirth: true, guardianName: true, guardianPhone: true, guardianRelation: true,
        // Vinculo real al tutor (lo escribe el alta del menor). Los campos de
        // texto de arriba son legado — ver pending-tasks.md.
        guardianPatientId: true,
        guardianPatient: { select: { id: true, patientCode: true, firstName: true, lastName: true, email: true, phone: true } },
        accidentDate: true, accidentType: true, insuranceCarrier: true, policyNumber: true,
        medicalHistory: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip:  page * PAGE_SIZE,
      take:  PAGE_SIZE,
    }),
    db.patient.count({ where }),
    db.patient.count({ where: { AND: [{ status: 'INACTIVE' }, providerScope] } }),
    db.patient.count({ where: { AND: [{ NOT: { status: 'INACTIVE' as const } }, providerScope] } }),
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
      scopeProviderId={scopeProviderId}
      basePath={basePath}
    />
  );
}
