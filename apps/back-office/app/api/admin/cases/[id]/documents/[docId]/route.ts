/**
 * DELETE /api/admin/cases/[id]/documents/[docId]
 *   Manda a la PAPELERA un documento o una carpeta vacía.
 *
 * PATCH /api/admin/cases/[id]/documents/[docId]
 *   Le cambia el nombre (Erick, 2026-09-15) y/o la CARPETA donde vive
 *   (Erick, 2026-09-16). Ver el comentario del handler.
 *
 * POST /api/admin/cases/[id]/documents/[docId]
 *   Lo restaura. Lo puede hacer cualquiera que vea la pantalla (Erick,
 *   2026-09-13): el que se equivoca es el que se da cuenta, y mandarlo a pedir
 *   una restauración convierte cada error en un ticket.
 *
 * ── El borrado es LÓGICO ───────────────────────────────────────────────────
 * Antes era `db.patientDocument.delete()` y la fila desaparecía. El archivo del
 * bucket, en cambio, nunca se borró —este endpoint no lo toca— así que el PDF
 * quedaba ocupando espacio para siempre y **nadie podía recuperarlo**: el
 * nombre, el paciente, el caso y la carpeta se habían ido con la fila. Era lo
 * peor de los dos mundos.
 *
 * ── Las carpetas con contenido siguen sin poder eliminarse ─────────────────
 * Aunque ahora sea recuperable. Mandar 17 archivos a la papelera con un clic es
 * mucho poder para un botón chico; primero se vacía.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { VIGENTES } from '@/lib/documentos';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId, docId } = await ctx.params;

  const doc = await db.patientDocument.findUnique({
    where: { id: docId },
    select: {
      id: true,
      name: true,
      isFolder: true,
      caseId: true,
      deletedAt: true,
      // Los hijos se cuentan SIN los que ya están en la papelera: una carpeta
      // cuyos archivos se borraron uno por uno está vacía, y seguir pidiendo
      // "vaciala primero" sería pedir algo que ya se hizo.
      _count: { select: { children: { where: VIGENTES } } },
    },
  });

  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Idempotente: dos clics seguidos, o dos personas a la vez, no son un error.
  if (doc.deletedAt) return NextResponse.json({ ok: true, yaEstaba: true });

  if (doc.isFolder && doc._count.children > 0) {
    return NextResponse.json(
      { error: 'FOLDER_NOT_EMPTY' },
      { status: 409 },
    );
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { caseCode: true },
  });

  // A la papelera, NO al borrado. El archivo del bucket tampoco se toca: es lo
  // que hace posible restaurarlo entero.
  await db.patientDocument.update({
    where: { id: docId },
    data: {
      deletedAt: new Date(),
      deletedById: actor.actorUserId,
      deletedByName: actor.actorName,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'DELETE_DOCUMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord?.caseCode, documentId: docId, name: doc.name },
  });

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/admin/cases/[id]/documents/[docId]
 *   Cambia el NOMBRE de un documento o de una carpeta.
 *
 * Hasta hoy el nombre se fijaba al subir y no se podía tocar nunca más: un
 * nombre mal puesto solo se arreglaba borrando el archivo y volviéndolo a
 * subir. Y hace falta — de los 110 documentos subidos por la app en dos días,
 * 36 venían con una convención de nombre distinta a la de los otros 74 (medido
 * 2026-09-15).
 *
 * Las carpetas también se renombran, por lo mismo: el archivo tiene 540
 * carpetas "Progress Note" y otras 106 "Progress Notes". Es la misma deriva y
 * es literalmente el mismo campo.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No toca el archivo del bucket. La clave de Storage se fija al subir
 * (`cases/<id>/<timestamp>-<nombre>`) y ahí se queda: renombrar es una etiqueta
 * de la ficha, no una mudanza de archivos. El que baja el documento igual lo
 * recibe con el nombre nuevo, porque la firma de descarga lo arma con `name`.
 *
 * No valida que el nombre sea único: ya hay nombres repetidos dentro de un
 * mismo caso y no son un error —dos "Notes" de fechas distintas, por ejemplo—.
 * La pantalla avisa, que es lo que hace falta; el servidor no bloquea.
 *
 * No repone la extensión si el nombre nuevo la pierde. Eso se cuida en la
 * pantalla, que no deja tocarla, y a propósito no se arregla acá: un servidor
 * que corrige el nombre a escondidas es peor que uno que guarda lo que le
 * mandaron.
 *
 * ── MOVER (2026-09-16) ─────────────────────────────────────────────────────
 * El mismo PATCH cambia de carpeta: `parentId` con el id de la carpeta destino,
 * o `null` para sacarlo a la raíz. Va acá y no en una ruta nueva porque es el
 * mismo acto —editar la ficha del documento, sin tocar el bucket— y así el
 * historial del caso lee los dos cambios del mismo lugar.
 *
 * Los dos campos son opcionales e independientes: se puede mandar uno, el otro
 * o los dos. `parentId: null` es un valor CON significado ("a la raíz"), así que
 * se distingue de "no vino" con `'parentId' in payload`; un `?? undefined` los
 * confundiría y sacaría archivos de su carpeta al renombrarlos.
 */
