'use client';

import * as React from 'react';

/**
 * Un reloj que late, para pantallas que muestran cuánto falta para algo.
 *
 * Devuelve `null` en el primer render y el timestamp real a partir de que monta.
 * Ese `null` no es pereza, es lo que evita el error de hidratación: si el
 * componente leyera `Date.now()` de entrada, el servidor y el cliente
 * calcularían momentos distintos y React tiraría el HTML del servidor entero
 * para volver a renderizar. Quien lo usa muestra el valor que vino del servidor
 * mientras esto sea `null`, y recién después toma el reloj propio.
 *
 * ── Por qué medio minuto ────────────────────────────────────────────────────
 *
 * Los textos son de grano "minuto" ("en 19 min"), así que un pulso de 30 s deja
 * el número desactualizado a lo sumo medio minuto y no hace falta más. Con
 * 60.000 exactos el redondeo puede quedar justo del lado equivocado y el número
 * se ve saltar de dos en dos.
 *
 * No es una consulta a la base: es aritmética sobre datos que ya están en la
 * página. El costo es un `setState` cada medio minuto.
 */
export function useReloj(intervaloMs = 30_000): number | null {
  const [ahora, setAhora] = React.useState<number | null>(null);

  React.useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return ahora;
}
