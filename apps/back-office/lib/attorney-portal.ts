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

export type AttorneyMenu = 'panel' | 'vigia' | 'messages' | 'cases' | 'users' | 'appointments';

export const ATTORNEY_MENU_HOME: Record<AttorneyMenu, string> = {
  panel:        '/attorney',
  vigia:        '/attorney/vigia',
  messages:     '/attorney/messages',
  cases:        '/attorney/cases',
  users:        '/attorney/users',
  appointments: '/attorney/appointments',
};

/**
 * Vigía todavía NO se le muestra al bufete.
 *
 * El portal está en producción y esta pantalla se está construyendo: mostrarle
 * a Garcia Law un tablero a medio hacer es peor que no mostrarle nada. Mientras
 * esto sea `true` solo la ven los admins, que entran con "ver como bufete" —
 * exactamente el mismo camino por el que se prueban las demás pantallas.
 *
 * Cuando el board esté terminado se pone en `false` y aparece para todos. Es la
 * única línea que hay que tocar: el menú, la ruta y la página ya preguntan por
 * esto (`canSeeVigia`), así que no se puede encender a medias.
 */
export const VIGIA_EN_CONSTRUCCION = true;

/**
 * ¿Ve esta persona el menú de Vigía?
 *
 * Va aparte de `canSeeMenu()` porque la pregunta tiene un segundo factor que no
 * sale de la ficha del abogado: si quien mira es un admin de la clínica. Sin
 * ese dato el layout tendría que repetir la condición a mano en cada lugar, y
 * el día que se encienda habría que acordarse de todos.
 */
export function canSeeVigia(lawyer: SessionLawyer, isAdminViewer: boolean): boolean {
  // Vale para Vigía y para Mensajes: son la ida y la vuelta del mismo pedido.
  if (!canSeeMenu(lawyer, 'vigia')) return false;
  return VIGIA_EN_CONSTRUCCION ? isAdminViewer : true;
}

/**
 * El abogado titular (y la cuenta del bufete) manejan el despacho entero.
 * Gestores y asistentes solo trabajan casos — no dan de alta gente ni miran la
 * agenda completa.
 */
// Vigía lo ven todos los del despacho: lo que cambia entre roles es el ALCANCE
// —un gestor pregunta sobre sus casos, no sobre los del bufete entero— y eso ya
// lo gobierna `lawyerCaseFilter()`, no el menú.
const FULL_MENUS: AttorneyMenu[] = ['panel', 'vigia', 'messages', 'cases', 'users', 'appointments'];
const STAFF_MENUS: AttorneyMenu[] = ['panel', 'vigia', 'messages', 'cases'];

export function menusFor(lawyer: SessionLawyer): AttorneyMenu[] {
  if (lawyer.isFirmAccount) return FULL_MENUS;
  return lawyer.memberRole === 'ATTORNEY' ? FULL_MENUS : STAFF_MENUS;
}

export function canSeeMenu(lawyer: SessionLawyer, menu: AttorneyMenu): boolean {
  return menusFor(lawyer).includes(menu);
}

/**
 * ¿Puede firmar el lien?
 *
 * TODOS los miembros del despacho (Erick, 2026-08-20 — corrige la definición
 * anterior, que lo limitaba al rol Abogado). A los gestores y asistentes se les
 * asignan casos para que hagan el seguimiento a pedido del abogado, y firmar es
 * parte de ese trabajo. Lo que separa a los roles es **qué ven**, no qué pueden
 * hacer: eso lo gobierna `lawyerCaseFilter()`.
 *
 * El alcance sigue protegiendo igual: un gestor solo puede firmar los casos que
 * ve, o sea aquellos donde figura asignado.
 */
