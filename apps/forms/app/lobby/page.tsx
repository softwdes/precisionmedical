/**
 * B.37 — Lobby TV · Clinic Selector
 * /lobby?lang=en|es
 *
 * Solo muestra clínicas con al menos 1 cita registrada.
 * Server Component — sin event handlers.
 */

import Link   from 'next/link';
import { db } from '@precision-medical/database';

export const metadata = {
  title:  'Lobby TV · Precision Medical',
  robots: 'noindex, nofollow',
};

const COLORS = ['#06B6D4', '#8B5CF6', '#10B981', '#F59E0B', '#6366F1'];

interface Props {
  searchParams: Promise<{ lang?: string }>;
}

export default async function LobbyIndexPage({ searchParams }: Props) {
  const { lang } = await searchParams;
  const es = lang !== 'en'; // default español

  // Solo clínicas con al menos 1 cita
  const clinicsWithAppts = await db.clinic.findMany({
    where: {
      appointments: { some: {} },
    },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, address: true,
      _count: { select: { appointments: true } },
    },
  });

  const toggleLang = es ? '?lang=en' : '?lang=es';

  return (
    <>
      <style>{`
        body { margin: 0; background: #0a1224; }
        .clinic-card {
          text-decoration: none; display: flex; flex-direction: column;
          gap: 16px; padding: 28px 24px; border-radius: 18px;
          background: rgba(255,255,255,0.03); transition: all 0.2s; cursor: pointer;
        }
        .clinic-card:hover { background: rgba(255,255,255,0.07); transform: translateY(-2px); }
        .clinic-card-c0 { border: 1px solid #06B6D430; } .clinic-card-c0:hover { border-color: #06B6D460; }
        .clinic-card-c1 { border: 1px solid #8B5CF630; } .clinic-card-c1:hover { border-color: #8B5CF660; }
        .clinic-card-c2 { border: 1px solid #10B98130; } .clinic-card-c2:hover { border-color: #10B98160; }
        .clinic-card-c3 { border: 1px solid #F59E0B30; } .clinic-card-c3:hover { border-color: #F59E0B60; }
        .clinic-card-c4 { border: 1px solid #6366F130; } .clinic-card-c4:hover { border-color: #6366F160; }
        .lang-btn { background: none; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
          padding: 6px 14px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;
          text-decoration: none; }
        .lang-btn:hover { border-color: rgba(255,255,255,0.40); background: rgba(255,255,255,0.06); }
        .lang-btn.active { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.35); color: #fff; }
        .lang-btn.inactive { color: rgba(255,255,255,0.40); }
      `}</style>

      <div style={{
        minHeight: '100vh', background: '#0a1224', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", padding: '40px 24px', gap: 40,
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', position: 'relative', width: '100%', maxWidth: 900 }}>
          {/* Lang toggle */}
          <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 6 }}>
            <Link href="?lang=es" className={`lang-btn ${es ? 'active' : 'inactive'}`}>ES</Link>
            <Link href="?lang=en" className={`lang-btn ${!es ? 'active' : 'inactive'}`}>EN</Link>
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #06B6D4, #8B5CF6)',
            fontSize: 22, fontWeight: 900, color: '#fff',
            marginBottom: 20, boxShadow: '0 0 32px rgba(99,102,241,0.40)',
          }}>PM</div>

          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
            {es ? 'Sala de Espera' : 'Waiting Room'}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.40)', marginTop: 8 }}>
            {es
              ? 'Selecciona la clínica para proyectar en TV'
              : 'Select a clinic to display on TV'}
          </p>
        </div>

        {/* Clinic cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20, width: '100%', maxWidth: 900,
        }}>
          {clinicsWithAppts.map((clinic, i) => {
            const color = COLORS[i % COLORS.length];
            const ci    = i % COLORS.length;
            return (
              <Link
                key={clinic.id}
                href={`/lobby/${clinic.id}`}
                className={`clinic-card clinic-card-c${ci}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: `${color}20`, border: `2px solid ${color}50`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>📺</div>
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
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: 12, borderTop: `1px solid ${color}20`,
                }}>
                  <span style={{ fontSize: 12, color, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {es ? 'Proyectar en TV' : 'Display on TV'} →
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>
                    {clinic._count.appointments} {es ? 'citas' : 'appts'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.20)', textAlign: 'center', maxWidth: 500 }}>
          HIPAA · {es
            ? 'Solo muestra iniciales + 2 dígitos · Ningún dato personal visible'
            : 'Shows initials + 2 digits only · No personal data displayed'}
        </p>
      </div>
    </>
  );
}
