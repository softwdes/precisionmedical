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
import { saldoDeMostrador } from '@/lib/saldo-de-mostrador';
import { auditarFichaAjenaDesdeLaPagina } from '@/lib/patient-access';
import { CaseUrlModal } from '@/components/cases/case-url-modal';

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
   * Sin guard de alcance desde 2026-09-16.
   *
   * Acá se exigía que el paciente fuera de este provider (lo atiende o lo
   * trajo). Con la lista mostrando toda la clínica, ese guard convertía cada
   * fila ajena en un 404 — la lista y la ficha tienen que contar lo mismo.
   * La decisión y su alcance están en `checkPatientAccess`.
   *
   * En su lugar queda la CONSTANCIA: si el expediente no es suyo, se registra.
   * Va con `await` y ANTES de las queries de la ficha — si sirviéramos el PHI y
   * después fallara el registro, habría divulgación sin rastro.
   */
  await auditarFichaAjenaDesdeLaPagina(id);

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

  /* Los mismos dos avisos que en la ficha de la clínica. El provider también
     los necesita: es el que ve al paciente en el consultorio, y si debe en el
     mostrador tiene que saberlo antes de despedirlo. */
  const [saldo, proximaCita] = await Promise.all([
    saldoDeMostrador(id),
    prisma.appointment.findFirst({
      where: { patientId: id, scheduledFor: { gte: new Date() }, status: { not: 'CANCELLED' } },
      orderBy: { scheduledFor: 'asc' },
      select: { id: true, scheduledFor: true, clinic: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      {/* Mismo cast que /patients/[id] — deuda técnica conocida, safe en runtime. */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <PatientDetailClient
        patient={patient as any}
        doctorMode
        saldo={saldo}
        proximaCita={proximaCita && {
          id: proximaCita.id,
          scheduledFor: proximaCita.scheduledFor.toISOString(),
          clinicName: proximaCita.clinic?.name ?? null,
        }}
      />

      {/* El caso abre como modal sobre la ficha, igual que en Mis Pacientes. El
          portal abre el caso de cualquier paciente. */}
      <CaseUrlModal caseId={caseId} tab={tab} variant="doctor" />
    </>
  );
}
