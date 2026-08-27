/**
 * GET /api/admin/admission
 *
 * B.14 — Check-in del día (Recepción).
 * Devuelve todas las citas de hoy agrupadas por estado para alimentar
 * la cola de check-in. Usa zona horaria America/Denver.
 *
 * Query params:
 *   clinicId — filtrar por clínica (optional)
 *   date     — 'YYYY-MM-DD' Denver (default: hoy)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { esDesenlaceCobrable, totalCargado } from '@/lib/appointment-outcome';

// Include para cada appointment de la cola
const APPT_INCLUDE = {
  patient: {
    select: { id: true, firstName: true, lastName: true, phone: true },
  },
  provider: {
    select: { id: true, firstName: true, lastName: true, specialty: true },
  },
  clinic: {
    select: { id: true, name: true },
  },
  case: {
    select: {
      id:                    true,
      caseCode:              true,
      caseType:              true,
      accidentType:          true,
      pipVerifiedAt:         true,
      intakeFormCompletedAt: true,
      lawFirmId:             true,
      attorneyId:            true,
      primaryInsurance: {
        select: { id: true, name: true, shortCode: true, color: true },
      },
    },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApptWithIncludes = any;

function denverMidnight(dateStr?: string | null): { from: Date; to: Date } {
  // Devuelve el rango UTC que corresponde a la medianoche-medianoche Denver
  const tz = 'America/Denver';
  const target = dateStr ?? new Date().toLocaleDateString('en-CA', { timeZone: tz });
  // Construir las fechas en Denver usando Intl
  const from = new Date(`${target}T00:00:00`);
  const to   = new Date(`${target}T23:59:59.999`);
  // Ajustar offset Denver. Medianoche Denver = 06:00 UTC (MDT) / 07:00 UTC (MST)
  // toLocaleDateString en-CA ya nos da la fecha Denver, pero el Date() la parsea
  // como local. Usamos el enfoque más robusto con un offset explícito.
  // Offset MDT = -6, MST = -7. Calculamos dinámicamente.
  const offsetMs = getTimezoneOffsetMs(tz, target);
  return {
    from: new Date(new Date(`${target}T00:00:00Z`).getTime() + offsetMs),
    to:   new Date(new Date(`${target}T23:59:59.999Z`).getTime() + offsetMs),
  };
}

function getTimezoneOffsetMs(tz: string, dateStr: string): number {
  // Calcula el offset de la timezone para una fecha dada en ms
  const utcDate = new Date(`${dateStr}T12:00:00Z`);
  const locStr = utcDate.toLocaleString('en-US', { timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const [, hour] = locStr.match(/(\d{2}):/) ?? [];
  const localHour = parseInt(hour ?? '12', 10);
  const offsetHours = localHour - 12;
  return -offsetHours * 60 * 60 * 1000;
}

function mapAppt(a: ApptWithIncludes) {
  const isReady = !!(a.case?.lawFirmId || a.case?.attorneyId) && !!a.case?.pipVerifiedAt;
  const hasPending = !isReady && !!a.case;
  // Cuánto se le cargó a esta cita. Para un desenlace cobrable, cero cargos
  // significa "la penalidad nunca se asentó" (ver lib/appointment-outcome).
  const chargedTotal = totalCargado(a.plannedServiceCodes as { fee?: number | null }[] | null);
  return {
    id:          a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    durationMinutes: a.durationMinutes,
    type:        a.type,
    status:      a.status,
    checkedInAt: (a as { checkedInAt?: Date | null }).checkedInAt?.toISOString() ?? null,
    // El doctor sello que termino con el paciente. La cola lo necesita para
    // mostrar "Listo para cobrar": sin esto el asistente tenia que entrar cita
    // por cita para saber si ya podia cerrarla.
    doctorDoneAt: (a as { doctorDoneAt?: Date | null }).doctorDoneAt?.toISOString() ?? null,
    // Telemedicina: la cola tiene que decir que la visita es por video ANTES de
    // que el asistente salga a buscar al paciente a la sala de espera.
    isOnline:    (a as { isOnline?: boolean }).isOnline ?? false,
    meetingUrl:  (a as { meetingUrl?: string | null }).meetingUrl ?? null,
    notes:       a.notes,
    // Distingue la cancelación tardía (cobra) de la que avisó (no cobra). La fila
    // la usa para pintarse igual que en el calendario: ámbar vs rose.
    cancelledSameDay: (a as { cancelledSameDay?: boolean }).cancelledSameDay ?? false,
    chargedTotal,
    hasCharge:   chargedTotal > 0,
    patient: {
      id:        a.patient.id,
      firstName: a.patient.firstName,
      lastName:  a.patient.lastName,
      phone:     a.patient.phone,
    },
    provider: a.provider ? {
      id:        a.provider.id,
      firstName: a.provider.firstName,
      lastName:  a.provider.lastName,
      specialty: a.provider.specialty,
    } : null,
    clinic: { id: a.clinic.id, name: a.clinic.name },
    case: a.case ? {
      id:                    a.case.id,
      caseCode:              a.case.caseCode,
      caseType:              a.case.caseType,
      accidentType:          a.case.accidentType ?? null,
      pipVerifiedAt:         a.case.pipVerifiedAt?.toISOString() ?? null,
      intakeFormCompletedAt: a.case.intakeFormCompletedAt?.toISOString() ?? null,
      isReady,
      hasPending,
      primaryInsurance: a.case.primaryInsurance ?? null,
    } : null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get('clinicId');
  const dateStr  = searchParams.get('date');   // 'YYYY-MM-DD' Denver

  const { from, to } = denverMidnight(dateStr);

  try {
    const where = {
      scheduledFor: { gte: from, lte: to },
      deletedAt:    undefined as undefined,
      ...(clinicId ? { clinicId } : {}),
      // Las canceladas CON AVISO liberaron la agenda y no dejan nada pendiente:
      // no entran. Las del MISMO DÍA sí — consumieron el horario y admiten
      // penalidad, así que recepción tiene que verlas para poder cobrarlas.
      // Antes se excluían TODAS las canceladas y la mitad de lo cobrable era
      // invisible en esta pantalla: se veía solo en el calendario.
      OR: [
        { status: { notIn: ['CANCELLED' as const] } },
        { status: 'CANCELLED' as const, cancelledSameDay: true },
      ],
    };

    const appts = await db.appointment.findMany({
      where,
      include: APPT_INCLUDE,
      orderBy: { scheduledFor: 'asc' },
    });

    const mapped = appts.map(mapAppt);

    // Agrupar
    const pending = mapped.filter(a =>
      a.status === 'SCHEDULED' || a.status === 'CONFIRMED' || a.status === 'PENDING',
    );
    const active = mapped.filter(a =>
      a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS',
    );
    // Citas con desenlace. `CANCELLED` acá solo puede ser del mismo día: el
    // `where` ya descartó las que avisaron.
    const resolved = mapped.filter(a =>
      a.status === 'COMPLETED' || a.status === 'NO_SHOW' || a.status === 'CANCELLED',
    );
    // Consumieron el horario y NO tienen la penalidad asentada. Es la única lista
    // que representa trabajo sin hacer, no un estado del día — por eso sale de
    // `done` en vez de convivir con él: si no, la misma cita aparecía dos veces.
    const unpenalized = resolved.filter(a => esDesenlaceCobrable(a) && !a.hasCharge);
    const unpenalizedIds = new Set(unpenalized.map(a => a.id));
    const done = resolved.filter(a => !unpenalizedIds.has(a.id));

    const totals = {
      total:     mapped.length,
      checkedIn: active.length + done.filter(a => a.status === 'COMPLETED').length,
      pending:   pending.length,
      inRoom:    active.filter(a => a.status === 'IN_PROGRESS').length,
      unpenalized: unpenalized.length,
    };

    // Fecha Denver para el header
    const displayDate = from.toLocaleDateString('es-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Denver',
    });

    return NextResponse.json({ ok: true, displayDate, totals, pending, active, done, unpenalized });
  } catch (err) {
    console.error('[GET /api/admin/admission]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
