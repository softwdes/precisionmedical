/**
 * "Mis pendientes de corrección": lo que UNA persona creó y hoy conviene arreglar.
 *
 * Plan: docs/plan-mis-pendientes.html. Fase 1 → tres detectores, sin tabla nueva
 * (se calcula al abrir, como Mis premios):
 *
 *  · CITA_DUPLICADA   mismo paciente a la misma hora, y la repetida es mía.
 *  · SMS_FALLIDO / CORREO_FALLIDO   un mensaje mío que no llegó, ya clasificado.
 *  · CITA_SIN_CERRAR  una cita mía ya pasada que quedó SCHEDULED o CONFIRMED.
 *
 * ── Qué NO es de la persona, y por eso no aparece ───────────────────────────
 *
 *  · Lo migrado del v2: sin `createdByUserId`, no se le asigna a nadie.
 *  · Pacientes de PRUEBA, números falsos y correos de dominio de prueba. Se
 *    cuentan aparte (`ocultas`) y nunca suman al contador. Medido 2026-10-07: de
 *    68 mensajes fallidos en 60 días, 51 eran pruebas.
 *  · `NOT_IN_TEST_ALLOWLIST`: es configuración del correo, no un error de usuario.
 *  · Citas en PENDING: es el estado en que el v2 dejó casi todo (2.186 citas
 *    pasadas). Listarlas inundaría la bandeja con algo que no es un error.
 *
 * ⚠️ El SQL va con clases POSIX (`[[:<:]]`, `[.]`) y NO con `\m` ni `\.`: Prisma
 * se come las barras invertidas de `Prisma.sql` y la regex nace rota sin error.
 * Ver trap-backslash-en-sql-de-prisma.
 */

import { db, Prisma } from '@precision-medical/database';

export type PendienteTipo = 'CITA_DUPLICADA' | 'SMS_FALLIDO' | 'CORREO_FALLIDO' | 'CITA_SIN_CERRAR';

/** El porqué, en clave: la pantalla lo traduce (es/en), el servidor no escribe frases. */
export type PendienteMotivo =
  | 'MISMA_HORA'
  | 'NUMERO_INVALIDO'
  | 'TELEFONO_FIJO'
  | 'NUMERO_INEXISTENTE'
  | 'SMS_OTRO'
  | 'CORREO_RECHAZADO'
  | 'PASADA_SIN_ESTADO';

export interface Pendiente {
  id: string;
  tipo: PendienteTipo;
  motivo: PendienteMotivo;
  /** "María G." — nombre abreviado para no mostrar de más (PHI). */
  paciente: string;
  patientId: string | null;
  caseId: string | null;
  appointmentId: string | null;
  /** La cita (o el mensaje) a la que se refiere. ISO. */
  cuando: string;
  /** Solo CITA_DUPLICADA: quién creó la otra y si fue antes. */
  otraCreadaPor: string | null;
  /** Solo CITA_SIN_CERRAR: el estado en que quedó. */
  estado: string | null;
}

export interface ResultadoPendientes {
  items: Pendiente[];
  counts: { total: number } & Record<PendienteTipo, number>;
  /** Cuántos se ocultaron por ser de prueba. */
  ocultas: number;
}

/** Hasta dónde mira cada detector. Más viejo que esto ya no es "pendiente", es historia. */
const DIAS_CITAS = 14;
const DIAS_SIN_CERRAR = 60;
const DIAS_MENSAJES = 30;
const TOPE_POR_TIPO = 100;

/** Palabra COMPLETA: "DEMOSS" y "Contest" no son pruebas, "Test Reagin" sí. */
const PRUEBA_NOMBRE = '[[:<:]](test|prueba|pruebas|demo)[[:>:]]';

function abreviar(first: string | null, last: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f && !l) return '—';
  return l ? `${f} ${l.charAt(0).toUpperCase()}.`.trim() : f;
}

interface FilaCita {
  id: string; patientId: string | null; caseId: string | null; scheduledFor: Date; status: string;
  firstName: string | null; lastName: string | null; prueba: boolean;
  otraPor?: string | null;
}

interface FilaMensaje {
  id: string; channel: string; code: number | null; msg: string | null; createdAt: Date;
  patientId: string | null; caseId: string | null; firstName: string | null; lastName: string | null; prueba: boolean;
}

/** Cómo se lee un fallo de SMS. `null` = no es de la persona (configuración). */
export function motivoDeMensaje(channel: string, code: number | null, msg: string | null): PendienteMotivo | null {
  const m = msg ?? '';
  if (/NOT_IN_TEST_ALLOWLIST/i.test(m)) return null;
  if (channel === 'EMAIL') return 'CORREO_RECHAZADO';
  if (/not a valid phone|not a mobile/i.test(m)) return 'NUMERO_INVALIDO';
  if (code === 30006) return 'TELEFONO_FIJO';
  if (code === 30005 || code === 30003) return 'NUMERO_INEXISTENTE';
  return 'SMS_OTRO';
}

