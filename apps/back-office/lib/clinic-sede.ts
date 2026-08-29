/**
 * Qué cuenta como SEDE de la clínica.
 *
 * La tabla `clinics` no guarda solo las sedes propias: también entran centros
 * externos a los que se deriva, y filas de prueba. No hay bandera que las
 * separe, así que la señal es la que ya usaba el Portal Legal (regla de Erick,
 * commit `89f64212`): **una sede es la que tiene dirección Y foto**.
 *
 * Pedir solo dirección no alcanza —los externos también la tienen— y fue
 * exactamente el bug de "Salt Lake Central Care", que salía en el carrusel del
 * bufete como una tarjeta en blanco.
 *
 * Medido 2026-08-29: 5 sedes (Murray, Pleasant Grove, Provo, Spanish Fork y
 * West Valley) contra ~15 filas más que son externos o prueba, con 0-2 citas
 * cada una.
 *
 * ⚠️ **Consecuencia a tener presente:** `Murray - Surgery` tiene 62 citas reales
 * pero NO tiene dirección ni foto, así que hoy la regla la deja afuera. La
 * solución es de datos, no de código — cargarle dirección y foto en Settings — y
 * con eso aparece bien acá y en el portal del bufete a la vez. Si en cambio se
 * relaja la regla, vuelven a colarse los externos.
 */

/** Fragmento `where` de Prisma. Para consultas que filtran en la base. */
export const SEDE_WHERE = {
  address: { not: null },
  photos:  { isEmpty: false },
} as const;

/** La misma regla en memoria, para listas ya traídas. */
export function esSede(c: { address: string | null; photos: string[] }): boolean {
  return !!c.address && c.photos.length > 0;
}
