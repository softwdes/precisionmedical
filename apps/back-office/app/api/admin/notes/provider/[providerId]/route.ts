/**
 * GET /api/admin/notes/provider/[providerId] — las visitas de UN provider.
 *
 * Alimenta el modal de `/doctor/notes`: la pantalla principal es solo la lista de
 * providers, y el detalle se pide al abrirlo. Por eso es una API y no parte del
 * server component — el modal se abre sobre la pantalla, sin navegar.
 *
 * Mismo criterio de "cita que debe nota" que todo lo demás (`lib/notes-audit`),
 * así que el número de la fila y lo que se ve adentro no pueden discrepar.
 *
 * NO devuelve contenido clínico: solo el estado de la nota y su firma. El texto
 * se pide aparte, por visita, cuando el supervisor abre una.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { canAuditNotes } from '@/lib/notes-audit-access';
import {
  whereNotas, antiguedadEnDias, estadoDeLaNota, filtrosDesdeParams,
} from '@/lib/notes-audit';

/** Tope por provider. El que más debe hoy tiene 32; 300 deja aire de sobra. */
const LIMIT = 300;

export interface VisitaDelProvider {
  appointmentId: string;
  scheduledFor: string;
  patientId: string;
  patientName: string;
  caseId: string | null;
  caseCode: string | null;
  clinicName: string;
  estado: ReturnType<typeof estadoDeLaNota>;
  ageDays: number;
  signedAt: string | null;
  signedByName: string | null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ providerId: string }> },
): Promise<NextResponse> {
  if (!(await canAuditNotes())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { providerId } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  // El provider sale de la RUTA, no de los filtros: el modal es de uno solo y
  // un `?provider=` en la query no puede cambiarlo por otro.
  const filtros = { ...filtrosDesdeParams((k) => sp.get(k) ?? undefined), providerId };

  const rows = await db.appointment.findMany({
    where: whereNotas(filtros),
    orderBy: { scheduledFor: 'desc' },
    take: LIMIT,
    select: {
      id: true,
      scheduledFor: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      case: { select: { id: true, caseCode: true } },
      clinic: { select: { name: true } },
      visitNote: { select: { status: true, signedAt: true, signedByName: true } },
    },
  });

  const visitas: VisitaDelProvider[] = rows.map((a) => ({
    appointmentId: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    patientId: a.patient.id,
    patientName: `${dec(a.patient.firstName) ?? ''} ${dec(a.patient.lastName) ?? ''}`.trim(),
    caseId: a.case?.id ?? null,
    caseCode: a.case?.caseCode ?? null,
    clinicName: a.clinic?.name ?? '—',
    estado: estadoDeLaNota(a.visitNote?.status),
    ageDays: antiguedadEnDias(a.scheduledFor),
    signedAt: a.visitNote?.signedAt?.toISOString() ?? null,
    signedByName: a.visitNote?.signedByName ?? null,
  }));

  return NextResponse.json({ visitas, total: visitas.length, truncado: rows.length === LIMIT });
}
