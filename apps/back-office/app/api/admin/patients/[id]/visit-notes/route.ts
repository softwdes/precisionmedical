/**
 * GET /api/admin/patients/[id]/visit-notes
 *
 * Notas clínicas del paciente, una por visita, para el Historial Médico.
 *
 * Decisión de Erick (2026-08-08): el caso NO lleva tab de notas — las notas del
 * doctor viven en el Historial Médico del paciente, y ahí se van acumulando por
 * visita. La decisión estaba escrita en el código pero nunca se implementó: hasta
 * hoy una nota cerrada no se veía en ninguna parte salvo entrando a la cita
 * puntual. Este endpoint es el destino que le faltaba al ciclo.
 *
 * Devuelve las CERRADAS y las abiertas, con su estado: un borrador también es
 * parte del registro de esa visita, y verlo acá le dice al doctor que tiene algo
 * sin terminar en el contexto del paciente. Las anuladas (VOIDED) quedan afuera.
 *
 * Orden: la visita MÁS RECIENTE primero — al revés que la cola de pendientes, que
 * ordena por la más vieja porque ahí lo que importa es el atraso.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';

type Ctx = { params: Promise<{ id: string }> };

export interface PatientVisitNote {
  appointmentId: string;
  scheduledFor: string;
  status: 'DRAFT' | 'SIGNED';
  signedAt: string | null;
  signedByName: string | null;
  providerName: string | null;
  caseCode: string | null;
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

  const { id: patientId } = await ctx.params;

  const rows = await db.visitNote.findMany({
    where: {
      status: { in: ['DRAFT', 'SIGNED'] },
      appointment: { patientId },
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
          case: { select: { caseCode: true } },
          clinic: { select: { name: true } },
        },
      },
    },
  });

  const notes: PatientVisitNote[] = rows.map((n) => ({
    appointmentId: n.appointment.id,
    scheduledFor: n.appointment.scheduledFor.toISOString(),
    status: n.status as 'DRAFT' | 'SIGNED',
    signedAt: n.signedAt?.toISOString() ?? null,
    signedByName: n.signedByName,
    providerName: n.appointment.provider
      ? `${n.appointment.provider.firstName} ${n.appointment.provider.lastName}`.trim()
      : null,
    caseCode: n.appointment.case?.caseCode ?? null,
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
