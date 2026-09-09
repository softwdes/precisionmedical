/**
 * F0 · Cuánto cuesta resolver la identidad, medido.
 *
 * Existe para tener un NÚMERO DE PARTIDA antes de tocar el camino de
 * autenticación. `supabase.auth.getUser()` no decodifica el token: hace una
 * llamada HTTP al servidor de Auth, y corre en el middleware —o sea en cada
 * request, páginas y APIs— más una vez por render de servidor. La estimación que
 * traíamos era de ~180 ms medidos una vez, a mano. Eso alcanza para decidir que
 * vale la pena mirarlo; no alcanza para decir si un cambio sirvió.
 *
 * Sin esto, F2 (verificación local del JWT con `getClaims()`) sería fe: veríamos
 * el código nuevo y no sabríamos si mejoró, ni cuánto, ni para quién.
 *
 * ── Qué NO se registra ──────────────────────────────────────────────────────
 *
 * Ni correo, ni id de usuario, ni la ruta completa. Esto corre en el camino de
 * TODAS las pantallas del sistema, incluidas las que llevan PHI en la URL
 * (`/patients/<id>`, `/front-office/<id>`), y un log de rendimiento no es lugar
 * para eso. Se guarda: la duración, si había sesión o no, y un CUBO de ruta de
 * tres valores. Con eso se puede sacar una mediana y un p95, que es lo único que
 * hace falta.
 *
 * ── Las dos salidas, y por qué son dos ──────────────────────────────────────
 *
 *  1. **`Server-Timing`**, siempre. Aparece en la pestaña Red del navegador,
 *     request por request, sin infraestructura y sin almacenar nada. Es la que
 *     sirve para mirar UNA navegación en detalle.
 *  2. **Un log muestreado**, para agregar sobre un día. Es la que sirve para
 *     tener la mediana de doce personas trabajando, que es el número que
 *     queremos mover.
 *
 * Se muestrea porque el 100 % en una jornada de doce personas es ruido puro en
 * los logs, y para un percentil no hace falta.
 */

/** Los tres tipos de request, que tienen historias muy distintas. */
export type CuboRuta = 'page' | 'rsc' | 'api';

/**
 * Página completa, navegación de cliente (el payload RSC) o llamada de API.
 *
 * Importa separarlos: una carga completa paga el layout entero y una navegación
 * de cliente no, así que promediarlos juntos esconde las dos historias.
 */
export function cuboDeRuta(pathname: string, headers: Headers): CuboRuta {
  if (pathname.startsWith('/api/')) return 'api';
  // Next pide el payload RSC con este header en las navegaciones de cliente.
  return headers.get('rsc') === '1' || headers.has('next-router-state-tree') ? 'rsc' : 'page';
}

/**
 * Qué fracción de los requests se loguea, de 0 a 1.
 *
 * El default de 0.1 no es un número mágico: con ~12 personas navegando una
 * jornada da del orden de cientos de muestras, de sobra para una mediana y un
 * p95, y deja los logs legibles. `AUTH_TIMING_SAMPLE=0` lo apaga sin desplegar
 * código, y `=1` lo prende entero para una sesión de diagnóstico puntual.
 */
function tasaDeMuestreo(): number {
  const raw = process.env.AUTH_TIMING_SAMPLE;
  if (raw === undefined) return 0.1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.1;
}

export interface MedicionAuth {
  ms: number;
  huboSesion: boolean;
  cubo: CuboRuta;
}

/**
 * Registra la medición. **No puede tirar**: corre en el middleware de cuatro
 * apps y un fallo acá sería un 500 en toda la navegación del sistema por una
 * línea de telemetría. Todo va dentro de un `try`.
 */
export function registrarAuth(m: MedicionAuth): void {
  try {
    if (Math.random() >= tasaDeMuestreo()) return;
    // Una sola línea, con prefijo buscable. `ms` redondeado: los decimales de un
    // viaje de red no significan nada.
    console.log(
      `[auth-timing] ms=${Math.round(m.ms)} cubo=${m.cubo} sesion=${m.huboSesion ? 1 : 0}`,
    );
  } catch {
    // Medir no puede ser la causa de una caída.
  }
}

/** El valor del header `Server-Timing` para una medición. */
export function serverTiming(m: MedicionAuth): string {
  return `auth;dur=${Math.round(m.ms)};desc="getUser ${m.cubo}"`;
}
