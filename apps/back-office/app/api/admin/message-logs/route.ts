/**
 * GET /api/admin/message-logs — historial de SMS enviados.
 *
 * Hermano de `/api/admin/call-logs`. Lee `message_logs`, que registra TODO
 * intento de envío, salga o no: sin eso "no le llegó el link" y "nadie se lo
 * mandó" son indistinguibles.
 *
 * El estado que importa es el que confirma el operador por
 * `/api/twilio/sms-status`. `QUEUED` solo dice que Twilio lo aceptó.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, type Prisma } from '@precision-medical/database';
import { createAdminClient } from '@precision-medical/auth/admin';
import { getSessionUser } from '@/lib/session';
import { resolveActor } from '@/lib/actor';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { phoneKey } from '@/lib/phone';
import { findPatientsByPhoneKeys } from '@/lib/patient-phone-lookup';

export const dynamic = 'force-dynamic';

/** Los que significan "no llegó" para el usuario que mira la lista. */
const NOT_DELIVERED = ['UNDELIVERED', 'FAILED'] as const;

const QuerySchema = z.object({
  /** `mine` = los que mandé yo · `all` = todos (supervisión). */
  scope:  z.enum(['mine', 'all']).default('mine'),
  /**
   * Qué canal se mira.
   *
   * Estaba fijo en `'SMS'` adentro del `where`, y `message_logs` guarda las dos
   * cosas: cada correo del portal escribe su fila igual que un SMS, con su
   * estado y su motivo de falla. Simplemente no había forma de verlos —el
   * historial los filtraba— así que un correo rechazado por el allowlist
   * quedaba registrado en una tabla que nadie podía consultar desde la app.
   *
   * El default sigue siendo SMS para no cambiarle la pantalla a quien ya la
   * usa; el filtro de canal es lo que abre el resto.
   */
  channel: z.enum(['SMS', 'EMAIL', 'ALL']).default('SMS'),
  /** `FAILED` agrupa UNDELIVERED + FAILED: al que mira le importa "no llegó". */
  status: z.enum(['DELIVERED', 'QUEUED', 'SENT', 'FAILED', 'NOT_DELIVERED']).optional(),
  from:   z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to:     z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  /**
   * Entrantes, salientes o las dos.
   *
   * Hasta el 2026-09-28 no hacia falta: TODO era saliente porque no habia
   * webhook que recibiera (ver `api/twilio/sms-incoming`). El default es ALL
   * para que el historial sea el historial —lo que se dijo y lo que
   * contestaron, en el mismo orden— y no dos listas que hay que cruzar.
   */
  direction: z.enum(['ALL', 'IN', 'OUT']).default('ALL'),
  /** Nombre, codigo o telefono del paciente. Lo pidio la clinica por escrito. */
  q: z.string().trim().max(80).optional(),
  page:   z.coerce.number().int().min(0).default(0),
  size:   z.coerce.number().int().min(1).max(100).default(10),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // ⚠️ El id que hay que comparar es el de `resolveActor`, NO `user.id`.
  //
  // `getSessionUser()` devuelve el UUID de Supabase Auth; `sentByUserId` se
  // escribe con `resolveActor()`, que devuelve el cuid de la tabla users. Son
  // dos identificadores distintos de la misma persona y nunca coinciden: por
  // eso "Mis SMS" mostraba cero con mensajes ya entregados en la tabla.
  //
  // Es la misma trampa que ya se habia pisado con CallLog.agentUserId. Se usa
  // el MISMO resolvedor que escribe, para que no puedan volver a divergir.
  const actor = await resolveActor(req.headers);
  const myUserId = actor.actorUserId;

  let query: z.infer<typeof QuerySchema>;
  try {
    query = QuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_QUERY', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) createdAt.gte = new Date(query.from);
  if (query.to) {
    const to = new Date(query.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setHours(23, 59, 59, 999);
    createdAt.lte = to;
  }

  const statusWhere: Prisma.MessageLogWhereInput = query.status
    ? query.status === 'NOT_DELIVERED'
      ? { status: { in: [...NOT_DELIVERED] } }
      : { status: query.status }
    : {};

  // `ALL` = sin cláusula de canal. Los contadores de abajo usan el mismo
  // filtro: si mostraran siempre los de SMS, las pastillas dirían un número y
  // la tabla otro.
  const channelWhere: Prisma.MessageLogWhereInput =
    query.channel === 'ALL' ? {} : { channel: query.channel };

  const directionWhere: Prisma.MessageLogWhereInput =
    query.direction === 'ALL' ? {} : { direction: query.direction === 'IN' ? 'INBOUND' : 'OUTBOUND' };

  /**
   * Un ENTRANTE no tiene remitente nuestro, asi que "los mios" no aplica.
   *
   * Sin esta excepcion, alguien con el filtro en "Mis mensajes" —que es como
   * queda la pantalla despues de usarla— no veria NUNCA una respuesta de un
   * paciente, y la bandeja pareceria vacia estando llena. El scope filtra lo
   * que YO mande; lo que entra es de la clinica, no de una persona.
   */
  const scopeWhere: Prisma.MessageLogWhereInput =
    query.scope === 'mine' && myUserId && query.direction !== 'IN'
      ? { sentByUserId: myUserId }
      : {};

  /** Busqueda por paciente: nombre, codigo, o el numero/direccion del mensaje. */
  const searchWhere: Prisma.MessageLogWhereInput = query.q
    ? {
        OR: [
          { patient: { firstName:   { contains: query.q, mode: 'insensitive' } } },
          { patient: { lastName:    { contains: query.q, mode: 'insensitive' } } },
          { patient: { patientCode: { contains: query.q, mode: 'insensitive' } } },
          { toAddress:   { contains: query.q, mode: 'insensitive' } },
          { fromAddress: { contains: query.q, mode: 'insensitive' } },
        ],
      }
    : {};

  const where: Prisma.MessageLogWhereInput = {
    ...channelWhere,
    ...directionWhere,
    ...scopeWhere,
    ...searchWhere,
    ...statusWhere,
    ...(query.from || query.to ? { createdAt } : {}),
  };

  const [rows, total, mineCount, allCount, notDeliveredCount, inboundCount, unreadCount] = await Promise.all([
    db.messageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.page * query.size,
      take: query.size,
      select: {
        id: true, providerMessageId: true, status: true,
        channel: true,
        toAddress: true, body: true,
        errorCode: true, errorMessage: true,
        sentByUserId: true, sentByName: true,
        deliveredAt: true, createdAt: true,
        direction: true, readAt: true, fromAddress: true,
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } },
        case:    { select: { id: true, caseCode: true } },
      },
    }),
    db.messageLog.count({ where }),
    db.messageLog.count({ where: { ...channelWhere, ...(myUserId ? { sentByUserId: myUserId } : { id: '' }) } }),
    db.messageLog.count({ where: channelWhere }),
    db.messageLog.count({ where: { ...channelWhere, status: { in: [...NOT_DELIVERED] } } }),
    db.messageLog.count({ where: { ...channelWhere, direction: 'INBOUND' } }),
    // Sin scope ni busqueda a proposito: un badge que cambia al filtrar no es
    // un badge, es otra columna de la tabla.
    db.messageLog.count({ where: { direction: 'INBOUND', readAt: null } }),
  ]);

  // Mismo reconocimiento que el historial de llamadas: un SMS a un número que
  // no quedó vinculado igual pertenece a alguien.
  //
  // Solo para SMS: en una fila de EMAIL, `toAddress` es una dirección de
  // correo, y pasarla por `phoneKey` da una clave sin sentido que puede
  // engancharse con la de otro paciente. Preferible no reconocer a nadie que
  // ponerle a un correo el nombre equivocado.
  const byPhoneKey = await findPatientsByPhoneKeys(
    rows.filter(r => !r.patient && r.channel === 'SMS').map(r => phoneKey(r.toAddress)),
  );

  // Nombre de quien lo mandó, si la fila no lo tiene denormalizado.
  const unresolved = [...new Set(
    rows.filter(r => r.sentByUserId && !r.sentByName).map(r => r.sentByUserId as string),
  )];
  const nameByUserId = new Map<string, string>();
  if (unresolved.length > 0) {
    const admin = createAdminClient();
    await Promise.all(unresolved.map(async (id) => {
      try {
        // Por `id` y no por Auth: `sentByUserId` es el cuid de la tabla users.
        const { data: profile } = await admin
          .from('users').select('firstName, lastName, email').eq('id', id).single();
        if (!profile) return;
        const name = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
        nameByUserId.set(id, name || (profile.email as string | null)?.split('@')[0] || id);
      } catch { /* la UI muestra "—" */ }
    }));
  }

  const messages = rows.map((r) => {
    const matched  = r.patient || r.channel !== 'SMS'
      ? null
      : byPhoneKey.get(phoneKey(r.toAddress)) ?? null;
    const resolved = r.patient ?? matched?.[0] ?? null;
    return {
      id: r.id,
      providerMessageId: r.providerMessageId,
      status: r.status,
      channel: r.channel,
      toAddress: r.toAddress,
      body: r.body,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      patient: resolved ? {
        id: resolved.id,
        patientCode: resolved.patientCode,
        firstName: resolved.firstName,
        lastName: resolved.lastName,
        phone: dec(resolved.phone),
      } : null,
      patientMatchedByPhone: !r.patient && !!resolved,
      patientMatchCount: matched?.length ?? 0,
      case: r.case ? { id: r.case.id, caseCode: r.case.caseCode } : null,
      sentByName: r.sentByName ?? (r.sentByUserId ? nameByUserId.get(r.sentByUserId) ?? null : null),
      sentByMe: !!myUserId && r.sentByUserId === myUserId,
    };
  });

  return NextResponse.json({
    messages,
    page: query.page,
    size: query.size,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.size)),
    counts: { mine: mineCount, all: allCount, notDelivered: notDeliveredCount, inbound: inboundCount, unread: unreadCount },
  });
}

/**
 * PATCH /api/admin/message-logs — marcar entrantes como leídos.
 *
 * Solo tiene sentido para los ENTRANTES: un mensaje que mandamos nosotros no se
 * "lee". Por eso el `where` lleva `direction: 'INBOUND'` — sin eso, un id
 * equivocado marcaría un saliente y el dato quedaría diciendo algo que no
 * significa nada.
 *
 * `updateMany` y no `update`: marcar como leído lo que ya estaba leído no es un
 * error, es el segundo clic de alguien. Y `readAt: null` en el filtro hace que
 * el PRIMERO que lo abre quede registrado, no el último.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const actor = await resolveActor(req.headers);

  let ids: string[];
  try {
    const cuerpo = await req.json();
    ids = z.array(z.string()).min(1).max(200).parse(cuerpo?.ids);
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const res = await db.messageLog.updateMany({
    where: { id: { in: ids }, direction: 'INBOUND', readAt: null },
    data:  { readAt: new Date(), readByUserId: actor.actorUserId ?? null },
  });

  return NextResponse.json({ ok: true, marcados: res.count });
}
