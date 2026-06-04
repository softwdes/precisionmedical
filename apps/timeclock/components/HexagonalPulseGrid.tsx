'use client';

/**
 * HexagonalPulseGrid — fondo decorativo honeycomb para el login del timeclock.
 *
 * Hexágonos con borde tenue que pulsan independientemente (campana sin/cos).
 * Mayoría púrpura indigo, ~15% cyan. Opacidad máx 0.18 — sutil y profesional.
 *
 * Patrón de canvas idéntico al NeuralBackground de los logins NTG:
 *  - Sin DPR scaling (evita clearRect conflicts)
 *  - position: absolute dentro del wrapper position: relative
 *  - Alias post-guard para TypeScript strict
 */

import { useEffect, useRef } from 'react';

interface Hex {
  x:          number;
  y:          number;
  phase:      number;   // 0-1, posición en el ciclo de pulso
  speed:      number;   // avance de fase por ms
  maxOpacity: number;   // opacidad pico (0.10-0.18)
  isCyan:     boolean;
}

export function HexagonalPulseGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    // Aliases post-guard — TS pierde narrowing en closures raf
    const cvs = el;
    const c   = ctx;

    let hexagons: Hex[] = [];
    let animId  = 0;
    let lastTime = 0;
    let radius   = 70;

    function buildGrid(): void {
      // Sin DPR — patrón simple igual al NeuralBackground (probado que funciona)
      cvs.width  = window.innerWidth;
      cvs.height = window.innerHeight;

      radius = window.innerWidth < 640 ? 38 : 70;

      const hexW    = Math.sqrt(3) * radius;
      const hexH    = 2 * radius;
      const vertGap = hexH * 0.75;

      const cols = Math.ceil(cvs.width  / hexW) + 2;
      const rows = Math.ceil(cvs.height / vertGap) + 2;

      hexagons = [];
      for (let row = 0; row < rows; row++) {
        const offset = row % 2 === 0 ? 0 : hexW / 2;
        for (let col = 0; col < cols; col++) {
          hexagons.push({
            x:          col * hexW + offset - hexW,
            y:          row * vertGap - hexH,
            phase:      Math.random(),
            speed:      0.00018 + Math.random() * 0.00022,
            maxOpacity: 0.10 + Math.random() * 0.08,
            isCyan:     Math.random() < 0.15,
          });
        }
      }
    }

    function drawHex(cx: number, cy: number, r: number, alpha: number, isCyan: boolean): void {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.strokeStyle = isCyan
        ? `rgba(6,182,212,${alpha.toFixed(3)})`
        : `rgba(99,102,241,${alpha.toFixed(3)})`;
      c.lineWidth = 1;
      c.stroke();
    }

    function frame(time: number): void {
      if (lastTime === 0) lastTime = time;
      const dt = Math.min(time - lastTime, 64);
      lastTime = time;

      c.clearRect(0, 0, cvs.width, cvs.height);

      for (const hex of hexagons) {
        hex.phase += hex.speed * dt;
        if (hex.phase > 1) hex.phase -= 1;

        const alpha = Math.sin(hex.phase * Math.PI) * hex.maxOpacity;
        if (alpha > 0.005) {
          drawHex(hex.x + radius, hex.y + radius, radius, alpha, hex.isCyan);
        }
      }

      animId = requestAnimationFrame(frame);
    }

    buildGrid();
    animId = requestAnimationFrame(frame);

    const onResize = (): void => { lastTime = 0; buildGrid(); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
