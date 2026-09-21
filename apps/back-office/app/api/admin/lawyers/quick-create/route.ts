/**
 * POST /api/admin/lawyers/quick-create — dar de alta un bufete DESDE el alta de caso.
 *
 * ── Por qué existe una ruta aparte ──────────────────────────────────────────
 *
 * `/api/admin/lawyers` está gobernada por el módulo **Externos**, que es el
 * catálogo de bufetes: crear, editar, borrar y leer las notas internas de
 * Edson. Recepción no lo tiene —y está bien que no lo tenga—, pero el wizard de
 * caso nuevo SÍ le ofrece "agregar bufete", porque el bufete aparece mientras
 * está tomando el caso y mandarla al catálogo la obliga a abandonar el alta y
 * empezar de nuevo (ver el encabezado de `components/lawyers/firm-dialog.tsx`).
 *
 * El resultado, medido el 2026-09-15: **8 cuentas EMPLEADO con `patients: true`
 * y `externals: false`** llenaban las diez casillas del formulario y recibían un
 * `FORBIDDEN` en el último clic, perdiendo todo lo tecleado. Más las 9 cuentas
 * de provider, que caen por la rama de DOCTOR del middleware. 17 de 28 cuentas
 * activas veían un botón que no podía funcionar.
 *
 * Erick eligió separar las dos capacidades (2026-09-15): **crear un bufete
 * mientras tomo un caso** no es lo mismo que **administrar el catálogo**. Esta
 * ruta es la primera; la de al lado sigue siendo la segunda.
 *
 * ⚠️ El middleware tiene que dejarla pasar POR SEPARADO: la regla de `externals`
 * lleva un `(?!\/quick-create$)` justo para esto, y hay una regla de `patients`
 * que la gobierna. Si alguien simplifica ese regex, esta ruta vuelve a dar 403
 * y el síntoma es exactamente el de arriba.
 *
 * ── Lo que esta ruta NO puede hacer ────────────────────────────────────────
 *
 * Solo CREAR, y solo un bufete (`entityType: 'FIRM'`). No edita, no borra, no
 * acepta `id`, y **no acepta `notes`**: ese campo son las notas internas de
 * Edson, privadas, y ofrecérselas a quien no tiene el módulo sería colar por la
 * ventana lo que la puerta no da. El alta siempre queda activa.
 *
 * El `POST` de `/api/admin/lawyers` sigue existiendo igual para el catálogo.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkPatientStaff } from '@/lib/patient-access';

/**
 * Los mismos campos del diálogo menos los que no corresponden acá.
 *
 * `notes` e `isActive` quedan fuera a propósito (ver el encabezado); `id`
 * también, porque esto no edita: mandarlo no hace nada.
 */
const AltaRapidaSchema = z.object({
  firmName:      z.string().trim().min(2).max(200),
  email:         z.string().email().nullable().optional(),
  phone:         z.string().max(50).nullable().optional(),
  address:       z.string().max(500).nullable().optional(),
  city:          z.string().max(100).nullable().optional(),
  state:         z.string().max(2).nullable().optional(),
  zip:           z.string().max(20).nullable().optional(),
  paymentSpeed:  z.enum(['FAST', 'AVERAGE', 'SLOW', 'UNKNOWN']).default('UNKNOWN'),
  caseflowFlags: z.array(z.string().max(50)).default([]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  /**
   * Staff administrativo, no cualquiera con sesión.
   *
   * El middleware gobierna esta ruta con `patients`, y ese módulo lo consume
   * también el portal médico (`DOCTOR_PORTAL_MODULES`), así que sin esto un
   * provider podría dar de alta bufetes desde su portal. Crear externos no es
   * parte de atender pacientes.
   */
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  let parsed;
  try {
    parsed = AltaRapidaSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  // Mismo chequeo que el catálogo: `email` es único en toda la tabla y choca
  // también contra los MIEMBROS, no solo contra los bufetes.
  if (parsed.email) {
    const existing = await db.lawyer.findUnique({ where: { email: parsed.email } });
    if (existing) {
      return NextResponse.json(
        { error: 'DUPLICATE_EMAIL', message: `Ya existe un bufete/miembro con email "${parsed.email}"` },
        { status: 409 },
      );
    }
  }

  const created = await db.lawyer.create({
    data: {
      entityType:    'FIRM',
      firmName:      parsed.firmName,
      email:         parsed.email ?? null,
      phone:         parsed.phone ?? null,
      address:       parsed.address ?? null,
      city:          parsed.city ?? null,
      state:         parsed.state ?? null,
      zip:           parsed.zip ?? null,
      paymentSpeed:  parsed.paymentSpeed,
      caseflowFlags: parsed.caseflowFlags,
      // Sin `notes`: son privadas de Edson y esta puerta no las abre.
      notes:         null,
      status:        'ACTIVE',
    },
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
    // La misma acción que el catálogo, con la vía anotada: para saber cuántos
    // bufetes nacen durante un alta y cuántos desde la pantalla de externos.
    metadata:    { via: 'alta-de-caso' },
    after:       created as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, firm: created }, { status: 201 });
}
