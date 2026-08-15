import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec, isCipher } from '@/lib/decrypt';

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
      intakeSubmission: { select: { id: true } },
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
    /**
     * Un puñado de casos migrados del v2 guardaron el `caseCode` con el cifrado
     * crudo (`e:…`) en vez del código legible, y el selector de citas los pintaba
     * tal cual: el mostrador veía una tarjeta con 60 letras y no sabía qué caso
     * era. Se descifra acá y, si no se puede (sin clave en el entorno), se manda
     * `null` — la pantalla resuelve cómo mostrarlo. Nunca el cifrado crudo.
     */
    const codigo = isCipher(c.caseCode) ? dec(c.caseCode) : c.caseCode;
    return {
      id:                   c.id,
      caseCode:             codigo,
      status:               c.status,
      caseType:             c.caseType,
      specialty:            c.specialty,
      accidentType:         c.accidentType,
      accidentDate:         c.accidentDate?.toISOString() ?? null,
      accidentNotes:        c.accidentNotes ?? null,
      intakeFormCompletedAt: c.intakeFormCompletedAt?.toISOString() ?? null,
      consentsData:         c.consentsData,
      hasIntakeSubmission:  !!c.intakeSubmission,
      firstAppointment:     cAppts[0]                  ? { scheduledFor: cAppts[0].toISOString() }                  : null,
      lastAppointment:      cAppts.length > 1           ? { scheduledFor: cAppts[cAppts.length - 1].toISOString() } : null,
    };
  });

  return NextResponse.json({ cases });
}
