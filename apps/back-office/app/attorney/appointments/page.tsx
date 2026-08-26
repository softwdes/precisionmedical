import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { PageHeader } from '@/components/ui-phoenix';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter, canSeeMenu } from '@/lib/attorney-portal';
import { ZONA_CLINICA } from '@/lib/fechas';
import { AppointmentsDayView, type DayAppointment, type ClinicOption } from './day-view';

/**
 * Portal Legal · Citas (SOLO LECTURA)
 *
 * Una JORNADA por vez, como v2 — no la lista de las últimas 100 de toda la
 * historia, que era lo que había antes: costaba una consulta pesada y nadie
 * necesita ver las citas de 2024.
 *
 * Y solo las de SUS pacientes. v2 muestra la agenda completa de todos los
 * médicos, con pacientes de todos los despachos; eso es información clínica de
 * terceros en manos de un externo (decisión de Erick, 2026-08-18).
 */

/** `YYYY-MM-DD` de hoy en la zona de la clínica, no en la del servidor. */
function hoyEnClinica(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Los límites del día en UTC.
 *
 * La clínica está en Denver, así que "el 25 de agosto" empieza a las 06:00 UTC
 * (o 07:00 según el horario de verano). Tomar el día en UTC a secas movería las
 * citas de la mañana al día anterior — el mismo error que ya nos costó una
 * fecha de nacimiento corrida.
 */
function rangoDelDia(iso: string): { desde: Date; hasta: Date } {
  const [y, m, d] = iso.split('-').map(Number);
  // El desfase REAL de esa fecha se deduce de cómo se ve el mediodía UTC en la
  // zona de la clínica: 6 horas en verano, 7 en invierno. Hardcodear una de las
  // dos rompe medio año.
  const tentativo = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit',
  }).formatToParts(new Date(tentativo));
  const horaLocal = Number(partes.find((p) => p.type === 'hour')?.value ?? '12');
  const desfaseHoras = 12 - horaLocal; // 6 o 7 según DST
  const desde = new Date(Date.UTC(y!, m! - 1, d!, desfaseHoras, 0, 0));
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
  return { desde, hasta };
}

export default async function AttorneyAppointmentsPage({ searchParams }: {
  searchParams: Promise<{ date?: string; clinic?: string }>;
}): Promise<React.ReactElement> {
  const [sp, lawyer, t] = await Promise.all([
    searchParams,
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
  ]);
  if (!lawyer) return <></>;
  if (!canSeeMenu(lawyer, 'appointments')) redirect('/attorney');

  // Una fecha inválida en la URL cae a hoy en vez de romper la pantalla.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : hoyEnClinica();
  const clinicId = sp.clinic ?? '';
  const { desde, hasta } = rangoDelDia(date);

  const [rows, clinicRows] = await Promise.all([
    db.appointment.findMany({
      where: {
        case: lawyerCaseFilter(lawyer),
        scheduledFor: { gte: desde, lt: hasta },
        ...(clinicId ? { clinicId } : {}),
      },
      orderBy: { scheduledFor: 'asc' },
      select: {
        id: true, scheduledFor: true, status: true,
        patient:  { select: { firstName: true, lastName: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
        clinic:   { select: { id: true, name: true } },
        case:     { select: { caseCode: true } },
      },
    }),
    /**
     * MISMA regla que la tarjeta de oficina de la barra lateral: una sede del
     * portal legal es la que tiene dirección Y foto. Una sola definición para
     * todo el portal, porque si el selector y la tarjeta discrepan, el bufete ve
     * una clínica en un lado y no en el otro.
     *
     * Deja fuera a "Murray - Surgery" (sin dirección ni foto) y a "Salt Lake
     * Central Care", que no tiene foto ni una sola cita en toda la base: filtrar
     * por ella siempre daba una lista vacía.
     *
     * Por DATO, no por nombre: cargarles los campos las devuelve solas.
     */
    db.clinic.findMany({
      where: { address: { not: null }, photos: { isEmpty: false } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const appointments: DayAppointment[] = rows
    // Sin proveedor no hay fila donde ponerla; son citas a medio crear.
    .filter((a) => a.provider !== null)
    .map((a) => ({
      id: a.id,
      scheduledFor: a.scheduledFor.toISOString(),
      status: a.status,
      patientName: `${a.patient.lastName.toUpperCase()}, ${a.patient.firstName}`,
      providerId: a.provider!.id,
      providerName: `${a.provider!.firstName} ${a.provider!.lastName}`.trim(),
      clinicId: a.clinic?.id ?? null,
      clinicName: a.clinic?.name ?? null,
      caseCode: a.case?.caseCode ?? null,
    }));

  const clinics: ClinicOption[] = clinicRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-4">
      <PageHeader title={t('apptTitle')} subtitle={t('apptSubtitle')} />
      <AppointmentsDayView
        date={date}
        appointments={appointments}
        clinics={clinics}
        clinicId={clinicId}
      />
    </div>
  );
}
