export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ maxWidth: 640, textAlign: 'center' }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: 'rgba(165,180,252,0.85)',
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          Phoenix · Phase 0 Scaffolding
        </div>
        <h1
          style={{
            fontSize: 38,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #06B6D4, #6366F1, #8B5CF6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 14,
          }}
        >
          LienMaster v3 · Back Office
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.65,
            marginBottom: 28,
          }}
        >
          Front Office + Edson (intake) + Brunella (billing, HCFA, ledger, settlement, abogados) + Super Admin clínico.
        </p>
        <div
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.30)',
            borderRadius: 8,
            color: '#fbbf24',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          🚧 Phase 1 (módulos clínicos) viene · Esta app está scaffold-only
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 12,
            color: 'rgba(255,255,255,0.40)',
            lineHeight: 1.65,
          }}
        >
          Mockups canónicos: B.1–B.4 (Front Office) · B.12–B.13 (Edson pre-visita) · B.23–B.28 (Brunella) · B.25–B.27 (billing)
        </div>
      </div>
    </main>
  );
}
