/**
 * Las plantillas de SMS que la clínica edita.
 *
 * GET    → el catálogo entero: texto vigente, si es el original, y las variables.
 * PUT    → guardar una plantilla (body: key, lang, body).
 * DELETE → restaurar el original, que es BORRAR la fila (?key=&lang=).
 *
 * ── Qué se valida al guardar ───────────────────────────────────────────────
 *
 * Dos cosas, y las dos se rechazan ACÁ y no en la pantalla: una validación que
 * solo vive en el cliente es una validación que se salta con una pestaña de red
 * abierta, y lo que está del otro lado es un mensaje a un paciente real.
 *
 *   · las variables OBLIGATORIAS tienen que estar. Si alguien borra `{fecha}`
 *     de un aviso de cita, el paciente recibe un mensaje sin fecha y nos
 *     enteramos por un no-show.
 *   · no puede haber variables INVENTADAS. `{doctor}` no existe, y en vez de
 *     fallar se renderizaría como vacío: un hueco silencioso en mitad del
 *     mensaje, que es peor que un error.
 *
 * Lo que NO se valida es el acento. Se AVISA —el editor muestra los segmentos y
 * lo que cuestan— pero no se prohíbe: puede haber una razón para escribir bien
 * el español, y esa decisión es de la clínica, no del código.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import { resolveActor } from '@/lib/actor';
import {
  CLAVES_PLANTILLA, DEFAULTS, VARIABLES, OBLIGATORIAS, CIERRE,
  faltantes, desconocidas,
  type ClavePlantilla, type LangPlantilla,
} from '@/lib/plantillas-sms';
import { cargarPlantillas } from '@/lib/plantillas-sms-db';

export const dynamic = 'force-dynamic';

const IDIOMAS: LangPlantilla[] = ['es', 'en'];

const Guardar = z.object({
  key:  z.enum(CLAVES_PLANTILLA),
  lang: z.enum(['es', 'en']),
  body: z.string().trim().min(1).max(1200),
});

export async function GET(): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  const editadas = await cargarPlantillas();

  const plantillas = CLAVES_PLANTILLA.flatMap((key) =>
    IDIOMAS.map((lang) => {
      const fila = editadas[`${key}:${lang}`];
      return {
        key,
        lang,
        texto:      fila?.body ?? DEFAULTS[key][lang],
        original:   DEFAULTS[key][lang],
        esOriginal: !fila,
        editadaEl:  fila?.updatedAt ?? null,
        variables:  VARIABLES[key],
        obligatorias: OBLIGATORIAS[key],
        // El cierre legal viaja para poder MOSTRARLO bloqueado: esconderlo
        // haría que el contador de segmentos del editor mienta por lo bajo.
        cierre: CIERRE[lang],
      };
    }),
  );

  return NextResponse.json({ plantillas });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  let datos;
  try {
    datos = Guardar.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const clave = datos.key as ClavePlantilla;
  const faltan = faltantes(clave, datos.body);
  if (faltan.length > 0) {
    return NextResponse.json({ error: 'FALTAN_VARIABLES', variables: faltan }, { status: 422 });
  }
  const raras = desconocidas(clave, datos.body);
  if (raras.length > 0) {
    return NextResponse.json({ error: 'VARIABLES_DESCONOCIDAS', variables: raras }, { status: 422 });
  }

  const actor  = await resolveActor(req.headers);
  const previo = await db.smsTemplate.findUnique({
    where: { key_lang: { key: clave, lang: datos.lang } },
    select: { body: true },
  });

  const fila = await db.smsTemplate.upsert({
    where:  { key_lang: { key: clave, lang: datos.lang } },
    create: { key: clave, lang: datos.lang, body: datos.body, updatedByUserId: actor.actorUserId ?? null },
    update: { body: datos.body, updatedByUserId: actor.actorUserId ?? null },
    select: { id: true, updatedAt: true },
  });

  /**
   * El texto de ANTES y el de DESPUÉS, completos.
   *
   * Es la red que hace aceptable dejar editar esto sin ser admin: si un mensaje
   * sale raro, se puede responder quién lo tocó y qué decía antes, sin depender
   * de que alguien se acuerde.
   */
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'UPDATE_SMS_TEMPLATE',
    entityType:  'sms_templates',
    entityId:    fila.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    before: { key: clave, lang: datos.lang, body: previo?.body ?? DEFAULTS[clave][datos.lang], eraOriginal: !previo } as Prisma.JsonValue,
    after:  { key: clave, lang: datos.lang, body: datos.body } as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, editadaEl: fila.updatedAt });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  const { searchParams } = new URL(req.url);
  const key  = searchParams.get('key');
  const lang = searchParams.get('lang');
  if (!key || !lang || !(CLAVES_PLANTILLA as readonly string[]).includes(key) || !IDIOMAS.includes(lang as LangPlantilla)) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const previo = await db.smsTemplate.findUnique({
    where: { key_lang: { key, lang } },
    select: { id: true, body: true },
  });
  // Restaurar lo que ya era el original no es un error: es el segundo clic.
  if (!previo) return NextResponse.json({ ok: true, yaEraOriginal: true });

  await db.smsTemplate.delete({ where: { id: previo.id } });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'RESTORE_SMS_TEMPLATE',
    entityType:  'sms_templates',
    entityId:    previo.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    before: { key, lang, body: previo.body } as Prisma.JsonValue,
    after:  { key, lang, body: DEFAULTS[key as ClavePlantilla][lang as LangPlantilla], vuelveAlOriginal: true } as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true });
}
