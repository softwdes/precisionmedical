/**
 * Portal Médico · Ficha del paciente (D2)
 *
 * Reúsa PatientDetailClient (B.4). Seguridad de alcance: solo pacientes
 * con al menos una cita del doctor de sesión — cualquier otro id → 404.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { db as prisma } from '@precision-medical/database';
import { PatientDetailClient } from '@/app/(admin)/patients/[id]/patient-detail-client';
import { getSessionProvider } from '@/lib/get-session-provider';
import { CaseUrlModal } from '@/components/cases/case-url-modal';
import { alcanceDelProvider } from '@/lib/patients-query';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.pageTitles');
  return { title: t('patient') };
}

export default async function DoctorPatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ case?: string; tab?: string }>;
}) {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { id } = await params;
  const { case: caseId, tab } = await searchParams;

  /**
   * Guard de alcance: el paciente lo atiende este doctor, o lo trajo él.
   *
   * La segunda mitad es por el alta rápida del portal: recién creado todavía no
   * tiene citas, y con el guard viejo el provider abría un 404 sobre el
   * paciente que acababa de dar de alta. Misma regla que recorta su lista —
   * ver `alcanceDelProvider`.
   */
  const hasRelation = await prisma.patient.findFirst({
    where: { AND: [{ id }, alcanceDelProvider(provider.id)] },
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

  return (
    <>
      {/* Mismo cast que /patients/[id] — deuda técnica conocida, safe en runtime. */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <PatientDetailClient patient={patient as any} doctorMode />

      {/* El caso abre como modal sobre la ficha, igual que en Mis Pacientes. El
          server revalida que la cita sea de este doctor. */}
      <CaseUrlModal caseId={caseId} tab={tab} variant="doctor" providerId={provider.id} />
    </>
  );
}
