/**
 * M1 F2 · Inbox de mensajería interna — /messages
 *
 * Server component: resuelve el usuario de sesión (users.id cuid de Phoenix +
 * rol) y monta el InboxClient compartido. El portal médico tiene su gemelo en
 * /doctor/messages con el mismo client.
 *
 * `?case=` abre el detalle del caso del hilo SOBRE esta pantalla: al cerrarlo,
 * el hilo sigue abierto con su borrador intacto (el client se repliega, no se
 * desmonta). Mismo mecanismo que el calendario y la lista de pacientes.
 */

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { InboxClient } from '@/components/messaging/inbox-client';
import { CaseUrlModal } from '@/components/cases/case-url-modal';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; tab?: string }>;
}): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user?.email) redirect('/login');

  const dbUser = await getDbUserByEmail(user.email);
  if (!dbUser) redirect('/login');

  const { case: caseId, tab } = await searchParams;

  return (
    <>
      <InboxClient
        currentUserId={dbUser.id}
        currentUserName={`${dbUser.firstName} ${dbUser.lastName}`.trim()}
        isAdmin={dbUser.role === 'SUPER_ADMIN' || dbUser.role === 'ADMIN'}
      />
      <CaseUrlModal caseId={caseId} tab={tab} />
    </>
  );
}
