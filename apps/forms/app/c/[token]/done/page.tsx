/**
 * B.9 — Confirmación · ¡Listo, paciente!
 *
 * Ruta: /c/[token]/done
 * El paciente llegó aquí después de completar el intake (con lien si es MVA).
 * Se muestra: nombre, próximos pasos, opción de descargar PDF (Phase 2).
 *
 * El idioma llega por ?lang= y se aplica a TODA la pantalla. Antes el texto
 * estaba hardcodeado en español y solo el botón de cerrar respetaba el idioma,
 * asi que un paciente que eligió inglés terminaba viendo la pantalla mezclada.
 */

import { db } from '@precision-medical/database';
import { CloseWindowButton } from './close-window-button';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> };

type Lang = 'es' | 'en';

const T = {
  es: {
    title:         (n: string) => `¡Listo, ${n}! 🎉`,
    sub:           'Tu registro está completo. Nuestro equipo revisará tu información y se comunicará contigo pronto.',
    emailedTo:     'Te enviamos los documentos a',
    caseLabel:     'Número de caso',
    completedAt:   'Completado',
    nextStepsLabel:'Próximos pasos',
    step1Title:    'Verificamos tu caso',
    // Un caso GM no tiene abogado con quien coordinar.
    step1SubMva:   'Confirmamos tu seguro y coordinamos con tu abogado. Esto toma 24-48 horas.',
    step1SubGm:    'Confirmamos tu seguro y preparamos tu expediente. Esto toma 24-48 horas.',
    step2Title:    'Te llamamos para confirmar',
    step2Sub:      'Nuestro equipo te llama para confirmar tu cita y resolver cualquier duda.',
    step3Title:    'Vienes a la clínica',
    step3Sub:      'Trae tu licencia de conducir y tarjeta de seguro a tu primera visita. Te cuidamos.',
    downloadBtn:   '📄 Descargar copia del acuerdo (Próximamente)',
    downloadTitle: 'Disponible en Fase 2',
    questions:     '¿Preguntas?',
    cifoFarewell:  (n: string) => `¡Excelente trabajo, ${n}! Estás en buenas manos. Si tienes dudas antes de tu primera visita, no dudes en llamarnos. 💙`,
    fallbackName:  'Paciente',
  },
  en: {
    title:         (n: string) => `All set, ${n}! 🎉`,
    sub:           'Your registration is complete. Our team will review your information and contact you soon.',
    emailedTo:     'We sent your documents to',
    caseLabel:     'Case number',
    completedAt:   'Completed',
    nextStepsLabel:'Next steps',
    step1Title:    'We verify your case',
    step1SubMva:   'We confirm your insurance and coordinate with your attorney. This takes 24-48 hours.',
    step1SubGm:    'We confirm your insurance and prepare your chart. This takes 24-48 hours.',
    step2Title:    'We call you to confirm',
    step2Sub:      'Our team will call you to confirm your appointment and answer any questions.',
    step3Title:    'You come to the clinic',
    step3Sub:      "Bring your driver's license and insurance card to your first visit. We'll take care of you.",
    downloadBtn:   '📄 Download a copy of the agreement (Coming soon)',
    downloadTitle: 'Available in Phase 2',
    questions:     'Questions?',
    cifoFarewell:  (n: string) => `Great job, ${n}! You're in good hands. If anything comes up before your first visit, just give us a call. 💙`,
    fallbackName:  'Patient',
  },
} as const;

function fmtDateTime(d: Date | null | undefined, lang: Lang): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(lang === 'en' ? 'en-US' : 'es-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Denver',
  });
}

export default async function DonePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { lang: rawLang = 'en' } = await searchParams;
  const lang: Lang = rawLang === 'es' ? 'es' : 'en';
  const t = T[lang];

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      caseCode: true,
      caseType: true,
      intakeFormCompletedAt: true,
      patient: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const firstName    = rec?.patient.firstName ?? t.fallbackName;
  const caseCode     = rec?.caseCode ?? '';
  const completedAt  = rec?.intakeFormCompletedAt ?? null;
  const patientEmail = rec?.patient.email ?? null;
  // Solo MVA firma lien, asi que solo ahi hay un acuerdo que descargar.
  const hasLien      = rec?.caseType === 'MVA';

  const steps = [
    { icon: '🔍', title: t.step1Title, sub: hasLien ? t.step1SubMva : t.step1SubGm },
    { icon: '📞', title: t.step2Title, sub: t.step2Sub },
    { icon: '🏥', title: t.step3Title, sub: t.step3Sub },
  ];

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
            {t.title(firstName)}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.65 }}>
            {t.sub}
          </p>
          {patientEmail && (
            <p style={{
              marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              📧 {t.emailedTo} <span style={{ color: '#A5B4FC', fontFamily: 'monospace' }}>{patientEmail}</span>
            </p>
          )}
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
            {t.caseLabel}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: '#A5B4FC', letterSpacing: '0.08em' }}>
            {caseCode}
          </div>
          {completedAt && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 6 }}>
              {t.completedAt}: {fmtDateTime(completedAt, lang)}
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
            {t.nextStepsLabel}
          </div>
          {steps.map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12,
              padding: '10px 0',
              borderBottom: i < steps.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
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
          {/* Close window */}
          <CloseWindowButton firstName={firstName} caseCode={caseCode} lang={lang} />

          {/* Download PDF — Phase 2 placeholder. Un caso sin lien no tiene
              acuerdo que descargar, asi que el boton no aplica. */}
          {hasLien && (
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
              title={t.downloadTitle}
            >
              {t.downloadBtn}
            </button>
          )}

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
            📞 (801) 375-2207 · {t.questions}
          </a>
        </div>

        {/* Cifo farewell */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          marginTop: 24,
          padding: '12px 14px', borderRadius: 12,
          background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.20)',
        }}>
          <img src="/cifo-1.gif" alt="Cifo" style={{
            width: 56, height: 56, flexShrink: 0, objectFit: 'contain', borderRadius: 8,
          }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#A5B4FC', marginBottom: 3, letterSpacing: '0.10em' }}>
              CIFO
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', lineHeight: 1.55 }}>
              {t.cifoFarewell(firstName)}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
