/**
 * B.4 mockup · Ficha del paciente
 *
 * Vista completa de un paciente con todos sus casos, datos personales y
 * referencias. Punto de llegada desde:
 *   - ⌘K search (B.34) — "Ver detalle"
 *   - PreCallStep — "Ver historial"
 *   - Front-office queue — (futuro) clic en nombre del paciente
 *
 * Phase 1A: mock data, sin PHI real.
 */

import { notFound } from 'next/navigation';
import { db as prisma } from '@precision-medical/database';
import { PatientDetailClient } from './patient-detail-client';

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  // Cast: Prisma enum types ($Enums.CaseStatus, CaseTypeWorkflow, etc.) no son
  // directamente assignables a las string unions del client. Mismo pattern que
  // front-office/page.tsx — deuda técnica conocida, safe en runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PatientDetailClient patient={patient as any} />;
}
