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
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: 'rgba(103,232,249,0.85)',
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          Phoenix · Phase 0 Scaffolding
        </div>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #06B6D4, #10B981)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 14,
          }}
        >
          LienMaster v3 · Portal del Paciente
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.65,
            marginBottom: 28,
          }}
        >
          Pacientes acceden con magic link · RLS por paciente · bilingüe español/inglés · mobile-first.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          <Button variant="default">Continuar</Button>
          <Button variant="outline">English</Button>
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
          Mockups canónicos: B.5 (Landing magic link) · B.6 (Datos personales) · B.7 (Salud) · B.8 (Documentos) · B.9 (Confirmación) · B.37 (Lobby mobile QR)
          <br />
          <span style={{ color: 'rgba(6,182,212,0.65)' }}>✓ next-intl wireado · @precision/ui wireado · Sentry inerte</span>
        </div>
      </div>
    </main>
  );
}
