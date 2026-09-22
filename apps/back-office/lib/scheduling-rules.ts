/**
 * Reglas de negocio compartidas para agendar citas — hoy solo el bloqueo de
 * fin de semana (ninguna clínica atiende sábado/domingo). Un solo lugar para
 * que el sugeridor automático (available-slots) y los endpoints que
 * realmente guardan la cita (create/edit/schedule-appointment) apliquen la
 * misma regla — antes solo la aplicaba el sugeridor, así que agendar a mano
 * un sábado/domingo se guardaba sin ningún chequeo.
 */

import { db } from '@precision-medical/database';

/**
 * La expansión de los bloqueos vive en `lib/bloqueos-recurrentes.ts`, que NO
 * importa Prisma: es aritmética de calendario y así se puede correr sin base.
 * Este archivo la re-exporta para que los cuatro llamadores —el sugeridor y los
 * tres endpoints que guardan— sigan pidiéndole todas las reglas de agenda a un
 * solo lugar, que es la razón por la que este archivo existe.
 */
export {
  type BlockRepeatMode, type BlockRule,
  blockOccurrences, blocksCovering, describeBlocks,
} from '@/lib/bloqueos-recurrentes';
import { blocksCovering } from '@/lib/bloqueos-recurrentes';

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


/**
 * Los avisos de agenda que pisan `[start, start + duration)`.
 *
 * Vive acá y no en la pantalla por la misma razón que el resto de este archivo:
 * lo consultan CUATRO lugares —el sugeridor de horarios y los tres endpoints que
 * guardan una cita— y con una copia por lugar, el día que alguien toque una, las
 * otras tres siguen con la regla vieja. Es literalmente lo que pasó con la regla
 * de fin de semana, que estaba sólo en el sugeridor: agendar un sábado a mano
 * se guardaba sin ningún chequeo.
 *
 * NO impide nada: devuelve lo que pisa y quien llama decide. El aviso y el
 * "dale igual" son de la pantalla, igual que con el cruce de dos citas del
 * mismo provider (regla de Erick, 2026-08-05).
 *
 * Trae los que no tienen doctor —son del calendario entero— más los de ESTE
 * doctor. Y no filtra por `startsAt` dentro del rango: una regla repetida
 * empieza una sola vez, así que se traen las vivas y se expanden.
 */
export async function findBlocksCovering(opts: {
  providerId: string | null | undefined;
  start: Date;
  durationMinutes: number;
}): Promise<Array<{ id: string; label: string }>> {
  const fin = new Date(opts.start.getTime() + opts.durationMinutes * 60_000);

  const vivos = await db.providerTimeBlock.findMany({
    where: {
      OR: [
        { repeatMode: 'NONE', startsAt: { lte: fin } },
        {
          repeatMode: { not: 'NONE' },
          startsAt:   { lte: fin },
          OR: [{ repeatUntil: null }, { repeatUntil: { gte: opts.start } }],
        },
      ],
      AND: [{ OR: [{ providerId: null }, ...(opts.providerId ? [{ providerId: opts.providerId }] : [])] }],
    },
    select: {
      id: true, label: true, startsAt: true, durationMinutes: true,
      repeatMode: true, repeatUntil: true,
    },
  });

  return blocksCovering(vivos, opts.start, opts.durationMinutes)
    .map((b) => ({ id: b.id, label: b.label }));
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
  return `El provider ya tiene una cita a las ${time}${who}${extra} que se cruza con este horario.`;
}

/**
 * Los mismos datos del cruce, SIN la oración armada.
 *
 * Existe porque `describeOverlap` escribe en español fijo y el cartel que lo
 * muestra tiene el título y los botones en el idioma de la app: la clínica en
 * inglés veía "Overlaps another appointment" con el cuerpo en castellano
 * (Erick, 21-sep-2026). La frase se arma en el cliente con next-intl y el
 * servidor manda lo único que no puede saber el navegador: CUÁL cita choca.
 *
 * `describeOverlap` se queda para el `message` del 409, que sigue siendo lo que
 * lee cualquier consumidor sin traducir (y lo que termina en un toast genérico
 * si algo falla antes de componer).
 *
 * La hora va en ISO y no formateada a propósito: el huso de la clínica lo
 * aplica el cliente junto con su idioma, que es donde ya vive esa regla.
 */
export interface OverlapDetails {
  /** Arranque de la cita con la que se cruza, en ISO. */
  at: string;
  /** Nombre y apellido, o null si la cita no tiene paciente cargado. */
  patient: string | null;
  /** Cuántas citas se cruzan en total, contando esta. */
  count: number;
}

export function overlapDetails(overlaps: OverlappingAppointment[]): OverlapDetails | null {
  const first = overlaps[0];
  if (!first) return null;
  return {
    at:      first.scheduledFor.toISOString(),
    patient: first.patient ? `${first.patient.firstName} ${first.patient.lastName}` : null,
    count:   overlaps.length,
  };
}

/**
 * Gracia para el horario que ya pasó: una hora.
 *
 * El selector de horarios puede quedar abierto un rato largo antes de que la
 * persona apriete guardar, y el hueco que eligió sigue siendo legítimo. Sin la
 * gracia, la cita que se elige a las 8:59 se rechaza al guardarla a las 9:01.
 */
export const GRACIA_HORARIO_PASADO_MS = 60 * 60 * 1000;

/**
 * ¿Este horario ya pasó?
 *
 * Vive acá y no en cada endpoint por lo mismo que el resto del archivo: la
 * regla estaba escrita TRES veces —crear cita, agendar desde el caso y el
 * wizard de caso nuevo— y ya había divergido (una perdonaba una hora y las
 * otras dos no perdonaban nada).
 *
 * Quien llama decide qué hacer: hoy los tres rechazan, salvo que se esté
 * registrando a propósito una visita que ya ocurrió (ver `allowPast` en el
 * POST de citas). Mover una cita YA CREADA a una fecha pasada es libre desde el
 * 2026-08-05 y por eso el PATCH no consulta esto.
 */
export function horarioYaPaso(cuando: Date, graciaMs: number = GRACIA_HORARIO_PASADO_MS): boolean {
  return cuando.getTime() < Date.now() - graciaMs;
}
