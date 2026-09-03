/**
 * GET /api/messages/patient/[patientId] → historial de mensajes del paciente
 * ("Messages & Requests" del legacy). A diferencia del inbox, lista TODOS los
 * hilos anclados al paciente sin importar quién los mire ni si salieron de
 * las bandejas (sellados y Delete From All incluidos): esta capa es el
 * registro permanente. Solo excluye los borrados del historial (deletedAt).
 *
 * `?caseId=` acota al historial de UN caso — es lo que abre el ícono de
 * mensaje en la fila de un caso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';

type Ctx = { params: Promise<{ patientId: string }> };

/** Largo del recorte: una línea de ~290px en la tarjeta del contexto. */
const PREVIEW_MAX = 140;

/**
 * HTML del cuerpo → una línea de texto plano.
 *
 * `&nbsp;` va aparte porque el editor lo mete al indentar y sin traducirlo la
 * vista previa sale con la basura a la vista. Las etiquetas de bloque se
 * reemplazan por un espacio y no por nada: sin eso `<p>Hola</p><p>Mundo</p>`
 * queda "HolaMundo".
 */
function recorte(html: string | null): string | null {
  if (!html) return null;
  const texto = html
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return null;
  return texto.length > PREVIEW_MAX ? `${texto.slice(0, PREVIEW_MAX).trimEnd()}…` : texto;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  const { patientId } = await ctx.params;

  const caseId = req.nextUrl.searchParams.get('caseId');

  const rows = await db.messageThread.findMany({
    where: { patientId, deletedAt: null, ...(caseId ? { caseId } : {}) },
    orderBy: { lastEntryAt: 'desc' },
    select: {
      id: true,
      subject: true,
      type: true,
      category: true,
      priority: true,
      createdByName: true,
      lastEntryAt: true,
      sealedAt: true,
      case: { select: { id: true, caseCode: true, accidentDate: true } },
      recipients: {
        where: { userId: actor.actorUserId },
        select: { lastReadAt: true },
      },
      entries: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { authorName: true, kind: true, body: true, _count: { select: { attachments: true } } },
      },
    },
  });

  /**
   * Cuántos hilos tiene este paciente en OTROS casos.
   *
   * Solo cuando se pidió un caso: es la línea "hay N en otro caso" de la
   * tarjeta de la nota. Se cuenta pero NO se devuelven los hilos — un caso MVA
   * tiene mensajes que involucran al bufete y no corresponde mostrarlos bajo la
   * nota de un caso GM. Se muestra que existen y se llega por el expediente.
   */
  const otrosCasos = caseId
    ? await db.messageThread.count({
        where: { patientId, deletedAt: null, caseId: { not: caseId } },
      })
    : 0;

  const threads = rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    type: r.type,
    category: r.category,
    priority: r.priority,
    createdByName: r.createdByName,
    lastEntryAt: r.lastEntryAt,
    sealedAt: r.sealedAt,
    case: r.case,
    lastAuthorName: r.entries[0]?.authorName ?? null,
    /**
     * Una línea del último mensaje, para la tarjeta de la nota.
     *
     * `body` es HTML del RichTextEditor: se limpia ACÁ y no en el cliente. Un
     * asunto no alcanza para decidir si el mensaje importa mientras se escribe
     * la nota ("Paciente llamó" no dice nada), y mandar el HTML crudo a un
     * sidebar es abrir una inyección para ahorrar cuatro líneas.
     */
    preview: recorte(r.entries[0]?.body ?? null),
    attachmentCount: r.entries[0]?._count.attachments ?? 0,
    // Bold solo aplica si YO soy destinatario; para terceros va sin negrita.
    unread:
      r.recipients.length > 0 &&
      (!r.recipients[0].lastReadAt || r.lastEntryAt > r.recipients[0].lastReadAt),
  }));

  return NextResponse.json({ threads, otrosCasos });
}
