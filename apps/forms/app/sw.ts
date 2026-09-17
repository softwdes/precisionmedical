/**
 * Service worker de `apps/forms`.
 *
 * ── Por qué este archivo ya casi no cachea nada (2026-09-17) ────────────────
 *
 * El 17-sep una iPad Air 2 de la clínica mostró el formulario con todo
 * encimado y sin responder a los toques: hubo que hacer firmar a la paciente
 * **en papel**. En la misma iPad la ciudad "no estaba en la lista" y tampoco
 * aparecía la opción de escribirla a mano — una opción que existe en el código
 * desde `6454eeba` y que se dibuja siempre que haya un estado elegido. O sea:
 * esa iPad no estaba corriendo el código que tenemos. Estaba corriendo una
 * mezcla.
 *
 * La causa era esta regla, que vivía acá abajo:
 *
 *     matcher: /\/_next\/static\/.*\/i,
 *     handler: new CacheFirst({ plugins: [new ExpirationPlugin({ maxEntries: 64 })] })
 *
 * Los tres pedazos juntos son el problema:
 *
 *  1. `CacheFirst` — si está en la caché, se sirve y **no se pregunta nunca más**.
 *  2. `maxEntries: 64` — pasado ese número, el plugin borra las entradas menos
 *     usadas. Un build de forms ya tiene 27 archivos estáticos y la portada
 *     sola referencia 12: con dos o tres despliegues encima, se pasa.
 *  3. Los chunks de Next llevan hash en el nombre, así que los viejos **no se
 *     pisan**: conviven con los nuevos y compiten por esas 64 ranuras.
 *
 * El desalojo es por uso, no por build. Así que un dispositivo que abrió el
 * formulario a lo largo de varios despliegues termina con chunks de builds
 * distintos, y React recibe módulos que no encajan: pinta el HTML del servidor
 * y la hidratación muere. Eso es exactamente "se ve desordenado" **y** "no
 * puedo hacer click en nada", que son el mismo síntoma visto de dos lados.
 * Y es por dispositivo, que es por qué se rompió una iPad y ninguna otra cosa.
 *
 * ── Por qué la regla no se arregla, se borra ────────────────────────────────
 *
 * Porque no estaba comprando nada. Producción ya sirve esos archivos con
 * `Cache-Control: public, max-age=31536000, immutable` (verificado contra
 * forms.lienmaster.net): la caché HTTP del navegador ya los guarda un año y
 * los sirve sin pedir permiso. El service worker estaba repitiendo ese trabajo
 * peor, con un techo que la caché HTTP no tiene.
 *
 * Y `apps/forms` no gana nada offline: **todo** `/api/*` es `NetworkOnly`, así
 * que sin red no se puede guardar ni un paso. Es un formulario que el paciente
 * abre una vez desde un SMS. Lo que necesita es estar al día, no estar cacheado.
 *
 * ── El `activate` de abajo no es limpieza de rutina ─────────────────────────
 *
 * Es lo único que arregla los dispositivos que YA están envenenados. Borrar la
 * regla no les devuelve nada: sus cachés siguen llenas de chunks viejos y
 * `CacheFirst` los seguiría sirviendo. Hay que vaciarlas explícitamente una vez.
 *
 * ⚠️ Si alguien vuelve a poner caché de assets acá, que sea **sin `maxEntries`**.
 * El techo es lo que mezcla los builds. Y antes de hacerlo, medir qué gana
 * contra `immutable`, que es lo que este comentario no pudo encontrar.
 */

import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

/**
 * Vacía TODAS las cachés, incluidas las que dejó la versión anterior de este
 * archivo. Corre antes que nada en cada activación.
 *
 * Es seguro que corra siempre: lo único que quedaría para borrar es lo que este
 * mismo service worker haya guardado, y ya no guarda nada. El día que vuelva a
 * guardar algo, esta función hay que acotarla a las cachés viejas por nombre.
 */
/**
 * El tipo del evento se declara acá: este `tsconfig` no carga la lib
 * `WebWorker`, así que `ExtendableEvent` no existe para el compilador aunque sí
 * exista en tiempo de ejecución. Es lo único que se necesita de ella.
 */
type EventoExtensible = Event & { waitUntil(p: Promise<unknown>): void };

self.addEventListener('activate', (event) => {
  (event as EventoExtensible).waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
    })(),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Nada de esto se guarda: son datos del paciente y el guardado de cada paso.
    { matcher: /^https:\/\/.*\.supabase\.co\/.*/i, handler: new NetworkOnly() },
    { matcher: /\/api\/.*/i, handler: new NetworkOnly() },
  ],
});

serwist.addEventListeners();
