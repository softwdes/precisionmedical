/**
 * B.16 — Triaje MA (Medical Assistant)
 *
 * Captura de signos vitales en iPad. El MA toma los signos mientras el
 * paciente está en sala de espera. Los datos se sincronizan automáticamente
 * con la vista del doctor (B.18) cuando abre la visita.
 *
 * Layout: sidebar con contexto del paciente + área principal con el formulario.
 */

import { notFound } from 'next/navigation';
import { db }       from '@precision-medical/database';
import { TriageClient } from './triage-client';

interface Props {
  params: Promise<{ appointmentId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { appointmentId } = await params;
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (!appt) return { title: 'Triaje · LienMaster Clinical' };
  return { title: `Triaje · ${appt.patient.firstName} ${appt.patient.lastName} · LM Clinical` };
}

export default async function TriagePage({ params }: Props) {
  const { appointmentId } = await params;

  const exists = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true },
  });
  if (!exists) notFound();

  return <TriageClient appointmentId={appointmentId} />;
}
