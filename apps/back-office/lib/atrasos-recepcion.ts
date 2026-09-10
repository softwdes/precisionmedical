import { db } from '@precision-medical/database';

/**
 * Los tres atrasos del front office.
 *
 * Vivían dentro del `Promise.all` de `app/(admin)/dashboard/page.tsx`, que es
 * donde nacieron. Salieron acá el 2026-09-08 porque ahora los pregunta una
 * SEGUNDA punta: la herramienta `atrasos_de_recepcion` de CIFO.
 *
 * Es la misma razón por la que `lib/cola-intake.ts` no vive en su pantalla: si
 * el panel y el agente definen "atrasado" por su lado, el día que alguien mueva
 * un umbral los dos números se contradicen en la misma sesión y el staff deja
 * de creerle a los dos.
 *
 * ── Qué mide cada uno y por qué ese reloj ────────────────────────────────────
 *
 * Los tres miden TIEMPO TRANSCURRIDO desde un evento del caso, y por eso son
 * distintos de la cola del centinela, que mide el tiempo que FALTA para la cita.
 * Las dos cosas son "atención requerida" y conviven, pero no se mezclan: una es
 * deuda acumulada y la otra es una fecha límite.
 */

/** Referido nuevo sin que nadie le mande el portal. Una hora es un turno de mostrador. */
export const HORAS_SIN_PORTAL = 1;

/** Portal enviado y el paciente no contestó. Un día es el ciclo natural de un SMS. */
export const HORAS_INTAKE_SIN_RESPUESTA = 24;

/** Confirmó por teléfono y sigue sin cita. Dos días ya es un caso que se enfría. */
export const HORAS_CONFIRMADO_SIN_AGENDA = 48;

/** Cuántas filas trae cada grupo. Más que esto es una pantalla, no un aviso. */
const MAX_FILAS = 10;

export interface FilaAtraso {
  id: string;
  caseCode: string;
  /**
   * Para la PANTALLA. La herramienta del agente lo descarta antes de devolver
   * nada — ver `lib/cifo/tools.ts`.
   */
  paciente: string | null;
  /** Desde cuándo espera: el evento que arrancó el reloj de este grupo. */
  desde: Date;
}

export interface AtrasosRecepcion {
  /** NEW_REFERRAL y nadie le mandó el portal. */
  sinPortal: FilaAtraso[];
  /** INTAKE_PENDING con el portal ya enviado y sin respuesta. */
  intakeSinRespuesta: FilaAtraso[];
  /** CONFIRMED y todavía sin ninguna cita viva. */
  confirmadoSinAgenda: FilaAtraso[];
  /** La pileta: de acá sale la cola de mañana. */
  intakePendiente: number;
  /** Confirmados esperando que alguien los agende. */
  sinAgendar: number;
}

const nombreDe = (p: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null =>
  `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim() || null;

export async function atrasosRecepcion(): Promise<AtrasosRecepcion> {
  const ahora = Date.now();
  const h = (horas: number): Date => new Date(ahora - horas * 3_600_000);

  const seleccion = {
    id: true, caseCode: true,
    patient: { select: { firstName: true, lastName: true } },
  } as const;

  const [sinPortal, intakeSinRespuesta, confirmadoSinAgenda, intakePendiente, sinAgendar] =
    await Promise.all([
      db.case.findMany({
        where: { status: 'NEW_REFERRAL', deletedAt: null, createdAt: { lte: h(HORAS_SIN_PORTAL) } },
        take: MAX_FILAS,
        orderBy: { createdAt: 'asc' },
        select: { ...seleccion, createdAt: true },
      }),
      db.case.findMany({
        where: {
          status: 'INTAKE_PENDING', deletedAt: null,
          intakeFormSentAt: { lte: h(HORAS_INTAKE_SIN_RESPUESTA) },
        },
        take: MAX_FILAS,
        orderBy: { intakeFormSentAt: 'asc' },
        select: { ...seleccion, intakeFormSentAt: true },
      }),
      db.case.findMany({
        where: {
          status: 'CONFIRMED', deletedAt: null,
          firstAppointmentConfirmedAt: { lte: h(HORAS_CONFIRMADO_SIN_AGENDA) },
        },
        take: MAX_FILAS,
        orderBy: { firstAppointmentConfirmedAt: 'asc' },
        select: { ...seleccion, firstAppointmentConfirmedAt: true },
      }),
      db.case.count({ where: { status: 'INTAKE_PENDING', deletedAt: null } }),
      /**
       * Confirmado y sin ninguna cita VIVA. `none` con los estados muertos
       * excluidos, y no `appointments: { none: {} }` a secas: un caso cuya única
       * cita se canceló SÍ está esperando que alguien lo agende, y con el `none`
       * pelado quedaba invisible.
       */
      db.case.count({
        where: {
          status: 'CONFIRMED', deletedAt: null,
          appointments: { none: { status: { notIn: ['CANCELLED', 'NO_SHOW'] } } },
        },
      }),
    ]);

  return {
    sinPortal: sinPortal.map((c) => ({
      id: c.id, caseCode: c.caseCode, paciente: nombreDe(c.patient), desde: c.createdAt,
    })),
    intakeSinRespuesta: intakeSinRespuesta.map((c) => ({
      id: c.id, caseCode: c.caseCode, paciente: nombreDe(c.patient), desde: c.intakeFormSentAt!,
    })),
    confirmadoSinAgenda: confirmadoSinAgenda.map((c) => ({
      id: c.id, caseCode: c.caseCode, paciente: nombreDe(c.patient), desde: c.firstAppointmentConfirmedAt!,
    })),
    intakePendiente,
    sinAgendar,
  };
}
