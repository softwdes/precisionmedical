/**
 * B.12 / B.13 / B.23 / B.24 — Bandeja de trabajo Edson (Case Manager)
 *
 * Tab 1 — Pre-visita (B.12/B.13): casos con primera cita próxima, tareas pendientes
 * Tab 2 — Cobranzas (B.23/B.24): casos activos sin settlement, clasificados por urgencia
 */

import { EdsonClient } from './edson-client';
import { db }          from '@precision-medical/database';

export const metadata = { title: 'Bandeja Edson · Precision Medical' };

export default async function EdsonPage() {
  const now = new Date();

  // ── Pre-visita: casos próximos a primera cita con tareas pendientes ──
  const in14Days = new Date(now);
  in14Days.setDate(in14Days.getDate() + 14);

  const preVisitCases = await db.case.findMany({
    where: {
      status: { in: ['NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED'] },
      deletedAt: null,
      appointments: {
        some: {
          scheduledFor: { gte: now, lte: in14Days },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      },
    },
    select: {
      id: true, caseCode: true, status: true,
      intakeFormSentAt: true, intakeFormCompletedAt: true,
      pipVerifiedAt: true, firstAppointmentConfirmedAt: true,
      createdAt: true, accidentDate: true, source: true,
      patient: {
        select: { firstName: true, lastName: true, phone: true, email: true },
      },
      lawFirm: { select: { firmName: true, phone: true, email: true } },
      attorney: { select: { firstName: true, lastName: true, email: true } },
      primaryInsurance: { select: { name: true } },
      appointments: {
        where: {
          scheduledFor: { gte: now },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 1,
        select: { id: true, scheduledFor: true, type: true, status: true },
      },
      lienSignatures: { select: { signerType: true }, take: 10 },
      intakeSubmission: { select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // ── Cobranzas: casos activos/cerrados sin settlement, con saldo potencial ──
  const collectionsCases = await db.case.findMany({
    where: {
      status: { in: ['ACTIVE', 'MMI', 'CLOSED'] },
      deletedAt: null,
    },
    select: {
      id: true, caseCode: true, status: true,
      createdAt: true, accidentDate: true, updatedAt: true,
      patient: {
        select: { firstName: true, lastName: true, phone: true, email: true },
      },
      lawFirm: { select: { firmName: true, phone: true, email: true } },
      attorney: { select: { firstName: true, lastName: true, email: true } },
      primaryInsurance: { select: { name: true } },
      lienSignatures: { select: { signerType: true, signedAt: true }, take: 10 },
      appointments: {
        where: { status: 'COMPLETED' },
        select: { id: true },
      },
      notes: {
        where: { content: { startsWith: '📞' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: 'asc' },
  });

  return (
    <EdsonClient
      preVisitCases={preVisitCases}
      collectionsCases={collectionsCases}
    />
  );
}
