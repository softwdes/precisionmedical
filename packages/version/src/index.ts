/**
 * La versión del producto. Un solo número, y lo muestran CUATRO apps:
 * `web`, `back-office`, `clinical` y `timeclock`.
 *
 * `forms` y `attorney` quedaron afuera a propósito —son de pacientes y de
 * externos, a quienes el número no les dice nada— y por eso **no declaran esta
 * dependencia**: tenerla los haría rebuildear en cada bump para no mostrar
 * nada. Si algún día tienen que mostrarla, se agrega a su `package.json` y
 * alcanza.
 *
 * ── Por qué un paquete entero para una línea ────────────────────────────────
 *
 * Por `turbo-ignore`. Vercel rebuildea una app cuando cambió algo de SU grafo
 * de dependencias, así que dónde vive esta constante decide qué se redespliega
 * al subir de versión:
 *
 *   · en `@precision/release` → las cuatro rebuildearían cada vez que alguien
 *     toca el changelog, para nada. Y `attorney` y `forms` ni siquiera
 *     dependen de ese paquete, así que ni podrían importarla el día que la
 *     necesiten.
 *   · acá, solo → tocar el número rebuildea esas cuatro, y NADA más lo hace.
 *
 * El efecto secundario es una garantía: cada app muestra la versión del código
 * que está corriendo de verdad. Si una no rebuildeó, sigue diciendo la
 * anterior — y eso es la verdad, no un desfasaje que haya que esconder.
 *
 * ── Es un STRING, y no es negociable ────────────────────────────────────────
 *
 * Arrancamos en `3.10` (decisión de Erick, 2026-09-23). Como número, `3.10` es
 * `3.1`: la décima versión desaparecería sola. Y ojo también con ordenar
 * alfabéticamente, que da `"3.9" > "3.10"` — para comparar hay que partir por
 * el punto y comparar los dos enteros, que es lo que hace `esVersionNueva`.
 *
 * ── Cómo se sube ────────────────────────────────────────────────────────────
 *
 * A mano, y solo cuando Erick dice que un lanzamiento es grande. No se
 * autoincrementa por deploy: "grande" es un juicio suyo, no algo que un script
 * pueda contar. El bump viaja en el commit del lanzamiento y lo hace Main Push.
 *
 * ── 3.10 → 3.11, y por qué NO 3.2 ─────────────────────────────────────────
 *
 * Erick pidió `3.2` para este lanzamiento, leyendo `3.10` como "tres punto
 * uno". No se puede: `esVersionNueva('3.2', '3.10')` compara 2 contra 10 y da
 * **false**, así que la cortina no se abriría para NADIE que ya haya visto la
 * 3.10 — o sea, todo el equipo. El lanzamiento saldría mudo. Es exactamente la
 * trampa que la nota de acá arriba anticipaba, y apareció en la primera
 * oportunidad que tuvo.
 */
export const VERSION = '3.11';

/**
 * La versión que tiene TITULAR propio en la cortina.
 *
 * Un lanzamiento normal muestra el número y los módulos que cambiaron. Uno
 * grande se merece una frase —"Ciberseguridad está aquí"—, y esa frase es de
 * ESA versión, no de la cortina.
 *
 * Por eso es un número y no un booleano: al subir `VERSION`, el titular se
 * apaga **solo**. Con un `TIENE_TITULAR = true` alguien se olvida de bajarlo y
 * la 3.12 anuncia la ciberseguridad de la 3.11 — un error que nadie reporta,
 * porque no se ve roto, se ve viejo.
 *
 * Para darle titular al próximo lanzamiento: poner acá su número y escribir
 * `versionTitular` / `versionSubtitulo` en los mensajes de cada app.
 */
export const TITULAR_DE = '3.11';

/**
 * ¿`candidata` es posterior a `vista`?
 *
 * Existe para que el aviso de CIFO no reaparezca al volver a una pestaña vieja
 * —un bundle sin actualizar tiene una `VERSION` anterior a la que la persona ya
 * vio— y para que ordenar nunca dependa del orden alfabético.
 *
 * Tolerante a propósito: cualquier cosa ilegible en `vista` (una marca vieja,
 * un `localStorage` manoseado) se trata como "no vio nada" y el aviso sale. El
 * costo de mostrarlo de más es un panel; el de no mostrarlo es que nadie se
 * entere del lanzamiento.
 */
export function esVersionNueva(candidata: string, vista: string | null): boolean {
  if (vista === null || vista === '') return true;

  const partes = (v: string): number[] =>
    v.split('.').map((p) => Number.parseInt(p, 10));

  const a = partes(candidata);
  const b = partes(vista);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return true;

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
