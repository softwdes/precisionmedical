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
  // visitNumber es CALCULADO por la API (count de citas previas al rango),
  // NO se almacena en DB. Estrategia para lograr el color correcto:
  //
  //   • Semana 1 (Jun 1-5):  USA SOLO casos 0 y 1 → casos 2 y 3 quedan sin historial
  //   • Semana 2 (Jun 8-12): casos 2 y 3 → visitNumber=0 → primera cita 🆕
  //                          casos 0 y 1 → visitNumber>0  → seguimiento
  //
  // Colores resultantes:
  //   CONFIRMED + AUTO_ACCIDENT   + v=0 → 🌹 MVA 1ra (rose gradient + glow + 🆕)
  //   CONFIRMED + AUTO_ACCIDENT   + v>0 → 🌹 MVA seguimiento (rose sólido)
  //   CONFIRMED + FAMILY_PRACTICE + v=0 → 🌿 GP  1ra (emerald gradient + glow + 🆕)
  //   CONFIRMED + FAMILY_PRACTICE + v>0 → 🌿 GP  seguimiento (emerald sólido)
  //   SCHEDULED + cualquier tipo        → 🟡 Sin confirmar (amber)
  //   COMPLETED + cualquier tipo        → 🔵 Atendida (índigo)
  //
  type ApptSeed = {
    isoDate: string;       // UTC timestamp
    caseIdx: number;
    providerIdx: number;
    clinicId: string;
    type: 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'FOLLOW_UP' | 'URGENT_CARE';
    status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED';
    durationMinutes: number;
    notes?: string;
  };

  const apptSeeds: ApptSeed[] = [
    // ─── Semana 1: Jun 1-5 · COMPLETED (índigo) ─────────────────────────────
    // SOLO usa casos 0 y 1 → casos 2 y 3 son "vírgenes" para semana 2
    //
    { isoDate: '2026-06-01T15:00:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 45, notes: '1ra consulta post-accidente' },
    { isoDate: '2026-06-01T16:30:00.000Z', caseIdx: 1, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-02T15:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-02T16:30:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-03T14:30:00.000Z', caseIdx: 0, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-03T21:00:00.000Z', caseIdx: 1, providerIdx: 2, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-04T15:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-04T16:30:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-05T15:00:00.000Z', caseIdx: 0, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'COMPLETED', durationMinutes: 30 },
    { isoDate: '2026-06-05T16:30:00.000Z', caseIdx: 1, providerIdx: 2, clinicId: proClinic.id, type: 'FOLLOW_UP',       status: 'COMPLETED', durationMinutes: 30 },

    // ─── Semana 2: Jun 8-12 · LOS 5 COLORES EN PANTALLA ────────────────────
    //
    // Lun Jun 8 — DEMO COMPLETO: los 5 colores en un solo día
    //   case 2 → sin historial → visitNumber=0 → MVA 1ra 🌹🆕
    //   case 3 → sin historial → visitNumber=0 → GP  1ra 🌿🆕
    //   case 0 → 5 citas previas (jun 1-5) → visitNumber>0 → MVA seguimiento 🌹
    //   case 1 → 5 citas previas (jun 1-5) → visitNumber>0 → GP  seguimiento 🌿
    //   SCHEDULED → amber 🟡 sin importar visitNumber
    //
    { isoDate: '2026-06-08T15:00:00.000Z', caseIdx: 2, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 45 }, // 🌹 MVA 1ra
    { isoDate: '2026-06-08T16:00:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'CONFIRMED', durationMinutes: 30 }, // 🌿 GP  1ra
    { isoDate: '2026-06-08T16:30:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30 }, // 🌹 MVA seguimiento
    { isoDate: '2026-06-08T17:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'CONFIRMED', durationMinutes: 30 }, // 🌿 GP  seguimiento
    { isoDate: '2026-06-08T21:00:00.000Z', caseIdx: 0, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'SCHEDULED', durationMinutes: 30 }, // 🟡 Sin confirmar

    // Mar Jun 9
    { isoDate: '2026-06-09T15:00:00.000Z', caseIdx: 2, providerIdx: 1, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 45 }, // 🌹 MVA visita 2
    { isoDate: '2026-06-09T16:30:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30 }, // 🌹 MVA seguimiento
    { isoDate: '2026-06-09T20:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'SCHEDULED', durationMinutes: 30 }, // 🟡 Sin confirmar

    // Mié Jun 10
    { isoDate: '2026-06-10T14:30:00.000Z', caseIdx: 0, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30 }, // 🌹 MVA seguimiento
    { isoDate: '2026-06-10T15:00:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: proClinic.id, type: 'FAMILY_PRACTICE', status: 'CONFIRMED', durationMinutes: 30 }, // 🌿 GP visita 2
    { isoDate: '2026-06-10T16:30:00.000Z', caseIdx: 1, providerIdx: 2, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'CONFIRMED', durationMinutes: 30 }, // 🌿 GP seguimiento
    { isoDate: '2026-06-10T19:00:00.000Z', caseIdx: 2, providerIdx: 0, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'SCHEDULED', durationMinutes: 30 }, // 🟡 Sin confirmar
    { isoDate: '2026-06-10T21:30:00.000Z', caseIdx: 3, providerIdx: 1, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'SCHEDULED', durationMinutes: 30 }, // 🟡 Sin confirmar

    // Jue Jun 11
    { isoDate: '2026-06-11T15:00:00.000Z', caseIdx: 2, providerIdx: 2, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 30 }, // 🌹 MVA visita 3
    { isoDate: '2026-06-11T16:00:00.000Z', caseIdx: 1, providerIdx: 0, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'CONFIRMED', durationMinutes: 30 }, // 🌿 GP seguimiento
    { isoDate: '2026-06-11T20:00:00.000Z', caseIdx: 0, providerIdx: 1, clinicId: proClinic.id, type: 'AUTO_ACCIDENT',   status: 'SCHEDULED', durationMinutes: 30 }, // 🟡 Sin confirmar

    // Vie Jun 12
    { isoDate: '2026-06-12T14:00:00.000Z', caseIdx: 0, providerIdx: 2, clinicId: pgClinic.id,  type: 'AUTO_ACCIDENT',   status: 'CONFIRMED', durationMinutes: 45 }, // 🌹 MVA seguimiento
    { isoDate: '2026-06-12T15:30:00.000Z', caseIdx: 3, providerIdx: 0, clinicId: pgClinic.id,  type: 'FAMILY_PRACTICE', status: 'SCHEDULED', durationMinutes: 30 }, // 🟡 Sin confirmar
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
  console.warn('🗓  Semana Jun 1-5  → COMPLETED (índigo/atendidas) — solo casos 0 y 1');
  console.warn('🗓  Semana Jun 8-12 → Jun 8 tiene los 5 colores en un día:');
  console.warn('     🌹 MVA 1ra (case2, sin historial), 🌿 GP 1ra (case3, sin historial)');
  console.warn('     🌹 MVA seguimiento (case0), 🌿 GP seguimiento (case1), 🟡 Sin confirmar');
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
