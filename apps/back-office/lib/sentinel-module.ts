/**
 * Llave de la capacidad "Sentinel" dentro de `users.clinicModules`.
 *
 * Vive sola, sin imports, porque la comparten dos runtimes: el middleware (Edge)
 * y los server components (Node). Importarla desde `lib/sentinel/agent.ts`
 * arrastraría el SDK del proveedor al bundle del Edge — el mismo motivo por el
 * que `notes-audit-module.ts` y `doctor-view-module.ts` están separados.
 *
 * Es OPT-IN, igual que la supervisión de notas y al revés que los menús del
 * back-office: un menú se ve salvo que su llave esté en `false`, así que un mapa
 * nulo ("Visión completa") los concede todos. Sentinel no puede caer de esa
 * regla — le contesta sobre los saldos de toda la clínica, las notas que debe
 * cada provider y los códigos de caso del padrón entero. Solo cuenta un `true`
 * explícito, o ser SUPER_ADMIN/ADMIN.
 */
export const SENTINEL_MODULE = 'sentinel';
