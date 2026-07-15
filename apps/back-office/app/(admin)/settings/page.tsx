import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { redirect } from 'next/navigation';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const userId = user.id;
  const [
    clinics,
    specialties,
    providers,
    firms,
    insurances,
    services,
    serviceFavs,
    ,  // diagnoses — eliminado, se carga via API paginada
    diagnosisFavs,
    diagnosisTotal,
    diagnosisPiRelevant,
    diagnosisWithSnomed,
    templates,
    auditTotal,
    auditToday,
    auditHuman,
    auditSystem,
    auditLogs,
  ] = await Promise.all([
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, address: true, phone: true, cellPhone: true,
        email: true, zipCode: true, state: true, city: true, color: true,
        _count: { select: { appointments: true } },
      },
    }),
    db.specialtyCatalog.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { doctorAssignments: true } } },
    }),
    db.provider.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { lastName: 'asc' }],
      include: {
        _count: { select: { appointments: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.lawyer.findMany({
      where: { entityType: 'FIRM', deletedAt: null },
      orderBy: [{ status: 'asc' }, { firmName: 'asc' }],
      include: { _count: { select: { members: true } } },
    }),
    db.insuranceCarrier.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.serviceCode.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    }),
    db.userServiceFavorite.findMany({ where: { userId: userId }, select: { serviceCodeId: true } }),
    // Diagnoses: solo stats — los rows se cargan via API paginada en DiagnosesClient
    Promise.resolve([] as unknown[]),
    db.userDiagnosisFavorite.findMany({ where: { userId: userId }, select: { diagnosisId: true } }),
    db.diagnosis.count(),
    db.diagnosis.count({ where: { piRelevant: true } }),
    db.diagnosis.count({ where: { snomedCode: { not: null } } }),
    db.template.findMany({
      where: { deletedAt: null },
      include: {
        sections: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { visitNotes: true, favorites: true } },
      },
      orderBy: [{ isActive: 'desc' }, { usageCount: 'desc' }, { title: 'asc' }],
    }),
    db.auditLog.count(),
    db.auditLog.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    db.auditLog.count({ where: { actorType: 'HUMAN_USER' } }),
    db.auditLog.count({ where: { actorType: 'SYSTEM' } }),
    db.auditLog.findMany({
      select: {
        id: true, actorType: true, actorUserId: true, actorRole: true,
        action: true, entityType: true, entityId: true,
        ipAddress: true, metadata: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const serviceFavIds  = new Set(serviceFavs.map((f) => f.serviceCodeId));
  const diagnosisFavIds = new Set(diagnosisFavs.map((f) => f.diagnosisId));

  return (
    <SettingsClient
      initialClinics={clinics.map((c) => ({
        id: c.id, name: c.name, address: c.address ?? '', phone: c.phone ?? '',
        cellPhone: c.cellPhone ?? '', email: c.email ?? '', zipCode: c.zipCode ?? '',
        state: c.state ?? '', city: c.city ?? '', color: c.color ?? '#6366F1',
        appointmentCount: c._count.appointments,
      }))}
      initialSpecialties={specialties.map((s) => ({
        id: s.id, name: s.name, description: s.description, color: s.color,
        caseType: s.caseType, cptSuggested: s.cptSuggested, workflowType: s.workflowType,
        isActive: s.isActive, sortOrder: s.sortOrder, doctorCount: s._count.doctorAssignments,
      }))}
      specialtyStats={{
        total: specialties.length,
        active: specialties.filter((s) => s.isActive).length,
        inactive: specialties.filter((s) => !s.isActive).length,
        totalDoctors: specialties.reduce((sum, s) => sum + s._count.doctorAssignments, 0),
      }}
      initialProviders={providers.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        specialty: p.specialty,
        licenseNumber: p.licenseNumber,
        status: p.status,
        appointmentCount: p._count.appointments,
        employeeId: p.employeeId ?? null,
        employee: p.employee ?? null,
      }))}
      providerStats={{
        total: providers.length,
        active: providers.filter((p) => p.status === 'ACTIVE').length,
        inactive: providers.filter((p) => p.status !== 'ACTIVE').length,
        bySpecialty: providers.reduce((acc, p) => {
          acc[p.specialty] = (acc[p.specialty] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      }}
      initialFirms={firms.map((f) => ({
        id: f.id, firmName: f.firmName ?? '—', email: f.email, phone: f.phone,
        address: f.address, city: f.city, state: f.state, notes: f.notes,
        paymentSpeed: f.paymentSpeed, caseflowFlags: f.caseflowFlags,
        status: f.status, memberCount: f._count.members, createdAt: f.createdAt,
      }))}
      firmStats={{
        total: firms.length,
        active: firms.filter((f) => f.status === 'ACTIVE').length,
        inactive: firms.filter((f) => f.status === 'INACTIVE').length,
        totalMembers: firms.reduce((n, f) => n + f._count.members, 0),
        slowPayers: firms.filter((f) => f.paymentSpeed === 'SLOW').length,
      }}
      initialInsurances={insurances.map((i) => ({
        id: i.id, name: i.name, legalName: i.legalName, shortCode: i.shortCode,
        color: i.color, type: i.type, claimsPhone: i.claimsPhone, claimsEmail: i.claimsEmail,
        claimsFax: i.claimsFax, claimsAddress: i.claimsAddress, portalUrl: i.portalUrl,
        hcfaChannel: i.hcfaChannel, preauthRequired: i.preauthRequired,
        avgResponseDays: i.avgResponseDays, responseSpeed: i.responseSpeed,
        notes: i.notes, isActive: i.isActive,
      }))}
      insuranceStats={{
        total: insurances.length,
        active: insurances.filter((i) => i.isActive).length,
        pip: insurances.filter((i) => i.type === 'PIP').length,
        medpay: insurances.filter((i) => i.type === 'MED_PAY').length,
        health: insurances.filter((i) => i.type === 'HEALTH').length,
        slow: insurances.filter((i) => i.responseSpeed === 'SLOW').length,
        fast: insurances.filter((i) => i.responseSpeed === 'FAST').length,
        average: insurances.filter((i) => i.responseSpeed === 'AVERAGE').length,
      }}
      initialServices={services.map((s) => ({
        id: s.id, code: s.code, type: s.type, shortDescription: s.shortDescription,
        longDescription: s.longDescription, category: s.category,
        currentFee: Number(s.currentFee), fiscalYear: s.fiscalYear,
        modifiersAllowed: s.modifiersAllowed, bundlingNotes: s.bundlingNotes,
        notes: s.notes, isActive: s.isActive, isInternalOnly: s.isInternalOnly,
        isFavorite: serviceFavIds.has(s.id),
      }))}
      serviceStats={{
        total: services.length,
        active: services.filter((s) => s.isActive).length,
        billable: services.filter((s) => !s.isInternalOnly).length,
        internal: services.filter((s) => s.isInternalOnly).length,
        cpt: services.filter((s) => s.type === 'CPT').length,
        hcpcs: services.filter((s) => s.type === 'HCPCS').length,
        custom: services.filter((s) => s.type === 'CUSTOM_PM').length,
        favorites: serviceFavIds.size,
      }}
      diagnosisStats={{
        total: diagnosisTotal,
        active: diagnosisTotal,
        piRelevant: diagnosisPiRelevant,
        withSnomed: diagnosisWithSnomed,
        favorites: diagnosisFavIds.size,
      }}
      diagnosisUserId={userId}
      initialTemplates={templates.map((t) => ({
        id:            t.id,
        title:         t.title,
        description:   t.description,
        encounterType: t.encounterType,
        caseType:      t.caseType,
        scope:         t.scope,
        specialty:     t.specialty,
        isActive:      t.isActive,
        usageCount:    t.usageCount,
        sections:      t.sections.map((s) => ({
          id:               s.id,
          sectionKey:       s.sectionKey,
          content:          s.content,
          enabledByDefault: s.enabledByDefault,
          orderIndex:       s.orderIndex,
        })),
        visitNoteCount: t._count.visitNotes,
      }))}
      templateStats={{
        total:    templates.length,
        active:   templates.filter((t) => t.isActive).length,
        shared:   templates.filter((t) => t.scope === 'SHARED').length,
        personal: templates.filter((t) => t.scope === 'PERSONAL').length,
        byEncounter: templates.reduce((acc, t) => {
          acc[t.encounterType] = (acc[t.encounterType] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      }}
      auditKpis={{ total: auditTotal, todayCount: auditToday, humanCount: auditHuman, systemCount: auditSystem }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialAuditLogs={auditLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })) as any}
    />
  );
}
