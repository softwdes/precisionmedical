/**
 * B.15 — Admisión "Pagos y Cobros" · Detalle de cita
 */

import { getTranslations } from 'next-intl/server';
import { notFound }             from 'next/navigation';
import { db }                   from '@precision-medical/database';
import { getSessionUser }       from '@/lib/session';
import { AdmissionDetailClient } from './admission-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const appt = await db.appointment.findUnique({
    where:  { id },
    select: { patient: { select: { firstName: true, lastName: true } } },
  });
  const [t, tp] = await Promise.all([
    getTranslations('phoenix.nav'),
    getTranslations('phoenix.pageTitles'),
  ]);
  const name = appt ? `${appt.patient.firstName} ${appt.patient.lastName}` : tp('appointment');
  return { title: `${name} · ${t('admission')}` };
}

export default async function AdmissionDetailPage({ params }: Props) {
  const { id } = await params;
  /* `getSessionUser` está memorizado con `cache()`, así que esto no agrega un
     viaje a la base: el layout ya lo resolvió. */
  const [exists, user] = await Promise.all([
    db.appointment.findUnique({ where: { id }, select: { id: true } }),
    getSessionUser(),
  ]);
  if (!exists) notFound();
  return <AdmissionDetailClient key={id} appointmentId={id} currentUserId={user?.id ?? null} />;
}
