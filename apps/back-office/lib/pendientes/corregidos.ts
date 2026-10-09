/**
 * Lo que YA se corrigió: el historial de "Mis pendientes" y de la vista del equipo.
 *
 * ── Por qué sale de lo que ya queda escrito ────────────────────────────────
 *
 * Los detectores de `./index.ts` calculan lo que está mal AHORA: cuando algo se
 * corrige, deja de detectarse y no queda rastro de que alguna vez lo estuvo. Una
 * tabla `incidencias` que lo guarde desde que nace es la forma completa, y está
 * en el plan (Fase 2); necesita `prisma db push`, que hoy falla por el drift de
 * `braceId`. Mientras tanto este módulo reconstruye lo que SÍ quedó escrito:
 *
 *  · citas creadas por la persona y luego ELIMINADAS con un motivo de error
 *    (duplicada, paciente equivocado, "error al agendar"): guardan quién la
 *    creó, quién la eliminó, cuándo y por qué;
 *  · check-ins deshechos (`REVERT_CHECK_IN`): el autor del error es quien marcó
 *    el `CHECK_IN` anterior de esa cita; la fila de la reversa no lo dice.
 *
 * ── Precisión antes que cobertura ──────────────────────────────────────────
 *
 * Solo entra una eliminación cuyo motivo ES un error. Una cita borrada por
 * "paciente lo pidió" no es una equivocación de nadie. Los motivos de prueba
 * ("Test") tampoco: una prueba no es un error, y es lo que ya se oculta en la
 * bandeja. Lo que no se pueda atribuir con seguridad queda afuera.
 *
 * Los pagos anulados NO entran todavía: `billing_payments` no guarda quién
 * registró el pago, solo quién lo anuló, y atribuirle el error al que lo corrigió
 * sería injusto.
 *
 * ⚠️ Clases POSIX en el SQL, nunca `\m` ni `\.`: Prisma se come las barras
 * (trap-backslash-en-sql-de-prisma).
 */

import { db, Prisma } from '@precision-medical/database';

export type CorregidoTipo =
  | 'CITA_DUPLICADA_ELIMINADA'
  | 'PACIENTE_EQUIVOCADO'
  | 'CITA_ERRONEA'
  | 'CHECK_IN_REVERTIDO';

export interface Corregido {
  id: string;
  tipo: CorregidoTipo;
  /** Quién cometió el error (el dueño de la entrada en su bandeja). */
  userId: string;
  /** "María G." — abreviado, igual que la bandeja. */
  paciente: string;
  patientId: string | null;
  caseId: string | null;
  appointmentId: string | null;
  /** Cuándo nació el error. ISO. */
  cuando: string;
  /** Cuándo se corrigió. ISO. */
  corregidoEn: string;
  /** Nombre de quien lo corrigió, o `null` si no hay forma de saberlo. */
  corregidoPor: string | null;
  /** Lo corrigió la propia persona. */
  porElMismo: boolean;
  /** Lo corrigió un administrador, un script o una limpieza, no la persona. */
  porAdministracion: boolean;
  /** El motivo escrito al corregirlo, tal cual. */
  motivo: string | null;
  /** Horas entre el error y la corrección. */
  horas: number;
}

const DUPLICADA = /duplic/i;
const PACIENTE = /wrong patient|wrong pt|paciente equivocado|equivocad/i;
/** Un motivo que ADMITE una equivocación. Lo demás ("paciente lo pidió") no entra. */
const ERROR = /error|incorrect|mistake|erro|wrong|equivoc|mal cargad|migrated|by mistake|entered/i;
/** Palabra COMPLETA: una prueba no es un error. */
const PRUEBA = /\b(test|testing|prueba|pruebas)\b/i;
/** Quien corrige por una limpieza o por la base directamente no es "otra persona" del equipo. */
const ADMINISTRACION = /limpieza|\(sql\)|borrado directo|sistema/i;

const PRUEBA_NOMBRE = '[[:<:]](test|prueba|pruebas|demo)[[:>:]]';

function abreviar(first: string | null, last: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f && !l) return '—';
  return l ? `${f} ${l.charAt(0).toUpperCase()}.`.trim() : f;
}

function tipoDeMotivo(motivo: string): CorregidoTipo | null {
  if (PRUEBA.test(motivo)) return null;
  if (DUPLICADA.test(motivo)) return 'CITA_DUPLICADA_ELIMINADA';
  if (PACIENTE.test(motivo)) return 'PACIENTE_EQUIVOCADO';
  if (ERROR.test(motivo)) return 'CITA_ERRONEA';
  return null;
}

interface FilaEliminada {
  id: string; userId: string; creador: string | null;
  patientId: string | null; caseId: string | null;
  creada: Date; eliminada: Date; porNombre: string | null; motivo: string | null;
  firstName: string | null; lastName: string | null; prueba: boolean;
}

interface FilaReversa {
  id: string; appointmentId: string; corregidoEn: Date; actorNombre: string | null; meta: unknown;
  userId: string | null; marcado: Date | null; patientId: string | null; caseId: string | null;
  firstName: string | null; lastName: string | null; prueba: boolean;
}

/**
 * Las correcciones de UNA persona (`userId`) o de todo el equipo (sin `userId`),
 * de los últimos `dias`. Más recientes primero.
 */
