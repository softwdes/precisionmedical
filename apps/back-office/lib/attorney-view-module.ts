/**
 * Llave de la capacidad "ver como bufete" dentro de `users.clinicModules`.
 *
 * Espejo exacto de `doctor-view-module.ts`, y por el mismo motivo vive sola y
 * sin imports: la comparten dos runtimes, el middleware (Edge) y los server
 * components (Node). `lib/get-session-lawyer.ts` la re-exporta junto al helper
 * que la evalúa — importarla desde allá arrastraría Prisma al bundle del Edge.
 *
 * A diferencia de los menús del back-office, esta capacidad es OPT-IN: un menú
 * se ve salvo que su llave esté en `false`, así que un mapa nulo ("Visión
 * completa") los concede todos. Abrir el despacho de otro no puede caer de esa
 * regla — solo cuenta un `true` explícito.
 *
 * Hasta que existió esta llave, el portal legal era "rol admin o nada": para
 * que alguien probara la vista del bufete había que subirlo a ADMIN, que le
 * daba de paso el back-office entero.
 */
export const ATTORNEY_VIEW_MODULE = 'attorney';
