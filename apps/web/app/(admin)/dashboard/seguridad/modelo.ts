/**
 * Qué es el Centro de Seguridad: los módulos, las protecciones y la forma de
 * los datos. SIN una sola importación de servidor.
 *
 * ── Por qué está separado de `datos.ts` ────────────────────────────────────
 *
 * Porque `seguridad-client.tsx` lleva `use client` y necesita estas constantes
 * para dibujar la matriz. Cuando vivían junto a la consulta, el componente de
 * pantalla arrastraba el `import 'server-only'` de ese archivo y **el build
 * del Admin fallaba**:
 *
 *     You're importing a component that needs "server-only". That only works
 *     in a Server Component but one of its parents is marked with "use client"
 *
 * `tsc` no lo ve —es una regla de Next, no de tipos— así que pasó en verde y
 * el Admin estuvo tres horas sin desplegar con la pantalla de seguridad, las
 * cabeceras y el login del servidor trabados detrás (2026-10-05).
 *
 * Regla para el próximo: lo que importe la pantalla va ACÁ. `datos.ts` es solo
 * para lo que toca la base.
 */
/**
 * Los datos del Centro de Seguridad.
 *
 * Se leen por REST contra el proyecto **Admin** — el mismo camino que usa
 * `api/auth/record-login` y el candado. Acá vive la cuenta con la que la gente
 * entra y acá se escribe cada intento, así que no hay nada que cruzar con la
 * base clínica.
 *
 * ── Qué NO va a estar acá ──────────────────────────────────────────────────
 *
 * El registro de auditoría de la CLÍNICA (quién tocó la ficha de un paciente)
 * vive en la otra base y se mira desde el back-office. Es trazabilidad HIPAA
 * para el personal, no seguridad perimetral, y mezclarlas haría que esta
 * pantalla no sirva para ninguna de las dos cosas.
 */

/** Las acciones del candado. Todo lo demás de `audit_logs` no es de acá. */
export const ACCIONES = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED'] as const;
export type Accion = (typeof ACCIONES)[number];

/** Los cinco módulos, en el orden en que se muestran. */
export const MODULOS = [
  { id: 'clinica',   nombre: 'Clinic',    host: 'clinic.lienmaster.net' },
  { id: 'providers', nombre: 'Providers', host: 'provider.lienmaster.net' },
  { id: 'attorneys', nombre: 'Attorneys', host: 'attorney.lienmaster.net' },
  { id: 'timeclock', nombre: 'TimeClock', host: 'pmtc.lienmaster.net' },
  { id: 'admin',     nombre: 'Admin',     host: 'admin.lienmaster.net' },
] as const;

/**
 * Qué protege hoy a cada módulo.
 *
 * ⚠️ Esto es una tabla ESCRITA A MANO, y tiene que serlo: son hechos del
 * código y de la configuración de despliegue, no filas de una base. Nada en
 * tiempo de ejecución puede preguntar "¿esta app tiene HSTS?" sin pedírselo a
 * sí misma por la red.
 *
 * **Por eso lleva fecha de medición.** Una matriz de seguridad que miente es
 * peor que no tenerla: da tranquilidad sin cubrir nada. Si tocás una de estas
 * protecciones en una app, actualizá la fila y la fecha.
 *
 * ⚠️ TRES DE LOS CINCO MÓDULOS SON LA MISMA APP. Medido el 2026-10-05 contra
 * producción: clinic, provider y attorney devuelven la MISMA `Permissions-Policy`
 * —micrófono incluido— porque los tres hosts los sirve `apps/back-office`. Lo
 * que se despliega de verdad son tres cosas: back-office, timeclock y el Admin.
 *
 * Por eso esas tres columnas van siempre iguales en las filas de infraestructura
 * (cabeceras, freno, endpoint). Se muestran separadas igual porque para quien mira
 * la pantalla son tres puertas distintas, y lo que cambia entre ellas —quién entra,
 * desde dónde— sí es distinto.
 *
 * Medido el 2026-10-05 leyendo el código y las respuestas de producción:
 *  · cabeceras → `next.config.mjs` de cada app (solo back-office las declara;
 *    `provider` sale del mismo build que `clinic`, así que las hereda)
 *  · 2FA → si la pantalla de login tiene el paso de MFA
 *  · freno y origen → `api/auth/lockout/route.ts`, desplegado en `e3ac5e57`
 */
