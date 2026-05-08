'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  {
    href: '/inicio',
    label: 'Inicio',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: '/rutina',
    label: 'Mi Rutina',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <line x1="9" y1="17" x2="15" y2="17"/>
      </svg>
    ),
  },
  {
    href: '/horario',
    label: 'Horario',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
      </svg>
    ),
  },
  {
    href: '/metricas',
    label: 'Métricas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    href: '/nutricion',
    label: 'Nutrición',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 00-7.35 16.76A2 2 0 006 20h12a2 2 0 001.35-.24A10 10 0 0012 2z"/>
        <path d="M12 12c0-3 2-5 2-5s-4 1-4 5"/>
      </svg>
    ),
  },
];

export default function StudentSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </span>
        <div>
          <div className="brand-name">Neural <span style={{ color: 'var(--accent)' }}>Trainer</span></div>
          <div className="brand-tag">Mi Entrenamiento</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map(({ href, label, icon }) => {
          const isActive = pathname === href || (href !== '/inicio' && pathname.startsWith(href)) || (href === '/inicio' && (pathname === '/inicio' || pathname === '/'));
          return (
            <Link key={href} href={href} className={`nav-item${isActive ? ' active' : ''}`}>
              <span style={{ width: '16px', height: '16px', flexShrink: 0 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
