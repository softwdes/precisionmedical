/**
 * GET /api/cita/[code]
 *
 * Búsqueda pública de cita por código de caso (CASE-1127) o ID de appointment.
 * HIPAA: solo devuelve nombre de pila, clínica, doctor (nombre), fecha/hora.
 * NUNCA: apellido completo, DOB, diagnóstico, aseguradora, número de caso completo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

function formatType(raw: string): string {
  const map: Record<string, string> = {
    FOLLOW_UP: 'Follow-up', INITIAL: 'Consulta inicial', TRIAGE: 'Triaje',
    PROCEDURE: 'Procedimiento', THERAPY: 'Terapia', EVALUATION: 'Evaluación',
    MVA: 'Accidente de tráfico', SLIP_AND_FALL: 'Caída', WORKERS_COMP: 'Comp. laboral',
  };
  return map[raw.toUpperCase()] ?? raw.replace(/_/g, ' ');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();

  const now = new Date();

  // Buscar por caseCode en el caso, o por ID directo de appointment
  const appt = await db.appointment.findFirst({
    where: {
      OR: [
        { case: { caseCode: { equals: normalized, mode: 'insensitive' } } },
        { id: normalized },
      ],
      scheduledFor: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) }, // no mostrar citas de hace más de 2h
    },
    select: {
      id:           true,
      scheduledFor: true,
      status:       true,
      type: true,
      patient: { select: { firstName: true } },
      provider: { select: { firstName: true } },
      clinic:   { select: { name: true, address: true } },
      case:     { select: { caseCode: true, caseType: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  if (!appt) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const scheduledFor = appt.scheduledFor;
  const diffMs   = scheduledFor.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isToday  = diffDays <= 0;

  return NextResponse.json({
    ok: true,
    firstName:   appt.patient.firstName,
    doctorName:  appt.provider ? `Dr. ${appt.provider.firstName}` : null,
    clinicName:  appt.clinic.name,
    clinicAddr:  appt.clinic.address,
    scheduledFor: scheduledFor.toISOString(),
    status:      appt.status,
    apptType:    formatType(appt.type ?? appt.case?.caseType ?? 'Follow-up'),
    caseCode:    appt.case?.caseCode ?? null,
    isToday,
    daysUntil:   Math.max(0, diffDays),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
