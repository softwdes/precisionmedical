'use client';

export function CloseWindowButton() {
  return (
    <button
      type="button"
      onClick={() => window.close()}
      style={{
        width: '100%', padding: '14px',
        background: 'linear-gradient(135deg, #10B981, #06B6D4)', border: 'none',
        borderRadius: 12, color: '#fff',
        fontSize: 15, fontWeight: 700, cursor: 'pointer',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      ✓ Cerrar esta ventana
    </button>
  );
}
