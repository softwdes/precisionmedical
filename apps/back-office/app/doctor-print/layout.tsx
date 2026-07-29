import type { ReactNode } from 'react';

/**
 * Portal Médico · Layout de documentos imprimibles (N3)
 *
 * Deliberadamente FUERA de /doctor: estas rutas no llevan sidebar ni topbar,
 * porque el resultado se imprime o se guarda como PDF. El middleware las trata
 * como área del doctor (ver `isDoctorArea`), así que el scoping por rol es el
 * mismo que en el portal.
 */

export default function DoctorPrintLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <>
      <style>{`
        html, body {
          background: #fff !important;
          color: #111 !important;
          font-family: 'Georgia', 'Times New Roman', serif !important;
        }
      `}</style>
      {children}
    </>
  );
}
