/**
 * Altura y peso: el par y el pivote.
 *
 * ── Por qué vive acá y no en el formulario ─────────────────────────────────
 * Estaba adentro de `triage-vitals-form.tsx`, que importa React y next-intl y
 * por lo tanto no se puede cargar desde un script: la aritmética que decide si
 * una nota impresa dice "5 ft 12 in" era, en la práctica, imposible de probar
 * sin copiarla — y una copia en verde no dice nada de la función real.
 *
 * ── El modelo ──────────────────────────────────────────────────────────────
 * **cm y kg son el valor real.** El par (pies+pulgadas, libras+onzas) es lo que
 * la gente teclea y lo que leen la nota impresa, el triaje de `apps/clinical`
 * (el v2, todavía en uso) y el SQL de métricas de doctores. El par se deriva
 * del pivote, nunca al revés, y así los dos dicen lo mismo.
 *
 * Hasta el 2026-09-11 la pantalla mostraba TOTALES —5 pies se veía como "60
 * pulgadas"— mientras la columna `heightIn` guardaba el resto (0). Escribir 6
 * en pulgadas no daba 5'6" sino "6 pulgadas de alto", y el usuario lo reportó
 * como "no me deja editar".
 */

/** Exactos por definición, no aproximados: así los tres números cierran. */
export const CM_POR_PULGADA = 2.54;
export const OZ_POR_KG      = 35.27396195;

export interface ParAltura { ft: number; inches: number }
export interface ParPeso   { lbs: number; oz: number }

/**
 * ⚠️ El redondeo del resto TIENE que acarrear.
 *
 * `Math.round(totalIn % 12)` devuelve 12 cuando el resto pasa de 11,5, y eso
 * guardaba **"5 ft 12 in"** — que no existe. Pasaba en cuatro bandas de 1,26 cm:
 * 120,65-121,91 · 151,14-152,40 · **181,62-182,88** · 212,10-213,36. La tercera
 * es un adulto de 5'11½"-6'0", de las más comunes que hay.
 *
 * No era teórico: al encontrarlo había 4 registros con `heightIn` ≥ 12 y 20 con
 * `weightOz` ≥ 16 ya guardados, y siguen en la base.
 *
 * Se redondea el TOTAL primero y después se reparte: el acarreo sale solo y no
 * hay forma de que el resto llegue al tope.
 */
export function cmToPar(cm: number): ParAltura {
  const totalIn = Math.round(cm / CM_POR_PULGADA);
  return { ft: Math.floor(totalIn / 12), inches: totalIn % 12 };
}

export function kgToPar(kg: number): ParPeso {
  const totalOz = Math.round(kg * OZ_POR_KG);
  return { lbs: Math.floor(totalOz / 16), oz: totalOz % 16 };
}

/**
 * El camino de vuelta: lo que se teclea → el valor real.
 *
 * Acepta una mitad en `null` porque así se escribe de verdad: se pone 5 en pies
 * y todavía no hay nada en pulgadas. Vacío cuenta como 0, pero las DOS vacías
 * devuelven `null` — eso es "sin cargar", no una persona de 0 cm.
 */
export function parACm(ft: number | null, inches: number | null): number | null {
  if (ft === null && inches === null) return null;
  return ((ft ?? 0) * 12 + (inches ?? 0)) * CM_POR_PULGADA;
}

export function parAKg(lbs: number | null, oz: number | null): number | null {
  if (lbs === null && oz === null) return null;
  return ((lbs ?? 0) * 16 + (oz ?? 0)) / OZ_POR_KG;
}
