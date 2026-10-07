import { router, superAdminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { misIds } from '../mis-ids';

/**
 * Las incidencias de seguridad abiertas, para el contador del Admin.
 *
 * Erick, 2026-10-07: *"en admin debe mostrar los íconos de 1, 2, 3, etc. de
 * incidencias para saber qué pasa"*.
 *
 * ── Qué cuenta como incidencia, y qué NO ───────────────────────────────────
 *
 * Solo lo que alguien puede CERRAR hoy:
 *
 *  · una cuenta trabada  → se desbloquea
 *  · una IP que solo falló → se bloquea
 *  · un aviso sin leer   → se lee
 *
 * Queda afuera a propósito lo que es una CONDICIÓN y no un hecho: "0 de 30
 * tienen doble factor" es verdad todos los días y nadie la cierra en una
 * tarde. Metida acá, el contador nunca bajaría de 1 y en una semana sería
 * papel pintado — que es exactamente lo contrario de lo que se pidió, que es
 * poder tratarlo como urgencia apenas aparezca.
 *
 * Un contador que puede llegar a cero es un contador que se mira.
 *
 * ── Por qué superAdmin y no admin ─────────────────────────────────────────
 *
 * Porque es quien ve la pantalla: en `permissions.ts` el módulo `seguridad`
 * está en `write` solo para `super_admin` y en `none` para `admin`, `contador`
 * y `employee`. El contador no puede ser más laxo que lo que cuenta.
 *
 * ── Por qué es barato ──────────────────────────────────────────────────────
 *
 * Lo pide el sidebar, que se dibuja en TODAS las pantallas, así que se sondea
 * cada 60 s. Son tres consultas chicas y acotadas: 30 filas de `users`, los
 * ingresos de las últimas 24 h (59 en los últimos SIETE días, medido) y un
 * `count` con `head`. Nada que crezca con el tiempo.
 */

/** Cuántas horas mira la caza de IPs. Un día: lo de ayer ya se revisó. */
const HORAS = 24;

export const seguridadRouter = router({
  incidencias: superAdminProcedure.query(async ({ ctx }) => {
    const ahora = Date.now();
    const desde = new Date(ahora - HORAS * 3_600_000).toISOString();

    /*
     * 1 · Cuentas trabadas AHORA.
     *
     * Se traen las 30 filas y se filtra acá, igual que hace la pantalla de
     * seguridad. Comparar `lockedUntil` en la consulta sería más corto y más
     * frágil: la columna es `timestamp` SIN zona y mandarle un ISO con `Z`
     * deja la comparación a merced del casteo. Con 30 filas no vale el riesgo.
     */
    const { data: us } = await supabaseAdmin
      .from('users')
      .select('lockedUntil');

    const trabadas = (us ?? []).filter((u) => {
      const v = (u as { lockedUntil?: string | null }).lockedUntil;
      if (v === null || v === undefined || v === '') return false;
      // Sin `Z` explícita, `new Date` la leería como hora local del servidor.
      const iso = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`;
      return new Date(iso).getTime() > ahora;
    }).length;

    /*
     * 2 · Direcciones que solo fallaron en las últimas 24 h.
     *
     * "Solo fallaron" y no "fallaron": la salida a internet de la clínica
     * junta tipeos de todo el personal y aparecería todos los días. Una IP sin
     * un solo acierto es la que no es de nadie.
     */
    const { data: ev } = await supabaseAdmin
      .from('audit_logs')
      .select('action, ipAddress')
      .in('action', ['LOGIN_FAILED', 'LOGIN_SUCCESS'])
      .gte('createdAt', desde)
      .limit(2000);

    const porIp = new Map<string, { ok: number; mal: number }>();
    for (const e of ev ?? []) {
      const ip = (e as { ipAddress?: string | null }).ipAddress;
      if (ip === null || ip === undefined || ip === '') continue;
      const fila = porIp.get(ip) ?? { ok: 0, mal: 0 };
      if ((e as { action: string }).action === 'LOGIN_SUCCESS') fila.ok += 1;
      else fila.mal += 1;
      porIp.set(ip, fila);
    }
    const ipsSoloFallos = [...porIp.values()].filter((x) => x.mal > 0 && x.ok === 0).length;

    /*
     * 3 · Avisos de seguridad sin leer, de esta persona.
     *
     * `misIds` y no `ctx.user.id`: hay una cuenta cuyos dos ids no coinciden y
     * es la del dueño. Ver el comentario largo en `mis-ids.ts`.
     */
    const { count } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .in('userId', await misIds(ctx))
      .eq('type', 'SYSTEM')
      .is('readAt', null);

    const avisosSinLeer = count ?? 0;

    return {
      trabadas,
      ipsSoloFallos,
      avisosSinLeer,
      total: trabadas + ipsSoloFallos + avisosSinLeer,
      horas: HORAS,
    };
  }),
});
