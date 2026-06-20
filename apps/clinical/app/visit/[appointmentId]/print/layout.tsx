/**
 * Print layout — sobreescribe estilos del root layout para impresión.
 * Fondo blanco, sin padding global del tema oscuro.
 */
import type { ReactNode } from 'react';

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        body {
          background: #fff !important;
          color: #111 !important;
          font-family: 'Georgia', serif !important;
        }
      `}</style>
      {children}
    </>
  );
}
