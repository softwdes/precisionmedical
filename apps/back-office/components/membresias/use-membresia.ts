'use client';

/**
 * La membresía de un paciente, para las pantallas que lo eligen en el momento.
 *
 * El diálogo de nueva cita no tiene el dato: el paciente se busca y se elige
 * ahí mismo, así que hay que ir a buscarlo cuando cambia. Las pantallas que
 * cargan del servidor —la ficha, el detalle del caso— NO usan esto: resuelven
 * con `membresiaDePaciente` y evitan un viaje.
 *
 * Mientras carga devuelve `null`, que la pastilla trata como "todavía no sé".
 * Es a propósito: mostrar "Sin membresía" durante medio segundo y después
 * cambiar a "Socio hasta el 22" es peor que no mostrar nada — el que ya leyó no
 * vuelve a mirar.
 */

import { useEffect, useState } from 'react';
import type { Membresia } from '@/lib/membresias';

export function useMembresia(patientId: string | null | undefined): Membresia | null {
  const [membresia, setMembresia] = useState<Membresia | null>(null);

  useEffect(() => {
    if (!patientId) { setMembresia(null); return; }
    let vivo = true;
    setMembresia(null);
    fetch(`/api/admin/patients/${patientId}/membership`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { membresia: Membresia } | null) => { if (vivo && d) setMembresia(d.membresia); })
      // Sin pastilla es mejor que una pastilla equivocada: si la consulta falla
      // no se afirma nada sobre si la persona es socia.
      .catch(() => {});
    return () => { vivo = false; };
  }, [patientId]);

  return membresia;
}
