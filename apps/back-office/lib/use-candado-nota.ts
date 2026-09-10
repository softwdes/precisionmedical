'use client';

/**
 * El latido del candado de la nota, del lado del navegador.
 *
 * Toma el candado al abrir la nota, late cada `LATIDO_MS` mientras está abierta,
 * y lo suelta al salir. Las reglas viven en `lib/visit-note-lock.ts`; acá está
 * solo el reloj y lo que la pantalla necesita mostrar.
 *
 * Vive fuera de `VisitNoteEditor` porque ese archivo ya tiene mil líneas y esto
 * es un mecanismo completo con su propio ciclo de vida — no una variable más.
 */

import * as React from 'react';
import { LATIDO_MS, type RespuestaCandado } from './visit-note-lock';

export interface Candado {
  /** `null` mientras no se sabe todavía: la pantalla NO debe decidir con esto. */
  mio: boolean | null;
  porNombre: string | null;
  desde: string | null;
  esperando: { nombre: string | null; desde: string | null } | null;
  /** Se soltó por 10 min sin actividad: hay que avisarle y cerrar. */
  soltado: boolean;
  /** El botón "Avisarle" del que espera. */
  avisar: () => void;
  /** La pantalla lo llama cuando el usuario toca una tecla. */
  marcarTecla: () => void;
}

export function useCandadoNota(appointmentId: string, activo: boolean): Candado {
  const [estado, setEstado] = React.useState<RespuestaCandado | null>(null);
  const [soltado, setSoltado] = React.useState(false);

  /** Tocó una tecla desde el latido anterior. Ref y no estado: no se dibuja. */
  const tecla = React.useRef(false);
  /** Pidió avisarle: viaja en el próximo latido. */
  const aviso = React.useRef(false);
  /**
   * Una vez soltado NO se late más.
   *
   * Sin esto, el latido siguiente encontraría el candado libre y lo tomaría de
   * nuevo en silencio: le habríamos dicho al usuario "se cerró" y la nota
   * seguiría abierta y bloqueada para los demás.
   */
  const muerto = React.useRef(false);

  const marcarTecla = React.useCallback(() => { tecla.current = true; }, []);
  const avisar = React.useCallback(() => { aviso.current = true; }, []);

  React.useEffect(() => {
    if (!activo || !appointmentId) return;
    muerto.current = false;
    setSoltado(false);
    let cancelado = false;

    const latir = async (): Promise<void> => {
      if (muerto.current) return;
      const conTecla = tecla.current;
      const conAviso = aviso.current;
      tecla.current = false;
      aviso.current = false;
      try {
        const res = await fetch(`/api/admin/visit-notes/${appointmentId}/lock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ typed: conTecla, notify: conAviso }),
        });
        if (!res.ok || cancelado) return;
        const d = await res.json() as RespuestaCandado;
        if (cancelado) return;
        setEstado(d);
        if (d.soltadoPorInactividad) { muerto.current = true; setSoltado(true); }
      } catch {
        /*
         * Un latido perdido NO cambia nada en pantalla. Si al fallar pusiéramos
         * `mio: false`, un bache de red de dos segundos le pondría la nota en
         * solo lectura a alguien que está escribiendo. El servidor ya perdona
         * tres latidos antes de dar la pestaña por muerta.
         */
      }
    };

    void latir();
    const id = setInterval(() => { void latir(); }, LATIDO_MS);

    return () => {
      cancelado = true;
      clearInterval(id);
      /*
       * Soltar al salir, con `keepalive` para que el request sobreviva a la
       * navegación — mismo motivo que el `flush()` del editor. Si no llega, no
       * pasa nada grave: el candado vence solo en un minuto.
       */
      void fetch(`/api/admin/visit-notes/${appointmentId}/lock`, {
        method: 'DELETE',
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [appointmentId, activo]);

  return {
    mio: estado ? estado.mio : null,
    porNombre: estado?.porNombre ?? null,
    desde: estado?.desde ?? null,
    esperando: estado?.esperando ?? null,
    soltado,
    avisar,
    marcarTecla,
  };
}
