'use client';

import { useEffect, useState } from 'react';
import { esVersionNueva } from '@precision/version';
import type { ReleaseModuleGroup } from './types';

/**
 * El resumen del lanzamiento para el aviso de CIFO.
 *
 * Distinto de `useReleaseNotes`, que sirve a otra cosa: aquél muestra lo que
 * cambió DESPUÉS de apretar "Actualizar", y solo se dispara si el bundle viejo
 * dejó una marca. Esto responde "hay una versión que esta persona no vio".
 *
 * ── Por qué se ancla por FECHA y no por versión ─────────────────────────────
 *
 * Porque la tabla `releases` no guarda el número de versión: su identidad es
 * `(app, sha)`. Preguntar "qué trajo la 3.10" pediría una columna nueva y una
 * migración que alguien tiene que aplicar a mano.
 *
 * El ancla temporal ya existe (`bootAt` gana sobre `since` en `resolveFrom`) y
 * además responde algo MEJOR: no "qué trajo la 3.10" sino "qué hay de nuevo
 * **para vos**". Quien estuvo dos semanas sin entrar ve las dos semanas, no
 * solo el último empujón. El techo de 20 releases de `getChangelog` evita que
 * eso se desmadre.
 *
 * La contracara, y hay que decirla: las pastillas no son "los módulos de la
 * 3.10", son "los módulos que cambiaron desde que miraste". Para un aviso que
 * existe para que la gente sepa qué mirar, eso es lo correcto.
 *
 * ── Cuándo NO pide nada ─────────────────────────────────────────────────────
 *
 * Si la versión ya se vio, no hay fetch. El caso normal —entrar un martes
 * cualquiera sin lanzamiento nuevo— no le cuesta una request a nadie.
 */

/** La versión que la persona ya vio, y cuándo la vio. */
const CLAVE_VERSION = 'cifo:version-vista';
const CLAVE_DESDE = 'cifo:version-vista-at';

/**
 * El pedido de "mostrame otra vez lo de la versión", desde la insignia del
 * sidebar.
 *
 * Es un evento de `window` y no props ni contexto porque la insignia y el panel
 * de CIFO viven en ramas distintas del árbol —una en el layout, el otro en la
 * pantalla— y ya hay un precedente exacto para esto: `EVENTO_ABRIR`, el que usa
 * el botón de la barra para abrir el saludo.
 */
export const EVENTO_NOVEDAD = 'cifo:abrir-novedad';

export interface NovedadDeVersion {
  modulos: string[];
  cambios: number;
  /**
   * Cambia en cada pedido. Sin esto, tocar la insignia una segunda vez no
   * abriría nada: los datos serían los mismos y el efecto que abre la cortina
   * no vería ningún cambio del que engancharse.
   */
  nonce: number;
}

/**
 * ¿Esta persona todavía no vio la versión que está corriendo?
 *
 * Solo lee `localStorage` — ni una request. Lo usa la insignia del sidebar,
 * que se dibuja en TODAS las pantallas: si esto consultara algo, el Admin
 * pagaría una llamada por navegación.
 *
 * Arranca en `false` y se corrige en un efecto, no en el render: en el servidor
 * no existe `localStorage`, y leerlo durante el render daría marcas distintas
 * en servidor y cliente. React tira el árbol entero por eso.
 */
export function useVersionSinVer(version: string): boolean {
  const [sinVer, setSinVer] = useState(false);

  useEffect(() => {
    try {
      setSinVer(esVersionNueva(version, window.localStorage.getItem(CLAVE_VERSION)));
    } catch {
      /* Modo privado: se queda quieta. Mejor que pulsar para siempre. */
    }

    // Cuando CIFO la anuncia, la insignia tiene que dejar de pulsar SOLA. Sin
    // esto seguiría llamando la atención hasta la próxima navegación, que es
    // justo el tipo de detalle que hace que algo se sienta a medio hacer.
    const quieta = (): void => setSinVer(false);
    window.addEventListener(EVENTO_VISTA, quieta);
    return () => window.removeEventListener(EVENTO_VISTA, quieta);
  }, [version]);

  return sinVer;
}

/** Aviso interno: la versión acaba de mostrarse. Lo escucha la insignia. */
const EVENTO_VISTA = 'cifo:version-vista';