const EditarSchema = z.object({
  name:     z.string().trim().min(1).max(255).optional(),
  parentId: z.string().min(1).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId, docId } = await ctx.params;

  let cuerpo: unknown;
  let parsed: z.infer<typeof EditarSchema>;
  try {
    cuerpo = await req.json();
    parsed = EditarSchema.parse(cuerpo);
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // `parentId: null` significa "a la raíz" y es distinto de no haberlo mandado.
  // Por eso se pregunta por la PRESENCIA de la clave, no por su valor.
  const mueve    = typeof cuerpo === 'object' && cuerpo !== null && 'parentId' in cuerpo;
  const renombra = parsed.name !== undefined;
  if (!mueve && !renombra) {
    return NextResponse.json({ error: 'NADA_QUE_CAMBIAR' }, { status: 400 });
  }

  // Uno en la papelera no se renombra ni se mueve: para el que mira la pantalla
  // no existe. Mismo criterio que la ruta de descarga.
  const doc = await db.patientDocument.findFirst({
    where: { id: docId, ...VIGENTES },
    select: { id: true, name: true, caseId: true, isFolder: true, parentId: true },
  });

  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const destino = parsed.parentId ?? null;

  if (mueve && destino !== doc.parentId) {
    if (destino !== null) {
      /**
       * La carpeta destino tiene que existir, ser carpeta, estar vigente y ser
       * DEL MISMO CASO. Lo último es lo que importa de verdad: sin esa
       * comprobación, un `parentId` de otro expediente movía el documento a la
       * ficha de otro paciente —una divulgación de PHI disfrazada de mudanza—.
       */
      const carpeta = await db.patientDocument.findFirst({
        where: { id: destino, ...VIGENTES },
        select: { id: true, isFolder: true, caseId: true },
      });
      if (!carpeta || carpeta.caseId !== caseId) {
        return NextResponse.json({ error: 'DESTINO_NO_ENCONTRADO' }, { status: 404 });
      }
      if (!carpeta.isFolder) {
        return NextResponse.json({ error: 'DESTINO_NO_ES_CARPETA' }, { status: 400 });
      }
      if (carpeta.id === doc.id) {
        return NextResponse.json({ error: 'DESTINO_ES_EL_MISMO' }, { status: 400 });
      }

      /**
       * Una carpeta no puede caer dentro de sí misma ni de su descendencia: el
       * `parentId` apunta a su propio subárbol y esas filas quedan huérfanas
       * para siempre —ninguna pantalla las lista, porque ninguna llega a ellas
       * desde la raíz—. Hoy hay 6 carpetas anidadas en todo el sistema, así que
       * la cadena es cortísima; el tope existe para que un dato corrupto no
       * cuelgue el request, no porque se espere profundidad.
       */
      if (doc.isFolder) {
        let cursor: string | null = destino;
        for (let saltos = 0; cursor && saltos < 50; saltos++) {
          if (cursor === doc.id) {
            return NextResponse.json({ error: 'DESTINO_ES_DESCENDIENTE' }, { status: 400 });
          }
          const padre: { parentId: string | null } | null = await db.patientDocument.findUnique({
            where: { id: cursor },
            select: { parentId: true },
          });
          cursor = padre?.parentId ?? null;
        }
      }
    }
  }

  // Sin cambio no se escribe ni se audita: dos clics seguidos en Guardar no son
  // dos renombrados, y ensuciarían el historial del documento. Lo mismo vale
  // para soltar un archivo en la carpeta donde ya estaba.
  const cambiaNombre = renombra && parsed.name !== doc.name;
  const cambiaPadre  = mueve    && destino     !== doc.parentId;
  if (!cambiaNombre && !cambiaPadre) {
    return NextResponse.json({ ok: true, sinCambio: true, name: doc.name });
  }

  await db.patientDocument.update({
    where: { id: docId },
    data: {
      ...(cambiaNombre ? { name: parsed.name } : {}),
      ...(cambiaPadre  ? { parentId: destino } : {}),
    },
  });

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { caseCode: true },
  });

  /**
   * Un renombrado y una mudanza son dos hechos distintos y se auditan por
   * separado, aunque hayan viajado en el mismo PATCH: en el historial del caso
   * "se llamaba X y ahora se llama Y" y "estaba en A y ahora está en B" se leen
   * como dos renglones, no como uno que dice las dos cosas a medias.
   */
  const comun = {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    entityType:  'cases' as const,
    entityId:    caseId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
  };

  if (cambiaNombre) {
    // `before`/`after` y no solo `metadata`: así el historial del caso puede
    // mostrar "se llamaba X y ahora se llama Y" sin tabla nueva.
    await writeAuditLog(db, {
      ...comun,
      action: 'RENAME_DOCUMENT',
      before: { name: doc.name },
      after:  { name: parsed.name },
      metadata: { caseCode: caseRecord?.caseCode, documentId: docId, isFolder: doc.isFolder },
    });
  }

  if (cambiaPadre) {
    // El NOMBRE de las carpetas, no solo el id: el historial se lee meses
    // después y "de Intake Form a MRI Results" dice algo; dos cuid no.
    const [antes, ahora] = await Promise.all([
      doc.parentId ? db.patientDocument.findUnique({ where: { id: doc.parentId }, select: { name: true } }) : null,
      destino      ? db.patientDocument.findUnique({ where: { id: destino },      select: { name: true } }) : null,
    ]);
    await writeAuditLog(db, {
      ...comun,
      action: 'MOVE_DOCUMENT',
      before: { parentId: doc.parentId, parentName: antes?.name ?? null },
      after:  { parentId: destino,      parentName: ahora?.name ?? null },
      metadata: { caseCode: caseRecord?.caseCode, documentId: docId, name: doc.name, isFolder: doc.isFolder },
    });
  }

  return NextResponse.json({
    ok: true,
    name:     cambiaNombre ? parsed.name : doc.name,
    parentId: cambiaPadre  ? destino     : doc.parentId,
  });
}

