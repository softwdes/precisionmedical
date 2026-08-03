/**
 * GET /api/admin/call-logs — historial de llamadas (fase 2 del plan de Twilio).
 *
 * Una sola query alimenta las 3 pestañas del historial de Clinic y la vista de
 * supervisión de Admin: cambia el `scope`, no la vista.
 *
 *   scope=inbound          → direction = INBOUND (visible a todos)
 *   scope=mine             → agentUserId = usuario logueado
 *   scope=answered-by-me   → agentUserId = yo + direction = INBOUND
 *   scope=all              → sin filtro de usuario (solo ADMIN / SUPER_ADMIN)
 *
 * Filtros opcionales: `outcome`, `from`, `to` (ISO date). Paginación `page` /
 * `size`, default 10 (estándar de listas del proyecto).
 *
 * La respuesta trae el paciente y el caso resueltos: el gap que motivó esta
 * vista es que el historial no mostraba a QUIÉN se llamó, solo el número.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, type Prisma } from '@precision-medical/database';
import { createAdminClient } from '@precision-medical/auth/admin';
import { getSessionUser } from '@/lib/session';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { phoneKey } from '@/lib/phone';

export const dynamic = 'force-dynamic';

/** Resultados que cuentan como "perdida" para el contador de devolución. */
const MISSED_OUTCOMES = ['NO_ANSWER', 'BUSY', 'FAILED'] as const;

/**
 * Tope de perdidas que se revisan para calcular "sin devolver". Es un contador
 * de trabajo pendiente, no un reporte histórico: si alguna vez hubiera más de
 * 500 perdidas sin atender, el número exacto es lo de menos.
 */
const MISSED_SCAN_LIMIT = 500;

