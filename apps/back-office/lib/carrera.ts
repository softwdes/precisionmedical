/**
 * La Carrera para el back-office — abierta a toda la clínica.
 *
 * Misma fuente que el tab Métricas de apps/web: la fn `employee_metrics` de la
 * DB (`prisma/sql/20260806-employee-metrics-fn.sql`). La diferencia es que allá
 * pasa por tRPC y solo la ven SUPER_ADMIN/ADMIN; acá se sirve directo, porque la
 * fn vive en ESTA base y no hay puente que cruzar.
 *
 * Se devuelve solo lo que la pista necesita —nombre, grupo, minutos, acciones y
 * áreas—; ni llamadas, ni SMS, ni el desglose acción por acción. Esos son datos
 * de gestión y esta pantalla la ve todo el equipo.
 *
 * Decisión de Erick (31-ago-2026): nombres completos y visible para todos,
 * "porque es una carrera entre todos".
 */

import { db, ACTION_FAMILY, NOT_STAFF_WORK, emptyFamilies, type ActionFamily } from '@precision-medical/database';
import { ZONA_CLINICA } from './fechas';

export type Crew = 'CLINIC' | 'DEV' | 'COMMS';

export interface RacerRow {
  userId: string;
  name: string;
  role: string;
  crew: Crew | null;
  activeMinutes: number;
  totalActions: number;
  families: Record<string, number>;
}

/** Medianoche de un día de la clínica, en UTC (DST-aware por fecha). */
function inicioDelDia(dia: string): Date {
  const sonda = new Date(`${dia}T12:00:00Z`);
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CLINICA, timeZoneName: 'shortOffset' })
    .formatToParts(sonda)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const m = /GMT([+-]\d+)/.exec(parte);
  const horas = m?.[1] ? parseInt(m[1], 10) : -6;
  const hh = String(Math.abs(horas)).padStart(2, '0');
  return new Date(`${dia}T00:00:00${horas <= 0 ? '-' : '+'}${hh}:00`);
}

function diaSiguiente(dia: string): string {
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

interface Payload {
  users: Array<{ userId: string; name: string | null; email: string; role: string }>;
  audit: Array<{ userId: string; action: string; n: number }>;
  activity: Array<{ userId: string; minutes: number }>;
}

/**
 * Grupo de cada persona, desde el proyecto ADMIN.
 *
 * El cruce va por EMAIL y no por id: son dos proyectos Supabase distintos y el
 * cuid de `users` de acá no existe allá. `ilike` y no `eq` porque PostgREST
 * distingue mayúsculas y hay emails guardados con la inicial en mayúscula — un
 * `Info@…` no matcheaba nunca con el `info@…` que normaliza Supabase Auth.
 *
 * Si falla, todos quedan sin grupo y la pista se muestra completa: la Carrera no
 * se cae por no poder etiquetar.
 */
async function gruposPorEmail(): Promise<Map<string, Crew>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Map();
  try {
    const res = await fetch(`${url}/rest/v1/users?select=email,crew&crew=not.is.null`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!res.ok) return new Map();
    const filas = (await res.json()) as Array<{ email: string; crew: string }>;
    return new Map(filas.map((f) => [f.email.toLowerCase(), f.crew as Crew]));
  } catch {
    return new Map();
  }
}

/** `from`/`to` son días de la clínica, inclusivos (YYYY-MM-DD). */
export async function corredores(from: string, to: string): Promise<RacerRow[]> {
  // String plano y `$queryRawUnsafe`: interpolar un fragmento `Prisma.sql` en
  // `next dev` falla en silencio y devuelve el SQL como texto — ver la nota
  // larga en `lib/catalog.ts`.
  const filas = await db.$queryRawUnsafe<Array<{ payload: unknown }>>(
    'SELECT employee_metrics($1::timestamptz, $2::timestamptz) AS payload',
    inicioDelDia(from).toISOString(),
    inicioDelDia(diaSiguiente(to)).toISOString(),
  );

  const m = filas[0]?.payload as Payload | undefined;
  if (!m) return [];

  const crews = await gruposPorEmail();

  const rows = new Map<string, RacerRow>();
  for (const u of m.users) {
    rows.set(u.userId, {
      userId: u.userId,
      name: u.name ?? u.email,
      role: u.role,
      crew: crews.get(u.email.toLowerCase()) ?? null,
      activeMinutes: 0,
      totalActions: 0,
      families: emptyFamilies(),
    });
  }

  for (const g of m.audit) {
    const row = rows.get(g.userId);
    if (!row) continue;
    if (NOT_STAFF_WORK.has(g.action)) continue;
    // Sin familia conocida va a `otros`: una acción nueva entra al total el día
    // uno, sin esperar a que alguien la mapee.
    const familia: ActionFamily = ACTION_FAMILY[g.action] ?? 'otros';
    row.families[familia] += g.n;
    row.totalActions += g.n;
  }

  for (const g of m.activity) {
    const row = rows.get(g.userId);
    if (row) row.activeMinutes = g.minutes;
  }

  // El orden final lo decide la pista (por ritmo); acá solo se sacan los que no
  // hicieron nada ni estuvieron, para no mandar 25 filas vacías al navegador.
  return [...rows.values()].filter((r) => r.activeMinutes > 0 || r.totalActions > 0);
}
