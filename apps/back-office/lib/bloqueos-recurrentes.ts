/**
 * Bloqueos de agenda que se repiten — aritmética de calendario, sin base.
 *
 * Vive aparte de `lib/scheduling-rules.ts` a propósito: ese archivo importa
 * Prisma, y con el import adentro esta lógica **no se puede correr sin una base
 * de datos**. Es la trampa que ya tenemos anotada: cuando algo no se puede
 * probar, el problema es DÓNDE VIVE, no cómo se prueba. Acá sólo entran fechas
 * y reglas, así que se ejecuta con objetos a mano.
 *
 * `scheduling-rules.ts` lo re-exporta: los llamadores siguen pidiéndole las
 * reglas de agenda a un solo lugar.
 */

import { claveDia, DIA_MS, instanteEnClinica, minutosDelDiaEnClinica, weekdayEnClinica } from '@/lib/fechas';

/**
 * Cada cuánto se repite un bloqueo. Espejo del enum `BlockRepeat` de la base.
 *
 * Se declara acá como unión de strings y no se importa de Prisma a propósito:
 * la expansión es aritmética de calendario y no necesita saber de dónde salió
 * la fila. Así se puede probar con objetos a mano, sin base.
 */
export type BlockRepeatMode = 'NONE' | 'WEEKDAYS' | 'WEEKLY';

/**
 * Lo mínimo para expandir un bloqueo. Estructural: la fila de Prisma encaja sin
 * convertir nada, y un caso de prueba también.
 */
export interface BlockRule {
  /**
   * La PRIMERA vez que ocurre — no "cuándo es".
   *
   * Es el cambio de significado que trajo la repetición, y el que rompe las
   * consultas viejas: filtrar `startsAt` dentro del rango pedido hace que un
   * almuerzo creado en septiembre deje de verse en octubre.
   */
  startsAt: Date;
  durationMinutes: number;
  repeatMode: BlockRepeatMode;
  /** Último día en que aplica. `null` = para siempre. */
  repeatUntil: Date | null;
}

/**
 * Los días en que una regla cae dentro de `[desde, hasta]`.
 *
 * Devuelve INSTANTES de inicio, uno por ocurrencia, reconstruidos desde la hora
 * CIVIL de la clínica — no sumando 24 h. Sumar días en UTC corre el almuerzo una
 * hora para siempre a partir del domingo en que cambia la hora; ver
 * `instanteEnClinica`.
 *
 * `WEEKDAYS` salta sábado y domingo: la clínica no atiende (misma regla que
 * `isWeekendInDenver`, unos renglones más arriba) y un almuerzo pintado el
 * sábado es ruido. `WEEKLY` repite el mismo día de la semana que la primera vez.
 *
 * El tope de 400 iteraciones no es una regla de negocio: es un cinturón por si
 * alguien pide un rango absurdo. Un año de calendario son 365.
 */
export function blockOccurrences(rule: BlockRule, desde: Date, hasta: Date): Date[] {
  const minutos = minutosDelDiaEnClinica(rule.startsAt);
  const primerDia = claveDia(rule.startsAt);
  const ultimoDia = rule.repeatUntil ? claveDia(rule.repeatUntil) : null;

  // Sin repetición, la única ocurrencia es la que ya tiene la fila. Se devuelve
  // tal cual —sin reconstruirla— para no correr un bloqueo viejo si alguna vez
  // se guardó con una hora que hoy no cae redonda.
  if (rule.repeatMode === 'NONE') {
    const fin = new Date(rule.startsAt.getTime() + rule.durationMinutes * 60_000);
    return fin > desde && rule.startsAt <= hasta ? [rule.startsAt] : [];
  }

  const diaDeSemanaDelPrimero = weekdayEnClinica(rule.startsAt);
  const salida: Date[] = [];

  // Se arranca desde el más TARDÍO entre el inicio del rango y el primer día de
  // la regla: una regla que empieza mañana no tiene ocurrencias ayer.
  let clave = claveDia(desde) < primerDia ? primerDia : claveDia(desde);
  const claveFinal = claveDia(hasta);

  for (let i = 0; i < 400 && clave <= claveFinal; i++) {
    if (ultimoDia && clave > ultimoDia) break;

    const inicio = instanteEnClinica(clave, minutos);
    const dia = weekdayEnClinica(inicio);
    const sirve =
      rule.repeatMode === 'WEEKDAYS'
        ? dia !== 'Sat' && dia !== 'Sun'
        : dia === diaDeSemanaDelPrimero;

    if (sirve) {
      const fin = new Date(inicio.getTime() + rule.durationMinutes * 60_000);
      // `fin > desde` y no `inicio >= desde`: un almuerzo que arrancó a las
      // 12:45 sigue ocupando la 1 PM, y para quien pregunta por la 1 PM esa
      // ocurrencia cuenta.
      if (fin > desde && inicio <= hasta) salida.push(inicio);
    }

    // El día siguiente se calcula sobre el MEDIODÍA del actual, no sumando 24 h
    // al inicio: en los domingos de cambio de hora, +24 h desde la medianoche
    // cae en el mismo día o se saltea uno.
    const sonda = new Date(`${clave}T12:00:00Z`);
    clave = claveDia(new Date(sonda.getTime() + DIA_MS));
  }

  return salida;
}

/**
 * ¿Algún bloqueo pisa `[start, start + duration)`?
 *
 * Devuelve los que pisan, con su etiqueta, para que el aviso diga QUÉ hay ahí
 * ("Lunch") y no un genérico. Nunca IMPIDE nada: quien llama decide, igual que
 * con el cruce de dos citas del mismo provider (regla de Erick, 2026-08-05).
 * Ver el comentario de `bloqueosQuePisan` en los endpoints que guardan.
 */
export function blocksCovering<T extends BlockRule & { label: string }>(
  bloqueos: T[],
  start: Date,
  durationMinutes: number,
): T[] {
  const fin = new Date(start.getTime() + durationMinutes * 60_000);
  return bloqueos.filter((b) =>
    blockOccurrences(b, start, fin).some((inicio) => {
      const finBloqueo = new Date(inicio.getTime() + b.durationMinutes * 60_000);
      return inicio < fin && finBloqueo > start;
    }),
  );
}

/** El aviso, en palabras. Lo muestra el diálogo de cita antes de dejar guardar. */
export function describeBlocks(bloqueos: Array<{ label: string }>): string {
  const etiquetas = [...new Set(bloqueos.map((b) => b.label))];
  return etiquetas.join(' · ');
}

