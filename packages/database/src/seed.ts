import { db } from './index';

async function seed(): Promise<void> {
  console.warn('🌱 Seeding database...');

  // Countries
  const [us, bolivia, peru] = await Promise.all([
    db.country.upsert({
      where: { code: 'US' },
      update: {},
      create: { code: 'US', name: 'United States', currency: 'USD' },
    }),
    db.country.upsert({
      where: { code: 'BO' },
      update: {},
      create: { code: 'BO', name: 'Bolivia', currency: 'BOB' },
    }),
    db.country.upsert({
      where: { code: 'PE' },
      update: {},
      create: { code: 'PE', name: 'Peru', currency: 'PEN' },
    }),
  ]);

  console.warn(`✅ Countries: US(${us.id}), BO(${bolivia.id}), PE(${peru.id})`);

  // Departments
  const departments = [
    'Front Desk',
    'Medical Staff',
    'Administration',
    'IT / Tech',
    'Operations',
    'Finance',
  ];

  await Promise.all(
    departments.map((name) =>
      db.department.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  console.warn(`✅ Departments: ${departments.length} created`);

  // Clinics
  await Promise.all([
    // Nombres con sufijo " Clinic" para matchear clinics.name en prod
    // (migration 20260528130000_clinics_table.sql). Sin esto, el form de
    // horarios genera schedules con clinic_name que no matchea y el
    // timeclock cae en la primera opcion alfabetica por default.
    db.clinic.upsert({
      where: { name: 'Pleasant Grove Clinic' },
      update: {},
      create: {
        name: 'Pleasant Grove Clinic',
        address: '1234 State St, Pleasant Grove, UT 84062',
        phone: '+1-801-555-0100',
      },
    }),
    db.clinic.upsert({
      where: { name: 'Provo Clinic' },
      update: {},
      create: {
        name: 'Provo Clinic',
        address: '5678 University Ave, Provo, UT 84601',
        phone: '+1-801-555-0200',
      },
    }),
  ]);

  console.warn('✅ Clinics: Pleasant Grove Clinic, Provo Clinic');

  // Cash Boxes
  await Promise.all([
    db.cashBox.upsert({
      where: { name: 'Pleasant Grove Box' },
      update: {},
      create: {
        name: 'Pleasant Grove Box',
        currency: 'USD',
        balance: 500,
        lowBalanceThreshold: 100,
      },
    }),
    db.cashBox.upsert({
      where: { name: 'Provo Box' },
      update: {},
      create: {
        name: 'Provo Box',
        currency: 'USD',
        balance: 500,
        lowBalanceThreshold: 100,
      },
    }),
  ]);

  console.warn('✅ Cash Boxes: Pleasant Grove Box, Provo Box');

  // ─────────────────────────────────────────────────────────────────────
  // PHOENIX (LM v3) — Phase 0 seeds · NO-PHI catalogs only
  // Added 2026-06-05 · capturados del LM legacy MVA F/U template
  // ─────────────────────────────────────────────────────────────────────

  // Diagnoses: dual ICD-10 + SNOMED CT (capturados del B.18 legacy)
  const diagnosesSeed = [
    { icd10Code: 'M62.838', icd10Description: 'Other muscle spasm', snomedCode: '1141864009', snomedDescription: 'Perioral spasm', category: 'M', bodySystem: 'Musculoskeletal', piRelevant: true },
    { icd10Code: 'S46.819A', icd10Description: 'Strain of other muscles, fascia and tendons at shoulder and upper arm level, unspecified arm, initial encounter', snomedCode: '1254774007', snomedDescription: 'Traumatic tear of pectoralis', category: 'S', bodySystem: 'Shoulder/Upper arm', piRelevant: true },
    { icd10Code: 'S13.4XXA', icd10Description: 'Sprain of ligaments of cervical spine, initial encounter', snomedCode: '122751000119105', snomedDescription: 'Acute posttraumatic headache', category: 'S', bodySystem: 'Cervical spine', piRelevant: true },
    { icd10Code: 'G47.9', icd10Description: 'Sleep disorder, unspecified', snomedCode: '12262002', snomedDescription: 'Restless sleep', category: 'G', bodySystem: 'Neurological', piRelevant: true },
    { icd10Code: 'M54.2', icd10Description: 'Cervicalgia', snomedCode: '102554000', snomedDescription: 'Tenderness of spinous process', category: 'M', bodySystem: 'Cervical spine', piRelevant: true },
    { icd10Code: 'M54.12', icd10Description: 'Radiculopathy, cervical region', snomedCode: '103014001', snomedDescription: 'Cervical nerve root pain', category: 'M', bodySystem: 'Cervical spine', piRelevant: true },
    { icd10Code: 'M54.6', icd10Description: 'Pain in thoracic spine', snomedCode: '136791000119103', snomedDescription: 'Chronic thoracic back pain', category: 'M', bodySystem: 'Thoracic spine', piRelevant: true },
    { icd10Code: 'M54.50', icd10Description: 'Low back pain, unspecified', snomedCode: '1119213008', snomedDescription: 'Tenderness of left lumbar region', category: 'M', bodySystem: 'Lumbar spine', piRelevant: true },
    { icd10Code: 'M53.3', icd10Description: 'Sacrococcygeal disorders, not elsewhere classified', snomedCode: '1224255100119102', snomedDescription: 'Pain in left sacroiliac', category: 'M', bodySystem: 'Sacrum', piRelevant: true },
    { icd10Code: 'M54.17', icd10Description: 'Radiculopathy, lumbosacral region', snomedCode: '103016004', snomedDescription: 'Lumbosacral nerve root pain', category: 'M', bodySystem: 'Lumbosacral spine', piRelevant: true },
    { icd10Code: 'R51.9', icd10Description: 'Headache, unspecified', snomedCode: '103007003', snomedDescription: 'Headache due to external cause', category: 'R', bodySystem: 'Head', piRelevant: true },
  ];

  await Promise.all(
    diagnosesSeed.map((dx) =>
      db.diagnosis.upsert({
        where: { icd10Code: dx.icd10Code },
        update: {},
        create: dx as Parameters<typeof db.diagnosis.create>[0]['data'],
      }),
    ),
  );

  console.warn(`✅ Phoenix Diagnoses: ${diagnosesSeed.length} ICD-10 + SNOMED dual (PI-relevant)`);

  // SpecialtyCatalog: 6 especialidades del legacy con colores + CPT sugeridos
  const specialtiesSeed = [
    { name: 'Auto Accidents', description: 'Casos PI post-accidente automovilístico · MVA workflow · lien-based billing', color: '#F43F5E', caseType: 'MVA' as const, cptSuggested: ['99213', '99214', '98941', '98942', '97140'], workflowType: 'MVA', sortOrder: 1 },
    { name: 'Pain Management', description: 'Manejo de dolor crónico · trigger points · inyecciones · DAW EPCS', color: '#F59E0B', caseType: 'MVA' as const, cptSuggested: ['20552', '20553', '64483', '64633', '99213'], workflowType: 'MVA', sortOrder: 2 },
    { name: 'Family Practice', description: 'Medicina general · seguimientos · GM workflow (no MVA)', color: '#34D399', caseType: 'GENERAL' as const, cptSuggested: ['99213', '99214', '99215'], workflowType: 'GM', sortOrder: 3 },
    { name: 'Urgent Care', description: 'Atención inmediata sin cita previa · GM workflow · walk-ins', color: '#06B6D4', caseType: 'GENERAL' as const, cptSuggested: ['99203', '99213', '99214'], workflowType: 'GM', sortOrder: 4 },
    { name: 'Surgery', description: 'Procedimientos quirúrgicos menores · derivaciones a especialistas', color: '#8B5CF6', caseType: 'GENERAL' as const, cptSuggested: [], workflowType: 'GM', sortOrder: 5 },
    { name: 'Membership', description: 'Plan de membresía mensual · self-pay con suscripción · sin facturación a aseguradora', color: '#EC4899', caseType: 'GENERAL' as const, cptSuggested: [], workflowType: 'SELFPAY', sortOrder: 6 },
  ];

  await Promise.all(
    specialtiesSeed.map((sp) =>
      db.specialtyCatalog.upsert({
        where: { name: sp.name },
        update: {
          color: sp.color,
          description: sp.description,
          cptSuggested: sp.cptSuggested,
          workflowType: sp.workflowType,
          sortOrder: sp.sortOrder,
        },
        create: sp,
      }),
    ),
  );

  console.warn(`✅ Phoenix Specialties: ${specialtiesSeed.length} líneas de servicio (colores + CPT sugeridos)`);

  // Bufetes (B.30) — 4 firms con sus members
  const lawFirmsSeed = [
    {
      firm: {
        firmName: 'Smith & Johnson LLP',
        email: 'contact@smith-johnson.example',
        phone: '+1-801-555-0301',
        address: '123 Center St, Suite 200',
        city: 'Provo',
        state: 'UT',
        paymentSpeed: 'FAST' as const,
        notes: 'Bufete principal · paga puntual · alto volumen de casos PI',
        caseflowFlags: ['PIP-COVERED', 'MED-PAY'],
      },
      members: [
        { firstName: 'Mary', lastName: 'Smith', email: 'mary.smith@smith-johnson.example', phone: '+1-801-555-0311', memberRole: 'ATTORNEY' as const },
        { firstName: 'David', lastName: 'Johnson', email: 'david.johnson@smith-johnson.example', phone: '+1-801-555-0312', memberRole: 'ATTORNEY' as const },
        { firstName: 'Linda', lastName: 'Garcia', email: 'linda.garcia@smith-johnson.example', phone: '+1-801-555-0313', memberRole: 'CASE_MANAGER' as const },
      ],
    },
    {
      firm: {
        firmName: 'Brown & Associates',
        email: 'info@brown-assoc.example',
        phone: '+1-801-555-0401',
        address: '4085 S 2200 W',
        city: 'West Valley',
        state: 'UT',
        paymentSpeed: 'AVERAGE' as const,
        notes: 'Volumen medio · responde rápido a Edson',
        caseflowFlags: ['PIP-COVERED'],
      },
      members: [
        { firstName: 'Michael', lastName: 'Brown', email: 'michael.brown@brown-assoc.example', phone: '+1-801-555-0411', memberRole: 'ATTORNEY' as const },
        { firstName: 'Jennifer', lastName: 'Lopez', email: 'jennifer.lopez@brown-assoc.example', phone: '+1-801-555-0412', memberRole: 'CASE_MANAGER' as const },
      ],
    },
    {
      firm: {
        firmName: 'Garcia Law Firm',
        email: 'contacto@garcia-law.example',
        phone: '+1-801-555-0501',
        address: '65 W 200 N Suite 7',
        city: 'Spanish Fork',
        state: 'UT',
        paymentSpeed: 'SLOW' as const,
        notes: 'PAGO LENTO · seguir mensualmente · ~165 días promedio',
        caseflowFlags: ['PIP-COVERED'],
      },
      members: [
        { firstName: 'Roberto', lastName: 'Garcia', email: 'roberto.garcia@garcia-law.example', phone: '+1-801-555-0511', memberRole: 'ATTORNEY' as const },
        { firstName: 'Sofia', lastName: 'Martinez', email: 'sofia.martinez@garcia-law.example', phone: '+1-801-555-0512', memberRole: 'PARALEGAL' as const },
      ],
    },
    {
      firm: {
        firmName: 'Bennet & Lopez',
        email: 'old@bennet-lopez.example',
        phone: '+1-801-555-0601',
        address: 'Inactive — no longer accepting referrals',
        city: 'West Valley',
        state: 'UT',
        paymentSpeed: 'UNKNOWN' as const,
        notes: 'INACTIVO desde Mar 2026 · no respondió 6 meses',
        caseflowFlags: [],
      },
      members: [
        { firstName: 'James', lastName: 'Bennet', email: 'james.bennet@bennet-lopez.example', phone: '+1-801-555-0611', memberRole: 'ATTORNEY' as const },
      ],
      isInactive: true,
    },
  ];

  for (const { firm, members, isInactive } of lawFirmsSeed) {
    const firmRecord = await db.lawyer.upsert({
      where: { email: firm.email },
      update: {},
      create: {
        entityType: 'FIRM',
        firmName: firm.firmName,
        email: firm.email,
        phone: firm.phone,
        address: firm.address,
        city: firm.city,
        state: firm.state,
        paymentSpeed: firm.paymentSpeed,
        notes: firm.notes,
        caseflowFlags: firm.caseflowFlags,
        status: isInactive ? 'INACTIVE' : 'ACTIVE',
      },
    });

    for (const member of members) {
      await db.lawyer.upsert({
        where: { email: member.email },
        update: {},
        create: {
          entityType: 'INDEPENDENT',
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone,
          memberRole: member.memberRole,
          parentFirmId: firmRecord.id,
          city: firm.city,
          state: firm.state,
          status: isInactive ? 'INACTIVE' : 'ACTIVE',
        },
      });
    }
  }

  console.warn(`✅ Phoenix Bufetes: ${lawFirmsSeed.length} firms + ${lawFirmsSeed.reduce((n, f) => n + f.members.length, 0)} members (B.30/B.31)`);

  // Template sample: NG-MVA F/U (Motor Vehicle Accident Follow-up)
  // Capturado del LM legacy 2026-06-05. Solo se crea si existe al menos un User
  // (porque template.createdBy es FK obligatorio). Skip silencioso si no hay user
  // (Phase 1 cargará templates después de crear users reales).
  const firstUser = await db.user.findFirst({ select: { id: true } });

  if (firstUser) {
    const existingTemplate = await db.template.findFirst({
      where: { title: 'NG-MVA F/U' },
      select: { id: true },
    });

    if (!existingTemplate) {
      const template = await db.template.create({
        data: {
          title: 'NG-MVA F/U',
          description: 'Motor Vehicle Accident Follow-up · capturado del legacy 2026-06-05',
          encounterType: 'FOLLOW_UP',
          caseType: 'MVA',
          scope: 'SHARED',
          createdById: firstUser.id,
          isActive: true,
        },
      });

      // Crear 7 secciones (CC, HPI, ROS, PE, Eval, Plan, Dx)
      const sections = [
        {
          sectionKey: 'QUEJA_PRINCIPAL' as const,
          content: '',
          orderIndex: 0,
        },
        {
          sectionKey: 'HPI' as const,
          content: 'MVA date: ____ Chiro: ____\nPt has given us permission to release information to attorney:\n• Pt here for follow up\n• Reviewed MRI with pt in detail and answered questions. See assessment section/documents section for more details.\n**Treatments:** Been going to chiropractor x/week, massage x/week, using ice/heat, doing stretches.',
          orderIndex: 1,
        },
        {
          sectionKey: 'ROS' as const,
          content: 'Denies f/c, dizziness, syncope, eye pain/visual disturbances, ear pain, nasal congestion, ST, CP, racing heart/palpitations, trouble breathing/SOB, cough, abd pain, n/v, diarrhea, constipation, blood in stool, dysuria, hematuria, edema, rashes',
          orderIndex: 2,
        },
        {
          sectionKey: 'EXAMEN_FISICO' as const,
          content: '**General:** NAD, alert, Ox3. Normal mood/affect.\n**EENT:** PERRLA, no vision disturbances/changes, EOM intact. TMs pearly gray/intact.\n**Neck:** Increased tone/tight/TTP paracervical/trapezius/erector/levator/rhomboid muscles, limited/pain with ROM- improving with treatment plan.\n**Chest:** Heart RRR, No murmurs.\n**Abd:** Soft. Nontender.\n**MSKTL:** Increased tone/tight/TTP paraspinal muscles, SI Joint TTP, limited ROM.',
          orderIndex: 3,
        },
        {
          sectionKey: 'EVALUACIONES' as const,
          content: 'Variante Básica (9): Neck Pain · Whiplash · Trapezius Strain · Thoracic BP · Low BP · Sacroilliac · Muscle Spasms · Headaches · Sleep Disturbance',
          variants: [
            { label: 'Básica (9)', content: '1. Neck Pain\n2. Whiplash\n3. Trapezius Strain\n4. Thoracic Back Pain\n5. Low Back Pain\n6. Sacroilliac pain\n7. Muscle Spasms\n8. Headaches\n9. Sleep Disturbance' },
            { label: 'Intermedia (11)', content: '1. Neck Pain\n2. Cervical Radiculopathy\n3. Whiplash\n4. Trapezius Strain\n5. Thoracic Back Pain\n6. Low Back Pain\n7. Sacroilliac pain\n8. Lumbosacral Radiculopathy\n9. Muscle Spasms\n10. Headaches\n11. Sleep Disturbance' },
            { label: 'Severa (13)', content: '1. Neck Pain\n2. Cervical Radiculopathy\n3. Paresthesias Upper Extremity\n4. Whiplash\n5. Trapezius Strain\n6. Thoracic Back Pain\n7. Low Back Pain\n8. Sacroilliac pain\n9. Lumbosacral Radiculopathy\n10. Paresthesias Lower Extremity\n11. Muscle Spasms\n12. Headaches\n13. Sleep Disturbance' },
          ] as Parameters<typeof db.templateSection.create>[0]['data']['variants'],
          lockedBlocks: [
            {
              content_substring: 'reasonable degree of medical certainty',
              warning_message: 'PI Causation Statement — confirm before deleting',
            },
          ] as Parameters<typeof db.templateSection.create>[0]['data']['lockedBlocks'],
          orderIndex: 4,
        },
        {
          sectionKey: 'PLAN' as const,
          content: 'Standard plan with Rx + stretches + ice/heat + topical creams + TENS. See variants for With PT / Closing Case.',
          variants: [
            { label: 'Standard (sin PT)', content: '1. Continue chiropractic eval/treat/manipulation/modalities and massage therapy PRN\n2. Continue/Refill: RX Naproxen 500 mg BID with food\n3. Continue/Refill: RX Tizanidine 4 mg HS PRN OR RX Cyclobenzaprine 10 mg HS PRN\n4. Continue Tylenol 500 mg q8h PRN\n5. Stretches at least 2x/day. Use heat prior.\n6. Ice/heat therapy 20-30 min 3-4x/day.\n7. May use topical creams.\n8. May use TENs unit daily.' },
            { label: 'Con PT', content: 'Same as Standard + Order Physical Therapy eval/treat/modalities + home exercises program.' },
            { label: 'Closing Case (MMI)', content: 'CLOSING CASE:\nPt reports all injuries resolved / has reached state of static MMI. May close out case at this point.\n\nFuture care pricing (snapshot al firmar):\n• Follow Up Appointments: $250.00 (CPT 99213)\n• Trigger Point Injections: $300.00 (CPT 20552)\n• Medications for Injections: $120.00\n• All Spine and Epidural injections: $2,500.00 (CPT 64483)\n• Radio Frequency Ablation: $3,500.00 (CPT 64633)\n\nFollow up PRN.' },
          ] as Parameters<typeof db.templateSection.create>[0]['data']['variants'],
          proceduralBlocks: [
            {
              trigger: 'trigger_point_injection',
              content: 'After risks of injection discussed in detail, including skin/muscle atrophy and infection, patient gave informed consent (see signed consent). Utilizing sterile technique, cleaned area with alcohol and iodine and injected trigger point spasm in BLANK muscles with 40 mg kenalog/1 cc Marcaine/1 cc Lidocaine. Pt tolerated well. No bleeding. No complications.',
              cpt_code: '20552',
              consent_required: true,
            },
          ] as Parameters<typeof db.templateSection.create>[0]['data']['proceduralBlocks'],
          priceReferences: [
            { label: 'Follow Up Appointments with our Clinic', cpt_code: '99213' },
            { label: 'Trigger Point Injections', cpt_code: '20552' },
            { label: 'All Spine and Epidural injections', cpt_code: '64483' },
            { label: 'Radio Frequency Ablation', cpt_code: '64633' },
          ] as Parameters<typeof db.templateSection.create>[0]['data']['priceReferences'],
          orderIndex: 5,
        },
        {
          sectionKey: 'DIAGNOSTICOS' as const,
          content: 'Diagnósticos agregados al caso. Doctor selecciona del catálogo dual ICD-10+SNOMED en B.35.',
          orderIndex: 6,
        },
      ];

      await db.templateSection.createMany({
        data: sections.map((s) => ({
          templateId: template.id,
          sectionKey: s.sectionKey,
          content: s.content,
          orderIndex: s.orderIndex,
          variants: 'variants' in s ? (s.variants ?? undefined) : undefined,
          proceduralBlocks: 'proceduralBlocks' in s ? (s.proceduralBlocks ?? undefined) : undefined,
          priceReferences: 'priceReferences' in s ? (s.priceReferences ?? undefined) : undefined,
          lockedBlocks: 'lockedBlocks' in s ? (s.lockedBlocks ?? undefined) : undefined,
        })),
      });

      console.warn(`✅ Phoenix Template: NG-MVA F/U (7 sections, SHARED scope, MVA case type)`);
    } else {
      console.warn(`⏭ Phoenix Template: NG-MVA F/U ya existe (skip)`);
    }
  } else {
    console.warn(`⏭ Phoenix Template: skip (no users yet — corre seed después de crear al menos un user)`);
  }

  console.warn('🎉 Seed complete!');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
