import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui-phoenix';
import { CaseUrlModal } from '@/components/cases/case-url-modal';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { canSeeMenu } from '@/lib/attorney-portal';
import { ReferralsClient } from './referrals-client';

/**
 * Portal Legal · Referidos
 *
 * La pantalla del ítem "Referir un cliente" del menú: arriba el botón para
 * mandar uno nuevo, abajo la lista de los que el bufete ya mandó con su estado
 * —pendiente en la clínica, o ya con caso— y el caso abre encima (`?case=`),
 * como en el resto del portal.
 */
export default async function AttorneyReferralsPage({ searchParams }: {
  searchParams: Promise<{ case?: string; tab?: string; new?: string }>;
}): Promise<React.ReactElement> {
  const [{ case: caseId, tab, new: abrirNuevo }, lawyer, t, locale] = await Promise.all([
    searchParams,
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
    getLocale(),
  ]);
  if (!lawyer) return <></>;
  if (!canSeeMenu(lawyer, 'referrals')) redirect('/attorney');

  const attorneyName = lawyer.isFirmAccount ? null : (`${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim() || null);

  return (
    <div className="space-y-6">
      <PageHeader title={t('refListTitle')} subtitle={t('refListSubtitle')} />
      <ReferralsClient
        locale={locale}
        firmName={lawyer.firmName ?? '—'}
        attorneyName={attorneyName}
        abrirNuevo={abrirNuevo === '1'}
      />
      <CaseUrlModal caseId={caseId} tab={tab} variant="attorney" />
    </div>
  );
}
