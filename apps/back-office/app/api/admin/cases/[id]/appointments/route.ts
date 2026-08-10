/**
 * GET /api/admin/cases/[id]/appointments
 *
 * Citas del caso, con la forma que consume `AppointmentDetailPanel`.
 *
 * Devolvía 8 campos planos, suficientes para pintar la lista pero no para abrir
 * el panel de la cita: ese muestra el checklist del caso, el abogado, el seguro
 * y el tab de Servicios, y sin esos datos abría vacío. Ahora la lista y el panel
 * comen del mismo payload.
 *
 * El paciente, el caso y la cobertura se resuelven UNA vez y se reparten: acá
 * todas las citas son del mismo caso, así que repetirlos por fila seria mandar
 * lo mismo N veces.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { COVERAGE_LIST_SELECT, resolveCoverage, serializeCoverage } from '@/lib/coverage';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;

  const caseRow = await db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseCode: true,
      accidentType: true,
      accidentDate: true,
      status: true,
      intakeFormCompletedAt: true,
      attorney: {
        select: { id: true, firmName: true, firstName: true, lastName: true, phone: true, email: true },
      },
      patient: {
        select: {
          id: true, firstName: true, lastName: true, phone: true, email: true, dateOfBirth: true,
        },
      },
      ...COVERAGE_LIST_SELECT,
      // Despues del spread a proposito: COVERAGE_LIST_SELECT trae la aseguradora
      // solo con el nombre y el panel de la cita necesita tambien el id.
      primaryInsurance: { select: { id: true, name: true } },
    },
  });
  if (!caseRow) return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });

  const rows = await db.appointment.findMany({
    where: { caseId: id },
    orderBy: { scheduledFor: 'asc' },
    select: {
      id: true,
      scheduledFor: true,
      durationMinutes: true,
      type: true,
      status: true,
      notes: true,
      isOnline: true,
      meetingUrl: true,
      plannedServiceCodes: true,
      checkedInAt: true,
      attendanceSignedAt: true,
      clinic: { select: { id: true, name: true, address: true } },
      provider: { select: { id: true, firstName: true, lastName: true, specialty: true } },
    },
  });

  const caseInfo = {
    id: caseRow.id,
    caseCode: caseRow.caseCode,
    accidentType: caseRow.accidentType,
    accidentDate: caseRow.accidentDate?.toISOString() ?? null,
    status: caseRow.status,
    intakeFormCompletedAt: caseRow.intakeFormCompletedAt?.toISOString() ?? null,
    attorney: caseRow.attorney,
    primaryInsurance: caseRow.primaryInsurance,
  };

  const patient = {
    ...caseRow.patient,
    dateOfBirth: caseRow.patient.dateOfBirth?.toISOString() ?? null,
  };

  /**
   * `visitNumber` = cuántas citas del caso vienen ANTES que ésta. Mismo criterio
   * que el calendario (0 = primera visita), pero acá sale de la lista completa
   * del caso, sin ventana de fechas: es el número de visita real, no el de la
   * semana que se está mirando. Las canceladas no cuentan.
   */
  const noCanceladas = rows.filter((a) => a.status !== 'CANCELLED');
  const numeroDeVisita = new Map<string, number>();
  noCanceladas.forEach((a, i) => numeroDeVisita.set(a.id, i));

  const appointments = rows.map((a) => ({
    id: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    durationMinutes: a.durationMinutes,
    type: a.type,
    status: a.status,
    notes: a.notes,
    isOnline: a.isOnline,
    meetingUrl: a.meetingUrl,
    plannedServiceCodes: a.plannedServiceCodes ?? [],
    visitNumber: numeroDeVisita.get(a.id) ?? 0,
    checkedInAt: a.checkedInAt?.toISOString() ?? null,
    attendanceSignedAt: a.attendanceSignedAt?.toISOString() ?? null,
    clinic: { id: a.clinic.id, name: a.clinic.name, address: a.clinic.address },
    provider: a.provider,
    patient,
    case: caseInfo,
  }));

  return NextResponse.json({
    ok: true,
    appointments,
    coverage: serializeCoverage(resolveCoverage(caseRow)),
  });
}
