'use client';

import * as React from 'react';

/**
 * El lector del streaming del agente, del lado del navegador.
 *
 * Salió de `app/attorney/vigia/ask-box.tsx` para que CIFO no lo copie. Es la
 * misma razón que el lazo del servidor: lo valioso acá no es el diseño, es el
 * parseo de NDJSON partido, que es donde estas cosas se rompen.
 *
 * Lo que NO está acá: el cajón, los chips de sugerencia, los botones. Eso es
 * chrome y cada agente tiene el suyo — Vigía abre listas del bufete, CIFO
 * manda a la cola del panel. Se comparte la máquina, no la carrocería.
 */

export interface PasoVista {
  tool: string;
  sources: string[];
  count?: number;
}

export interface AccionVista {
  key: string;
  params?: Record<string, string>;
  href?: string;
  kind?: string;
}

export interface RespuestaVista {
  answer: string;
  steps: PasoVista[];
  sources: string[];
  actions: AccionVista[];
  usage: { prompt: number; completion: number; total: number };
  model: string;
}

export interface EstadoAgente {
  /** La pregunta que se mandó, para mostrarla arriba de la respuesta. */
  preguntada: string | null;
  cargando: boolean;
  /** La respuesta a medio escribir, mientras el modelo la teclea. */
  parcial: string;
  /** Las herramientas que ya terminaron. */
  pasos: PasoVista[];
  /** La respuesta final, con sus botones. */
  res: RespuestaVista | null;
  /** `'config'` = falta la clave del proveedor; `'falla'` = cualquier otra cosa. */
  error: 'config' | 'falla' | null;
}

const INICIAL: EstadoAgente = {
  preguntada: null, cargando: false, parcial: '', pasos: [], res: null, error: null,
};

/**
 * @param endpoint La ruta NDJSON del agente (`/api/cifo/ask`, `/api/attorney/vigia/ask`).
 */
export function usePreguntar(endpoint: string): EstadoAgente & {
  preguntar: (pregunta: string) => Promise<void>;
  limpiar: () => void;
} {
  const [estado, setEstado] = React.useState<EstadoAgente>(INICIAL);

  const limpiar = React.useCallback(() => setEstado(INICIAL), []);

  const preguntar = React.useCallback(async (pregunta: string): Promise<void> => {
    const limpia = pregunta.trim();
    if (limpia.length < 3) return;

    setEstado({ ...INICIAL, preguntada: limpia, cargando: true });

    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: limpia }),
      });
      if (!r.ok || !r.body) {
        // El 503 es el único que tiene una causa que la persona puede entender.
        setEstado((s) => ({ ...s, error: r.status === 503 ? 'config' : 'falla' }));
        return;
      }

      /**
       * Se lee de a pedazos, no con `.json()`.
       *
       * El servidor manda un objeto JSON por línea, y un pedazo puede cortar una
       * línea por la mitad: lo que sobra queda en `resto` y se pega adelante del
       * siguiente. Sin eso, un JSON partido rompe el parseo justo cuando la
       * respuesta es larga — que es cuando el streaming importa.
       */
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let resto = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        resto += decoder.decode(value, { stream: true });
        const lineas = resto.split('\n');
        resto = lineas.pop() ?? '';

        for (const linea of lineas) {
          if (!linea.trim()) continue;
          let ev:
            | { type: 'step'; step: PasoVista }
            | { type: 'delta'; text: string }
            | { type: 'reset' }
            | { type: 'done'; answer: RespuestaVista }
            | { type: 'error' };
          try {
            ev = JSON.parse(linea);
          } catch {
            // Una línea ilegible no tira la respuesta entera: se saltea.
            continue;
          }

          if (ev.type === 'delta') setEstado((s) => ({ ...s, parcial: s.parcial + ev.text }));
          else if (ev.type === 'step') setEstado((s) => ({ ...s, pasos: [...s.pasos, ev.step] }));
          // Era un preámbulo antes de pedir una herramienta: no es la respuesta.
          else if (ev.type === 'reset') setEstado((s) => ({ ...s, parcial: '' }));
          else if (ev.type === 'done') setEstado((s) => ({ ...s, res: ev.answer }));
          else if (ev.type === 'error') setEstado((s) => ({ ...s, error: 'falla' }));
        }
      }
    } catch {
      setEstado((s) => ({ ...s, error: 'falla' }));
    } finally {
      setEstado((s) => ({ ...s, cargando: false }));
    }
  }, [endpoint]);

  return { ...estado, preguntar, limpiar };
}
