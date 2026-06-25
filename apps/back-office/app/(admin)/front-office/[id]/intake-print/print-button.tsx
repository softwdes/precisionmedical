'use client';

export function PrintButton() {
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      <button
        onClick={() => window.print()}
        style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          background: '#4f46e5', color: '#fff', border: 'none', fontFamily: 'inherit',
        }}
      >
        🖨 Imprimir / PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', fontFamily: 'inherit',
        }}
      >
        ✕ Cerrar
      </button>
    </div>
  );
}
