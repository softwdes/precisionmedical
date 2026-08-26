import { db } from '@precision-medical/database';
import type { SessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter, ACTIVE_STATUSES } from '@/lib/attorney-portal';

/**
 * Vigía · la cola de "necesita atención".
 *
 * Vive acá y no en la pantalla ni en la herramienta porque la usan LAS DOS: el
 * tablero la pinta y el agente la cuenta. Si cada uno definiera "frenado" por su
 * lado, el número de la tarjeta y el de la respuesta dejarían de coincidir en
 * cuanto alguien toque un criterio — y el bufete deja de creerle a los dos.
 *
 * ── Qué entra y qué no (la decisión que define la pantalla) ──────────────────
 *
 * La primera versión marcaba todo lo imperfecto y en Garcia Law daba **297 de
 * 297 casos**. Una cola donde entra todo no es una cola: es la lista de casos
 * con otro nombre, y el que la mira aprende a ignorarla.
 *
 * Entra lo que **se pudre con el tiempo** — tratamiento que se frenó, un caso que
 * nunca arrancó. Eso decae solo y cada día que pasa vale menos.
 *
 * NO entra el atraso de volumen. Los 87 liens sin firmar de Garcia Law son
 * reales, pero son un trabajo de tarde entera, no un aviso: ya tienen su
 * indicador arriba y su propia lista filtrada. Meterlos acá tapaba las tres
 * cosas que sí hay que mirar hoy. El lien sin firma SUMA PESO a un caso que ya
 * está frenado por otra cosa, pero nunca crea una fila por sí solo.
 *
 * ── La ventana (lo segundo que rompió la cola) ───────────────────────────────
 *
 * Con las reglas de arriba, los ocho primeros de Garcia Law llevaban entre 300 y
 * 665 días sin una cita. Eso no es trabajo de hoy: es **cartera abandonada** que
 * arrastra la migración, y tapaba justo los casos que todavía se pueden salvar.
 *
 * Un caso que cruzó la línea de los 21 días la semana pasada se recupera con una
 * llamada. Uno de 600 días ya no. Así que la cola cubre una VENTANA —de 21 a 90
 * días— y lo que quedó atrás se cuenta aparte: sigue siendo un problema, pero es
 * un proyecto de limpieza, no el aviso de la mañana.
 *
 * Falta una regla que hoy no se puede escribir: **lien sin firma en un caso que
 * ya cerró** es lo más caro que existe —la clínica cobra por fuera del acuerdo—
 * pero `Case` no tiene fecha de cierre, así que no hay forma de distinguir el que
 * cerró la semana pasada del que cerró en 2023 y arrastra el hueco de la
 * migración. Se agrega el día que exista `closedAt`.
 */

export type MotivoAtencion =
  /** Caso abierto sin una sola cita: nunca arrancó el tratamiento. */
  | 'SIN_NINGUNA_CITA'
  /** Tratamiento abierto que dejó de moverse. */
  | 'TRATAMIENTO_SIN_MOVIMIENTO';

/** Motivo secundario: no crea fila, agrava la que ya existe. */
export type Agravante = 'LIEN_SIN_FIRMA';

const PESO: Record<MotivoAtencion, number> = {
  TRATAMIENTO_SIN_MOVIMIENTO: 60,
  SIN_NINGUNA_CITA: 50,
};

/** Lo que suma que además le falte la firma del abogado. */
const PESO_AGRAVANTE = 15;

/** Días sin cita nueva que cuentan como meseta. */
export const DIAS_MESETA = 21;

/**
 * Más allá de esto el caso está abandonado, no frenado: sale de la cola diaria y
 * se cuenta aparte.
 */
export const DIAS_ABANDONO = 90;

/**
 * Días de gracia antes de marcar un caso sin citas.
 *
 * Un caso abierto ayer todavía no tiene citas y eso es normal: está en admisión.
 * Sin esta ventana, cada caso nuevo entra a la cola el día que se crea.
 */
const DIAS_GRACIA_SIN_CITAS = 14;

