'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const V = '#534AB7';

const NAV = [
  {
    href: '/master/dashboard', label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    href: '/master/trainers', label: 'Trainers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
        <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>
      </svg>
    ),
  },
  {
    href: '/master/planes', label: 'Planes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ),
  },
  {
    href: '/master/facturacion', label: 'Facturación',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>
    ),
  },
  {
    href: '/master/reportes', label: 'Reportes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
];

function BrandBlock() {
  return (
    <div className="brand" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{
        width: 42, height: 42, borderRadius: '10px', background: V,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" style={{ width: 20, height: 20 }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </div>
      <div>
        <div className="brand-name" style={{ fontSize: '15px' }}>
          Precision <span style={{ color: V }}>Trainer</span>
        </div>
        <div style={{
          fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px',
          background: 'rgba(83,74,183,0.2)', color: V,
          letterSpacing: '0.08em', display: 'inline-block', marginTop: '3px',
        }}>
          MASTER
        </div>
      </div>
    </div>
  );
}

export default function MasterSidebar({ email }: { email: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const footerBlock = (
    <div style={{
      padding: '16px 20px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: V, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: 15, height: 15 }}>
          <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>
        </svg>
      </div>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--fg-muted)', marginTop: '1px' }}>Super Admin</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar" style={{ borderRight: '1px solid rgba(83,74,183,0.2)' }}>
        <BrandBlock />
        <nav className="nav" style={{ flex: 1 }}>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname.startsWith(item.href) ? ' active' : ''}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        {footerBlock}
      </aside>

      {/* Hamburger button — fixed, appears at 900px via CSS */}
      <button
        className="hamburger-btn"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileOpen(false)}>
          <div className="mobile-nav" onClick={e => e.stopPropagation()}>
            <div className="mobile-nav-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '8px', background: V,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" style={{ width: 16, height: 16 }}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg-strong)' }}>
                    Precision <span style={{ color: V }}>Trainer</span>
                  </div>
                  <div style={{
                    fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px',
                    background: 'rgba(83,74,183,0.2)', color: V,
                    letterSpacing: '0.08em', display: 'inline-block', marginTop: '2px',
                  }}>
                    MASTER
                  </div>
                </div>
              </div>
              <button className="mobile-nav-close" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <nav className="nav" style={{ flex: 1 }}>
              {NAV.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${pathname.startsWith(item.href) ? ' active' : ''}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </nav>

            {footerBlock}
          </div>
        </div>
      )}
    </>
  );
}
