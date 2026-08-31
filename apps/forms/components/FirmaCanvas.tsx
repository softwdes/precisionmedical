'use client';

/**
 * Canvas de firma del paciente — mouse y dedo.
 *
 * Sale del trazo probado del wizard de intake (`intake-wizard.tsx`), donde el
 * mismo patrón está escrito DOS veces. Acá vive una sola vez:
 *
 *  · **`mouseup` en `window`, no en el canvas.** Si el paciente suelta el botón
 *    fuera del recuadro, el `mouseup` del canvas nunca llega y el trazo queda
 *    "pegado": vuelve a dibujar al pasar el mouse sin apretar. Fue un bug real
 *    de la firma del lien (2026-07-03).
 *  · **`touchmove` con `preventDefault`** para que el gesto no scrollee la
 *    página mientras se firma en el celular.
 *  · **Escala por `devicePixelRatio`**: sin esto la firma se guarda pixelada y
 *    en el impreso legal se ve mal. Al cambiar el tamaño se REDIBUJA lo que ya
 *    había — cambiar `width`/`height` de un canvas lo borra.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const ALTO = 170;

interface Props {
  /** Recibe el PNG en data URL, o `null` cuando se limpia. */
  onChange: (dataUrl: string | null) => void;
  color?: string;
  /** Texto del botón y de la ayuda; el componente no decide idioma. */
  labels: { clear: string; hint: string };
}

export function FirmaCanvas({ onChange, color = '#111827', labels }: Props) {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  /** Último trazo guardado — se usa para redibujar tras un resize. */
  const ultimo    = useRef<string | null>(null);
  /**
   * ¿Se dibujó algo? En un REF, no solo en el estado.
   *
   * `terminar()` corre en el `mouseup` y tiene que saber si hubo trazo. Si lo
   * leyera del estado, un `mouseup` que llegue antes de que React re-renderice
   * vería `vacio` todavía en true y DESCARTARÍA la firma sin decir nada. Es una
   * firma legal: no puede depender de cuándo re-renderiza React.
   */
  const dibujado  = useRef(false);
  const [vacio, setVacio] = useState(true);

  // ── Tamaño real del canvas (DPI) ────────────────────────────────────────────
  useEffect(() => {
    const ajustar = () => {
      const wrap = wrapRef.current, canvas = canvasRef.current;
      if (!wrap || !canvas) return;

      const dpr   = window.devicePixelRatio || 1;
      const ancho = wrap.clientWidth;
      if (!ancho) return;

      canvas.style.width  = `${ancho}px`;
      canvas.style.height = `${ALTO}px`;
      canvas.width        = Math.round(ancho * dpr);
      canvas.height       = Math.round(ALTO * dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      // Cambiar width/height borró el canvas: reponer la firma que ya estaba.
      if (ultimo.current) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, ancho, ALTO);
        img.src = ultimo.current;
      }
    };

    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  // Termina el trazo aunque el puntero salga del recuadro.
  useEffect(() => {
    const soltar = () => { dibujando.current = false; };
    window.addEventListener('mouseup', soltar);
    window.addEventListener('touchend', soltar);
    return () => {
      window.removeEventListener('mouseup', soltar);
      window.removeEventListener('touchend', soltar);
    };
  }, []);

  const pos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const empezar = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    dibujando.current = true;
    const { x, y } = pos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const trazar = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!dibujando.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = pos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    dibujado.current = true;
    if (vacio) setVacio(false);
  }, [color, vacio]);

  const terminar = useCallback(() => {
    dibujando.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !dibujado.current) return;
    const data = canvas.toDataURL('image/png');
    ultimo.current = data;
    onChange(data);
  }, [onChange]);

  const limpiar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ultimo.current   = null;
    dibujado.current = false;
    setVacio(true);
    onChange(null);
  }, [onChange]);

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          border: '1px dashed rgba(255,255,255,0.22)',
          borderRadius: 10,
          background: '#fff',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={empezar}
          onMouseMove={trazar}
          onMouseUp={terminar}
          onTouchStart={empezar}
          onTouchMove={trazar}
          onTouchEnd={terminar}
          style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <button
          type="button"
          onClick={limpiar}
          disabled={vacio}
          style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            color: vacio ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.80)',
            cursor: vacio ? 'not-allowed' : 'pointer',
          }}
        >
          {labels.clear}
        </button>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>{labels.hint}</span>
      </div>
    </div>
  );
}
