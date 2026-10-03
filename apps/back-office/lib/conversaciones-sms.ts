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
 * ── Y el que no necesita respuesta ─────────────────────────────────────────
 *
 * Eso funciona para una pregunta y NO funciona para un "Ok". Medido el
 * 2026-10-03: de 11 entrantes, 7 tienen 15 caracteres o menos, y de las 3
 * conversaciones que esperaban respuesta dos eran "Yes" y "Ok". El mensaje que
 * no necesita respuesta no es el caso raro, es la mayoría del tráfico.
 *
 * Sacarlo contestándole "ok" al paciente es pagar un SMS para apagar un
 * indicador. Así que hay una tercera forma de cerrar, además de contestar:
 * marcarlo resuelto (`resolvedAt` en el mensaje, Erick 2026-10-03).
 *
 * La propiedad que lo vuelve seguro —y que no es opcional— es que **un mensaje
 * nuevo del paciente nace sin marca**, así que la conversación vuelve sola.
 * Descartar cierra lo dicho HASTA ACÁ, no la conversación: lo peor que puede
 * pasar con un descarte equivocado es que algo se vea tarde, nunca que se
 * pierda. Sin eso, el botón sería un lugar donde esconder un "cancel my
 * appointment for tomorrow".
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
import { findPatientsByPhoneKeys } from '@/lib/patient-phone-lookup';

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
  /**
   * Hay un entrante ABIERTO más nuevo que nuestra última respuesta: alguien
   * tiene que ocuparse. Contestar lo cierra, y marcarlo resuelto también.
   */
  pendiente: boolean;
  /**
   * Los pacientes que comparten ese número, cuando no se pudo elegir uno.
   *
   * Vacío cuando `patientId` está resuelto. Con dos o más, la pantalla los
   * ofrece para que decida una persona: acá las familias que comparten línea
   * son lo normal —117 números pertenecen a 263 pacientes, medido— así que
   * "no coincide con ningún paciente" era casi siempre falso. Coincidía con
   * varios, que es otra cosa.
   */
  candidatos: Array<{ id: string; nombre: string }>;
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
   * El truco: por cada conversación, el instante del último ENTRANTE ABIERTO y
   * el del último SALIENTE. Si el entrante es más nuevo, nadie contestó.
   *
   * "Abierto" = sin `resolvedAt`. Un entrante marcado resuelto deja de contar,
   * y como la marca va por MENSAJE, el siguiente que llegue vuelve a contar sin
   * que haya que limpiar nada.
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
        MAX(CASE WHEN direction = 'INBOUND' AND "resolvedAt" IS NULL THEN "createdAt" END) AS ultimo_entrante,
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
      resolvedAt: true,
      fromAddress: true, toAddress: true, patientId: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  const porClave = new Map<string, Conversacion>();
  /**
   * Por conversación: ¿ya pasamos por un saliente?
   *
   * `filas` viene de la MÁS NUEVA, así que todo lo que se vea antes del primer
   * saliente es posterior a nuestra última respuesta. Un entrante abierto ahí
   * adentro es exactamente lo que el SQL de `contarPendientes` cuenta — y las
   * dos definiciones tienen que coincidir, porque una pinta la lista y la otra
   * el badge que está al lado. Si divergen, la pantalla se contradice sola.
   */
  const vistoSaliente = new Set<string>();

  for (const m of filas) {
    const deEntrada = m.direction === 'INBOUND';
    const numero = deEntrada ? m.fromAddress : m.toAddress;
    const clave = m.patientId ? `pac:${m.patientId}` : `tel:${phoneKey(numero) || numero}`;

    const abierto = deEntrada && m.resolvedAt === null && !vistoSaliente.has(clave);
    if (!deEntrada) vistoSaliente.add(clave);

    const ya = porClave.get(clave);
    if (ya) {
      ya.total += 1;
      if (abierto) ya.pendiente = true;
      continue;
    }

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
      pendiente: abierto,
      candidatos: [],
    });
  }

  const todas = [...porClave.values()];
  const salida = opts.soloPendientes ? todas.filter((c) => c.pendiente) : todas;

  /**
   * Para las que no tienen paciente, buscar quién comparte ese número.
   *
   * En UNA consulta para todas: una por conversación serían 170 viajes a la
   * base cada vez que se abre la pantalla. Se hace al final y solo sobre las
   * que se van a devolver.
   */
  const sinPaciente = salida.filter((c) => !c.patientId);
  if (sinPaciente.length > 0) {
    const porNumero = await findPatientsByPhoneKeys(sinPaciente.map((c) => phoneKey(c.numero)));
    for (const c of sinPaciente) {
      const halla = porNumero.get(phoneKey(c.numero)) ?? [];
      c.candidatos = halla.map((p) => ({ id: p.id, nombre: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() }));
      // Uno solo no es ambiguo: se resuelve acá y la pantalla lo muestra con
      // su nombre, igual que si hubiera venido vinculado desde el webhook.
      if (c.candidatos.length === 1) {
        c.patientId = c.candidatos[0]!.id;
        c.nombre    = c.candidatos[0]!.nombre;
        c.candidatos = [];
      }
    }
  }

  return salida;
}

/**
 * Los mensajes de UNA conversación, en orden, estén o no vinculados.
 *
 * Se busca por la CLAVE y no por paciente, que es el cambio de fondo pedido por
 * Erick el 2026-10-01: la conversación es con un NÚMERO, y el paciente es un
 * dato que resolvemos cuando podemos, no un requisito para abrirla.
 *
 * Eso destraba tres casos que antes quedaban muertos en pantalla:
 *  · el número que coincide con VARIOS pacientes (familias que comparten línea,
 *    que acá son 117 números sobre 263 pacientes)
 *  · el que no coincide con ninguno — hoy ya hay una conversación así
 *  · y el futuro en que escriban abogados, ajustadores o farmacias, que no son
 *    pacientes de nadie y aun así hay que poder contestarles
 *
 * Los números del lado del paciente están TODOS en E.164 (`+1XXXXXXXXXX`),
 * verificado sobre los envíos reales: `sendSms` normaliza antes de guardar. Por
 * eso alcanza con comparar los últimos 10 dígitos.
 */
export async function mensajesDeConversacion(clave: string): Promise<Array<{
  id: string; direction: string; status: string; body: string;
  createdAt: string; sentByName: string | null; errorCode: number | null;
  resolvedAt: string | null; resolvedByName: string | null;
}>> {
  const esPaciente = clave.startsWith('pac:');
  const valor = clave.slice(4);

  const where: Prisma.MessageLogWhereInput = esPaciente
    ? { patientId: valor }
    : {
        channel: 'SMS',
        OR: [
          { toAddress:   { endsWith: valor } },
          { fromAddress: { endsWith: valor } },
        ],
      };

  const filas = await db.messageLog.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true, direction: true, status: true, body: true,
      createdAt: true, sentByName: true, errorCode: true,
      resolvedAt: true, resolvedByName: true,
    },
  });

  return filas.map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
  }));
}