import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import superjson from 'superjson';
import type { User, UserRole, Session } from '@precision-medical/database';

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
