import 'server-only';
import { createAdminClient } from '@precision-medical/auth/server';
import { listarBloqueadas } from '@precision-medical/auth/ips-bloqueadas';
import { ACCIONES, type Accion, type Cuentas, type DatosSeguridad, type Evento, type IpEchada, type PorIp } from './modelo';

/**
 * La consulta del Centro de Seguridad. Solo servidor.
 *
 * Se lee por REST contra el proyecto **Admin** — el mismo camino que usa
 * `api/auth/record-login` y el candado. Acá vive la cuenta con la que la gente
 * entra y acá se escribe cada intento, así que no hay nada que cruzar con la
 * base clínica.
 *
 * El registro de auditoría de la CLÍNICA (quién tocó la ficha de un paciente)
 * vive en la otra base y se mira desde el back-office: es trazabilidad HIPAA
 * para el personal, no seguridad perimetral.
 *
 * Los módulos, las protecciones y los tipos están en `modelo.ts`, que la
 * pantalla puede importar sin arrastrar `server-only` — ver la nota de allá.
 */
/** Ventana por defecto: dos días. Es lo que cabe en una pantalla sin filtrar. */
const DIAS = 2;

/** La ventana que se consulta. `hasta` abierto significa "hasta ahora". */
export interface Ventana { desde: string; hasta?: string }

/** Los últimos N días, que es lo que pide la pantalla cuando no eligen un mes. */
export const ultimosDias = (dias: number): Ventana =>
  ({ desde: new Date(Date.now() - dias * 86_400_000).toISOString() });

/**
 * Un mes cerrado, de `YYYY-MM`, en UTC.
 *
 * En UTC y no en la hora de la clínica a propósito: las filas se guardan en
 * UTC, así que un mes definido en UTC se corresponde exactamente con un corte
 * de la columna. Definirlo en Denver movería el borde seis horas y las últimas
 * seis horas de cada mes caerían en el reporte del mes siguiente —un desfase
 * que nadie ve hasta que dos reportes no suman el total.
 */
export function mesCerrado(mes: string): Ventana | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const anio = Number(m[1]);
  const num = Number(m[2]);
  if (num < 1 || num > 12) return null;
  return {
    desde: new Date(Date.UTC(anio, num - 1, 1)).toISOString(),
    hasta: new Date(Date.UTC(anio, num, 1)).toISOString(),
  };
}

/**
 * Le devuelve la `Z` a las fechas que vienen de Postgres.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * El candado escribe `createdAt: new Date().toISOString()` — o sea UTC, con la
 * `Z`. Pero la columna es `timestamp` **sin** zona, así que PostgREST la
 * devuelve pelada: `2026-10-06T17:56:29.88`.
 *
 * Y una cadena sin zona, para JavaScript, es hora **local del navegador**. No
 * UTC. Así que la misma fila se dibujaba distinto en cada máquina, corrida
 * tantas horas como el huso de quien mirara.
 *
 * Medido el 2026-10-06 con el primer ingreso de Erick al Admin: ocurrió a las
 * 11:56 de Utah y la pantalla lo mostraba a las 16:56 — **279 minutos en el
 * futuro**, mientras el reloj de la barra marcaba 13:15. Él lo vio antes que yo.
 *
 * Se arregla acá, en el servidor, y no en la pantalla: así lo que viaja al
 * navegador ya es una fecha sin ambigüedad, y las cuentas que hace la pantalla
 * —los cubos de las chispas, la cercanía del radar, "hace cuánto"— salen bien
 * sin que cada una tenga que acordarse.
 */
const utc = (v: string | null | undefined): string | null => {
  if (!v) return null;
  return /[Zz]$|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`;
};

export async function leerSeguridad(ventana: Ventana = ultimosDias(DIAS)): Promise<DatosSeguridad> {
  const admin = createAdminClient();
  const { desde } = ventana;
  const hasta = ventana.hasta ?? new Date().toISOString();
  const vacio: DatosSeguridad = {
    eventos: [], porIp: [], bloqueadas: [], desde, hasta,
    cuentas: { total: 0, sinMfa: 0, adminsSinMfa: 0, pendientesQueEntran: 0, nuncaEntraron: 0, trabadasAhora: 0, conIntentos: [] },
    ok: false,
  };

  const [regs, usrs, echadas] = await Promise.all([
    admin.from('audit_logs')
      .select('action, ipAddress, createdAt, metadata, actorUserId')
      .in('action', ACCIONES as unknown as string[])
      .gte('createdAt', desde)
      .lt('createdAt', hasta)
      .order('createdAt', { ascending: false })
      .limit(2000),
    admin.from('users')
      .select('id, email, role, status, mfaEnabled, lastLoginAt, failedLoginAttempts, lockedUntil')
      .is('deletedAt', null),
    /*
     * La lista de bloqueadas va en el MISMO `Promise.all`: cada viaje a la
     * base cuesta ~137 ms y lo que importa en esta pantalla es cuántos van en
     * fila, no cuántos hay. En paralelo no cuesta nada.
     *
     * `listarBloqueadas` nunca lanza: si la tabla todavía no existe en el
     * proyecto Admin devuelve una lista vacía y el resto de la pantalla
     * funciona igual. Es a propósito: el DDL lo corre Erick a mano y el
     * despliegue puede llegar antes.
     */
    listarBloqueadas(),
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
      cuando:  utc(r.createdAt as string)!,
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
    /**
     * ⚠️ NO es "las inactivas entran". `INACTIVE` y `SUSPENDED` SÍ bloquean:
     * están en `BLOCKING_STATUSES` y el middleware las manda a /no-access.
     *
     * El agujero es `PENDING_VERIFICATION`: parece un candado en la lista de
     * usuarios y no retiene nada. Medido el 2026-10-05: las 10 cuentas no
     * activas son exactamente de ese estado.
     *
     * Se cuenta así —por el estado concreto y no por "distinto de ACTIVE"—
     * porque la primera versión de esta fila decía que las suspendidas entraban,
     * y eso era falso. Una pantalla de seguridad que exagera un riesgo enseña a
     * no creerle.
     */
    pendientesQueEntran: us.filter((u) => u.status === 'PENDING_VERIFICATION').length,
    nuncaEntraron: us.filter((u) => !u.lastLoginAt).length,
    trabadasAhora: us.filter((u) => {
      const hasta = utc(u.lockedUntil as string | null);
      return hasta !== null && new Date(hasta).getTime() > ahora;
    }).length,
    conIntentos: us
      .filter((u) => (u.failedLoginAttempts as number) > 0 || u.lockedUntil)
      .map((u) => ({
        id: u.id as string,
        correo: u.email as string,
        intentos: (u.failedLoginAttempts as number) ?? 0,
        hasta: utc(u.lockedUntil as string | null),
      })),
  };

  const bloqueadas: IpEchada[] = echadas.map((b) => ({
    ip: b.ip,
    motivo: b.motivo,
    bloqueadaEl: utc(b.bloqueadaEl)!,
    hasta: utc(b.hasta),
    pais: b.pais,
    ciudad: b.ciudad,
  }));

  return { eventos, porIp, cuentas, bloqueadas, desde, hasta, ok: true };
}
