/**
 * B.18 — Nota de Visita (Doctor)
 *
 * 2 tabs: Nota SOAP | Historial médico
 * Layout 2 paneles: sidebar paciente + área principal (vitales + 7 secciones + diagnósticos).
 *
 * Color accent: violet (Regla #5 — módulo Doctor)
 */

import { notFound } from 'next/navigation';
import { db }       from '@precision-medical/database';
import { VisitClient } from './visit-client';

interface Props {
  params: Promise<{ appointmentId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { appointmentId } = await params;
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (!appt) return { title: 'Nota · LienMaster Clinical' };
  return { title: `Nota · ${appt.patient.firstName} ${appt.patient.lastName} · LM Clinical` };
}

export default async function VisitPage({ params }: Props) {
  const { appointmentId } = await params;

  const exists = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true },
  });
  if (!exists) notFound();

  return <VisitClient appointmentId={appointmentId} />;
}
