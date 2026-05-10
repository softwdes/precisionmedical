/**
 * tRPC Base Configuration
 * 
 * Defines:
 * - Context (user, db, request info)
 * - Base procedures (public, protected, admin)
 * - Middleware (auth, logging, rate limiting)
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import superjson from 'superjson';
import type { Session, User, UserRole } from '@prisma/client';

// =====================================================
// Context
// =====================================================

export interface Context {
  user: (User & { role: UserRole }) | null;
  session: Session | null;
  ipAddress?: string;
  userAgent?: string;
}

// =====================================================
// Initialize tRPC
// =====================================================

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

// =====================================================
// Reusable middleware
// =====================================================

/**
 * Logging middleware. Logs every request with timing.
 */
const loggingMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const ms = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[tRPC] ${type} ${path} - ${ms}ms - ${result.ok ? 'OK' : 'ERR'}`);
  }
  
  return result;
});

/**
 * Auth middleware. Requires valid session.
 */
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in.',
    });
  }
  
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,  // Now non-null
      session: ctx.session,  // Now non-null
    },
  });
});

/**
 * Role-check middleware factory.
 */
const requireRole = (allowedRoles: UserRole[]) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || !allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }
    
    return next({ ctx: { ...ctx, user: ctx.user } });
  });

// =====================================================
// Procedures
// =====================================================

/** Anyone can call. Use sparingly. */
export const publicProcedure = t.procedure.use(loggingMiddleware);

/** Requires authentication. */
export const protectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware);

/** Requires admin or super_admin role. */
export const adminProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['ADMIN', 'SUPER_ADMIN']));

/** Requires super_admin role. */
export const superAdminProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['SUPER_ADMIN']));

/** For lawyer portal endpoints. */
export const lawyerProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['LAWYER']));

/** For provider portal endpoints. */
export const providerProcedure = t.procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(requireRole(['PROVIDER']));

// =====================================================
// Router builders
// =====================================================

export const router = t.router;
export const middleware = t.middleware;
