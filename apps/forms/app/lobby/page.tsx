/**
 * B.37 — Lobby TV · Clinic Selector
 * /lobby
 *
 * Página para que el staff elija qué clínica proyectar en la TV.
 * Server Component — sin event handlers.
 */

import Link   from 'next/link';
import { db } from '@precision-medical/database';

export const metadata = {
  title:  'Lobby TV · Precision Medical',
  robots: 'noindex, nofollow',
};

export default async function LobbyIndexPage() {
  const clinics = await db.clinic.findMany({
    orderBy: { name: 'asc' },
    select:  { id: true, name: true, address: true },
  });

  const colors = ['#06B6D4', '#8B5CF6', '#10B981', '#F59E0B', '#6366F1'];

  return (
    <>
      <style>{`
        body { margin: 0; background: #0a1224; }
        .clinic-card {
          text-decoration: none;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 28px 24px;
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          transition: all 0.2s;
          cursor: pointer;
        }
        .clinic-card:hover {
          background: rgba(255,255,255,0.07);
          transform: translateY(-2px);
        }
        .clinic-card-c0 { border: 1px solid #06B6D430; }
        .clinic-card-c0:hover { border-color: #06B6D460; }
        .clinic-card-c1 { border: 1px solid #8B5CF630; }
        .clinic-card-c1:hover { border-color: #8B5CF660; }
        .clinic-card-c2 { border: 1px solid #10B98130; }
        .clinic-card-c2:hover { border-color: #10B98160; }
        .clinic-card-c3 { border: 1px solid #F59E0B30; }
        .clinic-card-c3:hover { border-color: #F59E0B60; }
        .clinic-card-c4 { border: 1px solid #6366F130; }
        .clinic-card-c4:hover { border-color: #6366F160; }
      `}</style>

      <div style={{
        minHeight:      '100vh',
        background:     '#0a1224',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     "'Plus Jakarta Sans', system-ui, sans-serif",
        padding:        '40px 24px',
        gap:            40,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            width: 64, height: 64,
            borderRadius: 16,
            background:   'linear-gradient(135deg, #06B6D4, #8B5CF6)',
            fontSize: 22, fontWeight: 900, color: '#fff',
            marginBottom: 20,
            boxShadow: '0 0 32px rgba(99,102,241,0.40)',
          }}>PM</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
            Sala de Espera · Waiting Room
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.40)', marginTop: 8 }}>
            Selecciona la clínica para proyectar en TV · Select clinic to display on TV
          </p>
        </div>

        {/* Clinic cards */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20, width: '100%', maxWidth: 900,
        }}>
          {clinics.map((clinic, i) => {
            const color = colors[i % colors.length];
            const ci    = i % colors.length;
            return (
              <Link
                key={clinic.id}
                href={`/lobby/${clinic.id}`}
                className={`clinic-card clinic-card-c${ci}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: `${color}20`,
                    border:     `2px solid ${color}50`,
                    display:    'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>
                    📺
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                      {clinic.name}
                    </div>
                    {clinic.address && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginTop: 3 }}>
                        {clinic.address}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  display:    'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: 12, borderTop: `1px solid ${color}20`,
                }}>
                  <span style={{ fontSize: 12, color, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Proyectar en TV · Display
                  </span>
                  <span style={{ fontSize: 18, color }}>→</span>
                </div>
              </Link>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.20)', textAlign: 'center', maxWidth: 500 }}>
          HIPAA · Solo muestra iniciales + 2 dígitos · Ningún dato personal visible
        </p>
      </div>
    </>
  );
}
