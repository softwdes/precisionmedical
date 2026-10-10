/**
 * PATCH /api/admin/patients/[id]/credito
 *
 * Pone o saca la marca "tiene crédito a favor en cobranza — no le cobres el
 * copago".
 *
 * ── Qué es ────────────────────────────────────────────────────────────────
 *
 * El espejo de `/cobro` con el signo invertido. Aquélla frena al paciente hasta
 * que pague; ésta frena al MOSTRADOR para que no le pida una plata que ya está
 * retenida a su nombre en PHI, el software de CBO.
 *
 * Viene de Darrell (cobranza), 2026-10-09, describiendo lo que ya hace en
 * Medusa: *"We note in the patient's alert that the patient has a credit
 * balance not to collect copays."*
 *
 * ⚠️ **No toca ningún saldo, y es a propósito.** El copago se sigue debiendo:
 * la clínica no tiene esa plata hasta que CBO aplique el crédito, dos semanas a
 * dos meses después. Lo único que esta marca agrega es el PORQUÉ — hoy un
 * copago esperando un crédito se ve idéntico a uno que nadie cobró.
 *
 * ── Por qué es su propia ruta ─────────────────────────────────────────────
 *
 * Por lo mismo que `/cobro`: el PATCH de la ficha exige el formulario entero, y
 * esto merece su propia acción en el audit log — es una instrucción sobre el
 * dinero de una persona, no un cambio de teléfono.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkPatientAccess } from '@/lib/patient-access';

const Schema = z.object({
  activo: z.boolean(),
  /**
   * El porqué. Opcional, pero es lo que de verdad sirve en el mostrador: la
   * marca sola dice "no cobres", y el texto dice de qué crédito se trata y
   * desde cuándo. Sale tal cual en el saludo de CIFO.
   */
  nota: z.string().max(280).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // La misma puerta que `/cobro`: es una decisión de mostrador.
  const acceso = await checkPatientAccess(id, { admin: true });
  if (acceso.deny) return acceso.deny;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }
  const { activo, nota } = parsed.data;

  // En paralelo, por lo mismo que en `/cobro`: son dos viajes distintos y este
  // botón lo aprieta alguien con el paciente enfrente.
  const [existing, actor] = await Promise.all([
    db.patient.findUnique({
      where: { id },
      select: { id: true, patientCode: true, creditOnFile: true },
    }),
    resolveActor(req.headers),
  ]);
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  /**
   * Al sacarla se limpia TODO, incluidos el autor y la fecha.
   *
   * Mismo motivo que en `/cobro`: dejar la nota del crédito que ya se aplicó
   * haría que la próxima vez aparezca el motivo viejo sobre un crédito nuevo.
   * La constancia de que existió queda en el audit log.
   */
  await db.patient.update({
    where: { id },
    data: activo
      ? {
          creditOnFile:     true,
          creditOnFileNote: nota?.trim() || null,
          creditOnFileBy:   actor.actorUserId ?? null,
          creditOnFileAt:   new Date(),
        }
      : {
          creditOnFile:     false,
          creditOnFileNote: null,
          creditOnFileBy:   null,
          creditOnFileAt:   null,
        },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      activo ? 'SET_CREDIT_ON_FILE' : 'CLEAR_CREDIT_ON_FILE',
    entityType:  'patients',
    entityId:    id,
    metadata:    {
      patientCode: existing.patientCode,
      antes:       existing.creditOnFile,
      // La nota queda en el registro: es la instrucción que se dio, y si mañana
      // alguien pregunta por qué no se le cobró el copago, la respuesta está acá.
      nota:        activo ? (nota?.trim() || null) : null,
    },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true, activo });
}
