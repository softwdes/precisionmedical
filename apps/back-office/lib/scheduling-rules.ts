/**
 * Reglas de negocio compartidas para agendar citas — hoy solo el bloqueo de
 * fin de semana (ninguna clínica atiende sábado/domingo). Un solo lugar para
 * que el sugeridor automático (available-slots) y los endpoints que
 * realmente guardan la cita (create/edit/schedule-appointment) apliquen la
 * misma regla — antes solo la aplicaba el sugeridor, así que agendar a mano
 * un sábado/domingo se guardaba sin ningún chequeo.
 */

import { db } from '@precision-medical/database';

const TIMEZONE = 'America/Denver';

/** Devuelve el día de semana en America/Denver (Mon, Tue, ..., Sun) */
export function weekdayInDenver(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, weekday: 'short',
  }).format(date);
}

/** ¿El timestamp UTC cae en sábado o domingo, en hora de Denver? */
export function isWeekendInDenver(date: Date): boolean {
  const weekday = weekdayInDenver(date);
  return weekday === 'Sat' || weekday === 'Sun';
}

// ─── Cruce de horarios del doctor ───────────────────────────────────────────

/**
 * Duración máxima que aceptan los schemas de crear/editar cita (480 min = 8 h).
 * La ventana de búsqueda arranca esa cantidad de minutos antes del horario
 * nuevo: una cita larga que empezó antes puede seguir ocupando al doctor.
 * Antes la ventana era una constante de 240 min, así que una cita de más de 4 h
 * que arrancaba antes era invisible al chequeo.
 */
const MAX_APPOINTMENT_MINUTES = 480;

export interface OverlappingAppointment {
  id: string;
  scheduledFor: Date;
  durationMinutes: number;
  patient: { firstName: string; lastName: string } | null;
}

/**
 * Todas las citas del doctor que se cruzan con [start, start + duration).
 *
 * Los tres endpoints que guardan una cita (crear, editar/arrastrar, agendar
 * desde el caso) tenían esto copiado, y los tres con el mismo defecto: un
 * `findFirst` **sin `orderBy`** sobre la ventana, y el chequeo de cruce se
 * aplicaba SOLO a esa única fila. Si la que devolvía la base no se cruzaba, el
 * cruce real pasaba sin aviso — y como `findFirst` sin orden no garantiza cuál
 * de las candidatas devuelve, el mismo guardado se bloqueaba o pasaba según el
 * momento. En la semana del 3-7 Ago, 21 de 50 citas tenían 2-3 candidatas en la
 * ventana, así que era una moneda al aire y se sentía como un bug intermitente.
 *
 * Ahora se traen TODAS las candidatas y se filtra el cruce real sobre todas.
 */
export async function findOverlappingAppointments(opts: {
  providerId: string;
  start: Date;
  durationMinutes: number;
  /** La cita que se está editando: sin esto choca consigo misma. */
  excludeAppointmentId?: string;
}): Promise<OverlappingAppointment[]> {
  const { providerId, start, durationMinutes, excludeAppointmentId } = opts;
  const end         = new Date(start.getTime() + durationMinutes * 60_000);
  const windowStart = new Date(start.getTime() - MAX_APPOINTMENT_MINUTES * 60_000);

  const candidates = await db.appointment.findMany({
    where: {
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      providerId,
      status:       { not: 'CANCELLED' },
      scheduledFor: { gte: windowStart, lt: end },
    },
    orderBy: { scheduledFor: 'asc' },
    select: {
      id: true, scheduledFor: true, durationMinutes: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  return candidates.filter((c) => {
    const cEnd = new Date(c.scheduledFor.getTime() + c.durationMinutes * 60_000);
    return c.scheduledFor < end && cEnd > start;
  });
}

/**
 * Mensaje para el usuario: nombra la hora y el paciente del cruce. El cartel
 * genérico no alcanzaba — sin el motivo concreto, un rechazo correcto se lee
 * como una falla del sistema.
 */
export function describeOverlap(overlaps: OverlappingAppointment[]): string {
  const first = overlaps[0];
  if (!first) return '';
  const time = first.scheduledFor.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: TIMEZONE,
  });
  const who   = first.patient ? ` con ${first.patient.firstName} ${first.patient.lastName}` : '';
  const extra = overlaps.length > 1 ? ` (y ${overlaps.length - 1} más)` : '';
  return `El doctor ya tiene una cita a las ${time}${who}${extra} que se cruza con este horario.`;
}