export interface FilaAtencion {
  /** Para el link del portal. NUNCA sale hacia el modelo — ver `tools.ts`. */
  caseId: string;
  caseCode: string;
  /**
   * El nombre del paciente, para la PANTALLA.
   *
   * El abogado piensa en personas: una lista de códigos lo obliga a abrir cada
   * caso para saber de quién habla. Esto es de este lado —la herramienta del
   * agente lo descarta antes de devolver nada— así que no cambia lo que viaja
   * al proveedor del modelo.
   */
  paciente: string | null;
  status: string;
  motivo: MotivoAtencion;
  /** Agravantes encontrados, para el detalle. */
  agravantes: Agravante[];
  diasSinCita: number | null;
  /** Días desde que se abrió el caso — el desempate cuando el motivo es el mismo. */
  diasAbierto: number;
  prioridad: number;
}

/** Cuántos casos se recorren. Más que esto es una pantalla, no una cola. */
const MAX_ESCANEO = 300;

const dias = (d: Date): number => Math.floor((Date.now() - d.getTime()) / 86_400_000);

export async function colaDeAtencion(
  lawyer: SessionLawyer,
  opts?: { diasSinCita?: number; limite?: number },
): Promise<{ total: number; abandonados: number; filas: FilaAtencion[]; filasAbandonadas: FilaAtencion[] }> {
  const scope = lawyerCaseFilter(lawyer);
  const meseta = opts?.diasSinCita ?? DIAS_MESETA;
  const corte = new Date(Date.now() - meseta * 86_400_000);

  const candidatos = await db.case.findMany({
    where: { ...scope, status: { in: ACTIVE_STATUSES as unknown as never[] } },
    take: MAX_ESCANEO,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, caseCode: true, status: true, createdAt: true, signatureExempt: true,
      patient: { select: { firstName: true, lastName: true } },
      lienSignatures: { where: { signerType: 'ATTORNEY' }, select: { id: true }, take: 1 },
      appointments: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { scheduledFor: 'desc' },
        take: 1,
        select: { scheduledFor: true },
      },
    },
  });

  const filas: FilaAtencion[] = [];
  /** Los de más de 90 días: no son el trabajo de hoy, pero existen. */
  const abandonadas: FilaAtencion[] = [];

  for (const c of candidatos) {
    const ultima = c.appointments[0]?.scheduledFor ?? null;
    const diasSinCita = ultima ? dias(ultima) : null;
    const diasAbierto = dias(c.createdAt);
    const parado = diasSinCita ?? diasAbierto;

    let motivo: MotivoAtencion | null = null;
    if (!ultima) {
      if (diasAbierto >= DIAS_GRACIA_SIN_CITAS) motivo = 'SIN_NINGUNA_CITA';
    } else if (ultima < corte) {
      motivo = 'TRATAMIENTO_SIN_MOVIMIENTO';
    }
    if (!motivo) continue;

    const agravantes: Agravante[] = [];
    if (!c.signatureExempt && c.lienSignatures.length === 0) agravantes.push('LIEN_SIN_FIRMA');

    // El tiempo parado ordena DENTRO del motivo; nunca hace que un motivo pase
    // por encima de otro.
    const prioridad = PESO[motivo] + parado / 30 + agravantes.length * PESO_AGRAVANTE;

    const fila = {
      caseId: c.id,
      caseCode: c.caseCode,
      paciente: `${c.patient?.firstName ?? ''} ${c.patient?.lastName ?? ''}`.trim() || null,
      status: c.status,
      motivo,
      agravantes,
      diasSinCita,
      diasAbierto,
      prioridad,
    };

    // Fuera de la ventana sigue siendo un problema, pero no el de hoy: va a su
    // propia lista en vez de perderse en un conteo.
    if (parado > DIAS_ABANDONO) abandonadas.push(fila);
    else filas.push(fila);
  }

  filas.sort((a, b) => b.prioridad - a.prioridad);

  /**
   * La cartera parada se ordena al REVÉS: los MENOS viejos primero.
   *
   * Acá el criterio no es la urgencia sino la posibilidad de rescate. Un caso de
   * 95 días todavía se llama; uno de 600 ya es papeleo. Ordenarlos por
   * antigüedad, como la cola de arriba, pondría los más muertos al frente.
   */
  abandonadas.sort((a, b) => (a.diasSinCita ?? a.diasAbierto) - (b.diasSinCita ?? b.diasAbierto));

  return {
    total: filas.length,
    abandonados: abandonadas.length,
    filas: filas.slice(0, opts?.limite ?? 8),
    filasAbandonadas: abandonadas.slice(0, 50),
  };
}
