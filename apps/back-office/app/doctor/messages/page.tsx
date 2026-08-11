/**
 * M1 F2 · Inbox de mensajería interna — /doctor/messages
 *
 * Mismo InboxClient que /messages: la mensajería es UN sistema compartido
 * entre el módulo Clínica y el portal médico (decisión de Erick 2026-08-07).
 *
 * `?case=` abre el caso del hilo sobre esta pantalla; el server revalida que el
 * caso tenga una cita de este doctor antes de mostrarlo.
 */

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { getSessionProvider } from '@/lib/get-session-provider';
import { InboxClient } from '@/components/messaging/inbox-client';
import { CaseUrlModal } from '@/components/cases/case-url-modal';

export default async function DoctorMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; tab?: string }>;
}): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user?.email) redirect('/login');

  const dbUser = await getDbUserByEmail(user.email);
  if (!dbUser) redirect('/login');

  const [provider, { case: caseId, tab }] = await Promise.all([
    getSessionProvider(),
    searchParams,
  ]);

  return (
    <>
      <InboxClient
        currentUserId={dbUser.id}
        currentUserName={`${dbUser.firstName} ${dbUser.lastName}`.trim()}
        isAdmin={dbUser.role === 'SUPER_ADMIN' || dbUser.role === 'ADMIN'}
      />
      <CaseUrlModal caseId={caseId} tab={tab} variant="doctor" providerId={provider?.id} />
    </>
  );
}
