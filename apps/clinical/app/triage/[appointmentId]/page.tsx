/**
 * B.16 — Triaje MA (Medical Assistant)
 *
 * Captura de signos vitales en iPad. El MA toma los signos mientras el
 * paciente está en sala de espera. Los datos se sincronizan automáticamente
 * con la vista del doctor (B.18) cuando abre la visita.
 *
 * Layout: sidebar con contexto del paciente + área principal con el formulario.
 */

import { notFound }         from 'next/navigation';
import { db }               from '@precision-medical/database';
import { createServerClient } from '@precision-medical/auth/server';
import { TriageClient }     from './triage-client';

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

  // Get the current user's name to show as "Captured by" in triage
  let currentUserName = 'MA';
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.full_name) {
      currentUserName = user.user_metadata.full_name as string;
    } else if (user?.email) {
      currentUserName = user.email.split('@')[0];
    }
  } catch {
    // fallback to 'MA'
  }

  return <TriageClient appointmentId={appointmentId} currentUserName={currentUserName} />;
}