export async function corregidos(opts: { userId?: string; dias?: number } = {}): Promise<Corregido[]> {
  const dias = opts.dias ?? 90;
  const userId = opts.userId ?? null;

  const [eliminadas, reversas] = await Promise.all([
    db.$queryRaw<FilaEliminada[]>(Prisma.sql`
      SELECT a.id, a."createdByUserId" AS "userId",
             NULLIF(TRIM(CONCAT(COALESCE(u."firstName", ''), ' ', COALESCE(u."lastName", ''))), '') AS creador,
             a."patientId", a."caseId", a."createdAt" AS creada, a."deletedAt" AS eliminada,
             a."deletedByName" AS "porNombre", a."deleteReason" AS motivo,
             p."firstName", p."lastName",
             COALESCE(p."firstName" ~* ${PRUEBA_NOMBRE} OR p."lastName" ~* ${PRUEBA_NOMBRE}, false) AS prueba
      FROM appointments a
      JOIN patients p ON p.id = a."patientId"
      LEFT JOIN public.users u ON u.id = a."createdByUserId"
      WHERE a."deletedAt" IS NOT NULL
        AND a."createdByUserId" IS NOT NULL
        AND COALESCE(a."deleteReason", '') <> ''
        AND a."deletedAt" >= now() - make_interval(days => ${dias}::int)
        AND (${userId}::text IS NULL OR a."createdByUserId" = ${userId}::text)
      ORDER BY a."deletedAt" DESC
      LIMIT 400`),

    db.$queryRaw<FilaReversa[]>(Prisma.sql`
      SELECT r.id, r."entityId" AS "appointmentId", r."createdAt" AS "corregidoEn",
             NULLIF(TRIM(CONCAT(COALESCE(ru."firstName", ''), ' ', COALESCE(ru."lastName", ''))), '') AS "actorNombre",
             r.metadata AS meta,
             ci."actorUserId" AS "userId", ci."createdAt" AS marcado,
             a."patientId", a."caseId", p."firstName", p."lastName",
             COALESCE(p."firstName" ~* ${PRUEBA_NOMBRE} OR p."lastName" ~* ${PRUEBA_NOMBRE}, false) AS prueba
      FROM audit_logs r
      JOIN appointments a ON a.id = r."entityId"
      JOIN patients p ON p.id = a."patientId"
      LEFT JOIN public.users ru ON ru.id = r."actorUserId"
      LEFT JOIN LATERAL (
        SELECT c."actorUserId", c."createdAt" FROM audit_logs c
         WHERE c.action = 'CHECK_IN' AND c."entityType" = 'appointment' AND c."entityId" = r."entityId"
           AND c."createdAt" <= r."createdAt"
         ORDER BY c."createdAt" DESC LIMIT 1) ci ON true
      WHERE r.action = 'REVERT_CHECK_IN' AND r."entityType" = 'appointment'
        AND r."createdAt" >= now() - make_interval(days => ${dias}::int)
        AND ci."actorUserId" IS NOT NULL
        AND (${userId}::text IS NULL OR ci."actorUserId" = ${userId}::text)
      ORDER BY r."createdAt" DESC
      LIMIT 200`),
  ]);

  const out: Corregido[] = [];

  for (const r of eliminadas) {
    if (r.prueba) continue;
    const motivo = (r.motivo ?? '').trim();
    const tipo = tipoDeMotivo(motivo);
    if (!tipo) continue;
    const por = (r.porNombre ?? '').trim() || null;
    const porAdmin = !!por && ADMINISTRACION.test(por);
    // La misma persona: el nombre del que la borró coincide con el de quien la creó.
    const porElMismo = !!por && !!r.creador && !porAdmin && por.toLowerCase() === r.creador.toLowerCase();
    out.push({
      id: `del:${r.id}`, tipo, userId: r.userId,
      paciente: abreviar(r.firstName, r.lastName), patientId: r.patientId, caseId: r.caseId, appointmentId: r.id,
      cuando: r.creada.toISOString(), corregidoEn: r.eliminada.toISOString(),
      corregidoPor: porAdmin ? null : por, porElMismo, porAdministracion: porAdmin,
      motivo: motivo || null,
      horas: Math.max(0, (r.eliminada.getTime() - r.creada.getTime()) / 3_600_000),
    });
  }

  for (const r of reversas) {
    if (r.prueba || !r.userId || !r.marcado) continue;
    const meta = (r.meta ?? {}) as { motivo?: unknown };
    const motivo = typeof meta.motivo === 'string' ? meta.motivo : null;
    // Quien deshace puede ser una persona o el sistema (el script de reversa).
    const porAdmin = !r.actorNombre;
    out.push({
      id: `rev:${r.id}`, tipo: 'CHECK_IN_REVERTIDO', userId: r.userId,
      paciente: abreviar(r.firstName, r.lastName), patientId: r.patientId, caseId: r.caseId, appointmentId: r.appointmentId,
      cuando: r.marcado.toISOString(), corregidoEn: r.corregidoEn.toISOString(),
      corregidoPor: r.actorNombre, porElMismo: false, porAdministracion: porAdmin,
      motivo,
      horas: Math.max(0, (r.corregidoEn.getTime() - r.marcado.getTime()) / 3_600_000),
    });
  }

  return out.sort((a, b) => b.corregidoEn.localeCompare(a.corregidoEn));
}
