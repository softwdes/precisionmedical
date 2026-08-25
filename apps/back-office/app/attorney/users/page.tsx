import { redirect } from 'next/navigation';
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerMemberFilter, canSeeMenu, lawyerCaseFilter } from '@/lib/attorney-portal';
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
      address: true, city: true, state: true, zip: true,
    },
  });

  // El acceso al portal vive en el directorio Admin, otra base: se resuelve en
  // un solo viaje para toda la lista (ver `lib/lawyer-access.ts`).
  const access = await getLawyerAccessMap(members.map((m) => m.email));

  /**
   * Carga de trabajo por miembro — lo que el modal de v2 muestra de más.
   *
   * Se cuenta con tres `groupBy` y no con el `_count` de la relación porque el
   * conteo tiene que respetar el ALCANCE de la sesión: un gestor solo ve sus
   * casos, así que su vista del despacho no puede contar los del resto. El
   * `_count` de Prisma cuenta la relación entera, sin ese filtro.
   */
  const scope = lawyerCaseFilter(lawyer);
  const [byAttorney, byParalegal, byAssistant] = await Promise.all([
    db.case.groupBy({ by: ['attorneyId'],       where: { AND: [scope, { attorneyId:       { not: null } }] }, _count: true }),
    db.case.groupBy({ by: ['paralegalId'],      where: { AND: [scope, { paralegalId:      { not: null } }] }, _count: true }),
    // Los asistentes viven en su propia tabla (varios por caso), así que se
    // cuentan desde ahí y no con un `groupBy` sobre la columna vieja.
    db.caseLegalAssistant.groupBy({ by: ['lawyerId'], where: { case: scope }, _count: true }),
  ]);

  const toMap = (rows: Array<{ _count: number } & Record<string, unknown>>, key: string): Map<string, number> =>
    new Map(rows.flatMap((r) => {
      const id = r[key];
      return typeof id === 'string' ? [[id, r._count] as [string, number]] : [];
    }));

  const attorneyCount  = toMap(byAttorney,  'attorneyId');
  const paralegalCount = toMap(byParalegal, 'paralegalId');
  const assistantCount = toMap(byAssistant, 'lawyerId');

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
    address: [m.address, m.city, m.state, m.zip].filter(Boolean).join(', ') || null,
    access: m.email ? (access[m.email.toLowerCase()] ?? 'none') : 'none',
    caseLoad: {
      attorney:  attorneyCount.get(m.id)  ?? 0,
      paralegal: paralegalCount.get(m.id) ?? 0,
      assistant: assistantCount.get(m.id) ?? 0,
    },
  }));

  return <AttorneyUsersClient members={rows} />;
}
