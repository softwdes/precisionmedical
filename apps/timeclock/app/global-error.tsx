'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Algo salió mal · Something went wrong
          </h1>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Ocurrió un error inesperado. El equipo ya fue notificado.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 8,
              border: 'none',
              background: '#111',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Reintentar · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
