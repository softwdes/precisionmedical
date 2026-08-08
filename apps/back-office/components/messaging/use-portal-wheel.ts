'use client';

/**
 * usePortalWheelScroll — rueda del mouse para dropdowns PORTALEADOS dentro de
 * un Dialog de Radix.
 *
 * El scroll-lock del modal (react-remove-scroll) escucha `wheel` en document y
 * hace preventDefault a todo lo que viva fuera del DialogContent — y estos
 * dropdowns van en portal a document.body justamente para escapar del
 * transform del modal. Detectarlo con `defaultPrevented` en el onWheel de
 * React NO funciona: React despacha en el root antes de que el lock corra.
 *
 * La salida es un listener NATIVO en el propio elemento (fase target, corre
 * antes que el listener de document): previene el default, corta la
 * propagación (el lock nunca lo ve) y scrollea a mano. Vale dentro y fuera de
 * modales — al prevenir el nativo no hay doble scroll.
 */

import { useEffect, type RefObject } from 'react';

export function usePortalWheelScroll(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, active]);
}
