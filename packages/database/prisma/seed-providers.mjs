/**
 * seed-providers.mjs
 * Siembra: 2 clínicas, 3 providers (doctor/quiro/MRI), slots de appointment para mañana.
 * Idempotente — usa upsert/findFirst para no duplicar.
 * Run: node packages/database/prisma/seed-providers.mjs
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// ─── helpers ────────────────────────────────────────────────────────────────

function nextWeekday(offsetDays = 1) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  // skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function slotAt(baseDate, hour, minute = 0) {
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding providers, clinics & appointment slots...\n');

  // ── 1. Clinics ─────────────────────────────────────────────────────────────
  const clinicProvo = await db.clinic.upsert({
    where: { name: 'Provo Clinic' },
    update: {},
    create: {
      name:    'Provo Clinic',
      address: '1234 N University Ave, Provo, UT 84604',
      phone:   '(801) 375-2207',
    },
  });

  const clinicOrem = await db.clinic.upsert({
    where: { name: 'Orem Clinic' },
    update: {},
    create: {
      name:    'Orem Clinic',
      address: '567 S State St, Orem, UT 84058',
      phone:   '(801) 224-1100',
    },
  });

  console.log(`  ✓ Clinics: ${clinicProvo.name} (${clinicProvo.id}), ${clinicOrem.name} (${clinicOrem.id})`);

  // ── 2. Providers ──────────────────────────────────────────────────────────
  const providers = [
    {
      firstName:     'Mario',
      lastName:      'Ramírez',
      email:         'mario.ramirez@precisionmedicalcare.com',
      specialty:     'CHIROPRACTIC',
      licenseNumber: '1234567890',
      phone:         '(801) 555-1001',
    },
    {
      firstName:     'Sandra',
      lastName:      'Flores',
      email:         'sandra.flores@precisionmedicalcare.com',
      specialty:     'ORTHOPEDICS',
      licenseNumber: '0987654321',
      phone:         '(801) 555-1002',
    },
    {
      firstName:     'James',
      lastName:      'Park',
      email:         'james.park@precisionmedicalcare.com',
      specialty:     'RADIOLOGY',
      licenseNumber: '1122334455',
      phone:         '(801) 555-1003',
    },
  ];

  const createdProviders = [];
  for (const p of providers) {
    const existing = await db.provider.findFirst({
      where: { firstName: p.firstName, lastName: p.lastName },
    });

    const provider = existing
      ? await db.provider.update({
          where: { id: existing.id },
          data: { specialty: p.specialty, licenseNumber: p.licenseNumber, phone: p.phone },
        })
      : await db.provider.create({
          data: {
            firstName:     p.firstName,
            lastName:      p.lastName,
            email:         p.email,
            specialty:     p.specialty,
            licenseNumber: p.licenseNumber,
            phone:         p.phone,
          },
        });

    createdProviders.push(provider);
    console.log(`  ✓ Provider: Dr. ${provider.firstName} ${provider.lastName} · ${provider.specialty} (${provider.id})`);
  }

  // ── 3. Appointment slots — mañana y pasado mañana ─────────────────────────
  const tomorrow      = nextWeekday(1);
  const dayAfter      = nextWeekday(2);

  // Find a test patient (QA AgentTest or any existing patient)
  let patient = await db.patient.findFirst({
    where: { OR: [{ firstName: 'QA' }, { firstName: 'Erik' }, { firstName: 'Sandra' }] },
    orderBy: { createdAt: 'desc' },
  });

  // Find test case for QA AgentTest
  const qaCase = await db.case.findFirst({
    where: { caseCode: { contains: 'SEN' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, caseCode: true, patientId: true },
  });

  if (qaCase) {
    patient = await db.patient.findUnique({ where: { id: qaCase.patientId } });
  }

  if (!patient) {
    console.log('  ⚠ No patient found — skipping appointment slots');
  } else {
    console.log(`\n  Using patient: ${patient.firstName} ${patient.lastName} (${patient.id})`);

    const slots = [
      // Dr. Ramírez — Provo — mañana 9:30 AM
      {
        patient:    patient,
        caseId:     qaCase?.id ?? null,
        clinic:     clinicProvo,
        provider:   createdProviders[0],
        scheduledFor: slotAt(tomorrow, 9, 30),
        duration:   30,
        type:       'AUTO_ACCIDENT',
      },
      // Dr. Ramírez — Provo — mañana 11:00 AM (slot libre)
      {
        patient:    patient,
        caseId:     null,
        clinic:     clinicProvo,
        provider:   createdProviders[0],
        scheduledFor: slotAt(tomorrow, 11, 0),
        duration:   30,
        type:       'AUTO_ACCIDENT',
      },
      // Dra. Flores — Orem — pasado mañana 10:00 AM
      {
        patient:    patient,
        caseId:     qaCase?.id ?? null,
        clinic:     clinicOrem,
        provider:   createdProviders[1],
        scheduledFor: slotAt(dayAfter, 10, 0),
        duration:   45,
        type:       'AUTO_ACCIDENT',
      },
    ];

    for (const slot of slots) {
      // Check if appointment already exists for this patient + provider + time
      const exists = await db.appointment.findFirst({
        where: {
          patientId:    slot.patient.id,
          providerId:   slot.provider.id,
          scheduledFor: slot.scheduledFor,
        },
      });

      if (exists) {
        console.log(`  ↩ Slot already exists: ${slot.provider.firstName} ${slot.scheduledFor.toISOString()}`);
        continue;
      }

      const appt = await db.appointment.create({
        data: {
          patientId:      slot.patient.id,
          caseId:         slot.caseId,
          clinicId:       slot.clinic.id,
          providerId:     slot.provider.id,
          scheduledFor:   slot.scheduledFor,
          durationMinutes: slot.duration,
          type:           slot.type,
          status:         slot.caseId ? 'CONFIRMED' : 'SCHEDULED',
        },
      });

      console.log(`  ✓ Appointment: Dr. ${slot.provider.firstName} @ ${slot.clinic.name} · ${slot.scheduledFor.toLocaleString()} · ${appt.status} (${appt.id})`);
    }
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  const counts = {
    clinics:      await db.clinic.count(),
    providers:    await db.provider.count(),
    appointments: await db.appointment.count(),
    patients:     await db.patient.count(),
    cases:        await db.case.count(),
  };

  console.log('\n─────────────────────────────────────────');
  console.log('DB summary after seed:');
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(14)}: ${v}`));
  console.log('─────────────────────────────────────────');
  console.log('\n✅ Seed complete. Restart the dev server if running locally.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
