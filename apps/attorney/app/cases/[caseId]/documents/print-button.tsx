'use client';

export function PrintButton() {
  return (
    <button
      className="print-btn"
      onClick={() => window.print()}
    >
      🖨 Imprimir / Guardar como PDF
    </button>
  );
}
