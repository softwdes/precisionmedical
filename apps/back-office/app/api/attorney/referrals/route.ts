/**
 * POST /api/attorney/referrals — el bufete manda un referido ("¿Tenés un referido?").
 * GET  /api/attorney/referrals — los referidos que mandó el bufete, con su estado.
 *
 * Puerta propia del abogado, como el pedido: el alcance sale de la sesión
 * (`lawyer.firmId`), los destinatarios los decide el servidor (escritorio
 * REFERRALS) y el remitente es la persona REAL de la sesión.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { getSessionLawyer, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { getSessionUser } from '@/lib/session';
import { canSeeVigia } from '@/lib/attorney-portal';
import { resolveActor } from '@/lib/actor';
import { ReferidoSchema, type ReferidoPayload } from '@/lib/referidos/referido';
import { crearReferido, type EtiquetasResumen } from '@/lib/referidos/referidos-server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const [lawyer, user] = await Promise.all([getSessionLawyer(), getSessionUser()]);
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  if (!canSeeVigia(lawyer, isAdminViewer)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  let payload: ReferidoPayload;
  try {
    payload = ReferidoSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'REFERIDO_INVALIDO' }, { status: 400 });
  }

  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId || !actor.actorName) {
    return NextResponse.json({ error: 'SIN_IDENTIDAD' }, { status: 401 });
  }

  /**
   * El resumen del mensaje se escribe en ESPAÑOL, el idioma de la clínica que lo
   * recibe — el abogado lo lee en el portal como texto, y lo que le importa
   * son los datos, no las etiquetas. Las etiquetas salen del catálogo de
   * mensajes (`phoenix.messaging.ref*`), no del código.
   */
  const tm = await getTranslations({ locale: 'es', namespace: 'phoenix.messaging' });
  const etiquetas: EtiquetasResumen = {
    cliente: tm('refLblClient'), telefono: tm('refLblPhone'), email: tm('refLblEmail'),
    nacimiento: tm('refLblDob'), idioma: tm('refLblLanguage'),
    accidente: tm('refLblAccident'), fecha: tm('refLblDate'), lugar: tm('refLblPlace'), descripcion: tm('refLblDescription'),
    seguro: tm('refLblInsurance'), poliza: tm('refLblPolicy'), reclamo: tm('refLblClaim'), ajustador: tm('refLblAdjuster'), tercero: tm('refLblThirdParty'),
    bufete: tm('refLblFirm'), abogado: tm('refLblAttorney'), nota: tm('refLblNote'),
    urgente: tm('refLblUrgent'), posibleDuplicado: tm('refLblPossibleDuplicate'),
  };
  const firma = lawyer.firmName ?? `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim();
  const asunto = `[${firma}] ${tm('refSubject', { name: `${payload.cliente.firstName} ${payload.cliente.lastName}` })}`;

  const r = await crearReferido({
    lawyer,
    actor: actor as typeof actor & { actorUserId: string; actorName: string },
    payload,
    etiquetas,
    asunto,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.error === 'SIN_DESTINATARIOS' ? 503 : 400 });
  }
  return NextResponse.json({ ok: true, referralId: r.referralId, threadId: r.threadId, duplicados: r.duplicados.length, respaldo: r.respaldo });
}

export async function GET(): Promise<NextResponse> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  if (!lawyer.firmId) return NextResponse.json({ referrals: [], pendientes: 0, creados: 0 });

  const rows = await db.firmReferral.findMany({
    where: { firmId: lawyer.firmId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, status: true, createdAt: true, convertedAt: true, threadId: true, payload: true,
      thread: { select: { case: { select: { caseCode: true } } } },
    },
  });

  return NextResponse.json({
    pendientes: rows.filter((r) => r.status === 'PENDING').length,
    creados: rows.filter((r) => r.status === 'CREATED').length,
    referrals: rows.map((r) => {
      const p = r.payload as unknown as ReferidoPayload;
      return {
        id: r.id,
        threadId: r.threadId,
        status: r.status,
        clientName: `${p.cliente.firstName} ${p.cliente.lastName}`,
        accidentDate: p.accidente.date,
        createdAt: r.createdAt,
        convertedAt: r.convertedAt,
        caseCode: r.thread.case?.caseCode ?? null,
      };
    }),
  });
}
