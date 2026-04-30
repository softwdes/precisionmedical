import type { ReactNode } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
}

interface SidebarProps {
  brandName: string;
  brandTag: string;
  brandIcon: ReactNode;
  navItems: NavItem[];
  footer?: ReactNode;
}

export function Sidebar({ brandName, brandTag, brandIcon, navItems, footer }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-logo">{brandIcon}</span>
        <div>
          <div className="brand-name">{brandName}</div>
          <div className="brand-tag">{brandTag}</div>
        </div>
      </div>
      <nav className="nav">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`nav-item${item.active ? ' active' : ''}`}
          >
            {item.icon}
            {item.label}
          </a>
        ))}
      </nav>
      {footer && <div className="system-status">{footer}</div>}
    </aside>
  );
}
