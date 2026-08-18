import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import {
  PageHeader, DataTable, StatusPill, TagPill, EmptyState,
} from '@/components/ui-phoenix';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter, canSeeMenu } from '@/lib/attorney-portal';
import { fechaHora } from '@/lib/fechas';

/**
 * Portal Legal · Citas (SOLO LECTURA)
 *
 * Decisión de Erick (2026-08-18): el abogado no agenda; solo ve las citas de sus
 * clientes. Por eso NO se replica la agenda por proveedor que muestra v2 — ahí
 * el despacho veía la jornada completa de todos los médicos, incluidos pacientes
 * de otros bufetes. Acá se listan únicamente las citas de los casos que ya
 * entran en su alcance (`lawyerCaseFilter`), que es su información y nada más.
 */

const APPT_STATE: Record<string, 'active' | 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  SCHEDULED: 'info', CONFIRMED: 'active', CHECKED_IN: 'active',
  IN_PROGRESS: 'active', COMPLETED: 'success',
  NO_SHOW: 'warning', CANCELLED: 'danger',
};

export default async function AttorneyAppointmentsPage(): Promise<React.ReactElement> {
  const [lawyer, t] = await Promise.all([
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
  ]);
  if (!lawyer) return <></>;
  if (!canSeeMenu(lawyer, 'appointments')) redirect('/attorney');

  const appointments = await db.appointment.findMany({
    where: { case: lawyerCaseFilter(lawyer) },
    orderBy: { scheduledFor: 'desc' },
    take: 100,
    select: {
      id: true,
      scheduledFor: true,
      status: true,
      patient:  { select: { firstName: true, lastName: true } },
      provider: { select: { firstName: true, lastName: true } },
      clinic:   { select: { name: true } },
      case:     { select: { id: true, caseCode: true } },
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t('apptTitle')} subtitle={t('apptSubtitle')} />

      {appointments.length === 0 ? (
        <EmptyState.Inline message={t('apptEmpty')} />
      ) : (
        <DataTable.Card>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('colDateTime')}</DataTable.Th>
                <DataTable.Th>{t('colCase')}</DataTable.Th>
                <DataTable.Th>{t('colPatient')}</DataTable.Th>
                <DataTable.Th>{t('colProvider')}</DataTable.Th>
                <DataTable.Th>{t('colClinic')}</DataTable.Th>
                <DataTable.Th>{t('colAppointmentStatus')}</DataTable.Th>
              </DataTable.Head>
              <tbody>
                {appointments.map((a) => (
                  <DataTable.Row key={a.id}>
                    <DataTable.Td sticky="left">
                      <span className="whitespace-nowrap">{fechaHora(a.scheduledFor)}</span>
                    </DataTable.Td>
                    <DataTable.Td>
                      {a.case
                        ? <TagPill label={a.case.caseCode} mono compact colorClass="bg-brand/10 text-brand-text border-brand/20" />
                        : '—'}
                    </DataTable.Td>
                    <DataTable.Td>
                      {a.patient.lastName.toUpperCase()}, {a.patient.firstName}
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
    </div>
  );
}
