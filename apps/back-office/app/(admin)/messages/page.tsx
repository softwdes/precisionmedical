/**
 * M1 F2 · Inbox de mensajería interna — /messages
 *
 * Server component: resuelve el usuario de sesión (users.id cuid de Phoenix +
 * rol) y monta el InboxClient compartido. El portal médico tiene su gemelo en
 * /doctor/messages con el mismo client.
 */

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { InboxClient } from '@/components/messaging/inbox-client';

export default async function MessagesPage(): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user?.email) redirect('/login');

  const dbUser = await getDbUserByEmail(user.email);
  if (!dbUser) redirect('/login');

  return (
    <InboxClient
      currentUserId={dbUser.id}
      currentUserName={`${dbUser.firstName} ${dbUser.lastName}`.trim()}
      isAdmin={dbUser.role === 'SUPER_ADMIN' || dbUser.role === 'ADMIN'}
    />
  );
}
