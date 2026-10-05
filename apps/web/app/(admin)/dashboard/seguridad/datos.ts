import 'server-only';
import { createAdminClient } from '@precision-medical/auth/server';
import { ACCIONES, type Accion, type Cuentas, type DatosSeguridad, type Evento, type PorIp } from './modelo';

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

export async function leerSeguridad(dias = DIAS): Promise<DatosSeguridad> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const vacio: DatosSeguridad = {
    eventos: [], porIp: [], desde,
    cuentas: { total: 0, sinMfa: 0, adminsSinMfa: 0, pendientesQueEntran: 0, nuncaEntraron: 0, trabadasAhora: 0, conIntentos: [] },
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