export function useNovedadDeVersion(version: string, audiencia: string): NovedadDeVersion | null {
  const [novedad, setNovedad] = useState<NovedadDeVersion | null>(null);

  useEffect(() => {
    let vista: string | null = null;
    let desde: string | null = null;
    try {
      vista = window.localStorage.getItem(CLAVE_VERSION);
      desde = window.localStorage.getItem(CLAVE_DESDE);
    } catch {
      /* Modo privado: se trata como "no vio nada" y el aviso sale igual. */
    }

    let cancelado = false;
    const sinVer = esVersionNueva(version, vista);

    /**
     * A pedido: alguien tocó la insignia del sidebar.
     *
     * Trae el resumen y con eso alcanza: el `nonce` nuevo hace que
     * `CortinaVersion` se abra sola. Nadie tiene que coordinar nada.
     */
    const aPedido = (): void => { void traer(); };
    window.addEventListener(EVENTO_NOVEDAD, aPedido);

    // El caso normal: no se pide nada si la versión ya se vio.
    if (sinVer) void traer();

    return () => { cancelado = true; window.removeEventListener(EVENTO_NOVEDAD, aPedido); };

    async function traer(): Promise<void> {
      try {
        const params = new URLSearchParams({
          // `since` es obligatorio en la ruta pero lo ignora `resolveFrom`
          // cuando `bootAt` parsea. Se manda la versión para que, si algún día
          // alguien mira los logs, se entienda de dónde salió la consulta.
          since: `v${version}`,
          audience: audiencia,
        });
        // Sin marca previa —primera vez— no se manda ancla: `resolveFrom` cae
        // al último release publicado, que es el default correcto.
        if (desde !== null && desde !== '') params.set('bootAt', desde);

        const res = await fetch('/api/changelog?' + params.toString(), { cache: 'no-store' });
        if (cancelado) return;
        if (!res.ok) {
          // Ruidoso a propósito: un aviso que no aparece es indistinguible de
          // "no había nada nuevo", y así al menos queda rastro en la consola.
          console.warn('[novedad] /api/changelog respondio', res.status);
          sinResumen();
          return;
        }
        const data = (await res.json()) as { modules: ReleaseModuleGroup[]; count: number };
        if (cancelado) return;

        setNovedad({
          modulos: data.modules.map((m) => m.moduleLabel),
          cambios: data.count,
          nonce: Date.now(),
        });
      } catch (err) {
        console.warn('[novedad] no se pudo pedir el changelog', err);
        sinResumen();
      }
    }

    /**
     * El changelog no vino. La cortina sale igual, con el número y sin
     * pastillas.
     *
     * ── Por qué no se cancela el aviso ──────────────────────────────────────
     *
     * Porque la pastilla del sidebar ya está en pantalla y la persona la va a
     * tocar. Si el fallo del resumen cancelara la cortina, ese clic no haría
     * **nada** — un botón muerto, que es peor que un aviso escueto: el primero
     * parece roto, el segundo se entiende.
     *
     * Y no es hipotético: el `DATABASE_URL` del Admin apunta hoy al puerto
     * directo de Supabase, que está muerto desde afuera, así que esta ruta
     * devuelve 500 ahí. Que el aviso dependa de arreglar una variable de
     * infraestructura sería atar dos cosas que no tienen por qué viajar juntas.
     */
    function sinResumen(): void {
      if (cancelado) return;
      setNovedad({ modulos: [], cambios: 0, nonce: Date.now() });
    }
  }, [version, audiencia]);

  return novedad;
}

/**
 * Deja constancia de que esta versión ya se anunció.
 *
 * Vive junto al hook porque son DOS llaves —la versión y la fecha, que es la
 * que ancla la próxima consulta— y partirlas entre dos archivos es la forma más
 * rápida de que alguien escriba una y se olvide de la otra.
 */
export function marcarVersionVista(version: string): void {
  try {
    window.localStorage.setItem(CLAVE_VERSION, version);
    window.localStorage.setItem(CLAVE_DESDE, new Date().toISOString());
  } catch {
    /* Modo privado: el aviso volverá a salir. Es el mal menor. */
  }
  // Va FUERA del `try`: aunque no se haya podido escribir la marca, la insignia
  // tiene que dejar de pulsar — la persona lo está viendo en este momento.
  try { window.dispatchEvent(new Event(EVENTO_VISTA)); } catch { /* SSR */ }
}
