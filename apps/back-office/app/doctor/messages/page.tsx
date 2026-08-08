/**
 * M1 F2 · Inbox de mensajería interna — /doctor/messages
 *
 * Mismo InboxClient que /messages: la mensajería es UN sistema compartido
 * entre el módulo Clínica y el portal médico (decisión de Erick 2026-08-07).
 */

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { InboxClient } from '@/components/messaging/inbox-client';

export default async function DoctorMessagesPage(): Promise<React.ReactElement> {
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
