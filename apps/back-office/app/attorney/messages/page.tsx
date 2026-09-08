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
export default async function AttorneyMessagesPage({ searchParams }: {
  searchParams: Promise<{ thread?: string }>;
}): Promise<React.ReactElement> {
  const [lawyer, user, t, locale, { thread }] = await Promise.all([
    getSessionLawyer(),
    getSessionUser(),
    getTranslations('phoenix.attorney'),
    getLocale(),
    searchParams,
  ]);
  if (!lawyer) return <></>;

  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  if (!canSeeMessages(lawyer, isAdminViewer)) redirect('/attorney');

  return (
    <div className="space-y-6">
      <PageHeader title={t('msgTitle')} subtitle={t('msgSubtitle')} />
      {/* `?thread=` es el link que viaja en el aviso por correo: abre ese hilo. */}
      <AttorneyInbox locale={locale} initialThreadId={thread ?? null} />
    </div>
  );
}
