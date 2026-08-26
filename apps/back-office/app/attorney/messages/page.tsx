import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui-phoenix';
import { getSessionLawyer, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { getSessionUser } from '@/lib/session';
import { canSeeMessages } from '@/lib/attorney-portal';
import { AttorneyInbox } from './inbox-client';

/**
 * Portal Legal · Mensajes
 *
 * Va detrás de la misma puerta que Vigía mientras se construye: es la otra mitad
 * del pedido —sin bandeja, la respuesta de la clínica no llega a ningún lado— y
 * no tiene sentido mostrarle una a un bufete que todavía no puede pedir nada.
 */
export default async function AttorneyMessagesPage(): Promise<React.ReactElement> {
  const [lawyer, user, t, locale] = await Promise.all([
    getSessionLawyer(),
    getSessionUser(),
    getTranslations('phoenix.attorney'),
    getLocale(),
  ]);
  if (!lawyer) return <></>;

  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  if (!canSeeMessages(lawyer, isAdminViewer)) redirect('/attorney');

  return (
    <div className="space-y-6">
      <PageHeader title={t('msgTitle')} subtitle={t('msgSubtitle')} />
      <AttorneyInbox locale={locale} />
    </div>
  );
}
