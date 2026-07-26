'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

/**
 * BootAnimation — splash inicial al cargar la app.
 *
 * Aparece por 1.2s con el logo LM + dots pulsando, después fade-in al contenido.
 * Copiado del patrón canónico del admin (apps/web).
 *
 * Se monta UNA sola vez en admin-shell · subsequent navegaciones no la disparan
 * (usar NavigationProgress para esos casos).
 */
export function BootAnimation({ children }: { children: React.ReactNode }): React.ReactElement {
  const [booted, setBooted] = useState(true);

  useEffect(() => {
    setBooted(false);
    const timer = setTimeout(() => setBooted(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!booted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-0 z-[100]">
        <div className="flex flex-col items-center gap-4 animate-boot-glow">
          <div className="flex h-16 w-16 items-center justify-center rounded-[20px] shadow-glow" style={{ background: 'linear-gradient(135deg,#1E40AF 0%,#2563EB 50%,#38BDF8 100%)', boxShadow: '0 0 40px rgba(37,99,235,0.65),0 0 80px rgba(56,189,248,0.25)' }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="13" y="2" width="10" height="32" rx="2.5" fill="white" fillOpacity="0.95"/>
              <rect x="2" y="13" width="32" height="10" rx="2.5" fill="white" fillOpacity="0.95"/>
              <path d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18" stroke="#1E40AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <p className="text-xs text-text-muted tracking-wider uppercase">Precision Medical</p>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1 w-1 rounded-full bg-brand animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <div className="animate-fade-in">{children}</div>;
}
