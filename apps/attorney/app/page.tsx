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
            color: 'rgba(253,164,175,0.85)',
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
            background: 'linear-gradient(135deg, #F43F5E, #F59E0B)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 14,
          }}
        >
          LienMaster v3 · Attorney Portal
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.65,
            marginBottom: 28,
          }}
        >
          External law firms · RLS per firm · One-click lien signing · Bilingual English/Spanish · Demand letter auto-population.
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
          🚧 Phase 1 (clinical modules) coming · This app is scaffold-only
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 12,
            color: 'rgba(255,255,255,0.40)',
            lineHeight: 1.65,
          }}
        >
          Canonical mockups: B.22 (Attorney Portal) · B.30 (Law firms catalog)
        </div>
      </div>
    </main>
  );
}
