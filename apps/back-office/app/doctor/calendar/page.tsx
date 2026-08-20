/**
 * Portal Médico · Mi Calendario (D1)
 *
 * Reúsa el calendario compartido B.10-B.11 con `lockedProviderId`:
 * mismas vistas día/semana/mes, drag & drop, telemedicina — solo sus citas.
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

  const clinics = await db.clinic.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <CalendarClient
        clinics={clinics}
        providers={[{
          id: provider.id,
          firstName: provider.firstName,
          lastName: provider.lastName,
          specialty: provider.specialty,
        }]}
        lockedProviderId={provider.id}
      />
      <CaseUrlModal caseId={caseId} tab={tab} variant="doctor" providerId={provider.id} />
    </>
  );
}
