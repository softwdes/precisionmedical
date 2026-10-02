/**
 * POST /api/admin/lawyers/quick-create-firm — dar de alta un BUFETE desde el seguimiento.
 *
 * ── Por qué existe, teniendo `quick-create` al lado ─────────────────────────
 *
 * Son la misma operación con distinto permiso, y eso no es un descuido: es la
 * decisión que Erick tomó el 2026-09-15 cuando separó "crear mientras trabajo"
 * de "administrar el catálogo". `quick-create` nació para el alta de caso y la
 * gobierna `patients`; esta nace para la pantalla de Edson y la gobierna
 * `edson`. Es exactamente el mismo corte que ya se hizo con
 * `quick-create-member` (personas) y con `insurances/quick-create`.
 *
 * No se reusó la de al lado porque el guard vive en el middleware y es por
 * RUTA: atar las dos a un solo path obligaría a tener los dos módulos —
 * `apiGuardModules` junta todas las reglas que matchean y bloquea si alguna
 * está apagada— y recepción perdería el alta de bufete que hoy tiene.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 *
 * Medido el 2026-10-01 sobre la cola de Edson (MVA con cita en los últimos 90
 * días): **86 casos no tienen bufete**, y sin bufete no hay dónde colgar al
 * abogado — `quick-create-member` exige uno existente. El catálogo tiene 26
 * bufetes, así que "elegí uno de la lista" tampoco alcanza: el que busca
 * muchas veces no está.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 *
 * Solo crea un bufete con su NOMBRE. Nada de correo, dirección, velocidad de
 * pago ni `notes` — las notas internas son privadas y esta puerta no las abre.
 * El resto se completa en Externos, que es el catálogo de verdad. Si el nombre
 * ya existe devuelve el que hay en vez de crear un gemelo, igual que
 * `quick-create-member`: el duplicado de bufetes es lo que parte el historial
 * de un caso en dos.
 *
 * ⚠️ El middleware la deja pasar por separado, y la regla de `externals` sobre
 * `/lawyers` lleva la exclusión AMPLIADA a `(?!\/quick-create(-member|-firm)?$)`.
 * Sin eso `externals` seguiría cerrando esta ruta y el 403 vuelve igual — ya
 * pasó dos veces, con los bufetes y con las personas.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

const AltaBufeteSchema = z.object({
  firmName: z.string().trim().min(2).max(200),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed;
  try {
    parsed = AltaBufeteSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  /*
   * Ya existe: se devuelve ese y no se crea otro.
   *
   * Sin acentos ni mayúsculas de por medio —`mode: 'insensitive'`— porque el
   * nombre lo va a tipear Edson a mano sobre una grilla: "LifeLaw" y "Lifelaw"
   * son el mismo bufete y partirlos en dos divide sus casos para siempre.
   *
   * Responde 200 y no 409: para quien llama esto NO es un error. Pidió "que
   * este caso quede en LifeLaw" y eso es lo que pasa; que el bufete ya
   * estuviera es un detalle del catálogo, no un problema suyo.
   */
  const yaEsta = await db.lawyer.findFirst({
    where: {
      deletedAt:  null,
      entityType: 'FIRM',
      firmName:   { equals: parsed.firmName, mode: 'insensitive' },
    },
    select: { id: true, firmName: true },
  });
  if (yaEsta) {
    return NextResponse.json({ ok: true, firm: yaEsta, existed: true });
  }

  const created = await db.lawyer.create({
    data: {
      entityType: 'FIRM',
      firmName:   parsed.firmName,
      notes:      null,
      status:     'ACTIVE',
    },
    select: { id: true, firmName: true },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'CREATE_LAWYER_FIRM',
    entityType:  'lawyers',
    entityId:    created.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    // La misma acción que el catálogo y que el alta de caso, con la vía
    // anotada: así se puede contar cuántos bufetes nacen desde el seguimiento.
    metadata:    { via: 'seguimiento' },
    after:       created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, firm: created }, { status: 201 });
}
