/**
 * Encargados del caso — GET / POST / DELETE
 *
 * GET    /api/admin/cases/[id]/managers             → actuales + histórico
 * POST   /api/admin/cases/[id]/managers             → asigna (por lawyerId, o crea la persona)
 * DELETE /api/admin/cases/[id]/managers?lawyerId=…  → cierra la asignación
 *
 * Pedido de Edson: necesita saber quién lleva el caso HOY. Rotan —se van del
 * bufete y nombran a otro— así que el DELETE **cierra** la asignación con
 * `removedAt` en vez de borrar la fila: si se borrara, Edson perdería a quién
 * le escribió el mes pasado.
 *
 * Ver docs/plan-vista-edson.md
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { duennoDelCorreo } from '@/lib/duenno-del-correo';

/**
 * Se puede asignar a alguien que ya existe (`lawyerId`) o escribir uno nuevo.
 *
 * Lo segundo existe para no frenar a Edson: si el bufete le manda un encargado
 * que no está cargado, lo escribe ahí mismo y queda creado como miembro del
 * bufete — o sea que la próxima vez ya sale en la lista. Obligarlo a ir a
 * Settings primero es como se termina con los datos en un Excel aparte.
 */
const AssignSchema = z.union([
  z.object({ lawyerId: z.string().min(1), notes: z.string().max(1000).nullable().optional() }),
  z.object({
    firstName: z.string().trim().min(1).max(100),
    /*
     * El apellido es OPCIONAL. Los bufetes a veces no lo dan —es politica de
     * ellos, no un descuido de quien carga— y exigirlo no mejoraba el dato:
     * hacia que la persona no se cargara. Erick, 2026-09-28.
     *
     * No rompe nada aguas abajo: `name` se arma con un `.trim()`, no hay
     * columna de apellido para los escritos a mano, y nadie deshace el nombre.
     * Quien distingue a dos personas aca es el correo o el telefono.
     */
    lastName: z.string().trim().max(100).optional(),
    email: z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
    phone: z.string().max(50).nullable().optional(),
    memberRole: z.enum(['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT', 'OTHER'])
      .default('CASE_MANAGER'),
    notes: z.string().max(1000).nullable().optional(),
  }),
]);

const SELECT = {
  id: true, assignedAt: true, assignedByName: true, removedAt: true, notes: true,
  name: true, email: true, phone: true, role: true,
  lawyer: {
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      memberRole: true, status: true,
      parentFirm: { select: { id: true, firmName: true } },
    },
  },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const rows = await db.caseManager.findMany({
    where: { caseId: id },
    orderBy: [{ removedAt: 'asc' }, { assignedAt: 'asc' }],
    select: SELECT,
  });

  return NextResponse.json({
    ok: true,
    current: rows.filter((r) => !r.removedAt),
    past: rows.filter((r) => r.removedAt),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = AssignSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const kase = await db.case.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, lawFirmId: true },
  });
  if (!kase || kase.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const stamp = {
    assignedById: actor.actorUserId,
    assignedByName: actor.actorName,
    notes: parsed.notes ?? null,
  };

  let saved;

  if ('lawyerId' in parsed) {
    const lawyer = await db.lawyer.findUnique({ where: { id: parsed.lawyerId } });
    if (!lawyer || lawyer.deletedAt) {
      return NextResponse.json({ error: 'LAWYER_NOT_FOUND' }, { status: 404 });
    }
    // Del catálogo: se revive la fila si ya había estado, así no se duplica ni
    // se pierde el histórico.
    saved = await db.caseManager.upsert({
      where:  { caseId_lawyerId: { caseId: id, lawyerId: lawyer.id } },
      create: { caseId: id, lawyerId: lawyer.id, ...stamp },
      update: { removedAt: null, removedById: null, assignedAt: new Date(), ...stamp },
      select: SELECT,
    });
  } else {
    /*
     * Escrito a mano. NO se exige bufete y NO se crea nada en el catálogo:
     * pedirlo hacía imposible agregar a nadie en los casos sin bufete, que son
     * la mayoría. Los datos viven en la asignación misma.
     *
     * Si el caso tiene bufete, igual se deja constancia del vínculo — pero como
     * dato, no como requisito.
     */
    saved = await db.caseManager.create({
      data: {
        caseId: id,
        name: `${parsed.firstName} ${parsed.lastName ?? ''}`.trim(),
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        role: parsed.memberRole,
        ...stamp,
      },
      select: SELECT,
    });
  }

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'ASSIGN_CASE_MANAGER',
    entityType: 'case_managers',
    entityId: saved.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: saved as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, manager: saved }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);
  // Se identifica por el id de la ASIGNACION: los encargados escritos a mano no
  // tienen `lawyerId`, asi que ese ya no sirve como llave.
  const assignmentId = req.nextUrl.searchParams.get('id');
  if (!assignmentId) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const before = await db.caseManager.findUnique({ where: { id: assignmentId } });
  if (!before || before.caseId !== id || before.removedAt) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const closed = await db.caseManager.update({
    where: { id: assignmentId },
    data: { removedAt: new Date(), removedById: actor.actorUserId },
    select: SELECT,
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'UNASSIGN_CASE_MANAGER',
    entityType: 'case_managers',
    entityId: closed.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    before: before as unknown as Prisma.JsonValue,
    after: closed as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, manager: closed });
}

