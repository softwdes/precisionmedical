import 'server-only';
import { createAdminClient } from '@precision-medical/auth/server';

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
const ACCIONES = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED'] as const;
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
 * Medido el 2026-10-05 leyendo el código de las cinco apps:
 *  · cabeceras → `next.config.mjs` de cada app (solo back-office las declara;
 *    `provider` sale del mismo build que `clinic`, así que las hereda)
 *  · 2FA → si la pantalla de login tiene el paso de MFA
 *  · freno y origen → `api/auth/lockout/route.ts`, desplegado en `e3ac5e57`
 */
export const MEDIDO_EL = '2026-10-05';

export interface Proteccion {
  id: string;
  nombre: string;
  detalle: string;
  /** Por módulo: true = cubierto, false = abierto, 'parcial' = existe pero no se usa. */
  estado: Record<string, boolean | 'parcial'>;
}

export const PROTECCIONES: Proteccion[] = [
  {
    id: 'candado', nombre: 'Account lockout',
    detalle: '3 wrong passwords and the account closes until tomorrow',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'aviso', nombre: 'Warning before lockout',
    detalle: '"1 attempt left" on the second failure',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'registro', nombre: 'IP logging',
    detalle: 'Every attempt stored with its IP, country, city and module',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'freno', nombre: 'Per-IP throttle',
    detalle: '8 reports and 30 checks per IP every 10 minutes',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'origen', nombre: 'Attempt endpoint closed',
    detalle: 'Rejects anything that does not come from our own screens',
    estado: { clinica: true, providers: true, attorneys: true, timeclock: true, admin: true },
  },
  {
    id: 'mfa', nombre: 'Two-factor step',
    detalle: 'Built into the login — but nobody has it turned on yet',
    estado: { clinica: 'parcial', providers: 'parcial', attorneys: 'parcial', timeclock: false, admin: false },
  },
  {
    id: 'cabeceras', nombre: 'Security headers',
    detalle: 'HSTS, anti-clickjacking, anti-sniffing',
    estado: { clinica: true, providers: true, attorneys: false, timeclock: false, admin: false },
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
  inactivasQueEntran: number;
  nuncaEntraron: number;
  trabadasAhora: number;
  conIntentos: Array<{ correo: string; intentos: number; hasta: string | null }>;
}

export interface DatosSeguridad {
  eventos: Evento[];
  porIp: PorIp[];
  cuentas: Cuentas;
  desde: string;
  /** Falso cuando la consulta falló: la pantalla lo dice en vez de mostrar ceros. */
  ok: boolean;
}

/** Ventana por defecto: dos días. Es lo que cabe en una pantalla sin filtrar. */
const DIAS = 2;

export async function leerSeguridad(dias = DIAS): Promise<DatosSeguridad> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const vacio: DatosSeguridad = {
    eventos: [], porIp: [], desde,
    cuentas: { total: 0, sinMfa: 0, adminsSinMfa: 0, inactivasQueEntran: 0, nuncaEntraron: 0, trabadasAhora: 0, conIntentos: [] },
    ok: false,
  };

  const [regs, usrs] = await Promise.all([
    admin.from('audit_logs')
      .select('action, ipAddress, createdAt, metadata, actorUserId')
      .in('action', ACCIONES as unknown as string[])
      .gte('createdAt', desde)
      .order('createdAt', { ascending: false })
      .limit(500),
    admin.from('users')
      .select('id, email, role, status, mfaEnabled, lastLoginAt, failedLoginAttempts, lockedUntil')
      .is('deletedAt', null),
  ]);

  if (regs.error || usrs.error || !regs.data || !usrs.data) {
    console.error('[seguridad] no se pudo leer:', regs.error?.message ?? usrs.error?.message);
    return vacio;
  }

  const correoDe = new Map(usrs.data.map((u) => [u.id as string, u.email as string]));
  const ahora = Date.now();

  const eventos: Evento[] = regs.data.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      accion:  r.action as Accion,
      cuando:  r.createdAt as string,
      ip:      (r.ipAddress as string | null) ?? null,
      correo:  correoDe.get(r.actorUserId as string) ?? null,
      modulo:  (m.app as string) ?? null,
      pais:    (m.pais as string) ?? null,
      ciudad:  (m.ciudad as string) ?? null,
      intentos: typeof m.failedAttempts === 'number' ? m.failedAttempts : null,
    };
  });

  /**
   * Agrupado por IP. Es la vista que detecta un ataque: muchos fallidos y cero
   * exitosos desde la misma dirección. Una IP con las dos cosas es alguien que
   * se equivocó y después entró.
   */
  const mapa = new Map<string, PorIp>();
  for (const e of eventos) {
    const ip = e.ip ?? '—';
    const x = mapa.get(ip) ?? { ip, fallidos: 0, exitosos: 0, pais: null, ciudad: null, ultimo: e.cuando, modulos: [] };
    if (e.accion === 'LOGIN_FAILED' || e.accion === 'ACCOUNT_LOCKED') x.fallidos++;
    if (e.accion === 'LOGIN_SUCCESS') x.exitosos++;
    x.pais   ??= e.pais;
    x.ciudad ??= e.ciudad;
    if (e.modulo && !x.modulos.includes(e.modulo)) x.modulos.push(e.modulo);
    if (e.cuando > x.ultimo) x.ultimo = e.cuando;
    mapa.set(ip, x);
  }
  const porIp = [...mapa.values()].sort((a, b) => b.fallidos - a.fallidos || b.exitosos - a.exitosos);

  const us = usrs.data;
  const esAdmin = (r: unknown): boolean => r === 'SUPER_ADMIN' || r === 'ADMIN';
  const cuentas: Cuentas = {
    total: us.length,
    sinMfa: us.filter((u) => !u.mfaEnabled).length,
    adminsSinMfa: us.filter((u) => esAdmin(u.role) && !u.mfaEnabled).length,
    // El estado dice inactiva o suspendida y el sistema la deja pasar igual.
    inactivasQueEntran: us.filter((u) => u.status !== 'ACTIVE').length,
    nuncaEntraron: us.filter((u) => !u.lastLoginAt).length,
    trabadasAhora: us.filter((u) => u.lockedUntil && new Date(u.lockedUntil as string).getTime() > ahora).length,
    conIntentos: us
      .filter((u) => (u.failedLoginAttempts as number) > 0 || u.lockedUntil)
      .map((u) => ({
        correo: u.email as string,
        intentos: (u.failedLoginAttempts as number) ?? 0,
        hasta: (u.lockedUntil as string | null) ?? null,
      })),
  };

  return { eventos, porIp, cuentas, desde, ok: true };
}
