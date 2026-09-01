import type { ReactNode } from 'react';

/**
 * Área de impresión del mostrador — documentos sin el chrome del back-office.
 *
 * Vive FUERA del grupo `(admin)` a propósito: ese layout monta la barra lateral
 * y el buscador, y este documento se abre además dentro de un `iframe` en el
 * panel de la cita. Con el chrome, la vista previa mostraría media aplicación
 * alrededor de una hoja. Mismo criterio que `/doctor-print/`.
 */
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
