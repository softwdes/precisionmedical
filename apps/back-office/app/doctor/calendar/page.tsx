/**
 * Portal Médico · Mi Calendario (D1)
 *
 * Reúsa el calendario compartido B.10-B.11: mismas vistas día/semana/mes,
 * drag & drop, telemedicina. Arranca en las citas del doctor de la sesión y
 * desde ahí puede ver las de cualquier otro — ver `initialProviderId`.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { CalendarClient } from '@/app/(admin)/calendar/calendar-client';
import { getSessionProvider } from '@/lib/get-session-provider';
import { CaseUrlModal } from '@/components/cases/case-url-modal';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('myCalendar') };
}

export default async function DoctorCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; tab?: string }>;
}): Promise<React.ReactElement> {
  const { case: caseId, tab } = await searchParams;
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  /**
   * TODOS los doctores, no solo el de la sesión.
   *
   * Devin (2026-10-05): *"Providers need to be able to see the schedules for all
   * clinics and providers"*. Antes esta página mandaba una lista con él solo y
   * `lockedProviderId`, que además escondía el filtro de doctor: no había forma
   * de mirar al resto.
   *
   * Ahora el filtro arranca en el suyo —entra a ver SU día, y eso no cambia— y
   * puede pasarlo a "Todos los doctores". Es el *"or a toggle to do so"* que él
   * mismo ofreció, y evita volcarle la agenda entera de la clínica a quien no la
   * pidió.
   */
  const [clinics, providers] = await Promise.all([
    db.clinic.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.provider.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true, specialty: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);

  return (
    <>
      <CalendarClient
        clinics={clinics}
        providers={providers}
        initialProviderId={provider.id}
      />
      <CaseUrlModal caseId={caseId} tab={tab} variant="doctor" />
    </>
  );
}
