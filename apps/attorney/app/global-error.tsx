'use client';

/**
 * Límite de error catastrófico de el portal legal.
 *
 * No es cosmético: **sin este archivo se pierden errores**. El límite de error
 * de React se come la excepción antes de que el SDK de Sentry la vea, así que un
 * fallo de render en producción no llegaba a ninguna parte — nos enterábamos
 * solo si alguien lo reportaba. Sentry ya estaba configurado en esta app
 * (`sentry.client/server/edge.config.ts` + `withSentryConfig`); lo único que
 * faltaba era el `captureException` de acá.
 *
 * `apps/web` y `timeclock` lo tenían desde antes; back-office se agregó el
 * 2026-08-20 junto con estos tres.
 *
 * `global-error` REEMPLAZA el layout raíz, por eso renderiza su propio
 * `<html>/<body>`, no puede usar next-intl (está fuera del provider) y va con
 * estilos en línea: si lo que explotó fue el layout, no hay clases de Tailwind
 * garantizadas. De ahí el mensaje bilingüe y los colores escritos a mano.
 */

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
    <html lang="en">
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
          background: '#060810',
          color: '#FFFFFF',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Algo salió mal · Something went wrong
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginBottom: '1.5rem' }}>
            Ocurrió un error inesperado. El equipo ya fue notificado. · An unexpected error occurred. The team has been notified.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 8,
              border: 'none',
              background: '#F43F5E',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reintentar · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
