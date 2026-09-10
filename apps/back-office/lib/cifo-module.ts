/**
 * Llave de CIFO dentro de `users.clinicModules`.
 *
 * Vive sola, sin imports, porque la comparten dos runtimes: el middleware (Edge)
 * y los server components (Node). Importarla desde `lib/cifo/agent.ts`
 * arrastraría el SDK del proveedor al bundle del Edge — el mismo motivo por el
 * que `notes-audit-module.ts` y `doctor-view-module.ts` están separados.
 *
 * ## Cambió de regla el 2026-09-10 (Erick): ahora lo tiene TODO el back-office
 *
 * Nació OPT-IN —solo con un `true` explícito— por lo que contesta: saldos de la
 * clínica, notas que debe cada provider y códigos de caso del padrón. Con esa
 * regla la capacidad quedó en cero personas: nadie la tenía salvo los 3 admins,
 * que la reciben por rol, y ni siquiera existía la casilla para darla.
 *
 * Pasa a la regla de los MENÚS —**se ve salvo que esté en `false`**—, así que
 * un mapa nulo o sin esta llave la concede. Lo que hace que eso sea aceptable no
 * es la decisión sola: el propio agente trabaja **por código de caso y sin
 * nombres de paciente** (lo dice su texto de alcance en pantalla), así que lo
 * que se abre es el dato operativo de la clínica a la gente de la clínica.
 *
 * Se sigue pudiendo quitar por persona desde la ficha del Admin, que guarda
 * `cifo: false`.
 */
export const CIFO_MODULE = 'cifo';
