import type { ReactNode } from 'react';

interface TopbarProps {
  title: string;
  breadcrumb?: string;
  userName: string;
  userRole: string;
  children?: ReactNode;
}

export function Topbar({ title, breadcrumb, userName, userRole, children }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        {title}
        {breadcrumb && (
          <>
            <span className="sep">{'//'}  </span>
            <span className="crumb-active">{breadcrumb}</span>
          </>
        )}
      </div>
      <div className="topbar-right">
        {children}
        <div className="live-indicator">En Vivo</div>
        <div className="user-chip">
          <div>
            <div className="user-name">{userName}</div>
            <div className="user-role">{userRole}</div>
          </div>
          <span className="user-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </span>
        </div>
      </div>
    </header>
  );
}