/**
 * Restaurar desde la papelera.
 *
 * Sin restricción de rol más allá de la de la pantalla: la papelera vive en el
 * tab Documentos, que ven back office y providers. El portal del abogado NO
 * llega acá —usa `/api/attorney/*` y su lista excluye los borrados— así que un
 * documento que la clínica eliminó no le reaparece ni lo puede devolver.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; docId: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId, docId } = await ctx.params;

  const doc = await db.patientDocument.findUnique({
    where: { id: docId },
    select: { id: true, name: true, caseId: true, deletedAt: true, parentId: true },
  });
  if (!doc || doc.caseId !== caseId) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!doc.deletedAt) return NextResponse.json({ ok: true, yaEstaba: true });

  /*
   * Si la carpeta que lo contenía también está en la papelera, restaurar el
   * archivo solo lo dejaría invisible: colgado de un padre que nadie ve. Se
   * avisa en vez de restaurar a medias — la pantalla ofrece restaurar la
   * carpeta primero.
   */
  if (doc.parentId) {
    const padre = await db.patientDocument.findUnique({
      where: { id: doc.parentId },
      select: { name: true, deletedAt: true },
    });
    if (padre?.deletedAt) {
      return NextResponse.json(
        { error: 'CARPETA_ELIMINADA', carpeta: padre.name },
        { status: 409 },
      );
    }
  }

  await db.patientDocument.update({
    where: { id: docId },
    data: { deletedAt: null, deletedById: null, deletedByName: null },
  });

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: { caseCode: true },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'RESTORE_DOCUMENT',
    entityType: 'cases',
    entityId: caseId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { caseCode: caseRecord?.caseCode, documentId: docId, name: doc.name },
  });

  return NextResponse.json({ ok: true });
}
