import { Button } from '@precision/ui';

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
            color: 'rgba(196,181,253,0.85)',
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
            background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 14,
          }}
        >
          LienMaster v3 · Clinical
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.65,
            marginBottom: 28,
          }}
        >
          Doctores + MAs (triaje). iPad-optimizado. DAW EPCS para prescripciones de controladas.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          <Button variant="default">Iniciar visita</Button>
          <Button variant="outline">Mi día</Button>
        </div>

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
          Mockups canónicos: B.16 (Triaje MA) · B.17 (Doctor Mi día) · B.17.5–B.17.7 (Entry · Selector · Admin plantillas) · B.18 (Visita en sala) · B.19–B.21 (Rx DAW + CPT) · B.37 (Lobby Display)
          <br />
          <span style={{ color: 'rgba(139,92,246,0.65)' }}>✓ next-intl wireado · @precision/ui wireado · Sentry inerte</span>
        </div>
      </div>
    </main>
  );
}