const QuerySchema = z.object({
  scope:   z.enum(['inbound', 'mine', 'answered-by-me', 'all']).default('inbound'),
  /**
   * Además de los valores del enum, acepta `MISSED` — el grupo que le importa a
   * quien mira la lista ("no hablé con esta persona"), que del lado de Twilio
   * son tres resultados distintos. Filtrar de a uno obligaría a la UI a saber
   * que BUSY y FAILED también son perdidas.
   */
  outcome: z.enum(['ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'IN_PROGRESS', 'MISSED']).optional(),
  from:    z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to:      z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  page:    z.coerce.number().int().min(0).default(0),
  size:    z.coerce.number().int().min(1).max(100).default(10),
});

type Scope = z.infer<typeof QuerySchema>['scope'];

/**
 * "Soy yo" en una llamada.
 *
 * `agentUserId` es la identidad real, pero recién se escribe desde que el token
 * emite identidad por usuario (fase 1): las 17 llamadas que ya existían tienen
 * `agentUserId` null y solo el nombre denormalizado. Sin la segunda rama,
 * "Mis llamadas" salía vacía para todos y la vista nacía muerta.
 *
 * La rama por nombre queda acotada a filas SIN `agentUserId`, así nunca puede
 * pisar una identidad real ni robarle una llamada a un homónimo futuro.
 */
function isMe(userId: string, agentName: string | null): Prisma.CallLogWhereInput {
  const byId: Prisma.CallLogWhereInput = { agentUserId: userId };
  if (!agentName) return byId;
  return { OR: [byId, { agentUserId: null, agentName }] };
}

function scopeWhere(scope: Scope, userId: string, agentName: string | null): Prisma.CallLogWhereInput {
  switch (scope) {
    case 'mine':           return isMe(userId, agentName);
    case 'answered-by-me': return { AND: [isMe(userId, agentName), { direction: 'INBOUND' }] };
    case 'all':            return {};
    case 'inbound':
    default:               return { direction: 'INBOUND' };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let query: z.infer<typeof QuerySchema>;
  try {
    query = QuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_QUERY', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Perfil del usuario: el rol decide si puede ver `scope=all`, y el nombre es
  // lo único que ata las llamadas viejas a su dueño (ver `isMe`).
  const { data: me } = await admin
    .from('users')
    .select('firstName, lastName, role')
    .eq('email', user.email ?? '')
    .single();

  const myName = me ? `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || null : null;

  // `scope=all` es supervisión: ve las llamadas de todos los usuarios.
  if (query.scope === 'all' && me?.role !== 'ADMIN' && me?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) createdAt.gte = new Date(query.from);
  if (query.to) {
    // `to=2026-08-03` debe incluir todo el día 3, no cortar a las 00:00.
    const to = new Date(query.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setHours(23, 59, 59, 999);
    createdAt.lte = to;
  }

  const mineWhere = scopeWhere('mine', user.id, myName);

  const outcomeWhere: Prisma.CallLogWhereInput = query.outcome
    ? query.outcome === 'MISSED'
      ? { outcome: { in: [...MISSED_OUTCOMES] } }
      : { outcome: query.outcome }
    : {};

  const where: Prisma.CallLogWhereInput = {
    ...scopeWhere(query.scope, user.id, myName),
    ...outcomeWhere,
    ...(query.from || query.to ? { createdAt } : {}),
  };

  const [rows, total, inboundCount, mineCount, answeredByMeCount, missed] = await Promise.all([
    db.callLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.page * query.size,
      take: query.size,
      select: {
        id: true,
        twilioCallSid: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        outcome: true,
        durationSeconds: true,
        agentUserId: true,
        agentName: true,
        createdAt: true,
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } },
        case:    { select: { id: true, caseCode: true } },
      },
    }),
    db.callLog.count({ where }),
    db.callLog.count({ where: { direction: 'INBOUND' } }),
    db.callLog.count({ where: mineWhere }),
    db.callLog.count({ where: { AND: [mineWhere, { direction: 'INBOUND' }] } }),
    db.callLog.findMany({
      where: { direction: 'INBOUND', outcome: { in: [...MISSED_OUTCOMES] } },
      orderBy: { createdAt: 'desc' },
      take: MISSED_SCAN_LIMIT,
      select: { id: true, fromNumber: true, createdAt: true },
    }),
  ]);

  // ─── "Perdidas sin devolver" ───────────────────────────────────────────────
  // Una perdida está devuelta si después existe una saliente al mismo número.
  // La comparación va por `phoneKey` (últimos 10 dígitos): el entrante llega
  // en E.164 y el paciente puede estar guardado como `(801) 555-1121`.
  const oldestMissed = missed.at(-1)?.createdAt;
  const callbacks = oldestMissed
    ? await db.callLog.findMany({
        where: { direction: 'OUTBOUND', createdAt: { gte: oldestMissed } },
        select: { toNumber: true, createdAt: true },
      })
    : [];

  const lastCallbackByNumber = new Map<string, Date>();
  for (const c of callbacks) {
    const key = phoneKey(c.toNumber);
    if (!key) continue;
    const prev = lastCallbackByNumber.get(key);
    if (!prev || c.createdAt > prev) lastCallbackByNumber.set(key, c.createdAt);
  }

  const pendingMissedIds = new Set<string>();
  for (const m of missed) {
    const last = lastCallbackByNumber.get(phoneKey(m.fromNumber));
    if (!last || last <= m.createdAt) pendingMissedIds.add(m.id);
  }

  // ─── Reconocer al llamante por su número ───────────────────────────────────
  //
  // `patientId` solo se escribe cuando la llamada salió desde la ficha de un
  // paciente. Todo lo demás (el dial pad, "Nuevo caso", y más adelante las
  // entrantes) queda sin vincular, y la fila mostraba "No registrado" aunque el
  // número estuviera en la base — que es justo lo que Erick reportó.
  //
  // Se busca por los últimos 10 dígitos contra `phone` y `phone2` normalizados
  // en SQL, porque los teléfonos conviven como `(801) 367-9254` y `+18013679254`.
  // Es la misma resolución que va a necesitar el webhook de entrantes (fase 3).
  //
  // Límite conocido: 8 de 5940 pacientes tienen el teléfono cifrado (`e:`) y no
  // se pueden comparar en SQL. Esos siguen saliendo como no registrados.
  const unlinkedKeys = [...new Set(
    rows
      .filter(r => !r.patient)
      .map(r => phoneKey(r.direction === 'INBOUND' ? r.fromNumber : r.toNumber))
      .filter(Boolean),
  )];

  type MatchedPatient = {
    id: string; patientCode: string | null;
    firstName: string; lastName: string;
    phone: string | null; phone2: string | null;
  };
  const byPhoneKey = new Map<string, MatchedPatient[]>();

  if (unlinkedKeys.length > 0) {
    const matches = await db.$queryRaw<MatchedPatient[]>`
      SELECT id, "patientCode", "firstName", "lastName", phone, phone2
      FROM patients
      WHERE right(regexp_replace(coalesce(phone,  ''), '\D', '', 'g'), 10) = ANY(${unlinkedKeys}::text[])
         OR right(regexp_replace(coalesce(phone2, ''), '\D', '', 'g'), 10) = ANY(${unlinkedKeys}::text[])
      ORDER BY "createdAt" DESC
    `;
    for (const m of matches) {
      // Un mismo número puede pertenecer a varios pacientes (99 números de la
      // base son familias que comparten línea). Se guardan todos y la UI avisa.
      for (const key of new Set([phoneKey(m.phone), phoneKey(m.phone2)])) {
        if (!key || !unlinkedKeys.includes(key)) continue;
        const list = byPhoneKey.get(key);
        if (list) list.push(m); else byPhoneKey.set(key, [m]);
      }
    }
  }

  // ─── Nombre del agente ─────────────────────────────────────────────────────
  // `agentName` está denormalizado en la fila. Solo se resuelve por
  // `agentUserId` cuando falta (filas viejas, o entrantes contestadas donde el
  // webhook conoce la identidad pero no el nombre).
  const unresolved = [...new Set(
    rows.filter(r => r.agentUserId && !r.agentName).map(r => r.agentUserId as string),
  )];
  const nameByUserId = new Map<string, string>();
  if (unresolved.length > 0) {
    await Promise.all(unresolved.map(async (id) => {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(id);
        const email = authUser?.user?.email;
        if (!email) return;
        const { data: profile } = await admin
          .from('users')
          .select('firstName, lastName')
          .eq('email', email)
          .single();
        const name = profile ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() : '';
        nameByUserId.set(id, name || email.split('@')[0]!);
      } catch {
        /* sin nombre: la UI muestra "—" */
      }
    }));
  }

  const calls = rows.map((r) => {
    const isInbound         = r.direction === 'INBOUND';
    const counterpartNumber = isInbound ? r.fromNumber : r.toNumber;

    // Vínculo real primero; si no hay, el reconocimiento por número.
    const matched  = r.patient ? null : byPhoneKey.get(phoneKey(counterpartNumber)) ?? null;
    const resolved = r.patient ?? matched?.[0] ?? null;

    return {
      id: r.id,
      twilioCallSid: r.twilioCallSid,
      direction: r.direction,
      outcome: r.outcome,
      durationSeconds: r.durationSeconds,
      createdAt: r.createdAt.toISOString(),
      /** El número del otro lado de la llamada — el que le importa a quien mira. */
      counterpartNumber,
      patient: resolved
        ? {
            id: resolved.id,
            patientCode: resolved.patientCode,
            firstName: resolved.firstName,
            lastName: resolved.lastName,
            phone: dec(resolved.phone),
          }
        : null,
      /**
       * `false` = el CallLog apunta a ese paciente. `true` = lo dedujimos del
       * número. La UI lo marca, porque una deducción puede errarle: hay 99
       * números compartidos por familias en la base.
       */
      patientMatchedByPhone: !r.patient && !!resolved,
      /** Cuántos pacientes comparten ese número (solo si se dedujo). */
      patientMatchCount: matched?.length ?? 0,
      case: r.case ? { id: r.case.id, caseCode: r.case.caseCode } : null,
      agentName: r.agentName ?? (r.agentUserId ? nameByUserId.get(r.agentUserId) ?? null : null),
      // Mismo criterio que `isMe`, para que la etiqueta "(yo)" coincida con lo
      // que filtra la pestaña "Mis llamadas".
      agentIsMe: r.agentUserId
        ? r.agentUserId === user.id
        : !!myName && r.agentName === myName,
      /** Perdida entrante que todavía nadie devolvió → muestra "Devolver". */
      pendingCallback: pendingMissedIds.has(r.id),
    };
  });

  return NextResponse.json({
    calls,
    page: query.page,
    size: query.size,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.size)),
    counts: {
      inbound:      inboundCount,
      mine:         mineCount,
      answeredByMe: answeredByMeCount,
      missedPending: pendingMissedIds.size,
    },
  });
}
