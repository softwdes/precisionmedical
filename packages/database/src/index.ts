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

// Códigos consecutivos de caso y paciente (estilo v2) — leer las notas de
// codes.ts antes de usarlas: van dentro de una transacción junto al INSERT.
export { nextCaseCode, nextPatientCode, casePrefixFor } from './codes';

// Edad / menor de edad — define quién firma los consentimientos y el lien.
export { calcAge, isMinor, EDAD_ADULTO } from './age';

// Tutor / apoderado de un menor — regla ÚNICA de crear/vincular. Va dentro de
// la misma transacción que el menor; leer las notas de guardian.ts.
export { resolveGuardian, GuardianIsSelfError, GUARDIAN_RELATIONS } from './guardian';
export type {
  GuardianInput, GuardianRelation, GuardianAction, GuardianResolution,
  ResolveGuardianOptions,
} from './guardian';

// Acción del audit log → área de trabajo. Compartido: el tab Métricas de
// apps/web y `/carrera` del back-office cuentan lo mismo con la misma tabla.
export {
  ACTION_FAMILY, NOT_STAFF_WORK, HEADLINE_ACTIONS,
  emptyFamilies, emptyHeadline,
} from './action-families';
export type { ActionFamily, EmployeeHeadline } from './action-families';
