/**
 * GET /api/messages/deleted → lo que se saco del historial, para el panel del
 * admin.
 *
 * Existe porque abrimos el boton de eliminar a todo el mundo (ver la nota en
 * `[threadId]/route.ts`). Esa apertura solo es defendible si alguien puede ver
 * lo eliminado y devolverlo; sin esta pantalla, "es recuperable" era cierto en
 * la base y falso en la practica.
 *
 * Va como PESTAÑA dentro de Mensajes, al lado de Pedidos de bufete, y no como
 * pantalla suelta en Configuracion. La diferencia no es cosmetica: este proyecto
 * ya aprendio que una cola que hay que acordarse de visitar termina funcionando
 * como un borrado silencioso — le paso a `needsReview` con las notas de release,
 * donde se acumularon 30 entradas que nadie miro nunca. Al lado de la bandeja
 * esta en el camino diario.
 *
 * Solo admin: el mismo criterio que restaurar. Y devuelve el hilo SIN sus
 * entradas — quien revisa necesita saber QUE se elimino y QUIEN lo hizo para
 * decidir si lo devuelve, no leer la conversacion. El contenido se ve al
 * restaurarlo, que es una accion que queda registrada.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { requireMessagingActor, ADMIN_ROLES } from '@/lib/messaging';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { actor, deny } = await requireMessagingActor(req.headers);
  if (deny) return deny;
  if (!ADMIN_ROLES.includes(actor.actorRole as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);

  const [total, filas] = await Promise.all([
    db.messageThread.count({ where: { deletedAt: { not: null } } }),
    db.messageThread.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        subject: true,
        type: true,
        priority: true,
        createdByName: true,
        lastEntryAt: true,
        deletedAt: true,
        deletedByUserId: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { caseCode: true } },
        _count: { select: { entries: true } },
      },
    }),
  ]);

  /**
   * El nombre de quien elimino sale de `users`, no de un snapshot.
   *
   * `deletedByUserId` guarda el id y nada mas, asi que hay que resolverlo. Una
   * consulta para todos los ids de la pagina y no una por fila.
   */
  const ids = [...new Set(filas.map((f) => f.deletedByUserId).filter((x): x is string => x !== null))];
  const gente = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nombre = new Map(gente.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    threads: filas.map((f) => ({
      id: f.id,
      subject: f.subject,
      type: f.type,
      priority: f.priority,
      createdByName: f.createdByName,
      lastEntryAt: f.lastEntryAt,
      deletedAt: f.deletedAt,
      deletedByName: f.deletedByUserId ? (nombre.get(f.deletedByUserId) ?? null) : null,
      patient: f.patient
        ? { id: f.patient.id, name: `${f.patient.firstName} ${f.patient.lastName}`.trim() }
        : null,
      caseCode: f.case?.caseCode ?? null,
      entryCount: f._count.entries,
    })),
  });
}
