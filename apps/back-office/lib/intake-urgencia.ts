/**
 * La escala de urgencia de la cola de intake. **Aritmética pura.**
 *
 * Vive separada de `lib/cola-intake.ts` por una razón concreta: la pantalla
 * necesita el umbral del titular, y `cola-intake.ts` importa
 * `@precision-medical/database` y `lib/decrypt`. Importar el umbral desde un
 * componente de cliente arrastraría el cliente de Prisma y las claves de cifrado
 * al bundle del navegador — y eso no falla con un error claro, se compila.
 *
 * Acá no hay ni un import. Todo lo que está en este archivo puede cruzar al
 * cliente sin pensarlo, y así el criterio sigue viviendo en UN lugar en vez de
 * quedar copiado a mano en la tarjeta.
 */

/**
 * Cuántos minutos antes de la cita una fila pasa a ser "ahora".
 *
 * Es el interruptor del rojo en la pantalla, y por eso es una constante con
 * nombre: la versión anterior teñía TODAS las filas del día —diecisiete a la
 * vez— y el rojo dejó de significar nada. Es la misma regla que las alertas de
 * vitales: el rojo se reserva para lo que exige actuar ya.
 *
 * Una hora, y no tres, porque es el margen en el que una llamada todavía cambia
 * el resultado: si el paciente contesta, le llega el enlace y lo llena en el
 * auto. Con tres horas de anticipación la llamada no la hace nadie.
 */
export const MINUTOS_INMINENTE = 60;

/**
 * En qué momento está la fila. Es lo único que decide su TRATAMIENTO visual.
 *
 * `TARDE` no existía y es el caso más grave: la cita ya pasó y el paciente no
 * llegó ni firmó. La ventana de la consulta arranca en `ahora − 36 h`, así que
 * estas filas siempre estuvieron en la lista — pero se veían igual que las demás
 * y encima SIN hora, porque la cuenta regresiva devuelve `null` cuando la cita
 * quedó atrás. La fila más alarmante de la pantalla era la que menos decía.
 */
export type NivelIntake = 'TARDE' | 'AHORA' | 'HOY' | 'MANANA' | 'SEMANA';

/**
 * Peso base por momento. Los saltos son grandes a propósito: así un agravante
 * (15 puntos) reordena dentro de un momento pero nunca por encima del siguiente.
 */
export const PESO_NIVEL: Record<NivelIntake, number> = {
  TARDE:  90,
  AHORA:  80,
  HOY:    60,
  MANANA: 35,
  SEMANA: 10,
};

export const PESO_AGRAVANTE = 15;

/**
 * A partir de acá la fila se gana el titular de la pantalla.
 *
 * Copiado de `mereceTitular()` de Vigía, umbral y todo, porque la escalera que
 * produce es la correcta acá también:
 *   · `TARDE` (90) titula siempre;
 *   · `AHORA` (80) titula con un solo agravante;
 *   · `HOY` (60) necesita dos — llega hoy, no empezó el formulario y nadie lo
 *     contactó nunca;
 *   · mañana y más allá no titulan nunca, porque no son de hoy.
 *
 * Cuando nadie lo alcanza, la pantalla dice que no hay nada urgente en vez de
 * inventar una urgencia — el equivalente del "Nothing stalled today" de Vigía.
 */
export const UMBRAL_TITULAR = 90;

/**
 * Genérica y con `fila is T` a propósito: así el que la llama se queda con SU
 * tipo (`FilaIntake` en el servidor, `FilaVista` en la pantalla) y TypeScript le
 * descarta el `null` después del `if`. Devolver `boolean` a secas obligaba a
 * repetir un `!` en cada uno de los treinta usos de la tarjeta.
 */
export function mereceTitular<T extends { prioridad: number }>(
  fila: T | null | undefined,
): fila is T {
  return !!fila && fila.prioridad >= UMBRAL_TITULAR;
}

