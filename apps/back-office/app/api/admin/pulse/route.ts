/**
 * GET /api/admin/pulse?date=YYYY-MM-DD | ?appointmentId=...
 *
 * Huella de versión de lo que muestra una pantalla. Devuelve ~60 bytes.
 *
 * Reemplaza al polling que traía el payload completo cada 20 s. La cadena de
 * decisiones que llevó acá:
 *
 *  1. Day Admission no tenía refresco de ningún tipo y el asistente veía la nota
 *     vacía cuando el doctor ya había firmado.
 *  2. Se puso polling de 20 s del payload completo — funcionó, pero son decenas de
 *     KB por pestaña y no se puede bajar el intervalo sin que duela.
 *  3. Se evaluó realtime (Supabase). Se descartó: la latencia nunca fue el
 *     problema (el paciente tarda medio minuto en caminar al mostrador), suscribir
 *     el navegador a las tablas expondría PHI dependiendo de un RLS que hoy no
 *     está, y un canal caído deja la pantalla congelada PERO CON CARA DE VIVA —
 *     peor que un retraso honesto.
 *  4. Esto: se consulta la versión cada 5 s (barata) y el payload real solo cuando
 *     cambió. Baja la latencia de 20 s a 5 s Y el tráfico en reposo a casi nada.
 *
 * SQL directo con agregados sobre columnas indexadas: no hace falta traer filas
 * para saber si algo cambió.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';

/** Rango [inicio, fin) de un día en Denver, DST-aware (mismo criterio que Mi Día). */
function denverDayRange(key: string): { start: Date; end: Date } {
  const probe = new Date(`${key}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'shortOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const m = /GMT([+-]\d+)/.exec(offsetPart);
  const hours = m?.[1] ? parseInt(m[1], 10) : -6;
  const hh = String(Math.abs(hours)).padStart(2, '0');
  const start = new Date(`${key}T00:00:00${hours <= 0 ? '-' : '+'}${hh}:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Los `Date`/`bigint` de Postgres a una cadena corta y estable. */
function stamp(v: unknown): string {
  if (v instanceof Date) return String(v.getTime());
  if (typeof v === 'bigint') return String(v);
  return String(v ?? '');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const appointmentId = sp.get('appointmentId');
  const date = sp.get('date');

  try {
    if (appointmentId) {
      // UNA visita: cita + nota + triaje + los tres orígenes de cargos.
      // El COUNT importa además del MAX: borrar una fila no mueve ningún
      // `updatedAt`, y sin contar, una eliminación pasaría desapercibida.
      const [row] = await db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          (SELECT "updatedAt" FROM appointments WHERE id = ${appointmentId})                                  AS a,
          (SELECT "updatedAt" FROM visit_notes WHERE "appointmentId" = ${appointmentId})                       AS n,
          (SELECT "updatedAt" FROM triage_records WHERE "appointmentId" = ${appointmentId})                     AS t,
          (SELECT MAX("updatedAt") FROM appointment_billing WHERE "appointmentId" = ${appointmentId})           AS b,
          (SELECT COUNT(*)        FROM appointment_billing WHERE "appointmentId" = ${appointmentId})           AS bc,
          (SELECT MAX("updatedAt") FROM appointment_braces WHERE "appointmentId" = ${appointmentId})            AS r,
          (SELECT COUNT(*)        FROM appointment_braces WHERE "appointmentId" = ${appointmentId})            AS rc,
          (SELECT MAX("updatedAt") FROM appointment_services WHERE "appointmentId" = ${appointmentId})          AS s,
          (SELECT COUNT(*)        FROM appointment_services WHERE "appointmentId" = ${appointmentId})          AS sc,
          (SELECT MAX("updatedAt") FROM prescriptions WHERE "appointmentId" = ${appointmentId})                 AS p,
          (SELECT COUNT(*)        FROM prescriptions WHERE "appointmentId" = ${appointmentId})                 AS pc,
          (SELECT MAX("updatedAt") FROM lab_orders WHERE "appointmentId" = ${appointmentId})                    AS l,
          (SELECT COUNT(*)        FROM lab_orders WHERE "appointmentId" = ${appointmentId})                    AS lc
      `;
      return NextResponse.json(
        { v: Object.values(row ?? {}).map(stamp).join('.') },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const { start, end } = denverDayRange(date);
      // La cola del día: citas del día + los triajes de esas citas.
      const [row] = await db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          (SELECT MAX("updatedAt") FROM appointments
            WHERE "scheduledFor" >= ${start} AND "scheduledFor" < ${end})                        AS a,
          (SELECT COUNT(*) FROM appointments
            WHERE "scheduledFor" >= ${start} AND "scheduledFor" < ${end})                        AS ac,
          (SELECT MAX(t."updatedAt") FROM triage_records t
             JOIN appointments ap ON ap.id = t."appointmentId"
            WHERE ap."scheduledFor" >= ${start} AND ap."scheduledFor" < ${end})                  AS t
      `;
      return NextResponse.json(
        { v: Object.values(row ?? {}).map(stamp).join('.') },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({ error: 'MISSING_TARGET' }, { status: 400 });
  } catch (err) {
    console.error('[GET /api/admin/pulse]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
