import { db } from '@precision-medical/database';
import { claveDia, ZONA_CLINICA } from '@/lib/fechas';

/**
 * Los bordes de hoy en la zona de la CLÍNICA, no en la del servidor.
 *
 * Sale de `claveDia`, que es la misma pieza que usa la cola de intake para
 * decidir a qué día pertenece una cita. Restar 24 h de un `Date` no sirve: en
 * los dos domingos del año en que cambia el horario, el día dura 23 o 25.
 */
export function rangoDeHoy(): { desde: Date; hasta: Date } {
  const hoy = claveDia(new Date());
  const [y, m, d] = hoy.split('-').map(Number);
  // El desfase real de esa fecha sale de cómo se ve el mediodía UTC en la zona
  // de la clínica: 6 horas en verano, 7 en invierno. Fijar uno rompe medio año.
  const tentativo = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const horaLocal = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit' })
      .format(new Date(tentativo)),
  );
  const desde = new Date(Date.UTC(y!, m! - 1, d!, 12 - horaLocal, 0, 0));
  return { desde, hasta: new Date(desde.getTime() + 86_400_000) };
}

export interface CitasDeHoy {
  /** Total del día SIN las canceladas: no son trabajo de hoy. */
  citasHoy: number;
  enElEdificio: number;
  yaSalieron: number;
  sinLlegarTodavia: number;
  noShowHoy: number;
  canceladasHoy: number;
  porEstado: Record<string, number>;
}

/**
 * Cómo viene el día en citas — UNA consulta.
 *
 * ── Por qué está acá y no adentro de `pulsoDelDia` ───────────────────────────
 *
 * Lo preguntan dos puntas con necesidades distintas:
 *
 *   · la herramienta `pulso_del_dia` de CIFO, que además quiere plata y
 *     esfuerzo de contacto (4 consultas, y está bien: es una pregunta explícita);
 *   · el saludo del dashboard, que solo quiere el número de citas y corre en
 *     CADA carga de la pantalla más usada del sistema (12 personas, todo el día).
 *
 * Si el saludo llamara a `pulsoDelDia()` para leer un campo, pagaría tres
 * consultas de más —cobros, mensajes y llamadas— por cada apertura del panel.
 * Y si copiara el `groupBy`, el día que alguien decida que las canceladas sí
 * cuentan, el saludo diría 24 y CIFO 22 en la misma pantalla.
 *
 * Así que el reparto es el de siempre acá: el criterio vive una sola vez, y cada
 * punta trae lo que necesita.
 */
export async function citasDeHoy(): Promise<CitasDeHoy> {
  const { desde, hasta } = rangoDeHoy();

  const porEstado = await db.appointment.groupBy({
    by: ['status'],
    where: { scheduledFor: { gte: desde, lt: hasta } },
    _count: true,
  });

  const cuenta = (...estados: string[]): number =>
    porEstado.filter((g) => estados.includes(g.status)).reduce((a, g) => a + g._count, 0);

  return {
    citasHoy: porEstado.filter((g) => g.status !== 'CANCELLED').reduce((a, g) => a + g._count, 0),
    enElEdificio: cuenta('CHECKED_IN', 'IN_PROGRESS'),
    yaSalieron: cuenta('COMPLETED', 'CHECKED_OUT'),
    sinLlegarTodavia: cuenta('SCHEDULED', 'CONFIRMED', 'PENDING'),
    noShowHoy: cuenta('NO_SHOW'),
    canceladasHoy: cuenta('CANCELLED'),
    porEstado: Object.fromEntries(porEstado.map((g) => [g.status, g._count])),
  };
}
