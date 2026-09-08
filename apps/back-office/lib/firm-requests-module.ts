/**
 * Llave de la capacidad "Pedidos de bufetes" dentro de `users.clinicModules`.
 *
 * Vive sola, sin imports, porque la comparten dos runtimes: el middleware (Edge)
 * y los server components (Node) — mismo motivo que `notes-audit-module.ts`.
 *
 * Es OPT-IN, igual que Notas clínicas y al revés que los menús del back-office:
 * un menú se ve salvo que su llave esté en `false`, así que un mapa nulo
 * ("Visión completa") los concede todos. Esta pantalla lista TODO lo que los
 * bufetes le pidieron a la clínica —con paciente, caso y quién respondió— y no
 * puede caer de esa regla. Solo cuenta un `true` explícito, o ser
 * SUPER_ADMIN/ADMIN. (Erick, 2026-09-08: "dale check para que lo puedan ver,
 * lo mismo que clinic notes".)
 */
export const FIRM_REQUESTS_MODULE = 'firmRequests';
