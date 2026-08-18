import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { db } from '@precision-medical/database';
import {
  PageHeader, DataTable, StatusPill, EmptyState, InfoCard, InfoRow,
} from '@/components/ui-phoenix';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';
import { fecha, fechaHora } from '@/lib/fechas';

/**
 * Portal Legal · Detalle de caso (solo lectura)
 *
 * El caso se busca CON el filtro de sesión, no por id a secas: pedir un caso de
 * otro despacho tiene que dar 404, no una página vacía ni —peor— la ficha.
 */

const STATUS_STATE: Record<string, 'active' | 'info' | 'warning' | 'success' | 'neutral'> = {
  NEW_REFERRAL: 'info', INTAKE_PENDING: 'info', INTAKE_COMPLETED: 'info',
  CONFIRMED: 'active', ACTIVE: 'active', MMI: 'warning',
  CLOSED: 'neutral', SETTLED: 'success', ARCHIVED: 'neutral', CANCELLED: 'neutral',
};

const APPT_STATE: Record<string, 'active' | 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  SCHEDULED: 'info', CONFIRMED: 'active', CHECKED_IN: 'active',
  IN_PROGRESS: 'active', COMPLETED: 'success',
  NO_SHOW: 'warning', CANCELLED: 'danger',
};

export default async function AttorneyCaseDetailPage(
  { params }: { params: Promise<{ id: string }> },
): Promise<React.ReactElement> {
  const { id } = await params;
  const [lawyer, t] = await Promise.all([
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
  ]);
  if (!lawyer) return <></>;

  const caseRecord = await db.case.findFirst({
    where: { AND: [lawyerCaseFilter(lawyer), { id }] },
    select: {
      id: true, caseCode: true, caseType: true, status: true,
      createdAt: true, accidentDate: true, signatureExempt: true,
      patient: { select: { firstName: true, lastName: true } },
      attorney:       { select: { firstName: true, lastName: true } },
      paralegal:      { select: { firstName: true, lastName: true } },
      legalAssistant: { select: { firstName: true, lastName: true } },
      lawFirm: { select: { firmName: true } },
      lienSignatures: { select: { id: true }, take: 1 },
      appointments: {
        orderBy: { scheduledFor: 'desc' },
        select: {
          id: true, scheduledFor: true, status: true,
          provider: { select: { firstName: true, lastName: true } },
          clinic:   { select: { name: true } },
        },
      },
    },
  });

  if (!caseRecord) notFound();

  // `AppointmentBilling.caseId` es denormalizado (sin relación Prisma).
  const debtAgg = await db.appointmentBilling.aggregate({
    where: { caseId: caseRecord.id },
    _sum: { balanceDue: true },
  });
  const debt = Number(debtAgg._sum.balanceDue ?? 0);

  const person = (p: { firstName: string | null; lastName: string | null } | null): string =>
    p ? (`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—') : '—';

  const patientName = `${caseRecord.patient.lastName.toUpperCase()}, ${caseRecord.patient.firstName}`;

  return (
    <div className="space-y-4">
      <Link
        href="/attorney/cases"
        className="inline-flex items-center gap-1.5 text-text-2 hover:text-text-1 text-sm"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('backToCases')}
      </Link>

      <PageHeader title={patientName} subtitle={caseRecord.caseCode} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard title={t('sectionCaseInfo')}>
          <InfoRow label={t('colType')} value={caseRecord.caseType ?? '—'} />
          <InfoRow
            label={t('colStatus')}
            value={<StatusPill state={STATUS_STATE[caseRecord.status] ?? 'neutral'} label={caseRecord.status.replace(/_/g, ' ')} />}
          />
          <InfoRow label={t('colAccidentDate')} value={fecha(caseRecord.accidentDate)} />
          <InfoRow label={t('colCreated')} value={fecha(caseRecord.createdAt)} />
          <InfoRow
            label={t('colSignature')}
            value={
              caseRecord.signatureExempt
                ? <StatusPill state="neutral" label={t('sigExempt')} />
                : caseRecord.lienSignatures.length > 0
                  ? <StatusPill state="success" label={t('sigSigned')} />
                  : <StatusPill state="warning" label={t('sigPending')} />
            }
          />
          <InfoRow label={t('labelDebt')} value={`$${debt.toFixed(2)}`} />
        </InfoCard>

        <InfoCard title={t('usersTitle')}>
          <InfoRow label={t('labelFirm')} value={caseRecord.lawFirm?.firmName ?? '—'} />
          <InfoRow label={t('colAttorney')} value={person(caseRecord.attorney)} />
          <InfoRow label={t('colParalegal')} value={person(caseRecord.paralegal)} />
          <InfoRow label={t('colAssistant')} value={person(caseRecord.legalAssistant)} />
        </InfoCard>
      </div>

      <section className="space-y-3">
        <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">
          {t('sectionAppointments')}
        </h2>

        {caseRecord.appointments.length === 0 ? (
          <EmptyState.Inline message={t('apptEmpty')} />
        ) : (
          <DataTable.Card>
            <DataTable.Scroll>
              <DataTable.Table>
                <DataTable.Head>
                  <DataTable.Th sticky="left">{t('colDateTime')}</DataTable.Th>
                  <DataTable.Th>{t('colProvider')}</DataTable.Th>
                  <DataTable.Th>{t('colClinic')}</DataTable.Th>
                  <DataTable.Th>{t('colAppointmentStatus')}</DataTable.Th>
                </DataTable.Head>
                <tbody>
                  {caseRecord.appointments.map((a) => (
                    <DataTable.Row key={a.id}>
                      <DataTable.Td sticky="left">
                        <span className="whitespace-nowrap">{fechaHora(a.scheduledFor)}</span>
                      </DataTable.Td>
                      <DataTable.Td>
                        {a.provider ? `${a.provider.firstName} ${a.provider.lastName}` : '—'}
                      </DataTable.Td>
                      <DataTable.Td>{a.clinic?.name ?? '—'}</DataTable.Td>
                      <DataTable.Td>
                        <StatusPill state={APPT_STATE[a.status] ?? 'neutral'} label={a.status.replace(/_/g, ' ')} />
                      </DataTable.Td>
                    </DataTable.Row>
                  ))}
                </tbody>
              </DataTable.Table>
            </DataTable.Scroll>
          </DataTable.Card>
        )}
      </section>
    </div>
  );
}
