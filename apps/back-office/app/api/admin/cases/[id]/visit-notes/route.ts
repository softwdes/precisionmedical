/**
 * GET /api/admin/cases/[id]/visit-notes
 *
 * Las notas clínicas de las visitas de UN caso, una por cita.
 *
 * Vive en el tab Citas del caso, junto a la cita que la produjo (decisión de
 * Erick, 2026-08-13). Antes esto era un endpoint por PACIENTE que alimentaba una
 * sección del Historial Médico, y estaba mal de raíz: el Historial Médico es la
 * ficha clínica del paciente —alergias, problemas, medicamentos—, no el archivo
 * de notas. La nota pertenece a una cita, y una cita pertenece a un caso.
 *
 * El corte por caso además deja de mandar PHI de más: la vista de un caso no
 * tiene por qué recibir las notas de otro caso del mismo paciente.
 *
 * Devuelve las CERRADAS y las abiertas, con su estado: un borrador también es
 * parte del registro de esa visita, y verlo acá le dice al doctor que tiene algo
 * sin terminar. Las anuladas (VOIDED) quedan afuera.
 *
 * Orden: la visita MÁS RECIENTE primero — al revés que la cola de pendientes, que
 * ordena por la más vieja porque ahí lo que importa es el atraso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';

type Ctx = { params: Promise<{ id: string }> };

export interface CaseVisitNote {
  appointmentId: string;
  scheduledFor: string;
  status: 'DRAFT' | 'SIGNED';
  signedAt: string | null;
  signedByName: string | null;
  providerName: string | null;
  clinicName: string | null;
  /** Secciones tal como las guardó el editor (HTML). Se sanean al renderizar. */
  chiefComplaint: string | null;
  hpi: string | null;
  ros: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
  diagnoses: Array<{ icd10Code: string | null; icd10Label: string | null }>;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id: caseId } = await ctx.params;

  const rows = await db.visitNote.findMany({
    where: {
      status: { in: ['DRAFT', 'SIGNED'] },
      appointment: { caseId },
    },
    orderBy: { appointment: { scheduledFor: 'desc' } },
    select: {
      status: true,
      signedAt: true,
      signedByName: true,
      chiefComplaint: true,
      hpi: true,
      ros: true,
      physicalExam: true,
      assessment: true,
      plan: true,
      diagnoses: {
        orderBy: { sortOrder: 'asc' },
        select: { icd10Code: true, icd10Label: true },
      },
      appointment: {
        select: {
          id: true,
          scheduledFor: true,
          provider: { select: { firstName: true, lastName: true } },
          clinic: { select: { name: true } },
        },
      },
    },
  });

  const notes: CaseVisitNote[] = rows.map((n) => ({
    appointmentId: n.appointment.id,
    scheduledFor: n.appointment.scheduledFor.toISOString(),
    status: n.status as 'DRAFT' | 'SIGNED',
    signedAt: n.signedAt?.toISOString() ?? null,
    signedByName: n.signedByName,
    providerName: n.appointment.provider
      ? `${n.appointment.provider.firstName} ${n.appointment.provider.lastName}`.trim()
      : null,
    clinicName: n.appointment.clinic?.name ?? null,
    chiefComplaint: n.chiefComplaint,
    hpi: n.hpi,
    ros: n.ros,
    physicalExam: n.physicalExam,
    assessment: n.assessment,
    plan: n.plan,
    diagnoses: n.diagnoses,
  }));

  return NextResponse.json({
    notes,
    signed: notes.filter((n) => n.status === 'SIGNED').length,
    open: notes.filter((n) => n.status === 'DRAFT').length,
  });
}
