/**
 * Clave de comparación de nombres de bufete.
 *
 * Vive acá y no en la ruta de `/similar` por dos razones: la ruta de Next **no
 * puede exportar** nada que no sea un verbo HTTP (`next build` lo rechaza,
 * `tsc` no lo ve — ver [[trap-tsc-no-ve-exports-de-route]]), y el mismo criterio
 * lo necesitan el aviso de parecidos y cualquier limpieza de duplicados.
 *
 * ── Qué se considera ruido ──────────────────────────────────────────────────
 *
 * La forma jurídica y los genéricos: `LLP`, `LLC`, `PC`, `PLLC`, `Law`, `Firm`,
 * `Group`, `Office(s)`, `Attorney(s)`, `Associates`, `The`, `And`.
 *
 * ⚠️ **`injury`, `trial`, `legal` y `partners` NO son ruido.** Estaban en una
 * primera versión y medido contra el catálogo real quedó claro que SÍ
 * distinguen: agrupaban "Apex Injury Law Group" con "Apex Trial Attorneys",
 * "Cascade Law Group" con "Cascade Injury Law" y "Wasatch Legal Partners" con
 * "Wasatch Injury Attorneys" — bufetes distintos que comparten apellido. Un
 * aviso que salta de más enseña a ignorarlo.
 *
 * Con esta lista, los 109 bufetes del catálogo dan 11 grupos y los 11 son del
 * mismo bufete real; 79 claves quedan únicas y no disparan ningún aviso.
 */

const RUIDO = new Set([
  'law', 'llp', 'llc', 'pc', 'pllc', 'the', 'and',
  'group', 'firm', 'offices', 'office', 'attorneys', 'attorney', 'associates',
]);

/**
 * Las dos primeras palabras con contenido, en minúsculas y sin puntuación.
 * Devuelve `''` cuando el nombre es solo ruido (ahí no se compara nada).
 */
export function claveDeNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !RUIDO.has(w))
    .slice(0, 2)
    .join(' ');
}
