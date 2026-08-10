/**
 * Cargos repetidos en una visita — cómo distinguirlos.
 *
 * Dos aplicaciones del mismo inyectable son dos cobros legítimos, así que la
 * lista muestra dos renglones idénticos: mismo código, mismo nombre, mismo
 * precio. Sin nada que los separe, borrar uno no se puede confirmar — y si algo
 * más toca los datos, parece que la pantalla se comió los dos.
 *
 * La hora del cobro (`chargedAt`, que ya guardamos) alcanza para desambiguarlos
 * y solo se muestra cuando el ítem está repetido: en el caso normal, que es uno
 * solo, no agrega ruido.
 */

/** Códigos que aparecen más de una vez en la lista. */
export function codigosRepetidos(rows: ReadonlyArray<{ code: string }>): ReadonlySet<string> {
  const veces = new Map<string, number>();
  for (const r of rows) veces.set(r.code, (veces.get(r.code) ?? 0) + 1);
  return new Set([...veces].filter(([, n]) => n > 1).map(([code]) => code));
}

/** Hora del cobro en la zona de la clínica — `18:24`, formato del locale. */
export function horaCobro(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver',
  });
}
