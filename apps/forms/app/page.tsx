/**
 * Portal · Home
 *
 * Los pacientes llegan SIEMPRE via magic link → /intake/[token]
 * Esta página solo se ve si alguien navega directo a la raíz del portal.
 */

export default function PortalHomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: '#060810',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 400, textAlign: 'center' }}>
        {/* Logo */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          marginBottom: 28,
          padding: '6px 16px', borderRadius: 20,
          background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)',
        }}>
          <span style={{ color: '#06B6D4', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em' }}>
            PRECISION MEDICAL
          </span>
        </div>

        {/* Icon */}
        <div style={{ fontSize: 48, marginBottom: 20 }}>🔗</div>

        <h1 style={{
          fontSize: 22, fontWeight: 800,
          color: '#fff', marginBottom: 12,
        }}>
          Usa tu enlace personalizado
        </h1>
        <p style={{
          fontSize: 14, color: 'rgba(255,255,255,0.55)',
          lineHeight: 1.65, marginBottom: 28,
        }}>
          Para acceder al formulario de intake, usa el enlace que recibiste por
          SMS o correo electrónico de Precision Medical.
        </p>

        <p style={{
          fontSize: 14, color: 'rgba(255,255,255,0.55)',
          lineHeight: 1.65, marginBottom: 8,
        }}>
          Use the personal link you received via SMS or email from Precision Medical
          to access your intake form.
        </p>

        <div style={{
          marginTop: 28,
          padding: '14px 20px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
            ¿Preguntas? · Questions?
          </div>
          <a
            href="tel:+18013752207"
            style={{
              color: '#06B6D4', fontSize: 16, fontWeight: 700,
              textDecoration: 'none', letterSpacing: '0.02em',
            }}
          >
            (801) 375-2207
          </a>
        </div>
      </div>
    </main>
  );
}
