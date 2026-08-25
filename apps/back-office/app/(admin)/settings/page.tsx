import { db } from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { redirect } from 'next/navigation';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const userId = user.id;
  /**
   * En DOS tandas, no en una de doce.
   *
   * Esta pantalla abria 17 consultas EN PARALELO y rompio dos veces por eso: con
   * el pool por defecto de Prisma (`num_cpus*2+1`, 49 en la maquina de Erick)
   * agotaba el pooler de transacciones de Supabase y Prisma reportaba
   * "Can't reach database server" —que suena a base caida cuando en realidad
   * estaba llena—; y con `connection_limit=1` se serializaban y las ultimas
   * morian por `pool_timeout`.
   *
   * Acotar la concurrencia ACA y no solo en la URL: el numero del env hay que
   * afinarlo en cada entorno (local, Vercel) y nadie se acuerda. Dos tandas de 7
   * y 5 entran en cualquier limite razonable. Cuesta un viaje de ida y vuelta
   * extra —unos 150 ms— en una pantalla de configuracion que se mira poco.
   */
  const [
    clinics,
    specialties,
    providers,
    firms,
    insurances,
    adjusters,
    services,
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
    db.insuranceAdjuster.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: { insuranceCarrier: { select: { id: true, name: true, shortCode: true, color: true } } },
    }),
    db.serviceCode.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    }),
  ]);

  const [
    serviceFavs,
    diagnosisFavs,
    diagnosisCounts,
    auditCounts,
    auditLogs,
  ] = await Promise.all([
    db.userServiceFavorite.findMany({ where: { userId: userId }, select: { serviceCodeId: true } }),
    db.userDiagnosisFavorite.findMany({ where: { userId: userId }, select: { diagnosisId: true } }),
    /**
     * Los 3 conteos de diagnosticos y los 4 de auditoria, en 2 viajes en vez de 7.
     *
     * Esta pantalla abria 17 consultas EN PARALELO, y con eso agotaba el pool de
     * Prisma contra el pooler de transacciones de Supabase: la pagina moria con
     * "Can't reach database server at ...:6543", que suena a base caida cuando en
     * realidad estaba llena. Settings era el canario —la que mas conexiones pide
     * de golpe—, no la culpable.
     *
     * `count(*) FILTER (WHERE ...)` resuelve varios conteos sobre la MISMA tabla
     * en una sola pasada. No hay equivalente en la API de Prisma, de ahi el raw.
     *
     * `::int` porque `count()` de Postgres devuelve bigint y eso no serializa a
     * JSON: sin el cast, cruzar el limite server→client revienta.
     */
    db.$queryRaw<[{ total: number; pi: number; snomed: number }]>`
      SELECT count(*)::int                                        AS total,
             count(*) FILTER (WHERE "piRelevant")::int            AS pi,
             count(*) FILTER (WHERE "snomedCode" IS NOT NULL)::int AS snomed
        FROM diagnoses
    `,
    /**
     * `hoy` se corta en la medianoche de la CLINICA, no del servidor.
     *
     * Era `new Date().setHours(0,0,0,0)`, o sea medianoche LOCAL del proceso —
     * en Vercel eso es UTC, asi que "hoy" arrancaba a las 5 o 6 de la tarde del
     * dia anterior en Utah y el numero contaba horas que no eran de hoy.
     * `date_trunc` con la zona lo resuelve exacto y aguanta el cambio de horario.
     */
    db.$queryRaw<[{ total: number; hoy: number; humano: number; sistema: number }]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (
               WHERE "createdAt" >= date_trunc('day', now() AT TIME ZONE 'America/Denver')
                                    AT TIME ZONE 'America/Denver'
             )::int AS hoy,
             count(*) FILTER (WHERE "actorType" = 'HUMAN_USER')::int AS humano,
             count(*) FILTER (WHERE "actorType" = 'SYSTEM')::int     AS sistema
        FROM audit_logs
    `,
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
        id: f.id, firmName: f.firmName ?? '—', entityType: f.entityType,
        email: f.email, phone: f.phone, address: f.address, city: f.city,
        state: f.state, notes: f.notes, paymentSpeed: f.paymentSpeed,
        caseflowFlags: f.caseflowFlags, status: f.status,
        memberCount: f._count.members, createdAt: f.createdAt, updatedAt: f.updatedAt,
      }))}
      firmStats={{
        total: firms.length,
        active: firms.filter((f) => f.status === 'ACTIVE').length,
        inactive: firms.filter((f) => f.status === 'INACTIVE').length,
        totalMembers: firms.reduce((n, f) => n + f._count.members, 0),
        slowPayers: firms.filter((f) => f.paymentSpeed === 'SLOW').length,
        independentCount: firms.filter((f) => f.entityType === 'INDEPENDENT').length,
        newLast30: 0,
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
      initialAdjusters={adjusters.map((a) => ({
        id: a.id, insuranceCarrierId: a.insuranceCarrierId, name: a.name,
        phone: a.phone, extension: a.extension, phone2: a.phone2, fax: a.fax,
        email: a.email, notes: a.notes, status: a.status,
        carrier: a.insuranceCarrier,
      }))}
      adjusterCarriers={insurances
        .filter((i) => i.isActive)
        .map((i) => ({ id: i.id, name: i.name, shortCode: i.shortCode, color: i.color }))}
      adjusterStats={{
        total: adjusters.length,
        active: adjusters.filter((a) => a.status === 'ACTIVE').length,
        carriersCovered: new Set(adjusters.map((a) => a.insuranceCarrierId)).size,
        noPhone: adjusters.filter((a) => !a.phone && !a.phone2).length,
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
        total: diagnosisCounts[0].total,
        active: diagnosisCounts[0].total,
        piRelevant: diagnosisCounts[0].pi,
        withSnomed: diagnosisCounts[0].snomed,
        favorites: diagnosisFavIds.size,
      }}
      diagnosisUserId={userId}
      auditKpis={{
        total:       auditCounts[0].total,
        todayCount:  auditCounts[0].hoy,
        humanCount:  auditCounts[0].humano,
        systemCount: auditCounts[0].sistema,
      }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialAuditLogs={auditLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })) as any}
    />
  );
}
