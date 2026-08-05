/**
 * Tutor / apoderado de un paciente menor de edad.
 *
 * El tutor SIEMPRE termina siendo un `Patient` vinculado por
 * `Patient.guardianPatientId`. Los campos de texto `guardianName` /
 * `guardianPhone` son legado y no se escriben desde acá: si el correo del tutor
 * cambia, tiene que cambiar en UN solo lugar (su propia ficha) y heredarlo
 * todos sus hijos. Ver docs/plan-tutor-legal.md §3.2.
 *
 * Esta regla vivía escrita a mano dentro de `POST /api/admin/cases`. Se extrajo
 * porque ahora hay tres lugares que la necesitan — el alta de caso, el PATCH de
 * paciente y la re-migración v2→v3 — y con un criterio por callsite terminarían
 * conviviendo tres reglas distintas en la misma tabla (es exactamente lo que ya
 * pasó con los generadores de código, ver codes.ts).
 *
 * IMPORTANTE: se llama con el `tx` de una transacción, la MISMA en la que se
 * crea o actualiza el menor. `nextPatientCode` toma un advisory lock que vive
 * con la transacción, y además así no puede quedar un apoderado huérfano si
 * algo falla después.
 *
 *     await db.$transaction(async (tx) => {
 *       const g = await resolveGuardian(tx, payload.guardian, { forPatientId: id });
 *       await tx.patient.update({ where: { id }, data: { guardianPatientId: g.guardianPatientId } });
 *     });
 */

import type { Prisma } from '@prisma/client';
import { nextPatientCode } from './codes';

export const GUARDIAN_RELATIONS = ['MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER'] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

export interface GuardianInput {
  /** Con valor → vincular a un paciente que ya existe. */
  patientId?:   string | null;
  firstName?:   string;
  lastName?:    string;
  email?:       string | null;
  phone?:       string;
  /** `YYYY-MM-DD` o ISO completo. */
  dateOfBirth?: string | null;
  relation?:    GuardianRelation;
}

export type GuardianAction =
  /** No vino nada útil — el caller no debe tocar `guardianPatientId`. */
  | 'none'
  /** Se vinculó al paciente que eligió el usuario en el buscador. */
  | 'linked'
  /** No se eligió a nadie, pero ya había un paciente con ese correo. */
  | 'reused'
  /** Se creó una ficha de paciente nueva para el tutor. */
  | 'created';

export interface GuardianResolution {
  guardianPatientId: string | null;
  action: GuardianAction;
}

/**
 * El tutor no puede ser el propio paciente. Es un error de datos, no un caso
 * borde a resolver en silencio: si se dejara pasar, el menor quedaría siendo su
 * propio tutor y el formulario de admisión se le enviaría a él mismo.
 */
export class GuardianIsSelfError extends Error {
  constructor() {
    super('El tutor no puede ser el mismo paciente.');
    this.name = 'GuardianIsSelfError';
  }
}

export interface ResolveGuardianOptions {
  /**
   * Id del menor al que se le está asignando el tutor, cuando ya existe.
   *
   * Se usa para EXCLUIRLO del dedupe por correo. Sin esto, un menor que quedó
   * con el correo de su tutor guardado en su propia ficha (así se cargaban
   * antes, cuando el menor no tenía correo propio) hace que la búsqueda por
   * correo lo encuentre a él y se vincule como su propio tutor, en silencio.
   */
  forPatientId?: string | null;
}

/**
 * Devuelve el `guardianPatientId` que corresponde al payload, creando la ficha
 * del tutor si hace falta.
 *
 * Orden de resolución:
 *   1. `patientId` presente → se vincula, sin más preguntas (lo eligió alguien
 *      en el buscador).
 *   2. Nombre y apellido presentes → si ya hay un paciente con ese correo se
 *      reutiliza (el buscador del UI puede haberse salteado), y si no se crea
 *      una ficha nueva SIN caso, para que quede disponible para sus propias
 *      citas y casos futuros.
 *   3. Nada de lo anterior → `action: 'none'`.
 *
 * El dedupe es SOLO por correo a propósito. Por teléfono no se puede: están
 * guardados con formato (`(801) 555-1121`) y una comparación cruda no matchea
 * nunca — habría que normalizar a dígitos en los dos lados (ver lib/phone.ts).
 */
export async function resolveGuardian(
  tx: Prisma.TransactionClient,
  guardian: GuardianInput | null | undefined,
  options: ResolveGuardianOptions = {},
): Promise<GuardianResolution> {
  if (!guardian) return { guardianPatientId: null, action: 'none' };

  const self = options.forPatientId ?? null;

  if (guardian.patientId) {
    if (self && guardian.patientId === self) throw new GuardianIsSelfError();
    return { guardianPatientId: guardian.patientId, action: 'linked' };
  }

  const firstName = (guardian.firstName ?? '').trim();
  const lastName  = (guardian.lastName  ?? '').trim();
  if (!firstName || !lastName) return { guardianPatientId: null, action: 'none' };

  const email = guardian.email?.trim() || null;

  if (email) {
    const existing = await tx.patient.findFirst({
      where: { email, ...(self ? { id: { not: self } } : {}) },
      select: { id: true },
    });
    if (existing) return { guardianPatientId: existing.id, action: 'reused' };
  }

  const created = await tx.patient.create({
    data: {
      patientCode: await nextPatientCode(tx),
      firstName,
      lastName,
      email,
      // null, no '' — un string vacío se lee como "teléfono presente pero en
      // blanco" en varias vistas.
      phone:       guardian.phone?.trim() || null,
      dateOfBirth: parseGuardianDob(guardian.dateOfBirth),
      status:      'NEW',
    },
    select: { id: true },
  });

  return { guardianPatientId: created.id, action: 'created' };
}

/**
 * Mediodía UTC para las fechas `YYYY-MM-DD`: a medianoche, cualquier zona al
 * oeste de UTC lee el día anterior y la fecha de nacimiento se corre un día.
 */
function parseGuardianDob(raw: string | null | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}
