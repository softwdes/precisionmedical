/**
 * B.15 — Admisión "Pagos y Cobros" · Detalle de cita
 */

import { notFound }             from 'next/navigation';
import { db }                   from '@precision-medical/database';
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
  const name = appt ? `${appt.patient.firstName} ${appt.patient.lastName}` : 'Cita';
  return { title: `${name} · Admisión · LienMaster` };
}

export default async function AdmissionDetailPage({ params }: Props) {
  const { id } = await params;
  const exists = await db.appointment.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  return <AdmissionDetailClient appointmentId={id} />;
}
