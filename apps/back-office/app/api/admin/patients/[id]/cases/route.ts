import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

/** GET /api/admin/patients/:id/cases — casos de un paciente para el selector de citas */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const rawCases = await db.case.findMany({
    where: { patientId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      caseCode: true,
      status: true,
      caseType: true,
      specialty: { select: { id: true, name: true, color: true } },
      accidentType: true,
      accidentDate: true,
      accidentNotes: true,
      intakeFormCompletedAt: true,
      consentsData: true,
    },
  });

  // Fetch appointments per case separately to get first/last
  const caseIds = rawCases.map(c => c.id);
  const appts = await db.appointment.findMany({
    where: { caseId: { in: caseIds } },
    orderBy: { scheduledFor: 'asc' },
    select: { caseId: true, scheduledFor: true },
  });

  const apptsByCaseId: Record<string, Date[]> = {};
  for (const a of appts) {
    if (!a.caseId) continue;
    if (!apptsByCaseId[a.caseId]) apptsByCaseId[a.caseId] = [];
    apptsByCaseId[a.caseId].push(a.scheduledFor);
  }

  const cases = rawCases.map(c => {
    const cAppts = apptsByCaseId[c.id] ?? [];
    return {
      id:                   c.id,
      caseCode:             c.caseCode,
      status:               c.status,
      caseType:             c.caseType,
      specialty:            c.specialty,
      accidentType:         c.accidentType,
      accidentDate:         c.accidentDate?.toISOString() ?? null,
      accidentNotes:        c.accidentNotes ?? null,
      intakeFormCompletedAt: c.intakeFormCompletedAt?.toISOString() ?? null,
      consentsData:         c.consentsData,
      firstAppointment:     cAppts[0]                  ? { scheduledFor: cAppts[0].toISOString() }                  : null,
      lastAppointment:      cAppts.length > 1           ? { scheduledFor: cAppts[cAppts.length - 1].toISOString() } : null,
    };
  });

  return NextResponse.json({ cases });
}
