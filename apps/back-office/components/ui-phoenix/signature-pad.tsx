'use client';

/**
 * SignaturePad — canvas de firma digital reutilizable.
 * Devuelve un dataURL PNG via onChange cuando hay trazos.
 * Uso:
 *   <SignaturePad onChange={(dataUrl) => setSignature(dataUrl)} initialValue={existingDataUrl} />
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, PenLine } from 'lucide-react';

interface Props {
  onChange: (dataUrl: string | null) => void;
  initialValue?: string | null;
  clearLabel?: string;
  hintLabel?: string;
  height?: number;
}

export function SignaturePad({ onChange, initialValue, clearLabel = 'Limpiar', hintLabel = 'Firme en el área de arriba.', height = 200 }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const drawing     = useRef(false);
  const lastPos     = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(!!initialValue);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    return ctx;
  }

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = getCtx();
    const pos = getPos(e);
    if (!ctx || !pos || !lastPos.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    if (!hasStrokes) setHasStrokes(true);
  }

  // Finaliza el trazo y persiste el dataURL — llamado tanto desde eventos del canvas
  // como desde el listener global de window (fix: mouseup fuera del canvas).
  const commitStroke = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL('image/png'));
  }, [onChange]);

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    commitStroke();
  }

  // Listener global: captura mouseup/touchend aunque el cursor salga del canvas.
  useEffect(() => {
    const onUp = () => commitStroke();
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mouseup',  onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [commitStroke]);

  // Ajusta resolución al devicePixelRatio y re-dibuja la firma existente si la hay.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Si había una firma previa (remount al volver al paso), restaurarla en el canvas.
    if (initialValue) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = initialValue;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onChange(null);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <div
        className={`relative rounded-lg overflow-hidden transition-colors ${
          hasStrokes
            ? 'border border-brand/40 bg-bg-2/40'
            : 'border-2 border-dashed border-border/50 bg-bg-2/20 hover:border-brand/30 hover:bg-bg-2/30'
        }`}
        style={{ height }}
      >
        {/* baseline guide */}
        {!hasStrokes && (
          <div
            className="absolute left-8 right-8 border-b border-dashed border-border/40 pointer-events-none"
            style={{ top: Math.round(height * 0.68) }}
          />
        )}
        {/* empty state hint */}
        {!hasStrokes && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
            <PenLine className="w-7 h-7 text-text-muted/25" />
            <span className="text-[11px] text-text-muted/40 italic">{hintLabel}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair touch-none"
          style={{ height }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-rose transition-colors"
        >
          <Eraser className="w-3 h-3" />
          {clearLabel}
        </button>
        {hasStrokes && (
          <span className="text-[10px] text-emerald/70 flex items-center gap-1">
            ✓ Firma capturada
          </span>
        )}
      </div>
    </div>
  );
}
