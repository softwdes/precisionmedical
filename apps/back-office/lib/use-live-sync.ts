'use client';

/**
 * Sincronización en vivo por huella de versión.
 *
 * Consulta `/api/admin/pulse` cada pocos segundos — ~60 bytes — y solo cuando la
 * huella cambia dispara el refetch real. Reemplaza al polling que traía el payload
 * completo cada 20 s.
 *
 * Lo que este hook garantiza, y que ningún canal de realtime da gratis:
 *
 *  · **La pantalla no miente.** Expone `lastSyncedAt` y `failing`, para que la
 *    vista pueda decir hace cuánto se actualizó y avisar cuando NO está
 *    sincronizando. El peor escenario de cualquier sincronización es quedar
 *    congelada con cara de viva; acá eso es visible.
 *  · **No trabaja al vacío.** Con la pestaña oculta no consulta nada, y al volver
 *    el foco sincroniza al instante — que es el momento real en que alguien mira.
 *  · **El refetch nunca toca el estado de carga.** El `onChange` que se le pasa
 *    tiene que ser silencioso: el bug que originó todo esto fue usar la recarga
 *    "cambié de paciente" como refresco de fondo, que prendía el skeleton y borraba
 *    el formulario de vitales de la MA.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** 5 s: la huella es barata, así que se puede consultar seguido. */
const DEFAULT_MS = 5_000;
/** Dos fallos seguidos ya es "no está sincronizando", no un hipo de red. */
const FAIL_THRESHOLD = 2;

export interface LiveSyncState {
  /** Cuándo se confirmó por última vez que los datos están al día. */
  lastSyncedAt: Date | null;
  /** true tras dos consultas fallidas seguidas — la vista debe avisarlo. */
  failing: boolean;
  /** Fuerza una comprobación ahora (botón de refrescar manual). */
  syncNow: () => void;
}

export function useLiveSync({
  url,
  onChange,
  enabled = true,
  intervalMs = DEFAULT_MS,
}: {
  /** URL del pulso. `null` desactiva el hook (ej. sin cita seleccionada). */
  url: string | null;
  /** Refetch REAL. Debe ser silencioso: sin skeletons, sin pisar lo que se edita. */
  onChange: () => void;
  /** Se apaga con la visita cerrada o en días pasados: ahí no cambia nada. */
  enabled?: boolean;
  intervalMs?: number;
}): LiveSyncState {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [failing, setFailing] = useState(false);

  const version = useRef<string | null>(null);
  const fails = useRef(0);
  // El callback vive en un ref para que cambiar su identidad no reinicie el
  // intervalo (los padres lo redefinen en cada render).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const check = useCallback(async (): Promise<void> => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { v?: string };
      const v = d.v ?? '';
      fails.current = 0;
      setFailing(false);
      setLastSyncedAt(new Date());
      // Primera vuelta: se guarda la huella y no se refetchea — la pantalla acaba
      // de cargar sus datos.
      if (version.current === null) { version.current = v; return; }
      if (v !== version.current) {
        version.current = v;
        onChangeRef.current();
      }
    } catch {
      fails.current += 1;
      if (fails.current >= FAIL_THRESHOLD) setFailing(true);
    }
  }, [url]);

  useEffect(() => {
    if (!enabled || !url) return;
    // Al cambiar de objetivo (otra cita, otro día) la huella anterior no aplica.
    // Va ACÁ y no en un efecto aparte: un efecto posterior corre DESPUÉS de haber
    // lanzado la primera consulta, y si esa respondiera antes de resetear, la
    // comparación contra la huella vieja dispararía un refetch fantasma.
    version.current = null;
    // Comprobación inmediata para tener `lastSyncedAt` desde el primer segundo
    // (si no, el indicador arranca vacío y parece roto).
    void check();
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void check();
    }, intervalMs);
    const onFocus = (): void => { void check(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [enabled, url, intervalMs, check]);

  return { lastSyncedAt, failing, syncNow: () => void check() };
}
