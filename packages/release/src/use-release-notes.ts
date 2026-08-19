'use client';

import { useEffect, useState } from 'react';
import { clearPendingNotes, readPendingNotes } from './pending-notes';
import type { ReleaseSummary } from './types';

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
 * `releases` vacío significa "no mostrar nada" — no hay modal vacío.
 */
export interface ReleaseNotes {
  releases: ReleaseSummary[];
  /** Cierra el aviso. No vuelve a aparecer: la marca ya se borró. */
  dismiss: () => void;
}

export function useReleaseNotes(): ReleaseNotes {
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);

  useEffect(() => {
    const pending = readPendingNotes();
    if (pending === null) return;

    let cancelled = false;

    // La marca se limpia YA, no al cerrar: si el fetch falla o el usuario
    // recarga, no queremos que el aviso vuelva en cada carga.
    clearPendingNotes();

    void (async () => {
      try {
        const url =
          '/api/changelog?since=' +
          encodeURIComponent(pending.since) +
          '&audience=' +
          encodeURIComponent(pending.audience);
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { releases: ReleaseSummary[] };
        if (!cancelled) setReleases(data.releases);
      } catch {
        // Sin changelog no pasa nada: el usuario ya tiene el bundle nuevo.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { releases, dismiss: () => setReleases([]) };
}

/** Cuántas notas hay en total — para el "N cambios" del pie. */
export function countNotes(releases: ReleaseSummary[]): number {
  return releases.reduce(
    (sum, release) => sum + release.modules.reduce((n, group) => n + group.notes.length, 0),
    0,
  );
}
