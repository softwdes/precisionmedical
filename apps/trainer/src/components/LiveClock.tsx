'use client';

import { useState, useEffect } from 'react';

export default function LiveClock() {
  const [t, setT] = useState('');

  useEffect(() => {
    const tick = () =>
      setT(
        new Date().toLocaleTimeString('es-PE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="live-indicator" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
      {t || '••:••:••'}
    </div>
  );
}
