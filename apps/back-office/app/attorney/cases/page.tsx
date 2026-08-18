import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerMemberFilter, canAssignStaff } from '@/lib/attorney-portal';
import { AttorneyCasesClient, type FirmMember } from './cases-client';

/**
 * Portal Legal · Casos
 *
 * El listado se pide por API (búsqueda, filtro y paginación viven en el
 * cliente), pero los MIEMBROS del despacho se resuelven acá: son las opciones de
 * los tres selectores de asignación y no cambian mientras se navega la tabla.
 */
export default async function AttorneyCasesPage(): Promise<React.ReactElement> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return <></>;

  const members = await db.lawyer.findMany({
    where: { ...lawyerMemberFilter(lawyer), status: 'ACTIVE' },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, memberRole: true },
  });

  const options: FirmMember[] = members.map((m) => ({
    id: m.id,
    name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || '—',
    role: m.memberRole,
  }));

  return (
    <AttorneyCasesClient
      members={options}
      // Gestores y asistentes trabajan los casos pero no reparten el trabajo del
      // despacho: eso es del titular. Es solo la mitad visual de la regla — la
      // API valida el alcance por su cuenta.
      canAssign={canAssignStaff(lawyer)}
    />
  );
}
