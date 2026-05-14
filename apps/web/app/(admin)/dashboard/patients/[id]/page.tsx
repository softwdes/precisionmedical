import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/trpc/server';
import { PatientDetailClient } from './patient-detail-client';

interface Props { params: Promise<{ id: string }> }

export default async function PatientDetailPage({ params }: Props) {
  const { id } = await params;
  try {
    const patient = await api.patients.getById({ id });
    return <PatientDetailClient patient={patient} />;
  } catch {
    notFound();
  }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations();
  try {
    const patient = await api.patients.getById({ id });
    return { title: `${patient.firstName} ${patient.lastName}` };
  } catch {
    return { title: t('patients.title') };
  }
}
