/**
 * Llave de la capacidad "ver como doctor" dentro de `users.clinicModules`.
 *
 * Vive sola, sin imports, porque la comparten dos runtimes: el middleware (Edge)
 * y los server components (Node). `lib/get-session-provider.ts` la re-exporta
 * junto con el helper que la evalúa — importar desde allá arrastraría Prisma al
 * bundle del Edge.
 *
 * A diferencia de los menús del back-office, esta capacidad es OPT-IN: un menú se
 * ve salvo que su llave esté en `false`, así que un mapa nulo ("Visión completa")
 * los concede todos. Suplantar a un médico no puede caer de esa regla — solo
 * cuenta un `true` explícito.
 */
export const DOCTOR_VIEW_MODULE = 'doctor';
