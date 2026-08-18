import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@precision-medical/database';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';

/**
 * Resuelve el ABOGADO de la sesión actual — espejo de `get-session-provider.ts`.
 *
 * Puente por EMAIL, igual que el portal médico: la sesión vive en el proyecto
 * Admin (login unificado) y la ficha del abogado vive en Phoenix, así que el
 * email es la única llave común. `lawyers.userId` existe en el esquema pero hoy
 * está vacío en las 89 filas y NO se usa como llave: sería un segundo camino
 * para responder la misma pregunta, y el que se desincroniza es siempre el que
 * nadie mira. Se llena como denormalización, nunca se lee para autorizar.
 *
 * Devuelve null si no hay sesión, si el email no corresponde a ningún abogado,
 * o si la ficha está archivada — un `null` acá significa "esta persona no entra
 * al portal legal", y todo el scoping de datos cuelga de eso.
 */
export interface SessionLawyer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** ATTORNEY · CASE_MANAGER · PARALEGAL · LEGAL_ASSISTANT · OTHER (null si es el bufete) */
  memberRole: string | null;
  /** Bufete al que pertenece: su `parentFirmId`, o él mismo si la ficha ES el bufete. */
  firmId: string | null;
  firmName: string | null;
  /** true cuando la sesión es la cuenta del bufete y no la de una persona. */
  isFirmAccount: boolean;
}

const LAWYER_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  entityType: true,
  memberRole: true,
  parentFirmId: true,
  firmName: true,
  status: true,
  parentFirm: { select: { firmName: true } },
} as const;

type LawyerRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  entityType: string;
  memberRole: string | null;
  parentFirmId: string | null;
  firmName: string | null;
  parentFirm: { firmName: string | null } | null;
};

/**
 * "Pertenecer a un bufete" se decide por `parentFirmId`, NO por `entityType`.
 *
 * Los 69 miembros migrados son `FIRM_MEMBER`, pero el alta de miembros
 * (`/api/admin/lawyers/members`) los crea como `INDEPENDENT` con `parentFirmId`
 * puesto. Las dos formas conviven en la tabla, así que mirar el enum dejaría a
 * los miembros nuevos sin bufete — y sin bufete no hay scoping, que es
 * exactamente el fallo que no podemos permitirnos acá.
 */
function toSessionLawyer(row: LawyerRow): SessionLawyer {
  const isFirmAccount = row.parentFirmId === null;

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    memberRole: row.memberRole,
    firmId: row.parentFirmId ?? (isFirmAccount ? row.id : null),
    firmName: row.parentFirm?.firmName ?? row.firmName,
    isFirmAccount,
  };
}

/**
 * Cookie del modo "ver como bufete" — espejo de `pm_doctor_view`.
 *
 * Solo la respetan los admins (ver `canViewAsLawyer`). Un abogado que se la
 * ponga a mano no consigue nada: sin rol admin se ignora y cae a su propia
 * ficha. Es la misma regla del portal médico, y por el mismo motivo — suplantar
 * a otro despacho no puede depender de algo que el cliente controla.
 */
export const ATTORNEY_VIEW_COOKIE = 'pm_attorney_view';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

/** ¿Puede este usuario abrir el portal de un bufete que no es suyo? */
export const canViewAsLawyer = cache(async (email: string): Promise<boolean> =>
  ADMIN_ROLES.has(await fetchDbRole(email)),
);

const getOwnLawyer = cache(async (email: string): Promise<SessionLawyer | null> => {
  const row = await db.lawyer.findFirst({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      email: { equals: email, mode: 'insensitive' },
    },
    select: LAWYER_FIELDS,
  });
  return row ? toSessionLawyer(row as LawyerRow) : null;
});

/**
 * Memorizado por request: el layout, el menú y cada página del portal lo van a
 * consultar, y detrás hay una llamada de red a Auth (~180 ms) más la query.
 */
export const getSessionLawyer = cache(async (): Promise<SessionLawyer | null> => {
  const user = await getSessionUser();
  if (!user?.email) return null;

  // 1. Bufete elegido con el selector — gana incluso sobre la ficha propia, para
  //    que un admin con ficha de abogado no pierda el selector (la misma
  //    corrección que ya se hizo en el portal médico).
  const selectedId = (await cookies()).get(ATTORNEY_VIEW_COOKIE)?.value;
  if (selectedId && await canViewAsLawyer(user.email)) {
    const chosen = await db.lawyer.findFirst({
      where: { id: selectedId, deletedAt: null },
      select: LAWYER_FIELDS,
    });
    if (chosen) return toSessionLawyer(chosen as LawyerRow);
  }

  // 2. Su propia ficha
  return getOwnLawyer(user.email);
});
