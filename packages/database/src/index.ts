import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';

// Phoenix 2026-06-05 — Audit log helpers (actorType-aware)
export { writeAuditLog, actorFromHeaders } from './audit';
export type { WriteAuditLogInput } from './audit';
