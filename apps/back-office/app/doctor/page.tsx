/**
 * Portal Médico · Mi Día (B.17 — D1)
 *
 * Server component: citas del día del doctor (Denver, DST-aware) + notas DRAFT
 * pendientes de firma. Todo scoped por el Provider de la sesión.
 * Navegable por día: ?date=YYYY-MM-DD (default hoy) — igual que Day Admission.
 */

import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal } from '@/lib/decrypt';
import { getSessionProvider } from '@/lib/get-session-provider';
import { MyDayClient, type MyDayAppointment, type UnsignedNote } from './my-day-client';

export const metadata = { title: 'Mi Día · Portal Médico' };

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKeyOf = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/**
 * Rango [inicio, fin) de un día en America/Denver, DST-aware.
 * @param dayKey YYYY-MM-DD del día deseado (default: hoy en Denver)
 */
function denverDayRange(dayKey?: string): { start: Date; end: Date; key: string } {
  const key = dayKey ?? dayKeyOf(new Date());
  // Offset vigente EN ESE DÍA (mediodía UTC de ese día evita ambigüedad de DST)
  const probe = new Date(`${key}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'shortOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const m = /GMT([+-]\d+)/.exec(offsetPart);
  const hours = m?.[1] ? parseInt(m[1], 10) : -6;
  const hh = String(Math.abs(hours)).padStart(2, '0');
  const start = new Date(`${key}T00:00:00${hours <= 0 ? '-' : '+'}${hh}:00`);
  return { start, end: new Date(start.getTime() + DAY_MS), key };
}

export default async function DoctorMyDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { date: dateParam } = await searchParams;
  const requested = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  const { start, end, key: dateKey } = denverDayRange(requested);
  const todayKey = dayKeyOf(new Date());
  const prevDate = dayKeyOf(new Date(start.getTime() - DAY_MS / 2));
  const nextDate = dayKeyOf(new Date(end.getTime() + DAY_MS / 2));

  const [appts, drafts] = await Promise.all([
    db.appointment.findMany({
      where: {
        providerId: provider.id,
        scheduledFor: { gte: start, lt: end },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      orderBy: { scheduledFor: 'asc' },
      select: {
        id: true,
        scheduledFor: true,
        durationMinutes: true,
        status: true,
        type: true,
        isOnline: true,
        meetingUrl: true,
        checkedInAt: true,
        attendanceSignedAt: true,
        patient: { select: { firstName: true, lastName: true } },
        case: { select: { caseCode: true } },
        clinic: { select: { name: true } },
        triageRecord: { select: { id: true } },
        visitNote: { select: { status: true } },
      },
    }),
    db.visitNote.findMany({
      where: { status: 'DRAFT', appointment: { providerId: provider.id } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        appointmentId: true,
        appointment: {
          select: {
            scheduledFor: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  const appointments: MyDayAppointment[] = appts.map((a) => ({
    id: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    type: a.type,
    isOnline: a.isOnline,
    meetingUrl: a.meetingUrl,
    checkedInAt: a.checkedInAt?.toISOString() ?? null,
    attendanceSignedAt: a.attendanceSignedAt?.toISOString() ?? null,
    hasTriage: !!a.triageRecord,
    noteStatus: a.visitNote?.status ?? null,
    patientFirstName: decryptFieldOrOriginal(a.patient.firstName) ?? '',
    patientLastName: decryptFieldOrOriginal(a.patient.lastName) ?? '',
    caseCode: a.case?.caseCode ?? null,
    clinicName: a.clinic.name,
  }));

  const unsignedNotes: UnsignedNote[] = drafts.map((n) => ({
    appointmentId: n.appointmentId,
    patientName: `${decryptFieldOrOriginal(n.appointment.patient.firstName) ?? ''} ${decryptFieldOrOriginal(n.appointment.patient.lastName) ?? ''}`.trim(),
    date: n.appointment.scheduledFor.toISOString(),
  }));

  return (
    <MyDayClient
      doctorName={`${provider.firstName} ${provider.lastName}`}
      appointments={appointments}
      unsignedNotes={unsignedNotes}
      clinicalUrl={process.env.NEXT_PUBLIC_CLINICAL_URL ?? 'https://clinical.lienmaster.net'}
      dateKey={dateKey}
      isToday={dateKey === todayKey}
      prevDate={prevDate}
      nextDate={nextDate}
    />
  );
}