/**
 * El momento de la fila, a partir de los minutos y del día.
 *
 * Los minutos mandan sobre el día, no al revés: una cita de hoy a las 16:00
 * vista a las 09:00 es `HOY` (calma), y la misma cita vista a las 15:30 es
 * `AHORA` (roja). Es lo que hace que la pantalla se caliente sola con el reloj
 * en vez de teñir el día entero desde la mañana.
 */
export function nivelDe(minutos: number, dias: number): NivelIntake {
  if (dias === 0 && minutos < 0) return 'TARDE';
  if (minutos >= 0 && minutos <= MINUTOS_INMINENTE) return 'AHORA';
  if (dias === 0) return 'HOY';
  if (dias === 1) return 'MANANA';
  return 'SEMANA';
}

/**
 * Los agravantes: lo que hace que dos filas del mismo momento no valgan igual.
 *
 * Son tres y cada uno es una razón distinta para que la llamada la haga una
 * persona y no el sistema:
 *   · el formulario sin abrir — no es "le falta un campo", es que no empezó;
 *   · nadie lo contactó nunca — no es que no conteste, es que nadie lo intentó;
 *   · el envío está bloqueado — el enlace no se puede mandar (menor sin tutor, o
 *     sin teléfono ni correo), así que el automático no lo va a resolver.
 */
export function agravantesDe(f: {
  pct: number;
  ultimoContacto: unknown | null;
  bloqueoEnvio: string | null;
}): number {
  let n = 0;
  if (f.pct === 0) n++;
  if (!f.ultimoContacto) n++;
  if (f.bloqueoEnvio) n++;
  return n;
}

/** Lo mínimo que hace falta para recalcular la urgencia de una fila. */
export interface FilaConUrgencia {
  /** ISO de la cita. */
  cita: string;
  diasHasta: number;
  pct: number;
  ultimoContacto: unknown | null;
  bloqueoEnvio: string | null;
  minutosHasta: number;
  nivel: NivelIntake;
  prioridad: number;
}

/**
 * Recalcula el momento de una fila contra un reloj dado.
 *
 * ── Por qué esto existe ──────────────────────────────────────────────────────
 *
 * `/dashboard` es un server component sin `revalidate` ni pulso: se renderiza una
 * vez y se queda. O sea que `minutosHasta` y `nivel` quedan CONGELADOS en el
 * momento de cargar la página, y el dashboard es justamente la pantalla que la
 * gente deja abierta en una pestaña toda la mañana.
 *
 * Con la versión anterior eso era un detalle —"HOY 09:00" sigue siendo verdad una
 * hora después— pero con la escala nueva sería un defecto de fondo: "EN 19 MIN"
 * se vuelve mentira, el paciente que ya llegó sigue apareciendo por llegar, y el
 * que entra en su última hora DESPUÉS de cargar la página nunca se pone rojo. El
 * rojo dejaría de ser una señal de tiempo real y volvería a ser decoración, que
 * es exactamente lo que veníamos a arreglar.
 *
 * Así que el servidor calcula el valor inicial —para que el HTML del servidor y
 * el del cliente coincidan en el primer render— y a partir de ahí el cliente
 * recalcula con su propio reloj.
 *
 * `diasHasta` NO se recalcula: depende de la zona de la clínica y de la clave de
 * día, que es cosa del servidor (`claveDia`). Una pestaña abierta cruzando la
 * medianoche va a mostrar el día viejo hasta que se recargue; es un caso raro y
 * el precio de arreglarlo acá sería meter aritmética de zona horaria en el
 * navegador, que es de donde la sacamos a propósito.
 */
export function recalcularUrgencia<T extends FilaConUrgencia>(f: T, ahoraMs: number): T {
  const minutosHasta = Math.round((new Date(f.cita).getTime() - ahoraMs) / 60_000);
  const nivel = nivelDe(minutosHasta, f.diasHasta);
  const prioridad = PESO_NIVEL[nivel] + agravantesDe(f) * PESO_AGRAVANTE;
  return { ...f, minutosHasta, nivel, prioridad };
}
