'use client';

/**
 * Botón "Imprimir / Guardar PDF" de las vistas de impresión.
 *
 * Existe porque `window.print()` necesita un client component y las páginas de
 * impresión son server components (consultan la DB y usan `getTranslations`).
 * Escribir `onClick={() => window.print()}` ahí **revienta en runtime**: React
 * no puede serializar una función a un elemento del DOM en RSC, y `tsc` no lo
 * ve. El bug estaba copiado en dos impresos del proyecto
 * (`billing/[caseId]/settlement/print` y el check-in de `apps/clinical`).
 *
 * Se esconde al imprimir con `.no-print`, que cada layout de impresión ya apaga.
 */

interface Props {
  label: string;
}

export function PrintButton({ label }: Props) {
  return (
    <div
      className="no-print"
      style={{
        background: '#f1f5f9',
        padding: '12px 48px',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          background: '#0f172a',
          color: '#fff',
          padding: '8px 20px',
          borderRadius: 6,
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        {label}
      </button>
    </div>
  );
}
