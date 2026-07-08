import { db } from '@precision-medical/database';
import { SettingsClient } from './settings-client';

const FAKE_USER_ID = 'erick-super-admin-stub';

export default async function SettingsPage() {
  const [
    clinics,
    specialties,
    firms,
    insurances,
    services,
    serviceFavs,
    diagnoses,
    diagnosisFavs,
  ] = await Promise.all([
    db.clinic.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, phone: true, _count: { select: { appointments: true } } },
    }),
    db.specialtyCatalog.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { doctorAssignments: true } } },
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
    db.userServiceFavorite.findMany({ where: { userId: FAKE_USER_ID }, select: { serviceCodeId: true } }),
    db.diagnosis.findMany({ orderBy: [{ isActive: 'desc' }, { piRelevant: 'desc' }, { icd10Code: 'asc' }] }),
    db.userDiagnosisFavorite.findMany({ where: { userId: FAKE_USER_ID }, select: { diagnosisId: true } }),
  ]);

  const serviceFavIds  = new Set(serviceFavs.map((f) => f.serviceCodeId));
  const diagnosisFavIds = new Set(diagnosisFavs.map((f) => f.diagnosisId));

  return (
    <SettingsClient
      initialClinics={clinics.map((c) => ({
        id: c.id, name: c.name, address: c.address ?? '', phone: c.phone ?? '',
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
      initialDiagnoses={diagnoses.map((d) => ({
        id: d.id, icd10Code: d.icd10Code, icd10Description: d.icd10Description,
        snomedCode: d.snomedCode, snomedDescription: d.snomedDescription,
        category: d.category, bodySystem: d.bodySystem, piRelevant: d.piRelevant,
        isActive: d.isActive, isFavorite: diagnosisFavIds.has(d.id),
      }))}
      diagnosisStats={{
        total: diagnoses.length,
        active: diagnoses.filter((d) => d.isActive).length,
        piRelevant: diagnoses.filter((d) => d.piRelevant).length,
        withSnomed: diagnoses.filter((d) => d.snomedCode).length,
        favorites: diagnosisFavIds.size,
      }}
    />
  );
}
