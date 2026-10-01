/**
 * Cuánto dura una cita cuando nadie eligió otra cosa.
 *
 * ── Por qué una constante ───────────────────────────────────────────────────
 *
 * Había SIETE defaults para este mismo dato, con TRES valores distintos: 15 en
 * el calendario, 30 en agendar-desde-el-caso y en dos rutas, 45 en el alta de
 * caso y en el sugeridor de horarios. O sea que la duración de la cita dependía
 * de por cuál pantalla se había entrado.
 *
 * No era teórico. Medido el 2026-10-01 sobre 8.657 citas: la clínica agenda a
 * 15 minutos el **79 %** de las veces. Pero en los últimos 7 días **el 52 % de
 * las citas nuevas salieron de 30**, porque el default las empuja y nadie lo
 * corrige cada vez. Son ~17 horas de agenda bloqueada por semana que nadie usa.
 *
 * Erick, 2026-10-01: *"la regla es que para todos la cita debe ser 15 min por
 * defecto"*.
 *
 * ── Por qué acá y no en `packages/database` ─────────────────────────────────
 *
 * Como `VIGENTES`, esto lo necesitan varios archivos. Pero a diferencia de
 * `VIGENTES`, tres de los que lo usan son **componentes de cliente**, y el
 * paquete de base construye el `PrismaClient` en su `index`: importarlo desde
 * el navegador se lleva Prisma al bundle. Un archivo sin un solo import —como
 * éste— lo pueden leer las dos mitades.
 *
 * El único que no puede importarlo es `packages/api/src/routers/appointments.ts`,
 * porque un paquete no puede depender de una app. Ahí el 15 está escrito a mano
 * con una nota que apunta acá.
 *
 * ── Qué NO es ───────────────────────────────────────────────────────────────
 *
 * Es el valor con el que ABRE el formulario, no un límite: quien necesite 30 o
 * 45 los sigue eligiendo, y ninguna cita existente cambia.
 */
export const DURACION_CITA_POR_DEFECTO = 15;
