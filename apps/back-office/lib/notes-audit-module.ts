/**
 * Llave de la capacidad "supervisión de notas" dentro de `users.clinicModules`.
 *
 * Vive sola, sin imports, porque la comparten dos runtimes: el middleware (Edge)
 * y los server components (Node). Importarla desde `lib/notes-audit.ts`
 * arrastraría Prisma al bundle del Edge — el mismo motivo por el que
 * `doctor-view-module.ts` está separado.
 *
 * Es OPT-IN, igual que el Portal Médico y al revés que los menús del
 * back-office: un menú se ve salvo que su llave esté en `false`, así que un mapa
 * nulo ("Visión completa") los concede todos. Esta pantalla lista al paciente de
 * TODOS los providers — no puede caer de esa regla. Solo cuenta un `true`
 * explícito, o ser SUPER_ADMIN/ADMIN.
 */
export const NOTES_AUDIT_MODULE = 'notesAudit';
