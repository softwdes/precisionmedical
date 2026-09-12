/**
 * El motor de agentes, compartido por las apps.
 *
 * ── Por qué es un paquete y no una carpeta de una app ───────────────────────
 *
 * Nació en `apps/back-office/lib/agente/` cuando Vigía y CIFO tuvieron que
 * dejar de copiarse. Se mudó acá (2026-09-12) cuando apareció el TERCER
 * consumidor: el Admin, que tenía su propio agente escrito aparte contra otro
 * proveedor.
 *
 * Ese agente del Admin es la prueba de por qué esto tiene que vivir una sola
 * vez: quedó apuntando a un modelo que fue retirado del catálogo, y como nadie
 * comparte código con él, **nadie se enteró de que estaba muerto**.
 *
 * ── Qué NO sabe este paquete ───────────────────────────────────────────────
 *
 * Nada del dominio. No sabe qué es un caso, un paciente, una caja ni un
 * bufete. Recibe un `alcance` genérico, se lo pasa a las herramientas y nunca
 * lo mira. Lo único que sabe es cómo hablar con el proveedor y cómo correr el
 * lazo de herramientas.
 *
 * Cada app aporta lo suyo: su alcance, sus herramientas, su prompt y sus
 * botones.
 */
export * from './tipos';
export * from './lazo';
