import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}

export function Card({ title, subtitle, eyebrow, headerRight, children, padded }: CardProps) {
  return (
    <section className="card">
      {(title || eyebrow || headerRight) && (
        <div className="card-head">
          <div className="card-head-left">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {headerRight}
        </div>
      )}
      <div className={padded ? 'card-body card-body--padded' : 'card-body'}>
        {children}
      </div>
    </section>
  );
}
