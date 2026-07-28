/**
 * Códigos consecutivos de caso y paciente — estilo v2.
 *
 * Antes cada endpoint generaba su propio formato y así llegamos a tener cinco
 * convenciones distintas conviviendo en la misma tabla:
 *
 *   casos      MVA-2962 (v2) · CASE-1152 (v2) · CASE-7872859RX · WI-2026-12345
 *   pacientes  P-4582 (v2)   · PT-787285ET9   · PAT-UWQYDX     · PM-123456
 *
 * De ahí que esto viva en el paquete compartido y no en cada ruta: mientras
 * hubo un generador por endpoint, cada endpoint nuevo agregó un formato nuevo.
 *
 * ── Numeración ────────────────────────────────────────────────────────────
 * El número es GLOBAL por entidad, compartido entre prefijos. Así lo hacía v2:
 * MVA-2865..2962 cae DENTRO del rango de CASE-1..3129, o sea el número era
 * único y el prefijo solo una etiqueta. Con series separadas por prefijo
 * existirían MVA-3130 y CASE-3130 a la vez, que para soporte telefónico es un
 * problema.
 *
 * ── Concurrencia ──────────────────────────────────────────────────────────
 * "Leer el máximo y sumar 1" es una carrera: dos requests simultáneas leen el
 * mismo número y una revienta contra el @unique. Cada función toma un advisory
 * lock, así que el caller no puede olvidarse de hacerlo.
 *
 * IMPORTANTE: hay que llamarlas dentro de una transacción y hacer el INSERT en
 * esa misma transacción. `pg_advisory_xact_lock` vive lo que vive la
 * transacción; si se llama fuera de una, el lock se libera de inmediato y la
 * protección desaparece en silencio.
 *
 *     await db.$transaction(async (tx) => {
 *       const code = await nextPatientCode(tx);
 *       await tx.patient.create({ data: { patientCode: code, ... } });
 *     });
 */

import type { Prisma } from '@prisma/client';

/**
 * Solo se consideran códigos de hasta 6 dígitos.
 *
 * Los formatos viejos podían producir números mucho más grandes que la serie
 * real: `PM-123456` o un `CASE-787285123` (la parte aleatoria en base36 puede
 * salir toda en dígitos). Uno solo de esos dejaría el contador disparado para
 * siempre, porque el máximo nunca volvería a bajar.
 */
const SOLO_SERIE = '^[A-Z]+-[0-9]{1,6}$';

async function tomarLock(tx: Prisma.TransactionClient, clave: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`;
}

/**
 * Siguiente código de caso: `MVA-3130`, `CASE-3131`, `WI-3132`, …
 *
 * @param prefix etiqueta del tipo de caso — no afecta la numeración.
 */
export async function nextCaseCode(
  tx: Prisma.TransactionClient,
  prefix = 'CASE',
): Promise<string> {
  await tomarLock(tx, 'pm:case_code');
  const rows = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT MAX(split_part("caseCode", '-', 2)::int) AS max_num
      FROM cases
     WHERE "caseCode" ~ ${SOLO_SERIE}
  `;
  return `${prefix}-${(rows[0]?.max_num ?? 0) + 1}`;
}

/**
 * Siguiente código de paciente: `P-6993`, `P-6994`, …
 *
 * El prefijo es `P` porque es el de los 5878 pacientes migrados del v2; los
 * `PT-`/`PAT-`/`PM-` fueron variantes que introdujo cada endpoint.
 */
export async function nextPatientCode(
  tx: Prisma.TransactionClient,
  prefix = 'P',
): Promise<string> {
  await tomarLock(tx, 'pm:patient_code');
  const rows = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT MAX(split_part("patientCode", '-', 2)::int) AS max_num
      FROM patients
     WHERE "patientCode" ~ ${SOLO_SERIE}
  `;
  return `${prefix}-${(rows[0]?.max_num ?? 0) + 1}`;
}