export const MEDIDO_EL = '2026-10-05';

export interface Proteccion {
  /**
   * El identificador manda: el nombre y el detalle que se leen en pantalla
   * viven en `security.prot.<id>.nombre` y `.detalle` de los `messages`, para
   * que sigan al selector ES/EN. Acá queda solo lo que es un hecho del código.
   *
   * Si agregás una protección, agregá también sus dos claves en los DOS
   * idiomas: next-intl no falla con una clave faltante, pinta la clave cruda.
   */
  id: string;
  /** Por módulo: true = cubierto, false = abierto, 'parcial' = existe pero no se usa. */
  estado: Record<string, boolean | 'parcial'>;
}

export const PROTECCIONES: Proteccion[] = [
  {
    id: 'candado',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'aviso',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'registro',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'freno',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'origen',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'mfa',
    estado: { clinica: 'parcial', providers: 'parcial', attorneys: 'parcial', timeclock: false, admin: false },
  },
  {
    id: 'cabeceras',
    /*
     * Las cinco, desde `8d3a1fb2`. Medido el 2026-10-05 contra producción, no
     * deducido del `next.config.mjs`: la vez anterior lo deduje y dije que
     * Attorneys no las tenía, cuando a ese host lo sirve el mismo build que a
     * Clinic.
     *
     *   admin.lienmaster.net → HSTS · SAMEORIGIN · nosniff · camera=() micro=() geo=()
     *   pmtc.lienmaster.net  → HSTS · SAMEORIGIN · nosniff · camera=() micro=() geo=(self)
     */
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
];

export interface Evento {
  accion: Accion;
  cuando: string;
  ip: string | null;
  correo: string | null;
  modulo: string | null;
  pais: string | null;
  ciudad: string | null;
  intentos: number | null;
}

export interface PorIp {
  ip: string;
  fallidos: number;
  exitosos: number;
  pais: string | null;
  ciudad: string | null;
  ultimo: string;
  modulos: string[];
}

export interface Cuentas {
  total: number;
  sinMfa: number;
  adminsSinMfa: number;
  pendientesQueEntran: number;
  nuncaEntraron: number;
  trabadasAhora: number;
  /** El `id` es para el botón de desbloquear: `/api/users/[id]/unlock`. */
  conIntentos: Array<{ id: string; correo: string; intentos: number; hasta: string | null }>;
}

/** Una IP echada, tal como la muestra la pantalla. */
export interface IpEchada {
  ip: string;
  motivo: string | null;
  bloqueadaEl: string;
  /** `null` = hasta que alguien la saque. */
  hasta: string | null;
  pais: string | null;
  ciudad: string | null;
}

export interface DatosSeguridad {
  eventos: Evento[];
  porIp: PorIp[];
  cuentas: Cuentas;
  /**
   * Las direcciones echadas. Van en los datos y no en una consulta aparte de
   * la pantalla para que el refresco automático las traiga junto con todo lo
   * demás: una lista de bloqueos que se queda vieja mientras el resto se
   * actualiza es peor que no tenerla.
   */
  bloqueadas: IpEchada[];
  desde: string;
  /**
   * El final de la ventana. Para "últimos N días" es ahora; para un mes
   * cerrado es el primer instante del mes siguiente.
   *
   * Viaja a la pantalla porque los cubos de las chispas y la cercanía del
   * radar se reparten entre `desde` y `hasta`. Antes usaban `Date.now()`, que
   * para un mes terminado empuja todo contra el borde izquierdo y deja el
   * gráfico plano.
   */
  hasta: string;
  /** Falso cuando la consulta falló: la pantalla lo dice en vez de mostrar ceros. */
  ok: boolean;
}

