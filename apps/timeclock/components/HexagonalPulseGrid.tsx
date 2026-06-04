'use client';

/**
 * HexagonalPulseGrid — fondo decorativo para el login.
 *
 * Renderiza un canvas full-screen con un patron honeycomb de hexagonos que
 * pulsan independientemente (aparecen y desaparecen suavemente con timings
 * aleatorios entre 3-6s por ciclo). La mayoria son purpura del proyecto,
 * ~15% son cyan para variedad cromatica.
 *
 * El canvas usa position:fixed + z-index:0 + pointerEvents:none para no
 * interferir con el contenido encima. Opacity maxima por hexagono es 0.18
 * para que el efecto sea sutil — apropiado para una app medica, no para un
 * portal hacker.
 */

import { useEffect, useRef } from 'react';

interface Hex {
  x: number;
  y: number;
  /** Opacidad actual del hexagono (0..maxOpacity). Recomputed each frame. */
  opacity: number;
  /** Fase del ciclo de pulso, 0..1. Cuando llega a 1 reinicia. */
  phase: number;
  /** Velocidad de avance de la fase por ms — controla la duracion del ciclo. */
  speed: number;
  /** Prefijo rgba(...) sin la opacidad final — cerramos con `${o})` al pintar. */
  color: string;
  /** Opacidad pico al centro del ciclo (sin(phase*pi) * maxOpacity). */
  maxOpacity: number;
}

const COLOR_PURPLE = 'rgba(100, 80, 220, ';
const COLOR_CYAN   = 'rgba(0, 200, 200, ';
const CYAN_RATIO   = 0.15;  // ~15% de los hexagonos son cyan

export function HexagonalPulseGrid(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Alias estables — TypeScript pierde narrowing en closures async/raf,
    // y queremos que dentro de animate() siga siendo non-null sin re-checkear.
    const c  = ctx;
    const cv = canvas;

    let hexagons: Hex[] = [];
    let raf = 0;
    let lastTime = 0;
    let radius = 70;

    function buildGrid(): void {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      cv.width  = w * dpr;
      cv.height = h * dpr;
      cv.style.width  = w + 'px';
      cv.style.height = h + 'px';
      // setTransform en vez de scale — scale acumula entre resizes.
      c.setTransform(dpr, 0, 0, dpr, 0, 0);

      const isMobile = w < 640;
      radius = isMobile ? 38 : 70;

      // Geometria honeycomb (pointy-top): cada fila offset por hexWidth/2.
      const hexWidth    = Math.sqrt(3) * radius;
      const hexHeight   = 2 * radius;
      const vertSpacing = hexHeight * 0.75;

      const cols = Math.ceil(w / hexWidth) + 2;
      const rows = Math.ceil(h / vertSpacing) + 2;

      const next: Hex[] = [];
      for (let row = 0; row < rows; row++) {
        const rowOffset = row % 2 === 0 ? 0 : hexWidth / 2;
        for (let col = 0; col < cols; col++) {
          const x = col * hexWidth + rowOffset - hexWidth;
          const y = row * vertSpacing - hexHeight;

          const isCyan = Math.random() < CYAN_RATIO;
          next.push({
            x,
            y,
            opacity: 0,
            phase: Math.random(),                       // empieza en fase aleatoria
            speed: 0.00018 + Math.random() * 0.00022,   // ~3-7s ciclo completo
            color: isCyan ? COLOR_CYAN : COLOR_PURPLE,
            maxOpacity: 0.10 + Math.random() * 0.08,    // 0.10..0.18
          });
        }
      }
      hexagons = next;
    }

    function drawHex(cx: number, cy: number, r: number, opacity: number, colorPrefix: string): void {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        // pointy-top hex: angulos 30, 90, 150, 210, 270, 330
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.strokeStyle = colorPrefix + opacity.toFixed(3) + ')';
      c.lineWidth = 1;
      c.stroke();
    }

    function animate(time: number): void {
      if (lastTime === 0) lastTime = time;
      const dt = Math.min(time - lastTime, 64);  // clamp a 64ms si el tab estuvo background
      lastTime = time;

      const w = cv.clientWidth;
      const h = cv.clientHeight;
      c.clearRect(0, 0, w, h);

      for (let i = 0; i < hexagons.length; i++) {
        const hex = hexagons[i];
        if (!hex) continue;

        hex.phase += hex.speed * dt;
        if (hex.phase > 1) hex.phase -= 1;

        // Pulso en forma de campana: opacity = sin(phase * PI) * max.
        // En phase=0 y phase=1 el hexagono es invisible; pico en phase=0.5.
        const o = Math.sin(hex.phase * Math.PI) * hex.maxOpacity;
        hex.opacity = o;

        if (o > 0.005) {
          drawHex(hex.x + radius, hex.y + radius, radius, o, hex.color);
        }
      }

      raf = requestAnimationFrame(animate);
    }

    buildGrid();
    raf = requestAnimationFrame(animate);

    const onResize = (): void => { lastTime = 0; buildGrid(); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',   // fixed pintaba BAJO el backgroundColor del wrapper
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