/**
 * PATCH — completar el CONTACTO de una persona del caso.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 *
 * El panel de la columna Attorney muestra a quién escribirle, y para 13 de las
 * 86 personas del catálogo no hay a dónde: no tienen correo. Hasta hoy el
 * único lugar donde completarlo era Externos, que Edson no abre y para el que
 * puede no tener permiso. Erick lo pidió el 2026-10-06: "en tracking, si no
 * tiene todos los datos, que se pueda agregar desde ahí y que se vincule".
 *
 * Se vincula solo: escribe sobre la MISMA fila de `lawyers` que muestra
 * Externos. No hay copia ni espejo.
 *
 * ── Por qué vive acá y no en `lawyers/members` ─────────────────────────────
 *
 * Por dos razones, y las dos importan:
 *
 *  1. El PATCH de `lawyers/members` PISA TODO lo que no se le manda — manda
 *     `address: parsed.address ?? null` y así con cada campo. Un edit parcial
 *     desde el panel le borraría a la persona la dirección, el rol y el número
 *     de colegiatura, en silencio. Esta ruta toca DOS columnas y ninguna más.
 *  2. `/api/admin/lawyers/*` lo gobierna el módulo `externals`, que Edson puede
 *     no tener. Para entrar por ahí habría que sumar una tercera excepción al
 *     regex del middleware, que ya se rompió dos veces. `/api/admin/cases/*`
 *     está deliberadamente fuera del guard por módulo —es la ficha compartida
 *     de la clínica— así que esto llega sin tocar nada.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 *
 * Solo correo y teléfono, y solo de alguien que YA está en ESTE caso: el
 * `EXISTS` de abajo no es decoración. Sin él esto sería un editor de cualquier
 * abogado del catálogo alcanzable desde cualquier caso.
 */
const ContactoSchema = z.object({
  lawyerId: z.string().min(1),
  email:    z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  phone:    z.string().max(50).nullable().optional().or(z.literal('').transform(() => null)),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = ContactoSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  /*
   * La persona tiene que estar EN ESTE CASO: o es su abogado, o es uno de sus
   * encargados activos. Es lo único que impide que esto sea un editor abierto
   * del catálogo entero.
   */
  const ligada = await db.case.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [
        { attorneyId: parsed.lawyerId },
        { caseManagers: { some: { lawyerId: parsed.lawyerId, removedAt: null } } },
      ],
    },
    select: { id: true },
  });
  if (!ligada) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const before = await db.lawyer.findUnique({ where: { id: parsed.lawyerId } });
  if (!before || before.deletedAt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Mismo criterio que el resto: el correo es unico en TODA la tabla y el
  // cartel tiene que decir de quien es. Ver `lib/duenno-del-correo.ts`.
  if (parsed.email && parsed.email !== before.email) {
    const dup = await db.lawyer.findUnique({ where: { email: parsed.email } });
    if (dup) {
      return NextResponse.json(
        { error: 'DUPLICATE_EMAIL', params: { email: parsed.email, duenno: duennoDelCorreo(dup) } },
        { status: 409 },
      );
    }
  }

  const updated = await db.lawyer.update({
    where: { id: parsed.lawyerId },
    data: {
      ...(parsed.email !== undefined ? { email: parsed.email } : {}),
      ...(parsed.phone !== undefined ? { phone: parsed.phone } : {}),
    },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'UPDATE_LAWYER',
    entityType:  'lawyers',
    entityId:    updated.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    // La via queda anotada: estos cambios salen del panel de un caso, no del
    // catalogo, y conviene poder contarlos por separado.
    metadata:    { via: 'seguimiento', caseId: id, fields: ['email', 'phone'] },
    before:      { email: before.email, phone: before.phone } as unknown as Prisma.JsonValue,
    after:       updated as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, lawyer: updated });
}
