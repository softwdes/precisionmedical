/**
 * Seed mock billing data para B.25-B.27 (Brunella's billing inbox).
 * Crea: Countries, Clinics, Specialties, Lawyers, Insurances,
 *        Patients, Cases, Appointments, VisitNotes SIGNED, CPTs asignados.
 * Run: node packages/database/prisma/seed-billing-mock.mjs
 * CERO PHI real — solo datos ficticios de desarrollo.
 */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  // ── Countries ─────────────────────────────────────────────────────────────
  await db.country.upsert({ where: { code: 'US' }, update: {}, create: { code: 'US', name: 'United States', currency: 'USD' } });

  // ── Clinics ────────────────────────────────────────────────────────────────
  const pgClinic = await db.clinic.upsert({
    where: { name: 'Pleasant Grove Clinic' },
    update: {},
    create: { name: 'Pleasant Grove Clinic', address: '1234 State St, Pleasant Grove, UT 84062', phone: '+1-801-555-0100' },
  });
  const pvClinic = await db.clinic.upsert({
    where: { name: 'Provo Clinic' },
    update: {},
    create: { name: 'Provo Clinic', address: '5678 University Ave, Provo, UT 84601', phone: '+1-801-555-0200' },
  });

  // ── Departments ────────────────────────────────────────────────────────────
  await db.department.upsert({ where: { name: 'Medical Staff' }, update: {}, create: { name: 'Medical Staff' } });

  // ── Specialties ────────────────────────────────────────────────────────────
  const autoSpec = await db.specialtyCatalog.upsert({
    where: { name: 'Auto Accidents' },
    update: {},
    create: { name: 'Auto Accidents', description: 'Casos PI post-accidente · MVA workflow', color: '#F43F5E', caseType: 'MVA', cptSuggested: ['99213','99214','98941'], workflowType: 'MVA', sortOrder: 1 },
  });
  const painSpec = await db.specialtyCatalog.upsert({
    where: { name: 'Pain Management' },
    update: {},
    create: { name: 'Pain Management', description: 'Manejo de dolor · trigger points · inyecciones', color: '#F59E0B', caseType: 'MVA', cptSuggested: ['20552','20553','64483'], workflowType: 'MVA', sortOrder: 2 },
  });

  console.log('✅ Clinics + Specialties OK');

  // ── Law Firms ──────────────────────────────────────────────────────────────
  const sjFirm = await db.lawyer.upsert({
    where: { email: 'contact@smith-johnson.example' },
    update: {},
    create: { entityType: 'FIRM', firmName: 'Smith & Johnson LLP', email: 'contact@smith-johnson.example', phone: '+1-801-555-0301', city: 'Provo', state: 'UT', paymentSpeed: 'FAST' },
  });
  const sjAtty = await db.lawyer.upsert({
    where: { email: 'mary.smith@smith-johnson.example' },
    update: {},
    create: { entityType: 'FIRM_MEMBER', firstName: 'Mary', lastName: 'Smith', email: 'mary.smith@smith-johnson.example', phone: '+1-801-555-0311', memberRole: 'ATTORNEY', parentFirmId: sjFirm.id },
  });

  const baFirm = await db.lawyer.upsert({
    where: { email: 'info@brown-assoc.example' },
    update: {},
    create: { entityType: 'FIRM', firmName: 'Brown & Associates', email: 'info@brown-assoc.example', phone: '+1-801-555-0401', city: 'West Valley', state: 'UT', paymentSpeed: 'AVERAGE' },
  });
  const baAtty = await db.lawyer.upsert({
    where: { email: 'michael.brown@brown-assoc.example' },
    update: {},
    create: { entityType: 'FIRM_MEMBER', firstName: 'Michael', lastName: 'Brown', email: 'michael.brown@brown-assoc.example', phone: '+1-801-555-0411', memberRole: 'ATTORNEY', parentFirmId: baFirm.id },
  });

  const gaFirm = await db.lawyer.upsert({
    where: { email: 'info@garcia-law.example' },
    update: {},
    create: { entityType: 'FIRM', firmName: 'Garcia Law Firm', email: 'info@garcia-law.example', phone: '+1-801-555-0501', city: 'Salt Lake City', state: 'UT', paymentSpeed: 'SLOW' },
  });
  const gaAtty = await db.lawyer.upsert({
    where: { email: 'carlos.garcia@garcia-law.example' },
    update: {},
    create: { entityType: 'FIRM_MEMBER', firstName: 'Carlos', lastName: 'Garcia', email: 'carlos.garcia@garcia-law.example', phone: '+1-801-555-0511', memberRole: 'ATTORNEY', parentFirmId: gaFirm.id },
  });

  console.log('✅ Law firms + attorneys OK');

  // ── Insurance Carriers ─────────────────────────────────────────────────────
  const geico = await db.insuranceCarrier.upsert({
    where: { name: 'GEICO' },
    update: {},
    create: { name: 'GEICO', shortCode: 'GEI', type: 'PIP', color: '#10B981', claimsPhone: '+1-800-841-3000', hcfaChannel: 'PORTAL', responseSpeed: 'FAST' },
  });
  const stateFarm = await db.insuranceCarrier.upsert({
    where: { name: 'State Farm' },
    update: {},
    create: { name: 'State Farm', shortCode: 'SF', type: 'PIP', color: '#EF4444', claimsPhone: '+1-800-732-5246', hcfaChannel: 'FAX', responseSpeed: 'AVERAGE' },
  });
  const progressive = await db.insuranceCarrier.upsert({
    where: { name: 'Progressive' },
    update: {},
    create: { name: 'Progressive', shortCode: 'PRG', type: 'PIP', color: '#3B82F6', claimsPhone: '+1-800-776-4737', hcfaChannel: 'EMAIL', responseSpeed: 'AVERAGE' },
  });
  const farmers = await db.insuranceCarrier.upsert({
    where: { name: 'Farmers' },
    update: {},
    create: { name: 'Farmers', shortCode: 'FAR', type: 'PIP', color: '#F59E0B', claimsPhone: '+1-800-435-7764', hcfaChannel: 'FAX', responseSpeed: 'SLOW' },
  });

  console.log('✅ Insurance carriers OK');

  // ── Provider User (PROVIDER role) ──────────────────────────────────────────
  // Intenta encontrar un usuario PROVIDER existente; si no, lo crea.
  let provider = await db.user.findFirst({ where: { role: 'PROVIDER', status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true } });
  if (!provider) {
    provider = await db.user.upsert({
      where: { email: 'dr.garcia.mock@precisionmedical.example' },
      update: {},
      create: {
        email: 'dr.garcia.mock@precisionmedical.example',
        firstName: 'Ana',
        lastName: 'Garcia',
        role: 'PROVIDER',
        status: 'ACTIVE',
      },
      select: { id: true, firstName: true, lastName: true },
    });
    console.log('✅ Mock provider created: Dr.', provider.firstName, provider.lastName);
  } else {
    console.log('✅ Provider found: Dr.', provider.firstName, provider.lastName);
  }
  const providerName = `Dr. ${provider.firstName} ${provider.lastName}`;

  // ── Service codes (lookup) ─────────────────────────────────────────────────
  const svcCodes = await db.serviceCode.findMany({
    where: { isActive: true, fiscalYear: 2026 },
    select: { id: true, code: true, currentFee: true, shortDescription: true },
  });
  const svcByCode = new Map(svcCodes.map(s => [s.code, s]));

  // ── Mock Cases + Patients + Appointments + VisitNotes SIGNED ──────────────
  const cases = [
    {
      patient: { code: 'PT-2962', firstName: 'Mario', lastName: 'Fernández', email: 'mario.f.mock@example.com', phone: '+1-801-555-2962', dob: new Date('1982-04-15') },
      caseCode: 'MVA-2962',
      firm: sjFirm, attorney: sjAtty,
      insurance: geico, policyNumber: 'GEI-7842-PIP',
      specialty: autoSpec, clinic: pgClinic,
      accidentDate: new Date('2026-05-22'),
      status: 'ACTIVE',
      visits: [
        { date: new Date('2026-05-28'), cpts: ['99204', '98941'], signed: true },
        { date: new Date('2026-06-04'), cpts: ['99214', '98940', '97140'], signed: true },
        { date: new Date('2026-06-11'), cpts: ['99213', '97110'], signed: true },
      ],
    },
    {
      patient: { code: 'PT-2865', firstName: 'Sandra', lastName: 'López', email: 'sandra.l.mock@example.com', phone: '+1-801-555-2865', dob: new Date('1988-03-22') },
      caseCode: 'MVA-2865',
      firm: gaFirm, attorney: gaAtty,
      insurance: farmers, policyNumber: 'FA-5588',
      specialty: painSpec, clinic: pvClinic,
      accidentDate: new Date('2026-04-10'),
      status: 'ACTIVE',
      visits: [
        { date: new Date('2026-04-17'), cpts: ['99204', '20552'], signed: true },
        { date: new Date('2026-04-24'), cpts: ['99214', '20553', '64483'], signed: true },
        { date: new Date('2026-05-05'), cpts: ['99213', '20552'], signed: true },
        { date: new Date('2026-05-15'), cpts: ['99214'], signed: true },
      ],
    },
    {
      patient: { code: 'PT-2949', firstName: 'Mónica', lastName: 'Silva', email: 'monica.s.mock@example.com', phone: '+1-801-555-2949', dob: new Date('1990-08-30') },
      caseCode: 'MVA-2949',
      firm: baFirm, attorney: baAtty,
      insurance: stateFarm, policyNumber: 'SF-9921-AUTO',
      specialty: autoSpec, clinic: pgClinic,
      accidentDate: new Date('2026-06-01'),
      status: 'INTAKE_PENDING',
      visits: [],
    },
    {
      patient: { code: 'PT-2944', firstName: 'Erik', lastName: 'Penrose', email: 'erik.p.mock@example.com', phone: '+1-801-555-2944', dob: new Date('1975-12-10') },
      caseCode: 'MVA-2944',
      firm: sjFirm, attorney: sjAtty,
      insurance: progressive, policyNumber: 'PRG-1192',
      specialty: autoSpec, clinic: pgClinic,
      accidentDate: new Date('2026-06-04'),
      status: 'NEW_REFERRAL',
      visits: [],
    },
  ];

  for (const m of cases) {
    // Upsert patient
    const patient = await db.patient.upsert({
      where: { patientCode: m.patient.code },
      update: {},
      create: {
        patientCode: m.patient.code,
        firstName: m.patient.firstName,
        lastName: m.patient.lastName,
        email: m.patient.email,
        phone: m.patient.phone,
        dateOfBirth: m.patient.dob,
        accidentDate: m.accidentDate,
        accidentType: 'AUTO',
        status: 'ACTIVE',
      },
    });

    // Upsert case
    const theCase = await db.case.upsert({
      where: { caseCode: m.caseCode },
      update: {},
      create: {
        caseCode: m.caseCode,
        patientId: patient.id,
        caseType: 'MVA',
        specialtyId: m.specialty.id,
        lawFirmId: m.firm.id,
        attorneyId: m.attorney.id,
        primaryInsuranceId: m.insurance.id,
        primaryPolicyNumber: m.policyNumber,
        accidentDate: m.accidentDate,
        accidentType: 'AUTO',
        status: m.status,
        source: 'LAW_FIRM_REFERRAL',
      },
    });

    // Create appointments + visit notes
    for (const v of m.visits) {
      // Check if appointment already exists for this case+date
      const existingAppt = await db.appointment.findFirst({
        where: { caseId: theCase.id, scheduledFor: v.date },
        select: { id: true },
      });
      if (existingAppt) continue;

      const appt = await db.appointment.create({
        data: {
          caseId: theCase.id,
          patientId: patient.id,
          clinicId: m.clinic.id,
          scheduledFor: v.date,
          status: 'COMPLETED',
          type: 'AUTO_ACCIDENT',
        },
      });

      if (v.signed) {
        // Create VisitNote SIGNED
        const note = await db.visitNote.create({
          data: {
            appointmentId: appt.id,
            status: 'SIGNED',
            chiefComplaint: 'Paciente con dolor cervical y lumbar post-MVA.',
            hpi: 'Paciente continúa con dolor cervical y lumbar. Refiere mejoría parcial con tratamiento.',
            ros: 'Niega mareos, náuseas, fiebre. Cefalea leve intermitente.',
            physicalExam: 'Cervical: contractura paravertebral. ROM limitado en flexión. Lumbar: TTP paraspinal bilateral.',
            assessment: 'Dolor musculoesquelético post-MVA con mejoría progresiva. Continúa tratamiento conservador.',
            plan: 'Continuar fisioterapia 2x/semana. Próxima cita en 2 semanas. Se ordena MRI si no mejora.',
            signedAt: new Date(v.date.getTime() + 2 * 3600000), // 2h after visit
            signedById: provider.id,
            signedByName: providerName,
          },
        });

        // Attach CPT codes via raw SQL (visit_service_codes table)
        for (const cptCode of v.cpts) {
          const svc = svcByCode.get(cptCode);
          if (!svc) { console.warn(`  ⚠ CPT ${cptCode} not found in catalog — skip`); continue; }
          await db.$executeRaw`
            INSERT INTO visit_service_codes (id, "visitNoteId", "serviceCodeId", "cptCode", description, "feeCatalog", units, "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), ${note.id}, ${svc.id}, ${cptCode}, ${svc.shortDescription ?? ''}, ${svc.currentFee}, 1, now(), now())
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    console.log(`✅ Case ${m.caseCode} (${m.patient.firstName} ${m.patient.lastName}) — ${m.visits.filter(v=>v.signed).length} signed visits`);
  }

  // Summary
  const [noteCount, caseCount] = await Promise.all([
    db.visitNote.count({ where: { status: 'SIGNED' } }),
    db.case.count(),
  ]);
  console.log(`\n📊 DB summary: ${caseCount} cases, ${noteCount} signed notes`);
  console.log('🎉 Billing mock seed complete — Brunella\'s inbox ready (B.25-B.27)');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
