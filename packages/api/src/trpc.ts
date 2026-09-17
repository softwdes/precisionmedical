import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import superjson from 'superjson';
import type { User, UserRole, Session } from '@precision-medical/database';
import { supabaseAdmin } from './supabase-admin';

export interface Context {
  user: (User & { role: UserRole }) | null;
  session: Session | null;
  ipAddress?: string;
  userAgent?: string;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

const loggingMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const ms = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[tRPC] ${type} ${path} - ${ms}ms - ${result.ok ? 'OK' : 'ERR'}`);
  }
  return result;
});

const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be logged in.' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireRole = (allowedRoles: UserRole[]) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || !allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });

export const publicProcedure = t.procedure.use(loggingMiddleware);

export const protectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware);

export const adminProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['ADMIN', 'SUPER_ADMIN'] as UserRole[]));

export const superAdminProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['SUPER_ADMIN'] as UserRole[]));

/**
 * Nómina: ADMIN, SUPER_ADMIN y **CONTADOR**.
 *
 * Existe porque el Contador entra legítimamente al Admin —el middleware lo
 * manda a /dashboard/employees y esa pantalla tiene su modo `payroll_only`— y
 * ahí consume `payments.list` y `payments.getSummary`. Subirlos a
 * `adminProcedure` le rompería la pantalla; dejarlos en `protectedProcedure` los
 * deja abiertos a cualquiera que esté logueado. Este es el punto medio, y es el
 * mínimo: no incluye a EMPLOYEE, DOCTOR ni LAWYER.
 */
export const payrollProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['ADMIN', 'SUPER_ADMIN', 'CONTADOR'] as UserRole[]));

/**
 * Agentes IA: ADMIN + SUPER_ADMIN + AUDITOR_AI.
 *
 * `agentes_ia` es el UNICO modulo del Admin donde la matriz de permisos le da
 * acceso real al AUDITOR_AI ('write'), y su pantalla ya lo respeta —
 * `dashboard/ai-agents/page.tsx` gatea con `can(role, 'agentes_ia')`—. Por eso el
 * middleware lo deja pasar la puerta cuando bloquea a doctores y abogados.
 *
 * Subir estas lecturas a `adminProcedure` le romperia la unica pantalla que ese
 * rol tiene; dejarlas en `protectedProcedure` las deja abiertas a cualquiera con
 * sesion. Este es el punto medio.
 */
export const aiAuditProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['ADMIN', 'SUPER_ADMIN', 'AUDITOR_AI'] as UserRole[]));

/**
 * Finanzas: ADMIN, SUPER_ADMIN, o **cualquiera con la casilla en su ficha**.
 *
 * Es el primer permiso del Admin que NO se decide solo por el rol, y por eso
 * merece la explicación entera.
 *
 * ── Por qué no alcanzaba un rol ─────────────────────────────────────────────
 *
 * Erick necesita darle Finanzas a UNA persona hoy (Darrell, que es EMPLOYEE) y
 * quizá a dos más, sin que compartan nada más entre sí. Un rol nuevo obliga a
 * que todos los que lo tengan vean lo mismo, y cambiar la matriz de `employee`
 * se lo daría a los 17.
 *
 * ── Por qué no alcanzaba con dejarlo entrar ─────────────────────────────────
 *
 * Los 16 procedimientos de `pettyCash` eran `adminProcedure`. Aunque el
 * middleware lo dejara pasar y el menú se le dibujara, **cada consulta de la
 * pantalla habría devuelto FORBIDDEN** y Finanzas se vería vacía. El permiso
 * vive en dos mitades y hay que mover las dos.
 *
 * ── Por qué un procedure nuevo y no ampliar `adminProcedure` ────────────────
 *
 * Porque `adminProcedure` también gobierna `wallets` y parte de `users`.
 * Ampliarlo para que entre un empleado con la casilla de Finanzas le abriría de
 * paso las billeteras y la administración de cuentas. Este es el mismo punto
 * medio que ya resolvieron `payrollProcedure` para el Contador y
 * `aiAuditProcedure` para el auditor: un procedure por alcance.
 */
const GRANT_FINANZAS = 'admin:finanzas';

export const finanzasProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(
    t.middleware(async ({ ctx, next }) => {
      const u = ctx.user;
      if (!u) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be logged in.' });

      // El rol se resuelve primero y corta: así un admin no paga la consulta.
      if (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') {
        return next({ ctx: { ...ctx, user: u } });
      }

      /**
       * La casilla se consulta por REST y no por Prisma: `clinicModules` **no
       * está en el schema de Prisma**, vive solo en la tabla `users` del
       * proyecto Admin y todo el repo la lee así (ver `users.list` en este
       * mismo paquete). Buscarla en `ctx.user` no compila.
       *
       * Es OPT-IN — solo un `true` explícito. Al revés que los menús de la
       * clínica, y por el mismo motivo que la supervisión de notas: acá adentro
       * está la caja chica de toda la empresa.
       *
       * `ilike` y no `eq`: Supabase Auth normaliza el email a minúsculas y el
       * directorio no siempre. Esa diferencia ya dejó gente sin permisos antes.
       */
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('clinicModules')
        .ilike('email', u.email)
        .limit(1);

      // Ante un fallo de la consulta NO se concede: el default es el de antes.
      if (error) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      const mods = (data?.[0] as { clinicModules?: Record<string, unknown> | null } | undefined)
        ?.clinicModules ?? null;

      if (mods?.[GRANT_FINANZAS] !== true) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      return next({ ctx: { ...ctx, user: u } });
    }),
  );

export const lawyerProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['LAWYER'] as UserRole[]));

export const providerProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['PROVIDER'] as UserRole[]));

export const router = t.router;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;
