'use client';

import { useEffect, useState } from 'react';
import { clearPendingNotes, readPendingNotes } from './pending-notes';
import type { ReleaseModuleGroup } from './types';

/**
 * Las notas que hay que mostrarle al usuario DESPUÉS del reload.
 *
 * No se muestran antes: el click en Actualizar borra SW + caches y hace
 * `location.replace()`, así que cualquier cosa en pantalla se destruye a medio
 * camino. Y quien aprieta Actualizar quiere actualizarse, no leer.
 *
 * El bundle viejo deja una marca en localStorage con el SHA desde el cual contar
 * (`stashPendingNotes`); este hook la levanta al montar, pide el changelog y
 * limpia la marca.
 *
 * Sólo la LÓGICA vive acá. La presentación la pone cada app con sus propios
 * primitivos: el back-office tiene una regla vinculante de usar `ui-phoenix` y
 * nada más, y `timeclock` no tiene ni preset de Tailwind ni primitivos.
 *
 * `modules` vacío significa "no mostrar nada" — no hay aviso vacío.
 */
export interface ReleaseNotes {
  modules: ReleaseModuleGroup[];
  count: number;
  /** Cierra el aviso. No vuelve a aparecer: la marca ya se borró. */
  dismiss: () => void;
}

export function useReleaseNotes(): ReleaseNotes {
  const [modules, setModules] = useState<ReleaseModuleGroup[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const pending = readPendingNotes();
    if (pending === null) return;

    let cancelled = false;

    // La marca se limpia YA, no al cerrar: si el fetch falla o el usuario
    // recarga, no queremos que el aviso vuelva en cada carga.
    clearPendingNotes();

    void (async () => {
      try {
        const params = new URLSearchParams({
          since: pending.since,
          audience: pending.audience,
        });
        if (pending.bootAt !== undefined) params.set('bootAt', pending.bootAt);

        const res = await fetch('/api/changelog?' + params.toString(), { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          // Antes esto era un `catch {}` mudo y por eso un bug real —el ancla
          // por sha— vivio horas sin dejar un solo sintoma. El usuario no ve
          // nada igual, pero ahora queda rastro en la consola.
          console.warn('[release-notes] /api/changelog respondio', res.status);
          return;
        }
        const data = (await res.json()) as { modules: ReleaseModuleGroup[]; count: number };
        if (!cancelled) {
          setModules(data.modules);
          setCount(data.count);
        }
      } catch (err) {
        console.warn('[release-notes] no se pudo pedir el changelog', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    modules,
    count,
    dismiss: () => {
      setModules([]);
      setCount(0);
    },
  };
}
