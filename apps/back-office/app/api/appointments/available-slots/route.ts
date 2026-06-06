/**
 * GET /api/appointments/available-slots?clinicId=...&fromDate=...&toDate=...&specialty=...
 *
 * Phoenix Phase 0 — AI Receptionist hook (stub).
 * Devuelve slots disponibles por clínica/doctor/specialty en un rango.
 *
 * Consumido HOY por: Recepción humana en B.10 (Calendar) via UI.
 * Consumido EN FUTURO por: AI Receptionist (Phase 3+) durante conversación.
 *
 * Phase 0: este stub devuelve mock slots (no hay tabla Appointment del lado
 * de PHI todavía — el existente en schema es del admin, no de clinical).
 * Phase 1 lo conecta a la tabla real.
 *
 * Mockup canónico: B.10 (Calendar) · B.11 (Modal detalle de cita).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

// ─── Query params schema ────────────────────────────────────────────
const QuerySchema = z.object({
  clinicId: z.string().min(1).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  specialty: z
    .enum([
      'RADIOLOGY',
      'NEUROLOGY',
      'ORTHOPEDICS',
      'PHYSICAL_THERAPY',
      'CHIROPRACTIC',
      'PAIN_MANAGEMENT',
      'PSYCHOLOGY',
      'GENERAL',
      'OTHER',
    ])
    .optional(),
  doctorId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = actorFromHeaders(req.headers);

  // Parse query params
  const { searchParams } = new URL(req.url);
  let query;
  try {
    query = QuerySchema.parse({
      clinicId: searchParams.get('clinicId') ?? undefined,
      fromDate: searchParams.get('fromDate') ?? undefined,
      toDate: searchParams.get('toDate') ?? undefined,
      specialty: searchParams.get('specialty') ?? undefined,
      doctorId: searchParams.get('doctorId') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_QUERY',
        details: err instanceof z.ZodError ? err.flatten() : String(err),
      },
      { status: 400 },
    );
  }

  // Phase 0 stub: devuelve mock slots determinísticos (próximos 14 días).
  // Phase 1 reemplaza por query real a Appointment/Clinic/DoctorCredentials.
  const now = new Date();
  const mockSlots = Array.from({ length: query.limit }).map((_, i) => {
    const slotDate = new Date(now);
    slotDate.setDate(slotDate.getDate() + Math.floor(i / 4) + 1);
    slotDate.setHours(8 + (i % 4) * 2, 0, 0, 0);
    return {
      slotId: `slot_stub_${i}_${slotDate.toISOString().slice(0, 10)}`,
      startAt: slotDate.toISOString(),
      endAt: new Date(slotDate.getTime() + 30 * 60 * 1000).toISOString(),
      durationMinutes: 30,
      clinicId: query.clinicId ?? 'clinic_provo',
      doctorId: query.doctorId ?? 'doctor_loder',
      specialty: query.specialty ?? 'CHIROPRACTIC',
      isAvailable: true,
    };
  });

  // Audit log (lecturas también, para AI agent traceability)
  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    action: 'QUERY_AVAILABLE_SLOTS',
    entityType: 'appointments',
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      phase: 0,
      stub: true,
      query,
      resultCount: mockSlots.length,
    },
  });

  return NextResponse.json({
    ok: true,
    stub: true,
    slots: mockSlots,
    message: 'Phase 0 stub — devuelve mock slots determinísticos. Phase 1 conectará a DB real.',
  });
}
