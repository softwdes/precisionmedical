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
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!booted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-0 z-[100]">
        <div className="flex flex-col items-center gap-4 animate-boot-glow">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-brand shadow-glow">
            <span className="text-lg font-extrabold text-white tracking-widest">LM</span>
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
