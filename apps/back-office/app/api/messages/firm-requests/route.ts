/**
 * GET /api/messages/firm-requests — TODOS los pedidos que mandaron los bufetes,
 * para el admin. Filtros: `firmId`, `desk`, `estado` (PENDING | ANSWERED),
 * `priority`, `from`, `to` (fechas ISO), `q` (asunto o código de caso), `page`.
 *
 * Existe porque la "bandeja ajena" es por PERSONA, no por origen: para ver lo
 * que pidieron los bufetes había que abrir la bandeja de Edson, después la de
 * Beatriz, y adivinar por el `[Bufete]` del asunto. Acá el origen es una
 * columna (`firmId`) y el escritorio otra.
 *
 * "Sin responder" se DERIVA, no se guarda: la última entrada visible la
 * escribió el lado del bufete. Lado del bufete = quien abrió el hilo o
 * cualquier usuario con rol LAWYER (un admin "viendo como" también abre hilos).
 * Como los pedidos de bufete son pocos —decenas, no miles—, se traen los que
 * pasan los filtros de base y el estado se resuelve en memoria. Si algún día
 * son miles, esto pasa a SQL; hoy sería complejidad sin cliente.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, type Prisma } from '@precision-medical/database';
import { requireMessagingActor } from '@/lib/messaging';
import { canSeeFirmRequestsFor } from '@/lib/firm-requests-access';
import { esEscritorio } from '@/lib/mensajeria/escritorios';

/** El cuerpo de la respuesta, en texto plano y corto, para la columna. */
function recorte(html: string | null | undefined, max = 160): string | null {
  if (!html) return null;
  const texto = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return null;
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

const PAGE_SIZE = 20;
/** Techo de hilos que se resuelven en memoria por consulta. */
const MAX_ESCANEO = 500;
const KINDS_VISIBLES = ['MESSAGE', 'REPLY', 'FORWARD'] as const;

// Sin `export`: los route files no admiten exports extra (tsc no lo ve, el build sí).
type EstadoPedido = 'PENDING' | 'ANSWERED' | 'CREATED';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  // Admin por rol, o la casilla "Pedidos de bufetes" en la ficha (opt-in).
  if (!actor.email || !(await canSeeFirmRequestsFor(actor.email))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const firmId = sp.get('firmId') || null;
  // Clínica del paciente = la de sus citas (el caso no tiene sede propia).
  const clinicId = sp.get('clinicId') || null;
  const desk = sp.get('desk');
  // REQUEST = consulta de caso · REFERRAL = referido. Sin filtro, los dos.
  const type = sp.get('type');
  const estado = sp.get('estado') as EstadoPedido | null;
  const priority = sp.get('priority');
  const from = sp.get('from');
  const to = sp.get('to');
  const q = sp.get('q')?.trim() || null;
  const page = Math.max(1, Number(sp.get('page') ?? '1'));

  const where: Prisma.MessageThreadWhereInput = {
    deletedAt: null,
    firmId: firmId ? firmId : { not: null },
    ...(esEscritorio(desk) ? { desk } : {}),
    ...(type === 'REQUEST' || type === 'REFERRAL' ? { type } : {}),
    ...(priority === 'URGENT' || priority === 'NORMAL' ? { priority } : {}),
    ...(clinicId ? { case: { appointments: { some: { clinicId } } } } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } }
      : {}),
    ...(q
      ? { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { case: { caseCode: { contains: q, mode: 'insensitive' } } }] }
      : {}),
  };

  const [threads, abogados] = await Promise.all([
    db.messageThread.findMany({
      where,
      orderBy: { lastEntryAt: 'desc' },
      take: MAX_ESCANEO,
      select: {
        id: true, subject: true, type: true, desk: true, topic: true, priority: true, firmId: true,
        createdByUserId: true, createdByName: true, createdAt: true, lastEntryAt: true, sealedAt: true,
        referral: { select: { id: true, status: true, convertedByName: true } },
        case: {
          select: {
            id: true, caseCode: true,
            // La sede del paciente: la de su cita más reciente.
            appointments: { orderBy: { scheduledFor: 'desc' }, take: 1, select: { clinic: { select: { id: true, name: true } } } },
          },
        },
        patient: { select: { firstName: true, lastName: true } },
        entries: {
          where: { kind: { in: [...KINDS_VISIBLES] } },
          orderBy: { sentAt: 'asc' },
          select: { authorUserId: true, authorName: true, sentAt: true, body: true },
        },
        recipients: { where: { kind: 'TO' }, select: { userName: true } },
      },
    }),
    db.user.findMany({ where: { role: 'LAWYER' }, select: { id: true } }),
  ]);
  const ladoBufete = new Set(abogados.map((a) => a.id));

  // Nombre del bufete: `firmId` no tiene FK, se resuelve aparte y de una vez.
  const firmIds = [...new Set(threads.map((t) => t.firmId!).filter(Boolean))];
  const firmas = await db.lawyer.findMany({
    where: { id: { in: firmIds } },
    select: { id: true, firmName: true, firstName: true, lastName: true },
  });
  const nombreBufete = new Map(firmas.map((f) => [f.id, f.firmName ?? `${f.firstName ?? ''} ${f.lastName ?? ''}`.trim()]));

  const resueltos = threads.map((t) => {
    const esBufete = (uid: string) => uid === t.createdByUserId || ladoBufete.has(uid);
    const ultima = t.entries[t.entries.length - 1];
    const primeraRespuesta = t.entries.find((e) => !esBufete(e.authorUserId));
    // Quién respondió por la clínica por última vez, cuándo y qué dijo: es el
    // control de que el pedido no quedó en el aire.
    const respuestas = t.entries.filter((e) => !esBufete(e.authorUserId));
    const ultimaRespuesta = respuestas[respuestas.length - 1];
    // Un referido convertido en caso está CERRADO aunque el bufete haya escrito
    // después: el trabajo que pedía ya se hizo.
    const estadoHilo: EstadoPedido = t.referral?.status === 'CREATED'
      ? 'CREATED'
      : ultima && esBufete(ultima.authorUserId) ? 'PENDING' : 'ANSWERED';
    return {
      id: t.id,
      subject: t.subject,
      type: t.type,
      referral: t.referral ? { id: t.referral.id, status: t.referral.status, convertedByName: t.referral.convertedByName } : null,
      desk: t.desk,
      topic: t.topic,
      priority: t.priority,
      firm: { id: t.firmId!, name: nombreBufete.get(t.firmId!) ?? '—' },
      case: t.case ? { id: t.case.id, caseCode: t.case.caseCode } : null,
      clinic: t.case?.appointments[0]?.clinic ?? null,
      patientName: t.patient ? `${t.patient.firstName} ${t.patient.lastName}`.trim() : null,
      lastReply: ultimaRespuesta
        ? { by: ultimaRespuesta.authorName, at: ultimaRespuesta.sentAt, text: recorte(ultimaRespuesta.body) }
        : null,
      from: t.createdByName,
      to: t.recipients.map((r) => r.userName),
      createdAt: t.createdAt,
      lastEntryAt: t.lastEntryAt,
      lastAuthor: ultima?.authorName ?? t.createdByName,
      entries: t.entries.length,
      sealed: !!t.sealedAt,
      estado: estadoHilo,
      /** Horas hasta la primera respuesta de la clínica; null si nadie respondió. */
      horasPrimeraRespuesta: primeraRespuesta
        ? Math.round(((primeraRespuesta.sentAt.getTime() - t.createdAt.getTime()) / 36e5) * 10) / 10
        : null,
    };
  });

  const filtrados = estado === 'PENDING' || estado === 'ANSWERED' || estado === 'CREATED'
    ? resueltos.filter((r) => r.estado === estado)
    : resueltos;

  // Los números arriba se calculan sobre lo que pasa los filtros de base (no
  // sobre la página): así "sin responder" cambia con bufete y escritorio pero
  // no con el paginado.
  const pendientes = resueltos.filter((r) => r.estado === 'PENDING').length;
  const respondidos = resueltos.filter((r) => r.horasPrimeraRespuesta !== null);
  const en24h = respondidos.filter((r) => (r.horasPrimeraRespuesta ?? 0) <= 24).length;
  const horas = respondidos.map((r) => r.horasPrimeraRespuesta!).sort((a, b) => a - b);
  const mediana = horas.length ? horas[Math.floor(horas.length / 2)]! : null;

  return NextResponse.json({
    total: filtrados.length,
    page,
    pageSize: PAGE_SIZE,
    rows: filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    kpis: {
      total: resueltos.length,
      pendientes,
      pctEn24h: respondidos.length ? Math.round((en24h / respondidos.length) * 100) : null,
      medianaHoras: mediana,
    },
    // Para los selects de filtro: solo los bufetes que mandaron algo.
    firms: firmIds.map((id) => ({ id, name: nombreBufete.get(id) ?? '—' })).sort((a, b) => a.name.localeCompare(b.name)),
    truncado: threads.length === MAX_ESCANEO,
  });
}