export async function misPendientes(userId: string): Promise<ResultadoPendientes> {
  const [dups, mensajes, abiertas] = await Promise.all([
    // 1 · Cita duplicada: yo soy la REPETIDA (la creé después de la otra).
    db.$queryRaw<FilaCita[]>(Prisma.sql`
      SELECT a.id, a."patientId", a."caseId", a."scheduledFor", a.status::text AS status,
             p."firstName", p."lastName",
             COALESCE(p."firstName" ~* ${PRUEBA_NOMBRE} OR p."lastName" ~* ${PRUEBA_NOMBRE}, false) AS prueba,
             o."createdByName" AS "otraPor"
      FROM appointments a
      JOIN patients p ON p.id = a."patientId"
      JOIN appointments o
        ON o."patientId" = a."patientId"
       AND o.id <> a.id
       AND o."deletedAt" IS NULL
       AND o.status::text <> 'CANCELLED'
       AND date_trunc('minute', o."scheduledFor") = date_trunc('minute', a."scheduledFor")
      WHERE a."createdByUserId" = ${userId}
        AND a."deletedAt" IS NULL
        AND a.status::text <> 'CANCELLED'
        AND a."scheduledFor" >= now() - make_interval(days => ${DIAS_CITAS}::int)
        AND (a."createdAt" > o."createdAt" OR (a."createdAt" = o."createdAt" AND a.id > o.id))
      ORDER BY a."scheduledFor" DESC
      LIMIT ${TOPE_POR_TIPO}`),

    // 2 · Mensajes míos que no llegaron. Se descarta el que ya se resolvió: si
    //     después le llegó otro al mismo paciente por el mismo canal, ya no hay nada que hacer.
    db.$queryRaw<FilaMensaje[]>(Prisma.sql`
      SELECT m.id, m.channel::text AS channel, m."errorCode" AS code, m."errorMessage" AS msg, m."createdAt",
             m."patientId", m."caseId", p."firstName", p."lastName",
             ( COALESCE(p."firstName" ~* ${PRUEBA_NOMBRE} OR p."lastName" ~* ${PRUEBA_NOMBRE}, false)
               OR COALESCE(m."toAddress" ~* '(@test[.]|example[.]com|[.]local$|@no-email)', false)
               OR regexp_replace(COALESCE(m."toAddress", ''), '[^0-9]', '', 'g') ~ '(1234567|0000000|1111111|^1?555)'
             ) AS prueba
      FROM message_logs m
      LEFT JOIN patients p ON p.id = m."patientId"
      WHERE m."sentByUserId" = ${userId}
        AND m."patientId" IS NOT NULL
        AND m.status::text IN ('FAILED', 'UNDELIVERED')
        AND m."createdAt" >= now() - make_interval(days => ${DIAS_MENSAJES}::int)
        AND NOT EXISTS (
          SELECT 1 FROM message_logs n
          WHERE n."patientId" = m."patientId" AND n.channel = m.channel
            AND n."createdAt" > m."createdAt"
            AND n.status::text IN ('DELIVERED', 'SENT', 'QUEUED'))
      ORDER BY m."createdAt" DESC
      LIMIT ${TOPE_POR_TIPO * 3}`),

    // 3 · Citas mías ya pasadas que nadie cerró. PENDING queda afuera a propósito.
    db.$queryRaw<FilaCita[]>(Prisma.sql`
      SELECT a.id, a."patientId", a."caseId", a."scheduledFor", a.status::text AS status,
             p."firstName", p."lastName",
             COALESCE(p."firstName" ~* ${PRUEBA_NOMBRE} OR p."lastName" ~* ${PRUEBA_NOMBRE}, false) AS prueba
      FROM appointments a
      JOIN patients p ON p.id = a."patientId"
      WHERE a."createdByUserId" = ${userId}
        AND a."deletedAt" IS NULL
        AND a.status::text IN ('SCHEDULED', 'CONFIRMED')
        AND a."scheduledFor" < now() - interval '2 days'
        AND a."scheduledFor" >= now() - make_interval(days => ${DIAS_SIN_CERRAR}::int)
      ORDER BY a."scheduledFor" DESC
      LIMIT ${TOPE_POR_TIPO}`),
  ]);

  const items: Pendiente[] = [];
  let ocultas = 0;

  for (const r of dups) {
    if (r.prueba) { ocultas++; continue; }
    items.push({
      id: `dup:${r.id}`, tipo: 'CITA_DUPLICADA', motivo: 'MISMA_HORA',
      paciente: abreviar(r.firstName, r.lastName), patientId: r.patientId, caseId: r.caseId, appointmentId: r.id,
      cuando: r.scheduledFor.toISOString(), otraCreadaPor: r.otraPor ?? null, estado: null,
    });
  }

  for (const r of mensajes) {
    const motivo = motivoDeMensaje(r.channel, r.code, r.msg);
    if (!motivo) continue;
    if (r.prueba) { ocultas++; continue; }
    items.push({
      id: `msg:${r.id}`, tipo: r.channel === 'EMAIL' ? 'CORREO_FALLIDO' : 'SMS_FALLIDO', motivo,
      paciente: abreviar(r.firstName, r.lastName), patientId: r.patientId, caseId: r.caseId, appointmentId: null,
      cuando: r.createdAt.toISOString(), otraCreadaPor: null, estado: null,
    });
  }

  for (const r of abiertas) {
    if (r.prueba) { ocultas++; continue; }
    items.push({
      id: `open:${r.id}`, tipo: 'CITA_SIN_CERRAR', motivo: 'PASADA_SIN_ESTADO',
      paciente: abreviar(r.firstName, r.lastName), patientId: r.patientId, caseId: r.caseId, appointmentId: r.id,
      cuando: r.scheduledFor.toISOString(), otraCreadaPor: null, estado: r.status,
    });
  }

  const counts = { total: items.length, CITA_DUPLICADA: 0, SMS_FALLIDO: 0, CORREO_FALLIDO: 0, CITA_SIN_CERRAR: 0 };
  for (const i of items) counts[i.tipo]++;
  return { items, counts, ocultas };
}
