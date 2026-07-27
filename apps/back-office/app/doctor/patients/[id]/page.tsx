/**
 * Portal Médico · Ficha del paciente (D2)
 *
 * Reúsa PatientDetailClient (B.4). Seguridad de alcance: solo pacientes
 * con al menos una cita del doctor de sesión — cualquier otro id → 404.
 */

import { notFound } from 'next/navigation';
import { db as prisma } from '@precision-medical/database';
import { PatientDetailClient } from '@/app/(admin)/patients/[id]/patient-detail-client';
import { getSessionProvider } from '@/lib/get-session-provider';

export const metadata = { title: 'Paciente · Portal Médico' };

export default async function DoctorPatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { id } = await params;

  // Guard de alcance: el paciente debe haber tenido cita con este doctor
  const hasRelation = await prisma.appointment.findFirst({
    where: { patientId: id, providerId: provider.id },
    select: { id: true },
  });
  if (!hasRelation) notFound();

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      lawyerReferrer: {
        select: { id: true, firmName: true },
      },
      providerReferrer: {
        select: { id: true, firstName: true, lastName: true },
      },
      cases: {
        include: {
          lawFirm: {
            select: { id: true, firmName: true, paymentSpeed: true },
          },
          attorney: {
            select: { id: true, firstName: true, lastName: true },
          },
          specialty: {
            select: { id: true, name: true, color: true },
          },
          primaryInsurance: {
            select: { id: true, name: true, shortCode: true, color: true },
          },
          _count: {
            select: { notes: true, appointments: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!patient) notFound();

  // Mismo cast que /patients/[id] — deuda técnica conocida, safe en runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PatientDetailClient patient={patient as any} doctorMode />;
}