export function canSignLien(_lawyer: SessionLawyer): boolean {
  return true;
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
      { attorney:  { parentFirmId: lawyer.firmId } },
      { paralegal: { parentFirmId: lawyer.firmId } },
      // Los asistentes son VARIOS por caso: se pregunta por la tabla, no por
      // una columna. `some` = "alguno de los asistentes es de este bufete".
      { legalAssistants: { some: { lawyer: { parentFirmId: lawyer.firmId } } } },
    ],
  };

  // Solo la CUENTA DEL BUFETE ve el despacho entero.
  if (lawyer.isFirmAccount) {
    return { deletedAt: null, ...belongsToFirm };
  }

  // Toda PERSONA —abogado incluido— ve únicamente los casos donde figura
  // (Erick, 2026-08-21: un abogado no ve los casos de otro abogado del mismo
  // despacho). Antes el rol Abogado veía todo el bufete.
  //
  // Consecuencia asumida: un caso del bufete SIN nadie asignado no lo ve nadie
  // del despacho — en Garcia Law son 14 de 90. Esos casos siguen siendo
  // visibles y asignables desde la clínica (Externals), que es de donde salen
  // las asignaciones.
  //
  // Se mantiene el ancla al bufete además del match personal: si alguien
  // quedara asignado a un caso de otro despacho por un error de datos, el
  // bufete sigue mandando.
  return {
    deletedAt: null,
    AND: [
      belongsToFirm,
      {
        OR: [
          { attorneyId:  lawyer.id },
          { paralegalId: lawyer.id },
          { legalAssistants: { some: { lawyerId: lawyer.id } } },
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

// ─── Filtros de la lista de casos ────────────────────────────────────────────
//
// Viven acá y no en la ruta porque los usan los DOS lados: la API para filtrar
// y el Panel para armar los links de sus KPIs. Si cada uno definiera "activo"
// por su cuenta, el número del KPI y el de la lista dejarían de coincidir en
// cuanto alguien agregue un estado — que es justo lo que Erick va a hacer.

/** Estados que cuentan como "caso abierto". */
export const ACTIVE_STATUSES = [
  'NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED', 'ACTIVE', 'MMI',
] as const;

/** Estados que cuentan como "caso cerrado". */
export const CLOSED_STATUSES = ['CLOSED', 'SETTLED', 'ARCHIVED'] as const;

/** Grupos que acepta el parámetro `status` además de un estado suelto. */
export const STATUS_GROUPS: Record<string, readonly string[]> = {
  active: ACTIVE_STATUSES,
  completed: CLOSED_STATUSES,
};

export type SignatureFilter = 'pending' | 'signed';

/**
 * Traduce los filtros de la URL a un `where` de Prisma.
 *
 * `status` acepta un GRUPO (`active`, `completed`) o un estado suelto
 * (`ACTIVE`). Un valor que no sea ninguno de los dos se ignora en vez de
 * devolver cero resultados: un parámetro viejo pegado en un favorito no debería
 * hacer creer al bufete que se quedó sin casos.
 *
 * `signature` mira SOLO la firma del abogado, y los casos exentos quedan fuera
 * de "pendiente" — nunca van a firmarse.
 */
export interface CaseListParams {
  status?: string;
  signature?: string;
  /** Id de un miembro del despacho — casos donde figura en cualquiera de los tres puestos. */
  assignee?: string;
  /** Acota el filtro anterior a UN puesto. Sin esto, cuenta los tres. */
  assigneeRole?: string;
}

/** Columna del caso que corresponde a cada puesto de UNA sola persona. */
const ASSIGNEE_COLUMN: Record<string, 'attorneyId' | 'paralegalId'> = {
  attorney:  'attorneyId',
  paralegal: 'paralegalId',
};

export function caseListFilters({
  status, signature, assignee, assigneeRole,
}: CaseListParams): Prisma.CaseWhereInput {
  const where: Prisma.CaseWhereInput = {};

  if (status) {
    const group = STATUS_GROUPS[status];
    if (group) where.status = { in: group as unknown as never[] };
    else if (ALL_STATUSES.includes(status)) where.status = status as never;
  }

  if (signature === 'pending') {
    where.signatureExempt = false;
    where.lienSignatures = { none: { signerType: 'ATTORNEY' } };
  } else if (signature === 'signed') {
    where.lienSignatures = { some: { signerType: 'ATTORNEY' } };
  }

  // Filtrar por persona NO amplía el alcance: esto se combina con
  // `lawyerCaseFilter()`, que ya ancló al bufete. Un id de otro despacho acá
  // devuelve cero casos, no los suyos.
  if (assignee) {
    // El puesto de asistente no es una columna: son varios por caso.
    if (assigneeRole === 'assistant') {
      where.legalAssistants = { some: { lawyerId: assignee } };
      return where;
    }
    const column = assigneeRole ? ASSIGNEE_COLUMN[assigneeRole] : undefined;
    if (column) {
      where[column] = assignee;
    } else {
      // Sin puesto: cuenta en cualquiera de los tres. Va en `AND` y no en `OR`
      // suelto porque `lawyerCaseFilter` ya usa `OR` a nivel raíz para el
      // bufete — pisarlo dejaría entrar casos ajenos.
      where.AND = [{
        OR: [
          { attorneyId: assignee },
          { paralegalId: assignee },
          { legalAssistants: { some: { lawyerId: assignee } } },
        ],
      }];
    }
  }

  return where;
}

/** Todos los estados válidos — para distinguir un estado suelto de un valor basura. */
const ALL_STATUSES: string[] = [...ACTIVE_STATUSES, ...CLOSED_STATUSES, 'CANCELLED'];
