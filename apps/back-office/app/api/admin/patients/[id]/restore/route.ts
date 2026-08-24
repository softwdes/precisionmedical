/**
 * POST /api/admin/patients/[id]/restore
 *
 * Restaura un paciente INACTIVE: vuelve a ACTIVE y reactiva sus casos (deletedAt → null).
 *
 * ⚠️ Las citas NO se reviven (decisión de Erick 2026-08-09). Archivar cancela las
 * citas futuras para liberar la agenda del doctor; mientras el paciente estuvo
 * archivado ese horario pudo dárselo a otro, así que resucitar la cita crearía un
 * doble turno silencioso. Restaurar devuelve al paciente y sus casos, y hay que
 * reagendar a mano — la respuesta informa cuántas quedaron canceladas para que la
 * pantalla lo pueda decir en vez de dejarlo como sorpresa.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const existing = await db.patient.findUnique({
    where: { id },
    select: {
      id: true,
      patientCode: true,
      status: true,
      cases: { where: { deletedAt: { not: null } }, select: { id: true } },
    },
  });
  if (!existing) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  if (existing.status !== 'INACTIVE') {
    return NextResponse.json({ ok: false, error: 'NOT_INACTIVE', message: 'El paciente no está inactivo.' }, { status: 409 });
  }

  // Citas futuras que quedaron canceladas y habrá que reagendar. Se cuenta ANTES
  // de restaurar por claridad; da igual el orden porque no se tocan.
  const porReagendar = await db.appointment.count({
    where: {
      patientId:    id,
      scheduledFor: { gt: new Date() },
      status:       'CANCELLED',
    },
  });

  /**
   * Qué casos revivir: SOLO los que se archivaron con este paciente.
   *
   * El filtro era `deletedAt: { not: null }`, o sea todos. Alcanzaba mientras
   * `deletedAt` lo escribiera únicamente el archivado de paciente — pero desde
   * que archivar un caso suelto también lo escribe (antes ponía
   * `status: CANCELLED`, que lo hacía indistinguible de un caso cancelado de
   * verdad), ese filtro resucitaría casos que alguien archivó a propósito.
   *
   * La lista sale del audit log del propio archivado, que es donde quedó
   * registrado qué se tocó. Si no hay entrada —un paciente archivado antes de
   * este cambio— se cae al comportamiento viejo: es lo único que se puede saber
   * de esos, y para ellos sigue siendo correcto.
   */
  const archivado = await db.auditLog.findFirst({
    where: { action: 'DELETE_PATIENT', entityType: 'patients', entityId: id },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  const idsRegistrados = (() => {
    const m = archivado?.metadata as { caseIds?: unknown } | null;
    return Array.isArray(m?.caseIds) ? m!.caseIds.filter((x): x is string => typeof x === 'string') : null;
  })();

  await db.$transaction([
    db.patient.update({
      where: { id },
      data: { status: 'ACTIVE' },
    }),
    ...(existing.cases.length > 0
      ? [db.case.updateMany({
          where: idsRegistrados
            ? { patientId: id, id: { in: idsRegistrados }, deletedAt: { not: null } }
            : { patientId: id, deletedAt: { not: null } },
          data: { deletedAt: null },
        })]
      : []),
  ]);

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'RESTORE_PATIENT',
    entityType:  'patients',
    entityId:    id,
    metadata:    {
      patientCode:   existing.patientCode,
      casesRestored: existing.cases.length,
      // Queda explícito que estas NO se revivieron: si alguien audita por qué el
      // paciente volvió sin sus citas, la respuesta está acá.
      appointmentsLeftCancelled: porReagendar,
    },
    ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
  });

  return NextResponse.json({ ok: true, appointmentsToReschedule: porReagendar });
}
