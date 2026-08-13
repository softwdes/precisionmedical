/**
 * GET /api/admin/pending-notes?scope=mine|clinic
 *
 * Notas clínicas SIN CERRAR. La nota nace abierta y solo el doctor la cierra con
 * su botón — puede quedar así meses (regla de Erick 2026-08-12), así que hace
 * falta una cola persistente y no un aviso que se pierda al recargar.
 *
 * Incluye DOS casos, y el segundo es el que importa:
 *   1. Notas en borrador (`visit_notes.status = DRAFT`).
 *   2. **Visitas atendidas SIN NINGUNA fila de nota.** La nota se crea al primer
 *      guardado, así que un doctor que nunca escribió nada no deja borrador y esa
 *      visita era invisible en cualquier listado. Es el peor caso y el único que
 *      una cola basada solo en DRAFT no vería nunca.
 *
 * `scope`:
 *   · `mine`   — el doctor, solo sus visitas (Provider de la sesión).
 *   · `clinic` — el asistente, todas. Es quien persigue al doctor, así que
 *                necesita ver de quién es cada pendiente.
 *
 * Orden: la MÁS VIEJA primero. El riesgo no es la nota de hoy, es la de hace
 * tres meses.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, Prisma } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { getSessionProvider } from '@/lib/get-session-provider';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';

/** Tope de la lista. El conteo total va aparte y sin tope. */
const LIMIT = 200;

export interface PendingNoteRow {
  appointmentId: string;
  scheduledFor: string;
  patientName: string;
  caseId: string | null;
  caseCode: string | null;
  providerName: string | null;
  /** `users.id` del doctor — para mandarle el recordatorio por mensajería. */
  providerUserId: string | null;
  patientId: string;
  /** false = la visita no tiene NINGUNA nota, ni en borrador. */
  hasDraft: boolean;
  /** Días completos desde la fecha de la visita. */
  ageDays: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const scope = req.nextUrl.searchParams.get('scope') === 'clinic' ? 'clinic' : 'mine';

  let providerId: string | null = null;
  if (scope === 'mine') {
    const provider = await getSessionProvider();
    // Sin perfil de médico no hay "mis notas" — se devuelve vacío en vez de
    // caer al listado completo, que sería filtrar de menos por accidente.
    if (!provider) return NextResponse.json({ notes: [], total: 0, oldestDays: 0 });
    providerId = provider.id;
  }

  const where: Prisma.AppointmentWhereInput = {
    // Una cita cancelada o a la que el paciente no vino no debe nota.
    status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    AND: [
      // Atendida: llegó, o el flujo avanzó. Las citas futuras no cuentan.
      {
        OR: [
          { checkedInAt: { not: null } },
          { status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
        ],
      },
      // Sin nota, o con la nota abierta.
      {
        OR: [
          { visitNote: { is: null } },
          { visitNote: { status: 'DRAFT' } },
        ],
      },
    ],
    ...(providerId ? { providerId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.appointment.findMany({
      where,
      orderBy: { scheduledFor: 'asc' }, // la más vieja primero
      take: LIMIT,
      select: {
        id: true,
        scheduledFor: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { id: true, caseCode: true } },
        provider: { select: { firstName: true, lastName: true, userId: true } },
        visitNote: { select: { status: true } },
      },
    }),
    db.appointment.count({ where }),
  ]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const notes: PendingNoteRow[] = rows.map((a) => ({
    appointmentId: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    patientName: `${dec(a.patient.firstName) ?? ''} ${dec(a.patient.lastName) ?? ''}`.trim(),
    patientId: a.patient.id,
    caseId: a.case?.id ?? null,
    caseCode: a.case?.caseCode ?? null,
    providerName: a.provider ? `${a.provider.firstName} ${a.provider.lastName}`.trim() : null,
    providerUserId: a.provider?.userId ?? null,
    hasDraft: !!a.visitNote,
    // Días desde la visita, contra el inicio de HOY: una visita de esta mañana
    // da 0 y no "0,3 días".
    ageDays: Math.max(0, Math.floor((startOfToday.getTime() - a.scheduledFor.getTime()) / 86_400_000)),
  }));

  return NextResponse.json({
    notes,
    total,
    /** Antigüedad de la más vieja — el bloque resumen muestra este número. */
    oldestDays: notes[0]?.ageDays ?? 0,
  });
}
