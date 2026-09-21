/**
 * PATCH /api/admin/patients/[id]/cobro
 *
 * Pone o saca la marca "cobrar antes de atender" — la roja del v2.
 *
 * ── Por qué es su propia ruta y no un campo del PATCH grande ───────────────
 *
 * Porque el PATCH de la ficha exige el formulario entero (nombre y apellido son
 * obligatorios ahí): para prender un interruptor habría que mandar de vuelta
 * todos los datos del paciente, y cualquier campo desactualizado en el cliente
 * los pisaría. Además esto merece su propia acción en el audit log — es una
 * instrucción que frena la atención de una persona, no un cambio de teléfono.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkPatientAccess } from '@/lib/patient-access';

const Schema = z.object({
  activo: z.boolean(),
  /**
   * El porqué. Opcional, pero es lo más útil de los dos: en el v2 la marca ERA
   * el texto ("no lo atiendan sin un pago sustancial"), y es lo que sale en el
   * saludo de CIFO cuando está.
   */
  nota: z.string().max(280).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // La misma puerta que archivar o restaurar: es una decisión de mostrador.
  const acceso = await checkPatientAccess(id, { admin: true });
  if (acceso.deny) return acceso.deny;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }
  const { activo, nota } = parsed.data;

  /**
   * En paralelo: no dependen entre sí y son dos viajes distintos —uno a la base,
   * otro a la sesión—. Encadenados sumaban su latencia por nada, y este botón lo
   * aprieta alguien con el paciente enfrente.
   */
  const [existing, actor] = await Promise.all([
    db.patient.findUnique({
      where: { id },
      select: { id: true, patientCode: true, collectBeforeVisit: true },
    }),
    resolveActor(req.headers),
  ]);
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  /**
   * Al sacarla se limpia TODO, incluidos el autor y la fecha.
   *
   * Dejar la nota de quien ya pagó haría que la próxima vez que se prenda la
   * marca aparezca el motivo viejo —"debe de septiembre"— sobre una deuda
   * nueva. La constancia de que existió no se pierde: queda en el audit log.
   */
  await db.patient.update({
    where: { id },
    data: activo
      ? {
          collectBeforeVisit:     true,
          collectBeforeVisitNote: nota?.trim() || null,
          collectBeforeVisitBy:   actor.actorUserId ?? null,
          collectBeforeVisitAt:   new Date(),
        }
      : {
          collectBeforeVisit:     false,
          collectBeforeVisitNote: null,
          collectBeforeVisitBy:   null,
          collectBeforeVisitAt:   null,
        },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      activo ? 'SET_COLLECT_BEFORE_VISIT' : 'CLEAR_COLLECT_BEFORE_VISIT',
    entityType:  'patients',
    entityId:    id,
    metadata:    {
      patientCode: existing.patientCode,
      antes:       existing.collectBeforeVisit,
      // La nota queda en el registro: es la instrucción que se dio, y si mañana
      // alguien pregunta por qué se frenó a un paciente, la respuesta está acá.
      nota:        activo ? (nota?.trim() || null) : null,
    },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true, activo });
}
