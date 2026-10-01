/**
 * Las conversaciones por SMS con pacientes, y cuáles esperan respuesta.
 *
 * Pedido de la clínica (2026-10-01, con Weave como referencia): una pestaña
 * *Actionable* separada de *Todos*, y un contador rojo en el menú.
 *
 * ── Por qué "pendiente" NO es "sin leer" ────────────────────────────────────
 *
 * Medido el 2026-10-01, con el buzón ya en uso real: **9 entrantes, 6 sin leer
 * y solo 3 esperando respuesta**. Los otros 3 estaban en conversaciones que
 * recepción ya había contestado — no había nada que hacer con ellos, pero un
 * contador de "sin leer" los cuenta igual.
 *
 * Un badge rojo que dice 6 cuando hay 3 cosas que hacer se vuelve ruido, y un
 * indicador que se aprende a ignorar es peor que no tenerlo.
 *
 * Así que pendiente = **la última palabra la tiene el paciente**. Eso tiene
 * tres propiedades que "sin leer" no tiene:
 *
 *  · **se limpia solo** — contestás y desaparece. Leer no resuelve nada.
 *  · **no se puede falsear** — hoy abrir el mensaje lo marca leído sin hacer nada.
 *  · **cuenta conversaciones, no mensajes** — un paciente que manda cuatro
 *    seguidos (pasó el 30-sep) es UNA cosa pendiente, no cuatro.
 *
 * ── Qué es una conversación ────────────────────────────────────────────────
 *
 * El paciente cuando se lo pudo reconocer, y el NÚMERO cuando no. Agrupar todo
 * lo no reconocido en un solo saco juntaría a personas distintas bajo el mismo
 * renglón; agrupar por número los mantiene separados y además es lo que se
 * puede mostrar.
 */

import { db, type Prisma } from '@precision-medical/database';
import { phoneKey } from '@/lib/phone';

/** El último mensaje de una conversación, que es lo que define su estado. */
export interface Conversacion {
  /** `pac:<id>` o `tel:<10 digitos>`. Estable, sirve de key de React. */
  clave: string;
  patientId: string | null;
  nombre: string | null;
  /** El número del paciente, para mostrar cuando no hay nombre. */
  numero: string;
  ultimo: {
    body: string;
    createdAt: string;
    deEntrada: boolean;
    sinLeer: boolean;
  };
  /** Cuántos mensajes tiene la conversación, en los dos sentidos. */
  total: number;
  /** La última palabra es del paciente: alguien tiene que contestar. */
  pendiente: boolean;
}

/**
 * Cuántas conversaciones esperan respuesta. Es el número del badge.
 *
 * Se calcula con una consulta sola y agrupada en la base, no trayendo los
 * mensajes: lo llama el layout en cada navegación, así que no puede costar una
 * lectura de toda la tabla.
 */
export async function contarPendientes(): Promise<number> {
  /**
   * El truco: por cada conversación, el instante del último ENTRANTE y el del
   * último SALIENTE. Si el entrante es más nuevo, nadie contestó.
   *
   * `COALESCE` con una fecha mínima cubre la conversación que solo tiene
   * entrantes — ahí no hay saliente con el que comparar y sí está pendiente.
   */
  const filas = await db.$queryRaw<{ n: bigint }[]>`
    WITH hilos AS (
      SELECT
        COALESCE("patientId", right(regexp_replace(
          CASE WHEN direction = 'INBOUND' THEN "fromAddress" ELSE "toAddress" END,
          '[^0-9]', '', 'g'), 10)) AS clave,
        MAX(CASE WHEN direction = 'INBOUND'  THEN "createdAt" END) AS ultimo_entrante,
        MAX(CASE WHEN direction = 'OUTBOUND' THEN "createdAt" END) AS ultimo_saliente
      FROM message_logs
      WHERE channel = 'SMS'
      GROUP BY 1
    )
    SELECT count(*)::bigint AS n
    FROM hilos
    WHERE ultimo_entrante IS NOT NULL
      AND ultimo_entrante > COALESCE(ultimo_saliente, TIMESTAMP '1970-01-01')
  `;
  return Number(filas[0]?.n ?? 0);
}

/**
 * Las conversaciones, de la más reciente a la más vieja.
 *
 * `soloPendientes` es la pestaña *Actionable*. Sin eso, son todas.
 */
export async function listarConversaciones(opts: {
  soloPendientes?: boolean;
  /** Nombre, código o número. El mismo buscador que la lista de mensajes. */
  q?: string;
  limite?: number;
} = {}): Promise<Conversacion[]> {
  const where: Prisma.MessageLogWhereInput = {
    channel: 'SMS',
    ...(opts.q
      ? {
          OR: [
            { patient: { firstName:   { contains: opts.q, mode: 'insensitive' } } },
            { patient: { lastName:    { contains: opts.q, mode: 'insensitive' } } },
            { patient: { patientCode: { contains: opts.q, mode: 'insensitive' } } },
            { toAddress:   { contains: opts.q, mode: 'insensitive' } },
            { fromAddress: { contains: opts.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  /**
   * Se traen los mensajes y se agrupan en memoria, y no con un `GROUP BY`,
   * porque de cada conversación hace falta el CUERPO del último mensaje — y eso
   * en SQL es una ventana con `DISTINCT ON` que ata esta función a Postgres sin
   * necesidad. Hoy son ~350 filas; el día que sean 50.000 se cambia, y el test
   * de que hay que cambiarlo es este comentario.
   */
  const filas = await db.messageLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 4000,
    select: {
      direction: true, body: true, createdAt: true, readAt: true,
      fromAddress: true, toAddress: true, patientId: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  const porClave = new Map<string, Conversacion>();

  for (const m of filas) {
    const deEntrada = m.direction === 'INBOUND';
    const numero = deEntrada ? m.fromAddress : m.toAddress;
    const clave = m.patientId ? `pac:${m.patientId}` : `tel:${phoneKey(numero) || numero}`;

    const ya = porClave.get(clave);
    if (ya) { ya.total += 1; continue; }   // `filas` viene de la más nueva: la primera ES la última

    porClave.set(clave, {
      clave,
      patientId: m.patientId,
      nombre: m.patient ? `${m.patient.firstName} ${m.patient.lastName}`.trim() : null,
      numero,
      ultimo: {
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        deEntrada,
        sinLeer: deEntrada && m.readAt === null,
      },
      total: 1,
      // La última palabra es del paciente — ver el encabezado.
      pendiente: deEntrada,
    });
  }

  const todas = [...porClave.values()];
  return opts.soloPendientes ? todas.filter((c) => c.pendiente) : todas;
}
