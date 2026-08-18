import type { Prisma } from '@precision-medical/database';
import type { SessionLawyer } from './get-session-lawyer';

/**
 * Portal Legal · qué ve cada persona del despacho.
 *
 * Dos capas distintas, a propósito:
 *  · MENÚS  — qué pantallas aparecen. Es cosmética: esconder un menú no protege
 *             nada, porque la URL se escribe a mano.
 *  · ALCANCE — qué filas devuelve la base. Es lo único que protege de verdad, y
 *             por eso `lawyerCaseFilter()` se arma SIEMPRE desde la sesión y
 *             nunca desde un parámetro que mande el cliente.
 *
 * Espejo de la separación que ya existe en el back-office entre `clinicModules`
 * (menús) y los guards de API del middleware.
 */

export type AttorneyMenu = 'panel' | 'cases' | 'users' | 'appointments';

export const ATTORNEY_MENU_HOME: Record<AttorneyMenu, string> = {
  panel:        '/attorney',
  cases:        '/attorney/cases',
  users:        '/attorney/users',
  appointments: '/attorney/appointments',
};

/**
 * El abogado titular (y la cuenta del bufete) manejan el despacho entero.
 * Gestores y asistentes solo trabajan casos — no dan de alta gente ni miran la
 * agenda completa.
 */
const FULL_MENUS: AttorneyMenu[] = ['panel', 'cases', 'users', 'appointments'];
const STAFF_MENUS: AttorneyMenu[] = ['panel', 'cases'];

export function menusFor(lawyer: SessionLawyer): AttorneyMenu[] {
  if (lawyer.isFirmAccount) return FULL_MENUS;
  return lawyer.memberRole === 'ATTORNEY' ? FULL_MENUS : STAFF_MENUS;
}

export function canSeeMenu(lawyer: SessionLawyer, menu: AttorneyMenu): boolean {
  return menusFor(lawyer).includes(menu);
}

/**
 * ¿Puede repartir el trabajo del despacho (asignar abogado/paralegal/asistente)?
 *
 * Solo el titular y la cuenta del bufete. Va aparte de `canSeeMenu('users')`
 * aunque hoy coincidan: son dos preguntas distintas —"¿ve el directorio?" y
 * "¿reparte casos?"— y atarlas a la misma llave haría que cambiar una mueva la
 * otra sin que nadie lo note.
 */
export function canAssignStaff(lawyer: SessionLawyer): boolean {
  return lawyer.isFirmAccount || lawyer.memberRole === 'ATTORNEY';
}

/**
 * Filtro de casos visibles para esta sesión — la pieza central del scoping.
 *
 * Devuelve un fragmento de `where` de Prisma que SIEMPRE ancla al bufete. Las
 * cuatro columnas legales del caso (`lawFirmId`, `attorneyId`, `paralegalId`,
 * `legalAssistantId`) apuntan a fichas distintas, así que un miembro puede
 * figurar en un caso por cualquiera de ellas: el gestor asignado a un caso lo ve
 * aunque el `lawFirmId` esté vacío, que es la situación real de buena parte de
 * los casos migrados.
 *
 * `firmId` nulo devuelve un filtro imposible en vez de uno vacío. Un `where: {}`
 * acá no sería "sin resultados" sino "todos los casos de la clínica" — el fallo
 * silencioso más caro que podríamos cometer en este módulo.
 */
export function lawyerCaseFilter(lawyer: SessionLawyer): Prisma.CaseWhereInput {
  if (!lawyer.firmId) return { id: { in: [] } };

  const belongsToFirm: Prisma.CaseWhereInput = {
    OR: [
      { lawFirmId: lawyer.firmId },
      { attorney:       { parentFirmId: lawyer.firmId } },
      { paralegal:      { parentFirmId: lawyer.firmId } },
      { legalAssistant: { parentFirmId: lawyer.firmId } },
    ],
  };

  // El titular y la cuenta del bufete ven todo el despacho.
  if (lawyer.isFirmAccount || lawyer.memberRole === 'ATTORNEY') {
    return { deletedAt: null, ...belongsToFirm };
  }

  // El resto solo los casos donde figura. Se mantiene el ancla al bufete además
  // del match personal: si alguien quedara asignado a un caso de otro despacho
  // por un error de datos, el bufete sigue mandando.
  return {
    deletedAt: null,
    AND: [
      belongsToFirm,
      {
        OR: [
          { attorneyId:       lawyer.id },
          { paralegalId:      lawyer.id },
          { legalAssistantId: lawyer.id },
        ],
      },
    ],
  };
}

/** Miembros del despacho visibles para esta sesión (tab Usuarios). */
export function lawyerMemberFilter(lawyer: SessionLawyer): Prisma.LawyerWhereInput {
  if (!lawyer.firmId) return { id: { in: [] } };
  return { deletedAt: null, parentFirmId: lawyer.firmId };
}
