/**
 * GET /api/appointments/available-slots
 *
 * Devuelve slots disponibles para un doctor+clínica en los próximos días.
 * Phase 1: consulta real a la tabla Appointment para detectar conflictos.
 *
 * Query params:
 *   clinicId         — requerido
 *   providerId       — requerido
 *   fromDate         — ISO datetime (default: ahora)
 *   toDate           — ISO datetime (default: fromDate + 8 días)
 *   durationMinutes  — duración de la cita (default: 45)
 *   limit            — max slots a devolver (default: 12)
 *
 * Lógica:
 *   1. Genera candidatos cada 30 min dentro de horario laboral (8:00-17:00 MT, L-V)
 *   2. Consulta appointments existentes del provider en ese rango (no CANCELLED)
 *   3. Filtra candidatos que traslapen con citas existentes
 *   4. Devuelve los primeros N disponibles
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';

const TIMEZONE = 'America/Denver';
const WORK_HOUR_START = 8;   // 8:00 AM MT
const WORK_HOUR_END   = 22;  // 10:00 PM MT (allows last slot at 9:30 PM + 30 min)

const QuerySchema = z.object({
  clinicId:        z.string().min(1),
  providerId:      z.string().min(1),
  fromDate:        z.string().datetime().optional(),
  toDate:          z.string().datetime().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(240).default(45),
  limit:           z.coerce.number().int().min(1).max(200).default(12),
});

/** Devuelve el número de hora local en America/Denver para una fecha UTC */
function mtHour(date: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE, hour: 'numeric', hour12: false,
    }).format(date),
    10,
  );
}

/** Devuelve el día de semana en America/Denver (Mon, Tue, ...) */
function mtWeekday(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, weekday: 'short',
  }).format(date);
}

/** ¿El timestamp UTC cae en horario laboral MT? (L-V 8:00-17:00) */
function isBusinessSlot(date: Date, durationMinutes: number): boolean {
  const weekday = mtWeekday(date);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const h = mtHour(date);
  return h >= WORK_HOUR_START && h + durationMinutes / 60 <= WORK_HOUR_END;
}

/** Genera candidatos cada `durationMinutes` min (máx 30) en el rango dado */
function generateCandidates(from: Date, to: Date, durationMinutes: number): Date[] {
  const INTERVAL = durationMinutes <= 30 ? durationMinutes : 30;
  const candidates: Date[] = [];
  // Never generate slots in the past — clamp start to now
  const now   = new Date();
  const start = new Date(Math.max(from.getTime(), now.getTime()));
  start.setSeconds(0, 0);
  // Snap to next 30-min boundary
  const rem = start.getMinutes() % INTERVAL;
  if (rem !== 0) start.setMinutes(start.getMinutes() + (INTERVAL - rem), 0, 0);

  const cursor = new Date(start);
  while (cursor < to) {
    candidates.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + INTERVAL);
  }
  return candidates;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  let query;
  try {
    query = QuerySchema.parse({
      clinicId:        searchParams.get('clinicId')        ?? undefined,
      providerId:      searchParams.get('providerId')      ?? undefined,
      fromDate:        searchParams.get('fromDate')        ?? undefined,
      toDate:          searchParams.get('toDate')          ?? undefined,
      durationMinutes: searchParams.get('durationMinutes') ?? undefined,
      limit:           searchParams.get('limit')           ?? undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'INVALID_QUERY', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const fromDate = query.fromDate ? new Date(query.fromDate) : new Date();
  const toDate   = query.toDate
    ? new Date(query.toDate)
    : new Date(fromDate.getTime() + 8 * 24 * 60 * 60 * 1000); // 8 días por defecto

  // ─── Citas existentes del provider en el rango ─────────────────────────
  const existingAppointments = await db.appointment.findMany({
    where: {
      providerId: query.providerId,
      status:     { not: 'CANCELLED' },
      scheduledFor: {
        gte: fromDate,
        lt:  toDate,
      },
    },
    select: {
      scheduledFor:    true,
      durationMinutes: true,
    },
  });

  // ─── Genera candidatos y filtra conflictos ─────────────────────────────
  const candidates = generateCandidates(fromDate, toDate, query.durationMinutes);
  const durationMs = query.durationMinutes * 60 * 1000;

  const available = candidates
    .filter((slot) => {
      // Debe estar en horario laboral MT
      if (!isBusinessSlot(slot, query.durationMinutes)) return false;

      // No debe traslapar con ninguna cita existente
      const slotEnd = new Date(slot.getTime() + durationMs);
      for (const appt of existingAppointments) {
        const apptStart = new Date(appt.scheduledFor);
        const apptEnd   = new Date(apptStart.getTime() + appt.durationMinutes * 60 * 1000);
        // Traslape: el slot empieza antes de que termine la cita Y termina después de que empieza
        if (slot < apptEnd && slotEnd > apptStart) return false;
      }
      return true;
    })
    .slice(0, query.limit)
    .map((slot) => ({
      startAt:         slot.toISOString(),
      endAt:           new Date(slot.getTime() + durationMs).toISOString(),
      durationMinutes: query.durationMinutes,
      clinicId:        query.clinicId,
      providerId:      query.providerId,
    }));

  return NextResponse.json({
    ok:    true,
    slots: available,
    meta: {
      fromDate:         fromDate.toISOString(),
      toDate:           toDate.toISOString(),
      durationMinutes:  query.durationMinutes,
      existingCount:    existingAppointments.length,
      candidateCount:   candidates.length,
    },
  });
}
