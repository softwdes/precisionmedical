/**
 * GET /api/admin/appointments/deleted — la papelera de citas
 *
 * Lo que alimenta el botón "Citas eliminadas" del calendario. Es una pantalla
 * de AUDITORÍA antes que de recuperación, así que cada fila responde las cuatro
 * preguntas que se hacen mirándola (Erick, 2026-09-23: *"que muestre la fecha,
 * hora y usuario que lo eliminó"*):
 *
 *   · CUÁNDO se eliminó — fecha y hora
 *   · QUIÉN la eliminó  — nombre, no un id
 *   · POR QUÉ           — el motivo que eligió o escribió
 *   · QUÉ era           — paciente, sede, provider y la fecha/hora que tenía
 *
 * Sin el nombre y el motivo, en un mes esto es una lista de filas que nadie
 * sabe interpretar — que es exactamente lo que se quiere evitar al auditar.
 *
 * Ordena por fecha de borrado descendente: lo que se acaba de eliminar es lo
 * que más chances tiene de ser un error que alguien viene a deshacer.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { ELIMINADAS } from '@/lib/citas-vigentes';

/** Techo de la lista. La papelera no es un informe: si hace falta más, se filtra. */
const TOPE = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const busqueda = (searchParams.get('q') ?? '').trim();

  const citas = await db.appointment.findMany({
    where: {
      ...ELIMINADAS,
      ...(busqueda
        ? {
            OR: [
              { patient: { firstName: { contains: busqueda, mode: 'insensitive' } } },
              { patient: { lastName:  { contains: busqueda, mode: 'insensitive' } } },
              { deletedByName:        { contains: busqueda, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { deletedAt: 'desc' },
    take: TOPE,
    select: {
      id: true,
      scheduledFor: true,
      durationMinutes: true,
      status: true,
      isOnline: true,
      deletedAt: true,
      deletedByName: true,
      deleteReason: true,
      patient:  { select: { id: true, firstName: true, lastName: true } },
      clinic:   { select: { name: true } },
      provider: { select: { firstName: true, lastName: true } },
      case:     { select: { caseCode: true, caseType: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    count: citas.length,
    /** Si llegó al techo, la pantalla avisa que hay más y ofrece buscar. */
    truncated: citas.length === TOPE,
    appointments: citas.map(c => ({
      id: c.id,
      scheduledFor: c.scheduledFor.toISOString(),
      durationMinutes: c.durationMinutes,
      status: c.status,
      isOnline: c.isOnline,
      deletedAt: c.deletedAt!.toISOString(),
      deletedByName: c.deletedByName,
      deleteReason: c.deleteReason,
      patient: c.patient,
      clinicName: c.clinic?.name ?? null,
      providerName: c.provider ? `${c.provider.firstName} ${c.provider.lastName}` : null,
      caseCode: c.case?.caseCode ?? null,
      caseType: c.case?.caseType ?? null,
    })),
  });
}
