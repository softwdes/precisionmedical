/**
 * POST /api/admin/call-logs/recuperar — traer de vuelta el historial de llamadas
 * desde Twilio.
 *
 * ── Qué pasó ────────────────────────────────────────────────────────────────
 *
 * El 2026-10-07 la clínica reportó que el historial de llamadas mostraba cero
 * teniendo semanas de llamadas hechas. Medido contra `pg_stat_user_tables`:
 *
 *     call_logs → 39 filas insertadas alguna vez · 4 borradas · 0 vivas
 *
 * 39 menos 4 son 35, y hay cero. Un `DELETE` no hace eso: lo deja contado. Un
 * `TRUNCATE` sí, porque vacía sin contar. Alguien la vació desde la consola de
 * la base. En el repo no hay nada que borre esa tabla —el único DELETE toca 3
 * pacientes de prueba de la migración, que son probablemente esas 4 filas.
 *
 * Lo que se perdió fue NUESTRA copia. **Twilio conserva la suya**: fecha,
 * duración, números y resultado de cada llamada. Esta ruta la vuelve a traer.
 *
 * ── Por qué una ruta y no un script ─────────────────────────────────────────
 *
 * Porque las credenciales de Twilio ya están donde tienen que estar: en las
 * variables del servidor. Un script local obligaría a copiarlas a la máquina de
 * alguien, que es exactamente lo que no hay que hacer con una credencial que
 * puede marcar llamadas a cuenta de la clínica.
 *
 * ── Se puede correr dos veces ───────────────────────────────────────────────
 *
 * `twilioCallSid` es único y acá se hace `skipDuplicates`. Correrla de nuevo no
 * duplica ni pisa lo que ya existe: suma lo que falte. Eso importa porque la
 * primera corrida puede quedarse corta —Twilio pagina— y porque el día que
 * alguien vuelva a vaciar la tabla, esto es el camino de vuelta.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import { twilioClient, TWILIO_PHONE_NUMBER, userIdFromIdentity } from '@/lib/twilio-server';
import { checkPatientStaff } from '@/lib/patient-access';
import { resolveActor } from '@/lib/actor';
import { findPatientsByPhoneKeys } from '@/lib/patient-phone-lookup';
import { phoneKey } from '@/lib/phone';

export const dynamic = 'force-dynamic';
/** Traer cientos de llamadas y resolver pacientes no entra en los 10 s default. */
export const maxDuration = 60;

const Entrada = z.object({
  /** Desde qué fecha traer. Por defecto, los últimos 90 días. */
  desde: z.string().optional(),
  /** Techo de seguridad: no traer más de esto en una corrida. */
  limite: z.number().int().min(1).max(2000).default(1000),
});

/**
 * El resultado de Twilio, traducido al nuestro.
 *
 * `completed` con duración 0 NO es atendida: es el caso en que la llamada se
 * estableció y nadie habló —buzón que cortó, colgaron al instante—. Contarla
 * como atendida inflaría el número que la clínica usa para saber si alguien
 * devolvió el llamado.
 */
