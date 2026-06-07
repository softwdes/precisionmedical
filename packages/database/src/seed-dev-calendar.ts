/**
 * seed-dev-calendar.ts
 *
 * Seed DEV-ONLY: Providers (doctores) + Appointments para el calendario B.10-B.11.
 * Crea citas en las semanas de Jun 2-6 y Jun 9-13, 2026.
 *
 * TIMEZONE: Todas las fechas están en Mountain Daylight Time (MDT = UTC−6).
 *   09:00 MDT → 15:00 UTC → isoDate '2026-06-02T15:00:00.000Z'
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
  const proClinic = clinics.find(c => c.name.includes('Provo'))           ?? clinics[0];

  if (!pgClinic || !proClinic) {
    console.error('❌ No clinics found — run main seed first');
    process.exit(1);
  }

  // ── 2. Providers ─────────────────────────────────────────────────────────────
  const providersSeed = [
    { email: 'dr.rivera@precisionmedical.example', firstName: 'Carlos',   lastName: 'Rivera',  specialty: 'ORTHOPEDICS'      as const },
    { email: 'dr.chen@precisionmedical.example',   firstName: 'Jennifer', lastName: 'Chen',    specialty: 'CHIROPRACTIC'     as const },
    { email: 'dr.garcia@precisionmedical.example', firstName: 'Miguel',   lastName: 'García',  specialty: 'PHYSICAL_THERAPY' as const },
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

  // ── 3. Cleanup — borrar citas previas de estos providers ─────────────────────
  const providerIds = providers.map(p => p.id);
  const deleted = await db.appointment.deleteMany({
    where: { providerId: { in: providerIds } },
  });
  if (deleted.count > 0) {
    console.warn(`🗑  Limpiados ${deleted.count} appointments del seed anterior`);
  }

  // ── 4. Patients & Cases ──────────────────────────────────────────────────────
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

  // ── 5. Appointments ──────────────────────────────────────────────────────────
  //
  // TIMEZONE: MDT = UTC−6. Para mostrar a las 9:00 AM en Utah → guardar 15:00 UTC.
  //
  // Status:
  //   - Semana Jun 1-6 (pasada): COMPLETED → color índigo (atendidas)
  //   - Semana Jun 9-13 (actual/siguiente): CONFIRMED → color por tipo (rose/emerald)
  //                                          SCHEDULED  → color amber (sin confirmar)
  //
  // visitNumber: 0 = primera cita del paciente en este caso (→ badge 🆕 + glow)
  //
  type ApptSeed = {
    isoDate: string;           // UTC
    caseIdx: number;
    providerIdx: number;
    clinicId: string;
    type: 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'FOLLOW_UP' | 'URGENT_CARE';
    status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED';
    durationMinutes: number;
    visitNumber: number;
    notes?: string;
  };

  const apptSeeds: ApptSeed[] = [
    // ─── Semana 1: Jun 1 (Lun) — Jun 6 (Sáb) · COMPLETED ───────────────────
    // Lun Jun 1
    { isoDate: '2026-06-01T15:00:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 45, visitNumber: 0, notes: '1ra cita post-accidente' },
    { isoDate: '2026-06-01T16:30:00.000Z', caseIdx: 1, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30, visitNumber: 0 },

    // Mar Jun 2
    { isoDate: '2026-06-02T15:00:00.000Z', caseIdx: 2, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30, visitNumber: 0 },
    { isoDate: '2026-06-02T16:00:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30, visitNumber: 3 },
    { isoDate: '2026-06-02T20:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30, visitNumber: 2 },

    // Mié Jun 3
    { isoDate: '2026-06-03T14:30:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30, visitNumber: 1 },
    { isoDate: '2026-06-03T15:30:00.000Z', caseIdx: 2, providerIdx: 2, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'COMPLETED', durationMinutes: 30, visitNumber: 0 },
    { isoDate: '2026-06-03T21:00:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30, visitNumber: 4 },

    // Jue Jun 4
    { isoDate: '2026-06-04T15:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 45, visitNumber: 3 },
    { isoDate: '2026-06-04T17:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30, visitNumber: 5 },

    // Vie Jun 5
    { isoDate: '2026-06-05T14:00:00.000Z', caseIdx: 2, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30, visitNumber: 2 },
    { isoDate: '2026-06-05T15:00:00.000Z', caseIdx: 3, providerIdx: 2, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'COMPLETED', durationMinutes: 30, visitNumber: 1 },
    { isoDate: '2026-06-05T20:30:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30, visitNumber: 4 },

    // ─── Semana 2: Jun 9 (Lun) — Jun 13 (Vie) · CONFIRMED + SCHEDULED ───────
    // Lun Jun 9
    { isoDate: '2026-06-09T15:00:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 45, visitNumber: 0 },
    { isoDate: '2026-06-09T16:30:00.000Z', caseIdx: 1, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30, visitNumber: 0 },
    { isoDate: '2026-06-09T20:00:00.000Z', caseIdx: 2, providerIdx: 2, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'SCHEDULED', durationMinutes: 30, visitNumber: 6 },

    // Mar Jun 10
    { isoDate: '2026-06-10T14:30:00.000Z', caseIdx: 3, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30, visitNumber: 2 },
    { isoDate: '2026-06-10T15:00:00.000Z', caseIdx: 0, providerIdx: 1, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'CONFIRMED', durationMinutes: 30, visitNumber: 0 },
    { isoDate: '2026-06-10T19:00:00.000Z', caseIdx: 1, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'SCHEDULED', durationMinutes: 30, visitNumber: 2 },
    { isoDate: '2026-06-10T21:30:00.000Z', caseIdx: 2, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'SCHEDULED', durationMinutes: 45, visitNumber: 7 },

    // Mié Jun 11
    { isoDate: '2026-06-11T15:00:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30, visitNumber: 0 },
    { isoDate: '2026-06-11T16:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'CONFIRMED', durationMinutes: 30, visitNumber: 6 },
    { isoDate: '2026-06-11T20:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: proClinic.id, type: 'URGENT_CARE',     status: 'SCHEDULED', durationMinutes: 30, visitNumber: 0 },

    // Jue Jun 12
    { isoDate: '2026-06-12T14:00:00.000Z', caseIdx: 2, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 45, visitNumber: 8 },
    { isoDate: '2026-06-12T15:30:00.000Z', caseIdx: 3, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'SCHEDULED', durationMinutes: 30, visitNumber: 3 },

    // Vie Jun 13
    { isoDate: '2026-06-13T15:00:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30, visitNumber: 7 },
    { isoDate: '2026-06-13T17:00:00.000Z', caseIdx: 1, providerIdx: 1, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'CONFIRMED', durationMinutes: 30, visitNumber: 3 },
    { isoDate: '2026-06-13T20:00:00.000Z', caseIdx: 2, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'SCHEDULED', durationMinutes: 30, visitNumber: 9 },
  ];

  let created = 0;
  for (const seed of apptSeeds) {
    const c = cases[seed.caseIdx % cases.length];
    const p = providers[seed.providerIdx];
    const dt = new Date(seed.isoDate);

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

  console.warn(`✅ Appointments: ${created} created`);
  console.warn('🗓  Semana Jun 1-5 → COMPLETED (índigo/atendidas)');
  console.warn('🗓  Semana Jun 9-13 → CONFIRMED (rose/emerald) + SCHEDULED (amber)');
  console.warn('🎉 Calendar seed complete!');
}

seedCalendar()
  .catch(e => {
    console.error('❌ Calendar seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
