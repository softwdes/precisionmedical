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
 *   1. Genera candidatos dentro del horario de atención (8:00-18:00 MT, L-V), cada
 *      `durationMinutes` si es ≤ 30 y cada 30 si es mayor; la cita tiene que
 *      TERMINAR antes del cierre
 *   2. Consulta appointments existentes del provider en ese rango (no CANCELLED)
 *   3. Filtra candidatos que traslapen con citas existentes
 *   4. Devuelve los primeros N disponibles
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@precision-medical/database';
import { isWeekendInDenver } from '@/lib/scheduling-rules';

const TIMEZONE = 'America/Denver';

/**
 * Horario de atención de la clínica, en minutos desde medianoche (hora de Denver).
 *
 * Estaba en 8-22 con la nota "allows last slot at 9:30 PM": el selector ofrecía
 * turnos hasta las 21:30 para un horario que cierra a las 18:00. En tres años de
 * datos hay 21 citas después de las 20:00 y ninguna después de las 22:00.
 *
 * Acá el cierre SÍ es un techo duro, a diferencia de la grilla del calendario
 * —que estira el rango para no esconder una cita que ya existe—: ofrecer un
 * horario con la clínica cerrada es un error, mostrar lo que ya está agendado no.
 */
const OPEN_MIN  = 8 * 60;   //  8:00 AM MT
const CLOSE_MIN = 18 * 60;  //  6:00 PM MT

const QuerySchema = z.object({
  clinicId:        z.string().min(1),
  providerId:      z.string().min(1),
  fromDate:        z.string().datetime().optional(),
  toDate:          z.string().datetime().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(240).default(45),
  limit:           z.coerce.number().int().min(1).max(200).default(12),
  /**
   * Techo POR DÍA en vez de por respuesta. Lo usan los selectores semanales.
   *
   * El `limit` global recortaba la lista ya ordenada por fecha, así que los
   * primeros días se comían todos los cupos y los últimos salían VACÍOS — con
   * citas de 15 min la semana genera 280 candidatos y el techo de 200 dejaba el
   * viernes en cero, indistinguible de "el doctor no atiende ese día". Cortando
   * por día, cada día compite solo consigo mismo.
   */
  limitPerDay:     z.coerce.number().int().min(1).max(200).optional(),
  /** Al editar una cita existente, excluirla del chequeo de conflictos —
   *  si no, su propio horario se ve a sí mismo como "ocupado" y desaparece
   *  de la lista, así que al editar nunca aparecía marcado su horario actual. */
  excludeAppointmentId: z.string().optional(),
});

/**
 * Minutos desde medianoche en America/Denver — con los MINUTOS, no solo la hora.
 *
 * Antes esto era `mtHour()`, que devolvía la hora truncada (17 para las 17:45), y
 * el chequeo de cierre comparaba `h + duración/60 <= FIN`. Con el cierre en las
 * 22:00 el redondeo no se notaba; al bajarlo a las 18:00 muerde justo en el
 * borde: una cita de 45 min a las 17:45 daba `17 + 0.75 = 17.75 <= 18` y se
 * ofrecía, terminando a las 18:30 — media hora después de cerrar.
 */
function mtMinutes(date: Date): number {
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
  const [h, m] = t.split(':').map(Number) as [number, number];
  return (h % 24) * 60 + m;
}

/** Fecha civil en America/Denver (`YYYY-MM-DD`) — la clave para agrupar por día. */
function denverDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/**
 * Deja como máximo `porDia` slots en cada día de Denver, respetando el orden.
 *
 * Reemplaza al `slice(0, limit)` global para los selectores semanales: recortar
 * una lista ordenada por fecha vacía los últimos días del rango.
 */
function limitarPorDia(slots: Date[], porDia: number): Date[] {
  const cuenta = new Map<string, number>();
  const salida: Date[] = [];
  for (const s of slots) {
    const dia = denverDate(s);
    const n = cuenta.get(dia) ?? 0;
    if (n >= porDia) continue;
    cuenta.set(dia, n + 1);
    salida.push(s);
  }
  return salida;
}

/**
 * ¿El timestamp UTC cae en horario de atención? (L-V, y la cita TERMINA antes del
 * cierre — si cierran a las 18:00, una cita de 45 min no puede arrancar 17:45).
 */
function isBusinessSlot(date: Date, durationMinutes: number): boolean {
  if (isWeekendInDenver(date)) return false;
  const inicio = mtMinutes(date);
  return inicio >= OPEN_MIN && inicio + durationMinutes <= CLOSE_MIN;
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
    /**
     * TODOS los searchParams de una, no listados a mano.
     *
     * Listarlos uno por uno ya causó un bug real: se agregó `limitPerDay` al
     * esquema y se olvidó acá, así que llegaba siempre `undefined` y la consulta
     * caía al default de `limit` (12) — el selector mostraba 12 horarios el lunes
     * y los otros cuatro días vacíos, SIN ningún error. Zod ignora las claves que
     * no conoce, así que sumar un parámetro al esquema ahora alcanza.
     */
    query = QuerySchema.parse(Object.fromEntries(searchParams));
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
      ...(query.excludeAppointmentId ? { id: { not: query.excludeAppointmentId } } : {}),
    },
    select: {
      scheduledFor:    true,
      durationMinutes: true,
    },
  });

  // ─── Genera candidatos y filtra conflictos ─────────────────────────────
  const candidates = generateCandidates(fromDate, toDate, query.durationMinutes);
  const durationMs = query.durationMinutes * 60 * 1000;

  const libres = candidates
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
    });

  // `limitPerDay` manda cuando viene: son dos formas de cortar y aplicar las dos
  // devolvería el techo global igual, que es justo lo que se quiere evitar.
  const recortados = query.limitPerDay
    ? limitarPorDia(libres, query.limitPerDay)
    : libres.slice(0, query.limit);

  const available = recortados.map((slot) => ({
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
      // Qué techo se aplicó y cuánto se recortó. Un corte silencioso fue
      // exactamente el bug: la respuesta se veía sana y un día entero faltaba.
      cap:              query.limitPerDay ? { perDay: query.limitPerDay } : { total: query.limit },
      freeCount:        libres.length,
      returnedCount:    available.length,
    },
  });
}
