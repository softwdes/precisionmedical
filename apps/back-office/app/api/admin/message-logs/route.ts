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
  /** `FAILED` agrupa UNDELIVERED + FAILED: al que mira le importa "no llegó". */
  status: z.enum(['DELIVERED', 'QUEUED', 'SENT', 'FAILED', 'NOT_DELIVERED']).optional(),
  from:   z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to:     z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
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

  const where: Prisma.MessageLogWhereInput = {
    channel: 'SMS',
    ...(query.scope === 'mine' && myUserId ? { sentByUserId: myUserId } : {}),
    ...statusWhere,
    ...(query.from || query.to ? { createdAt } : {}),
  };

  const [rows, total, mineCount, allCount, notDeliveredCount] = await Promise.all([
    db.messageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.page * query.size,
      take: query.size,
      select: {
        id: true, providerMessageId: true, status: true,
        toAddress: true, body: true,
        errorCode: true, errorMessage: true,
        sentByUserId: true, sentByName: true,
        deliveredAt: true, createdAt: true,
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } },
        case:    { select: { id: true, caseCode: true } },
      },
    }),
    db.messageLog.count({ where }),
    db.messageLog.count({ where: { channel: 'SMS', ...(myUserId ? { sentByUserId: myUserId } : { id: '' }) } }),
    db.messageLog.count({ where: { channel: 'SMS' } }),
    db.messageLog.count({ where: { channel: 'SMS', status: { in: [...NOT_DELIVERED] } } }),
  ]);

  // Mismo reconocimiento que el historial de llamadas: un SMS a un número que
  // no quedó vinculado igual pertenece a alguien.
  const byPhoneKey = await findPatientsByPhoneKeys(
    rows.filter(r => !r.patient).map(r => phoneKey(r.toAddress)),
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
    const matched  = r.patient ? null : byPhoneKey.get(phoneKey(r.toAddress)) ?? null;
    const resolved = r.patient ?? matched?.[0] ?? null;
    return {
      id: r.id,
      providerMessageId: r.providerMessageId,
      status: r.status,
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
    counts: { mine: mineCount, all: allCount, notDelivered: notDeliveredCount },
  });
}
