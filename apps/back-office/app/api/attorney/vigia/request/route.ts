/**
 * POST /api/attorney/vigia/request — el bufete le pide algo a la clínica.
 *
 * Es la puerta del abogado a la mensajería, y es SUYA: no se le abre
 * `/api/messages`. Acá el alcance se valida contra `lawyerCaseFilter()` y los
 * destinatarios los elige el servidor, no el cliente. Mandarlo por la ruta
 * general obligaría a confiar en el `to` que llega del navegador — y ese `to`
 * es el nombre de cualquier persona de la clínica.
 *
 * El hilo que crea es un hilo normal: cae en la bandeja del destinatario como
 * cualquier otro, atado al caso, y la respuesta le vuelve al abogado por su
 * propia bandeja. Ninguna tabla nueva.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { getSessionLawyer, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { getSessionUser } from '@/lib/session';
import { lawyerCaseFilter, canSeeVigia } from '@/lib/attorney-portal';
import { resolveActor } from '@/lib/actor';
import { destinatariosDePedidos } from '@/lib/vigia/pedidos';

const Schema = z.object({
  caso: z.string().min(1).max(60),
  subject: z.string().min(3).max(200),
  body: z.string().min(3).max(4000),
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const [lawyer, user] = await Promise.all([getSessionLawyer(), getSessionUser()]);
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  if (!canSeeVigia(lawyer, isAdminViewer)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let input: z.infer<typeof Schema>;
  try {
    input = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'PEDIDO_INVALIDO' }, { status: 400 });
  }

  // El caso tiene que estar en SU alcance. Se resuelve por código, igual que
  // las herramientas del agente: el id nunca viaja desde el cliente.
  const kase = await db.case.findFirst({
    where: { AND: [lawyerCaseFilter(lawyer), { caseCode: { equals: input.caso.trim(), mode: 'insensitive' } }] },
    select: { id: true, caseCode: true, patientId: true },
  });
  if (!kase) return NextResponse.json({ error: 'FUERA_DE_ALCANCE' }, { status: 404 });

  const destinatarios = await destinatariosDePedidos();
  if (destinatarios.length === 0) {
    return NextResponse.json({ error: 'SIN_DESTINATARIOS' }, { status: 503 });
  }

  /**
   * El remitente.
   *
   * Es la persona REAL de la sesión, no la ficha del bufete: cuando un admin
   * entra "viendo como" un despacho, el mensaje tiene que decir que lo mandó el
   * admin. Firmar con el nombre del abogado sería suplantarlo en un hilo que
   * después alguien va a leer como si lo hubiera escrito él.
   */
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId || !actor.actorName) {
    return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });
  }

  const firma = lawyer.firmName ?? `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim();
  const now = new Date();

  const thread = await db.messageThread.create({
    data: {
      // El bufete al frente: en la bandeja de la clínica tiene que leerse de
      // una que el pedido viene de afuera y de quién.
      subject: `[${firma}] ${input.subject}`,
      type: 'REQUEST',
      category: 'PATIENT_RELATED',
      priority: input.priority,
      patientId: kase.patientId,
      caseId: kase.id,
      createdByUserId: actor.actorUserId,
      createdByName: actor.actorName,
      lastEntryAt: now,
      entries: {
        create: {
          kind: 'MESSAGE',
          authorUserId: actor.actorUserId,
          authorName: actor.actorName,
          body: input.body,
          sentAt: now,
        },
      },
      recipients: {
        create: [
          ...destinatarios.map((u) => ({ userId: u.id, userName: u.name, kind: 'TO' as const })),
          // El que pidió participa, para ver la respuesta en su bandeja.
          ...(destinatarios.some((u) => u.id === actor.actorUserId)
            ? []
            : [{
                userId: actor.actorUserId,
                userName: actor.actorName,
                kind: 'SENDER' as const,
                lastReadAt: now,
              }]),
        ],
      },
    },
    select: { id: true },
  });

  writeAuditLog(db, {
    ...actor,
    action: 'VIGIA_REQUEST_SENT',
    entityType: 'MessageThread',
    entityId: thread.id,
    metadata: {
      caso: kase.caseCode,
      bufete: firma,
      // Queda quién lo mandó de verdad y en nombre de quién.
      comoBufete: lawyer.id,
      destinatarios: destinatarios.map((d) => d.name),
    },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, threadId: thread.id });
}
