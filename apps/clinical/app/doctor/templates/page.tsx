/**
 * B.17.7 — Gestión de plantillas clínicas
 *
 * Ruta:    /doctor/templates
 * Acceso:  Doctor (PROVIDER role)
 * Alcance: PERSONAL — CRUD mínimo Phase 1
 */

import { db } from '@precision-medical/database';
import { TemplatesClient } from './templates-client';

export const metadata = { title: 'Mis Plantillas · Precision Medical' };

export default async function TemplatesPage() {
  const doctors = await db.user.findMany({
    where: { role: 'PROVIDER', status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return (
    <div style={{
      minHeight: '100vh', background: '#0a1224', color: '#fff',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        padding: '0 24px', height: 56,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(139,92,246,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/doctor" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 7,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.60)', textDecoration: 'none', fontSize: 12,
          }}>← Mi Día</a>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.10)' }} />
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: '#8B5CF6',
          }}>
            B.17.7 · Plantillas Clínicas
          </span>
        </div>
      </header>

      <TemplatesClient doctors={doctors} />
    </div>
  );
}
