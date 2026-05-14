import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { AppointmentsClient } from './appointments-client';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('appointments.title') };
}

export default async function AppointmentsPage() {
  const [initial, clinics, patients, providers] = await Promise.all([
    api.appointments.list(),
    api.appointments.listClinics(),
    api.patients.list(),
    api.providers.list(),
  ]);
  return (
    <AppointmentsClient
      initial={initial}
      clinics={clinics}
      patients={patients.items}
      providers={providers.items}
    />
  );
}
