/**
 * seed-dev-calendar.ts
 *
 * Seed DEV-ONLY: Providers (doctores) + Appointments para el calendario B.10-B.11.
 * Crea citas en la semana del 2 Jun y 9 Jun 2026 para ver el calendario poblado.
 *
 * Corre con: pnpm --filter @precision-medical/database db:seed:calendar
 *
 * CERO PHI real — todos los nombres son ficticios.
 */

import { db } from './index';

async function seedCalendar(): Promise<void> {
  console.warn('📅 Seeding calendar fixtures (providers + appointments)...');

  // ── 1. Clinics ───────────────────────────────────────────────────────────────
  const clinics = await db.clinic.findMany({ select: { id: true, name: true } });
  const pgClinic  = clinics.find(c => c.name.includes('Pleasant Grove')) ?? clinics[0];
  const proClinic = clinics.find(c => c.name.includes('Provo')) ?? clinics[0];

  if (!pgClinic || !proClinic) {
    console.error('❌ No clinics found — run main seed first');
    process.exit(1);
  }

  // ── 2. Providers ─────────────────────────────────────────────────────────────
  const providersSeed = [
    { email: 'dr.rivera@precisionmedical.example', firstName: 'Carlos',   lastName: 'Rivera',   specialty: 'ORTHOPEDICS'       as const },
    { email: 'dr.chen@precisionmedical.example',   firstName: 'Jennifer', lastName: 'Chen',     specialty: 'CHIROPRACTIC'      as const },
    { email: 'dr.garcia@precisionmedical.example', firstName: 'Miguel',   lastName: 'García',   specialty: 'PHYSICAL_THERAPY'  as const },
  ];

  const providers = await Promise.all(
    providersSeed.map(p =>
      db.provider.upsert({
        where:  { email: p.email },
        update: { firstName: p.firstName, lastName: p.lastName },
        create: { ...p, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
      })
    )
  );

  console.warn(`✅ Providers: ${providers.map(p => `Dr. ${p.lastName}`).join(', ')}`);

  // ── 3. Patients & Cases ──────────────────────────────────────────────────────
  const cases = await db.case.findMany({
    select: {
      id: true, patientId: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    take: 4,
  });

  if (cases.length === 0) {
    console.error('❌ No cases found — run main seed first');
    process.exit(1);
  }

  // ── 4. Appointments — weeks of Jun 2 and Jun 9, 2026 ────────────────────────
  // Format: 2026-06-DD THH:MM:00 (local Mountain Time stored as UTC-aware ISO)
  type ApptSeed = {
    isoDate: string;
    caseIdx: number;
    providerIdx: number;
    clinicId: string;
    type: 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'FOLLOW_UP' | 'URGENT_CARE';
    status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED';
    durationMinutes: number;
    visitNumber: number; // 0 = primera cita
    notes?: string;
  };

  const apptSeeds: ApptSeed[] = [
    // ─── Semana 1: Jun 2–6 ──────────────────────────────────────────────────
    { isoDate: '2026-06-02T09:00:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED',  durationMinutes: 30, visitNumber: 0, notes: '1ra cita MVA' },
    { isoDate: '2026-06-02T10:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED',  durationMinutes: 45, visitNumber: 0 },
    { isoDate: '2026-06-02T14:00:00.000Z', caseIdx: 2, providerIdx: 1, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'COMPLETED',  durationMinutes: 30, visitNumber: 3 },

    { isoDate: '2026-06-03T08:30:00.000Z', caseIdx: 3, providerIdx: 2, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'COMPLETED',  durationMinutes: 30, visitNumber: 2 },
    { isoDate: '2026-06-03T09:30:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED',  durationMinutes: 30, visitNumber: 1 },
    { isoDate: '2026-06-03T15:00:00.000Z', caseIdx: 1, providerIdx: 1, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'COMPLETED',  durationMinutes: 30, visitNumber: 1 },

    { isoDate: '2026-06-04T09:00:00.000Z', caseIdx: 2, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED',  durationMinutes: 45, visitNumber: 0 },
    { isoDate: '2026-06-04T11:00:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED',  durationMinutes: 30, visitNumber: 4 },

    { isoDate: '2026-06-05T08:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED',  durationMinutes: 30, visitNumber: 2 },
    { isoDate: '2026-06-05T09:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'COMPLETED',  durationMinutes: 30, visitNumber: 0 },
    { isoDate: '2026-06-05T14:30:00.000Z', caseIdx: 2, providerIdx: 1, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED',  durationMinutes: 30, visitNumber: 5 },

    { isoDate: '2026-06-06T09:30:00.000Z', caseIdx: 3, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED',  durationMinutes: 45, visitNumber: 1 },
    { isoDate: '2026-06-06T11:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED',  durationMinutes: 30, visitNumber: 3 },

    // ─── Semana 2: Jun 9–13 ─────────────────────────────────────────────────
    { isoDate: '2026-06-09T09:00:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED',  durationMinutes: 30, visitNumber: 4 },
    { isoDate: '2026-06-09T10:30:00.000Z', caseIdx: 1, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED',  durationMinutes: 45, visitNumber: 0 },
    { isoDate: '2026-06-09T14:00:00.000Z', caseIdx: 2, providerIdx: 2, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 6 },

    { isoDate: '2026-06-10T08:30:00.000Z', caseIdx: 3, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED',  durationMinutes: 30, visitNumber: 2 },
    { isoDate: '2026-06-10T09:00:00.000Z', caseIdx: 0, providerIdx: 1, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 5 },
    { isoDate: '2026-06-10T13:00:00.000Z', caseIdx: 1, providerIdx: 2, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 2 },
    { isoDate: '2026-06-10T15:30:00.000Z', caseIdx: 2, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'SCHEDULED',  durationMinutes: 45, visitNumber: 7 },

    { isoDate: '2026-06-11T09:00:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 0 },
    { isoDate: '2026-06-11T10:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 6 },
    { isoDate: '2026-06-11T14:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: proClinic.id, type: 'URGENT_CARE',     status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 0 },

    { isoDate: '2026-06-12T08:00:00.000Z', caseIdx: 2, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'SCHEDULED',  durationMinutes: 45, visitNumber: 8 },
    { isoDate: '2026-06-12T09:30:00.000Z', caseIdx: 3, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 3 },

    { isoDate: '2026-06-13T09:00:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 7 },
    { isoDate: '2026-06-13T11:00:00.000Z', caseIdx: 1, providerIdx: 1, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 3 },
    { isoDate: '2026-06-13T14:00:00.000Z', caseIdx: 2, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'SCHEDULED',  durationMinutes: 30, visitNumber: 9 },
  ];

  let created = 0;
  let skipped = 0;

  for (const seed of apptSeeds) {
    const c = cases[seed.caseIdx % cases.length];
    const p = providers[seed.providerIdx];
    const dt = new Date(seed.isoDate);

    // Skip si ya existe (por scheduledFor + caseId + patientId)
    const exists = await db.appointment.findFirst({
      where: {
        patientId: c.patientId,
        scheduledFor: dt,
      },
      select: { id: true },
    });

    if (exists) { skipped++; continue; }

    await db.appointment.create({
      data: {
        patientId:       c.patientId,
        caseId:          c.id,
        clinicId:        seed.clinicId,
        providerId:      p.id,
        scheduledFor:    dt,
        durationMinutes: seed.durationMinutes,
        type:            seed.type,
        status:          seed.status,
        notes:           seed.notes ?? null,
      },
    });

    created++;
  }

  console.warn(`✅ Appointments: ${created} created, ${skipped} skipped (ya existían)`);
  console.warn('🎉 Calendar seed complete! Abrí el calendario en semana Jun 2 ó Jun 9.');
}

seedCalendar()
  .catch(e => {
    console.error('❌ Calendar seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
