/**
 * GET /api/admin/appointments/[id]/registration
 *
 * Quién registró la cita y cuándo — la línea "Registrado por" del panel de la
 * cita, que el staff usaba en el v2 para saber a quién preguntarle.
 *
 * De dónde sale cada dato:
 *  · La FECHA es `Appointment.createdAt`, un hecho de la fila.
 *  · El QUIÉN sale del `AuditLog` (`CREATE_APPOINTMENT`), porque la cita no
 *    guarda su autor en una columna. El audit log ya lo escribe con actor y rol
 *    en cada alta, así que no hace falta un campo nuevo ni una migración.
 *  · El creador del CASO sale de `Case.createdByUserId`.
 *
 * ⚠️ Los registros migrados del v2 NO traen autor: hay 137 altas auditadas sobre
 * ~14.5k citas, y `createdByUserId` está poblado en 21 de 2867 casos. Por eso el
 * endpoint devuelve `null` en vez de inventar un nombre — la pantalla muestra
 * solo la fecha cuando no hay quién, y no un "Front Office" de relleno como el
 * modal decorativo que esto reemplaza.
 *
 * Se resuelve en el server y en una sola llamada para que el panel no tenga que
 * pedir el audit log y después los nombres por separado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

interface Persona { id: string; nombre: string; rol: string | null }

async function persona(userId: string | null | undefined, rol?: string | null): Promise<Persona | null> {
  if (!userId) return null;
  const u = await db.user.findUnique({
    where:  { id: userId },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  if (!u) return null;
  return { id: u.id, nombre: `${u.firstName} ${u.lastName}`.trim(), rol: rol ?? u.role };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const appt = await db.appointment.findUnique({
    where:  { id },
    select: { id: true, createdAt: true, case: { select: { createdByUserId: true, createdAt: true } } },
  });
  if (!appt) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  // El alta más ANTIGUA: si alguien reagendó, el que la creó sigue siendo el primero.
  const alta = await db.auditLog.findFirst({
    where:   { entityType: 'appointments', entityId: id, action: 'CREATE_APPOINTMENT' },
    orderBy: { createdAt: 'asc' },
    select:  { actorUserId: true, actorRole: true, actorType: true, createdAt: true },
  });

  const [porCita, porCaso] = await Promise.all([
    persona(alta?.actorUserId, alta?.actorRole),
    persona(appt.case?.createdByUserId),
  ]);

  return NextResponse.json({
    ok: true,
    cita: {
      createdAt: appt.createdAt.toISOString(),
      por:       porCita,
      // Cuando no hay usuario pero sí hay auditoría, al menos se sabe que fue el
      // sistema o un agente (altas automáticas), y no queda como "desconocido".
      actorType: alta?.actorType ?? null,
    },
    caso: appt.case
      ? { createdAt: appt.case.createdAt.toISOString(), por: porCaso }
      : null,
  });
}
