/**
 * POST /api/admin/lawyers/quick-create-member — dar de alta un ABOGADO dentro de un bufete.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * El campo Attorney del caso filtra por bufete: muestra las personas cargadas
 * en ESE bufete. Si el bufete no tiene a nadie, la lista está vacía y elegir
 * abogado es imposible por mucho que se escriba.
 *
 * Y no es raro. Medido el 2026-10-01: de 26 bufetes con casos, **12 no tienen
 * una sola persona cargada**, y eso afecta a 47 casos. Edson lo viene pidiendo
 * hace semanas — "I can't add an attorney" — con Claggett & Sykes, que tiene
 * cero miembros.
 *
 * La señal de que la gente ya venía peleando con esto: de 4 casos con abogado
 * escrito a mano, 2 tienen el NOMBRE DEL BUFETE en el campo del abogado. No es
 * descuido; es alguien dejando constancia en el único lugar que lo dejaba
 * escribir.
 *
 * ── Por qué una ruta aparte y no la de al lado ──────────────────────────────
 *
 * `lawyers/quick-create` crea BUFETES (`entityType: 'FIRM'`) y su permiso es
 * `patients` — quien da de alta un caso puede dar de alta el bufete. Esto crea
 * PERSONAS dentro de un bufete que ya existe, se usa desde la pantalla de Edson
 * y va con su módulo. Meterlas en la misma ruta ataría los dos permisos.
 *
 * ⚠️ El middleware la deja pasar por separado, y la regla de `externals` sobre
 * `/lawyers` lleva la exclusión AMPLIADA a `(?!\/quick-create(-member)?$)`.
 * `apiGuardModules` junta todas las reglas que matchean y bloquea si alguna
 * está apagada: sin ampliarla, `externals` seguiría cerrando esta ruta y el 403
 * volvería igual.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 *
 * Solo crear una persona en un bufete EXISTENTE. No crea bufetes, no edita, no
 * borra, no toca las notas internas de Edson ni da acceso al portal legal — un
 * abogado con `email` acá sigue sin poder entrar a nada: el acceso se otorga
 * aparte, desde Externos, y es una decisión distinta.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { duennoDelCorreo } from '@/lib/duenno-del-correo';

const AltaMiembroSchema = z.object({
  parentFirmId: z.string().min(1),
  firstName:    z.string().trim().min(1).max(100),
  /**
   * El apellido es OPCIONAL, igual que en el case manager.
   *
   * Los bufetes a veces dan sólo el nombre de pila, y exigirlo no mejora el
   * dato: hace que la persona no se cargue. Erick lo decidió así el 2026-09-28
   * para los case managers y vale lo mismo acá.
   */
  lastName:     z.string().trim().max(100).optional(),
  email:        z.string().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  phone:        z.string().max(50).nullable().optional(),
  /** Por defecto ATTORNEY: es el campo desde el que se llega. */
  memberRole:   z.enum(['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT', 'OTHER']).default('ATTORNEY'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);

  let parsed;
  try {
    parsed = AltaMiembroSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  /*
   * El bufete tiene que existir y SER un bufete.
   *
   * `lawyers` guarda las dos cosas —bufetes y personas— en la misma tabla, así
   * que sin este chequeo se podría colgar una persona de otra persona y armar
   * un árbol que ninguna pantalla sabe leer.
   */
  const firma = await db.lawyer.findUnique({
    where:  { id: parsed.parentFirmId },
    select: { id: true, firmName: true, entityType: true, deletedAt: true },
  });
  if (!firma || firma.deletedAt || firma.entityType !== 'FIRM') {
    return NextResponse.json({ error: 'FIRM_NOT_FOUND' }, { status: 404 });
  }

  /*
   * `email` es único en TODA la tabla, no sólo entre las personas: choca
   * también contra los bufetes. Se chequea antes para no reventar con un P2002
   * que el cliente no sabría redactar, y se devuelve el id por si lo que
   * corresponde es usar al que ya está.
   */
  if (parsed.email) {
    const existing = await db.lawyer.findUnique({
      where:  { email: parsed.email },
      select: { id: true, firstName: true, lastName: true, firmName: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error:  'DUPLICATE_EMAIL',
          params: { email: parsed.email, duenno: duennoDelCorreo(existing) },
          lawyerId: existing.id,
        },
        { status: 409 },
      );
    }
  }

  /*
   * Ya hay alguien con ese nombre EN ESTE BUFETE: se devuelve en vez de crear
   * un gemelo. Sin esto, dos personas escribiendo el mismo nombre con un día de
   * diferencia dejan dos "Todd Livingston" en Claggett & Sykes, y el campo pasa
   * a ofrecer una elección que no significa nada.
   */
  const nombre = parsed.firstName.trim();
  const apellido = parsed.lastName?.trim() ?? '';
  const yaEsta = await db.lawyer.findFirst({
    where: {
      parentFirmId: firma.id,
      deletedAt:    null,
      firstName:    { equals: nombre, mode: 'insensitive' },
      ...(apellido ? { lastName: { equals: apellido, mode: 'insensitive' } } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (yaEsta) {
    return NextResponse.json(
      {
        error:  'DUPLICATE_NAME',
        params: { name: `${yaEsta.firstName ?? ''} ${yaEsta.lastName ?? ''}`.trim() },
        lawyerId: yaEsta.id,
      },
      { status: 409 },
    );
  }

  const created = await db.lawyer.create({
    data: {
      entityType:   'FIRM_MEMBER',
      parentFirmId: firma.id,
      firstName:    nombre,
      lastName:     apellido || null,
      email:        parsed.email ?? null,
      phone:        parsed.phone ?? null,
      memberRole:   parsed.memberRole,
      // Sin `notes`: son privadas de Edson y esta puerta no las abre.
      notes:        null,
      status:       'ACTIVE',
    },
    select: { id: true, firstName: true, lastName: true, memberRole: true },
  });

  try {
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'QUICK_CREATE_FIRM_MEMBER',
      entityType: 'lawyers',
      entityId: created.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      after: created as unknown as Prisma.JsonValue,
      metadata: { bufete: firma.firmName, origen: 'campo Attorney del caso' } as unknown as Prisma.JsonValue,
    });
  } catch (err) {
    // El audit no voltea una escritura que ya ocurrió. Mismo criterio que la
    // ruta de ajustadores.
    console.error('[quick-create-member] audit log fallido:', err);
  }

  return NextResponse.json({ ok: true, lawyer: created }, { status: 201 });
}
