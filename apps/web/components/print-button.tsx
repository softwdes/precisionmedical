'use client';

/**
 * Botón "Imprimir / Guardar PDF" de las vistas de impresión.
 *
 * Existe porque `window.print()` necesita un client component y las páginas de
 * impresión son server components (consultan la base y usan `getTranslations`).
 * Escribir `onClick={() => window.print()}` directo en una de ellas **revienta
 * en runtime** —React no puede serializar una función a un elemento del DOM en
 * RSC— y `tsc` no lo ve. El bug ya estuvo copiado en dos impresos del
 * back-office; esta es la misma pieza, traída al Admin.
 *
 * Se esconde al imprimir con `.no-print`.
 */
export function PrintButton({ label }: { label: string }): React.ReactElement {
  return (
    <div className="no-print" style={{ background: '#f1f5f9', padding: '12px 32px', borderBottom: '1px solid #e2e8f0' }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          background: '#4f46e5', color: '#fff', border: 0, borderRadius: 8,
          padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </div>
  );
}
