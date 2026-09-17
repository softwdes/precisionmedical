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

// Las fotos de identidad como DOCUMENTOS del paciente. Compartido: las suben
// `apps/forms` (el paciente desde su link) y `apps/back-office` (el staff), y
// las tres vías tienen que dejar la misma fila. Leer el encabezado antes de
// tocarlo: la fila va con `caseId: null` a propósito, porque el portal del
// bufete sirve todos los documentos de un caso.
export {
  archivarFotoDeIdentidad, papelerizarFotoDeIdentidad, restaurarFotoDeIdentidad,
  esSlotFoto, SLOTS_FOTO,
} from './foto-identidad';
// Y el lector: las fotos que la persona ya tiene, para no volver a pedírselas.
// El caso gana sobre la persona; `resolverFotosDeIdentidad` además dice CUÁLES
// vienen heredadas, que es lo que el formulario del paciente necesita saber.
export {
  fotosDelPaciente, fotosConRespaldo, resolverFotosDeIdentidad,
  clavesDeFotosDelPaciente,
} from './foto-identidad';
export type { SlotFoto, FotoParaArchivar, ResultadoArchivo, FotosResueltas } from './foto-identidad';

// El seguro que declaró el paciente en el intake → el seguro del CASO. El paso
// 6 lo guardaba en `consentsData.insurances` y nada lo promovía al campo que
// leen la portada y el PDF. Gana el staff: solo completa lo que está vacío.
export { promoverSeguroDeclarado, segurosMedicosDeclarados } from './seguro-declarado';
export type { SeguroDeclarado, ResultadoPromocion } from './seguro-declarado';
