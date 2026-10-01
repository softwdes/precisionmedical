'use client';

/**
 * Avisa que esta persona está mirando una conversación, y dice quién más lo está.
 *
 * Pedido de Erick (2026-10-01): que dos personas de recepción no le contesten lo
 * mismo al mismo paciente sin enterarse. **Avisa, no bloquea** — el hook no
 * puede impedir nada, solo devuelve nombres.
 */

import { useEffect, useRef, useState } from 'react';
import { PRESENCIA_SMS_HEARTBEAT_MS } from '@/lib/presencia-sms';

export interface OtroMirando {
  userId: string;
  nombre: string | null;
}

export function usePresenciaSms(clave: string | null): OtroMirando[] {
  const [otros, setOtros] = useState<OtroMirando[]>([]);
  /** La última clave que se latió, para poder despedirse de ELLA al cambiar. */
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    if (!clave) { setOtros([]); return; }

    let vivo = true;
    anterior.current = clave;

    const latir = async (saliendo = false) => {
      try {
        const res = await fetch('/api/admin/message-logs/presencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clave, saliendo }),
          /**
           * `keepalive` para que el latido de despedida sobreviva al cierre de
           * la pestaña. Sin esto el navegador cancela la petición al descargar
           * la página y la fila queda viva 45 s mostrando a alguien que se fue.
           */
          keepalive: saliendo,
        });
        if (!res.ok || saliendo || !vivo) return;
        const data = await res.json() as { otros?: OtroMirando[] };
        setOtros(data.otros ?? []);
      } catch {
        /**
         * Un latido perdido no se reporta ni se reintenta: el siguiente llega en
         * 20 s. Lo único que pasa mientras tanto es que no se muestra a nadie —
         * que es el lado correcto para fallar. Un aviso inventado es peor que
         * ninguno.
         */
      }
    };

    void latir();
    const id = setInterval(() => { if (!document.hidden) void latir(); }, PRESENCIA_SMS_HEARTBEAT_MS);

    /**
     * Con la pestaña oculta NO se late: esa persona no está mirando nada, y
     * seguir diciendo que sí es exactamente el aviso falso que queremos evitar.
     * Al volver se late enseguida en vez de esperar el intervalo.
     */
    const alVolver = () => { if (!document.hidden) void latir(); };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
      void latir(true);
    };
  }, [clave]);

  return otros;
}
