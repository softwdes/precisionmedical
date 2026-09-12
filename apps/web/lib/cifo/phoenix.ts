import { createClientWithCredentials } from '@precision-medical/auth';

/** La zona de la clínica. Todo lo que diga "hoy" en este módulo es hoy ACÁ. */
export const ZONA_CLINICA = 'America/Denver';

/**
 * El cliente que lee la base de la CLÍNICA (Phoenix) desde el Admin.
 *
 * ── Por qué hace falta un segundo cliente ───────────────────────────────────
 *
 * El Admin y la clínica viven en dos proyectos de Supabase distintos, y el
 * cliente por defecto del Admin apunta al suyo. Medido el 2026-09-12, en el
 * proyecto del Admin las tablas clínicas están **vacías**:
 *
 *     appointments 0 · patients 0 · providers 0 · commissions 0
 *     cash_boxes 6 · payments 46 · employees 20 · freelancers 8 · wallets 3
 *
 * O sea: lo administrativo tiene datos y lo clínico no. Preguntarle las visitas
 * al cliente de siempre devuelve 0 para siempre, con total convicción — que es
 * peor que no contestar.
 *
 * Estas credenciales NO son nuevas: son las mismas que ya usa
 * `packages/api/src/routers/metrics.ts` para las métricas por empleado y la
 * Carrera. El puente Admin → clínica ya existía y está en producción; acá se
 * reusa en vez de abrir uno.
 */
export function clienteClinica() {
  const url = process.env.BACKOFFICE_SUPABASE_URL;
  const key = process.env.BACKOFFICE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan BACKOFFICE_SUPABASE_URL / BACKOFFICE_SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClientWithCredentials(url, key);
}

/** `YYYY-MM-DD` de una fecha, en la zona de la clínica. */
export function claveDia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CLINICA }).format(d);
}

/**
 * Los bordes UTC de un día de la clínica.
 *
 * El desfase real de esa fecha sale de cómo se ve el mediodía UTC en la zona:
 * 6 horas en verano, 7 en invierno. Fijar uno rompe medio año — es la misma
 * cuenta que hace `lib/citas-de-hoy.ts` en el back-office, y por el mismo
 * motivo.
 */
export function bordesDelDia(clave: string): { desde: Date; hasta: Date } {
  const [y, m, d] = clave.split('-').map(Number);
  const medio = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const horaLocal = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit',
    }).format(new Date(medio)),
  );
  const desde = new Date(Date.UTC(y!, m! - 1, d!, 12 - horaLocal, 0, 0));
  return { desde, hasta: new Date(desde.getTime() + 86_400_000) };
}

/**
 * El día del que hay que hablar: hoy, o el LUNES si hoy es fin de semana.
 *
 * Regla de Erick (2026-09-12). Sale de mirar los datos: sábado y domingo dan
 * cero citas porque la clínica no abre, así que un aviso que diga "hoy tenés 0
 * visitas" el sábado a la mañana es cierto y no sirve para nada. Lo que un
 * administrador quiere ver el fin de semana es **cómo viene el lunes**.
 *
 * Medido el 2026-09-12 (sábado): sáb 0 · dom 0 · lun 10 · mar 13 · mié 20 ·
 * jue 9 · vie 7.
 */
export function diaHabilAMostrar(ahora = new Date()): { clave: string; esHoy: boolean } {
  const hoy = claveDia(ahora);
  // `en-US` con `weekday: short` da Sat/Sun sin depender del locale del server.
  const dia = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_CLINICA, weekday: 'short',
  }).format(ahora);

  if (dia !== 'Sat' && dia !== 'Sun') return { clave: hoy, esHoy: true };

  const saltar = dia === 'Sat' ? 2 : 1;
  const [y, m, d] = hoy.split('-').map(Number);
  // Mediodía para que el salto de día no lo mueva el cambio de horario.
  const lunes = new Date(Date.UTC(y!, m! - 1, d! + saltar, 12));
  return { clave: claveDia(lunes), esHoy: false };
}

export interface VisitasDelDia {
  /** `YYYY-MM-DD` del día contado. */
  dia: string;
  /** `false` cuando es el lunes que viene porque hoy es fin de semana. */
  esHoy: boolean;
  /** Total del día, SIN canceladas — no son trabajo. */
  total: number;
  /** Cuántas por clínica, para poder decir dónde se concentra. */
  porClinica: Record<string, number>;
}

/**
 * Cuántas visitas hay el día que corresponde mostrar.
 *
 * Excluye las canceladas por la misma razón que el resto del sistema: una cita
 * cancelada no es trabajo de nadie. Los no-shows SÍ entran — son un horario que
 * se consumió, y esa es la regla de la clínica.
 */
export async function visitasDelDia(ahora = new Date()): Promise<VisitasDelDia> {
  const { clave, esHoy } = diaHabilAMostrar(ahora);
  const { desde, hasta } = bordesDelDia(clave);

  const { data, error } = await clienteClinica()
    .from('appointments')
    .select('id, clinic:clinics(name)')
    .gte('scheduledFor', desde.toISOString())
    .lt('scheduledFor', hasta.toISOString())
    .neq('status', 'CANCELLED');

  if (error) throw new Error(`No pude leer las visitas: ${error.message}`);

  const porClinica: Record<string, number> = {};
  for (const fila of data ?? []) {
    const clinica = (fila as { clinic?: { name?: string } | null }).clinic?.name ?? '—';
    porClinica[clinica] = (porClinica[clinica] ?? 0) + 1;
  }

  return { dia: clave, esHoy, total: (data ?? []).length, porClinica };
}
