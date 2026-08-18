import { redirect } from 'next/navigation';
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerMemberFilter, canSeeMenu } from '@/lib/attorney-portal';
import { getLawyerAccessMap } from '@/lib/lawyer-access';
import { AttorneyUsersClient, type MemberRow } from './users-client';

/**
 * Portal Legal · Usuarios del despacho
 *
 * El menú ya no se le muestra a gestores ni asistentes, pero la página vuelve a
 * preguntar: esconder un link no impide escribir la URL.
 */
export default async function AttorneyUsersPage(): Promise<React.ReactElement> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return <></>;
  if (!canSeeMenu(lawyer, 'users')) redirect('/attorney');

  const members = await db.lawyer.findMany({
    where: lawyerMemberFilter(lawyer),
    orderBy: [{ memberRole: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      memberRole: true, barNumber: true, status: true, createdAt: true,
    },
  });

  // El acceso al portal vive en el directorio Admin, otra base: se resuelve en
  // un solo viaje para toda la lista (ver `lib/lawyer-access.ts`).
  const access = await getLawyerAccessMap(members.map((m) => m.email));

  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone,
    memberRole: m.memberRole,
    barNumber: m.barNumber,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    access: m.email ? (access[m.email.toLowerCase()] ?? 'none') : 'none',
  }));

  return <AttorneyUsersClient members={rows} />;
}
