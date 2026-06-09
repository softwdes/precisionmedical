/**
 * B.9 — Confirmación · ¡Listo, paciente!
 *
 * Ruta: /c/[token]/done
 * El paciente llegó aquí después de firmar el lien.
 * Se muestra: nombre, próximos pasos, opción de descargar PDF (Phase 2).
 */

import { db } from '@precision-medical/database';

type Props = { params: Promise<{ token: string }> };

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Denver',
  });
}

export default async function DonePage({ params }: Props) {
  const { token } = await params;

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      intakeFormCompletedAt: true,
      patient: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const firstName  = rec?.patient.firstName ?? 'Paciente';
  const caseCode   = rec?.caseCode ?? '';
  const completedAt = rec?.intakeFormCompletedAt ?? null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a1224',
      color: '#fff',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div style={{ maxWidth: 420, width: '100%' }}>

        {/* Success animation */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10B981, #06B6D4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, margin: '0 auto 20px',
            boxShadow: '0 0 50px rgba(16,185,129,0.40)',
          }}>
            ✓
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10 }}>
            ¡Listo, {firstName}! 🎉
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.65 }}>
            Tu registro está completo. Nuestro equipo revisará tu información
            y se comunicará contigo para confirmar tu primera cita.
          </p>
        </div>

        {/* Case code card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
            Número de caso
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: '#A5B4FC', letterSpacing: '0.08em' }}>
            {caseCode}
          </div>
          {completedAt && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 6 }}>
              Completado: {fmtDateTime(completedAt)}
            </div>
          )}
        </div>

        {/* Next steps */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.35)', marginBottom: 14,
          }}>
            Próximos pasos
          </div>
          {[
            { icon: '📞', title: 'Te llamamos', sub: 'Nuestro equipo te contactará en 24-48 horas para confirmar tu cita.' },
            { icon: '📅', title: 'Primera visita', sub: 'Recibirás un SMS de recordatorio el día anterior a tu cita.' },
            { icon: '📄', title: 'Trae tu ID', sub: 'Lleva tu licencia de conducir y tarjeta de seguro a tu primera visita.' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12,
              padding: '10px 0',
              borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{item.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Download PDF — Phase 2 placeholder */}
          <button
            style={{
              width: '100%', padding: '14px',
              background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)',
              borderRadius: 12, color: '#A5B4FC',
              fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            disabled
            title="Disponible en Fase 2"
          >
            📄 Descargar copia del acuerdo (Próximamente)
          </button>

          {/* Call button */}
          <a
            href="tel:+18013752207"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 20px', borderRadius: 12,
              background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)',
              color: '#06B6D4', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}
          >
            📞 (801) 375-2207 · ¿Preguntas?
          </a>
        </div>

        {/* Sifo farewell */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          marginTop: 24,
          padding: '12px 14px', borderRadius: 10,
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
          }}>✨</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#A5B4FC', marginBottom: 2, letterSpacing: '0.08em' }}>
              SIFO
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
              ¡Excelente trabajo, {firstName}! Estás en buenas manos. Si tienes dudas antes de tu primera visita, no dudes en llamarnos. 💙
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