function resultado(status: string | null | undefined, segundos: number): 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' {
  switch (status) {
    case 'completed': return segundos > 0 ? 'ANSWERED' : 'NO_ANSWER';
    case 'busy':      return 'BUSY';
    case 'no-answer': return 'NO_ANSWER';
    default:          return 'FAILED';   // failed, canceled, y lo que no conozcamos
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  let datos;
  try {
    datos = Entrada.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  if (!TWILIO_PHONE_NUMBER) {
    return NextResponse.json({ error: 'SIN_NUMERO_CONFIGURADO' }, { status: 503 });
  }

  const desde = datos.desde ? new Date(datos.desde) : new Date(Date.now() - 90 * 86_400_000);
  if (Number.isNaN(desde.getTime())) {
    return NextResponse.json({ error: 'FECHA_INVALIDA' }, { status: 400 });
  }

  let llamadas;
  try {
    llamadas = await twilioClient.calls.list({ startTimeAfter: desde, limit: datos.limite });
  } catch (e) {
    console.error('[call-logs/recuperar] Twilio rechazó la consulta:', e);
    return NextResponse.json({ error: 'TWILIO_NO_RESPONDE' }, { status: 502 });
  }

  /**
   * Una fila por llamada, no por tramo.
   *
   * Marcar desde el navegador genera DOS registros en Twilio: el del navegador
   * hacia nosotros y el nuestro hacia el paciente, atados por `parentCallSid`.
   * Guardar los dos mostraría cada llamada repetida, una de ellas con
   * `client:user-<id>` en la columna del teléfono. Nos quedamos con el padre,
   * que es el que tiene al agente.
   */
  const padres = llamadas.filter((c) => !c.parentCallSid);

  const nuestro = phoneKey(TWILIO_PHONE_NUMBER);
  const filas = padres.map((c) => {
    const from = c.from ?? '';
    const to   = c.to ?? '';
    /**
     * `client:` adelante significa que marcó una PERSONA desde la app. Twilio
     * reporta ese tramo como "inbound" porque el navegador entra hacia él, y
     * creerle dejaría todas las salientes marcadas como recibidas.
     */
    const delNavegador = from.startsWith('client:');
    const direction: 'INBOUND' | 'OUTBOUND' =
      delNavegador ? 'OUTBOUND'
      : phoneKey(to) === nuestro ? 'INBOUND'
      : 'OUTBOUND';

    const segundos = Number.parseInt(c.duration ?? '0', 10) || 0;
    return {
      twilioCallSid: c.sid,
      direction,
      // En una saliente desde el navegador, el origen real es nuestro número:
      // guardar `client:user-<uuid>` deja un id donde va un teléfono.
      fromNumber: delNavegador ? TWILIO_PHONE_NUMBER : from,
      toNumber:   to,
      outcome:    resultado(c.status, segundos),
      durationSeconds: segundos || null,
      agentUserId: delNavegador ? userIdFromIdentity(from) : null,
      agentName:   null as string | null,
      // La fecha REAL de la llamada, no la de hoy. Sin esto el historial
      // recuperado aparecería todo junto el día que se corrió el rescate.
      createdAt: c.startTime ? new Date(c.startTime) : new Date(),
      patientId: null as string | null,
    };
  });

  /**
   * De quién es cada número, en UNA consulta para todas.
   *
   * Solo cuando coincide con UN paciente: acá 117 números pertenecen a 263
   * personas —familias que comparten línea— y meterle la llamada a la ficha
   * equivocada es peor que dejarla sin vincular. Quien la mire la resuelve.
   */
  const claves = filas.map((f) => phoneKey(f.direction === 'INBOUND' ? f.fromNumber : f.toNumber));
  const porNumero = await findPatientsByPhoneKeys(claves);
  for (const f of filas) {
    const halla = porNumero.get(phoneKey(f.direction === 'INBOUND' ? f.fromNumber : f.toNumber)) ?? [];
    if (halla.length === 1) f.patientId = halla[0]!.id;
  }

  /**
   * El NOMBRE de quien llamó, en una consulta para todos.
   *
   * Twilio solo guarda `client:user-<id>`: el id, no la persona. La columna
   * "Agente" de la pantalla lee `agentName`, así que sin esto el historial
   * recuperado saldría entero con un guion donde va el nombre — recuperado a
   * medias, que para quien lo mira es casi lo mismo que no recuperarlo.
   */
  const ids = [...new Set(filas.map((f) => f.agentUserId).filter((v): v is string => !!v))];
  if (ids.length > 0) {
    const personas = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    const porId = new Map(personas.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    for (const f of filas) {
      if (f.agentUserId) f.agentName = porId.get(f.agentUserId) ?? null;
    }
  }

  const res = await db.callLog.createMany({ data: filas, skipDuplicates: true });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'RECOVER_CALL_LOGS',
    entityType:  'call_logs',
    entityId:    'recuperacion',
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    // Cuántas trajo y desde cuándo. Los números de teléfono NO: ya quedan en
    // `call_logs`, y repetirlos acá duplica lo que hay que proteger.
    metadata: {
      desde: desde.toISOString(),
      vistas: llamadas.length,
      consideradas: filas.length,
      insertadas: res.count,
    } as Prisma.JsonValue,
  });

  return NextResponse.json({
    ok: true,
    /** Lo que Twilio devolvió, incluidos los tramos hijos. */
    vistasEnTwilio: llamadas.length,
    /** Las que son una llamada de verdad (sin los tramos hijos). */
    consideradas: filas.length,
    /** Las que NO estaban y ahora sí. El resto ya existía. */
    insertadas: res.count,
    desde: desde.toISOString(),
  });
}
