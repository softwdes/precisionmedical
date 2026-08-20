'use client';

/**
 * Límite de error catastrófico de todo el back-office.
 *
 * No es cosmético: **sin este archivo se pierden errores**. El límite de error
 * de React se come la excepción antes de que el SDK de Sentry la vea, así que un
 * fallo de render en producción no llegaba a ninguna parte — nos enterábamos
 * solo si alguien lo reportaba. Sentry está configurado en esta app
 * (`sentry.client/server/edge.config.ts`), lo que faltaba era el `captureException`
 * de acá. `apps/web` y `timeclock` ya lo tenían; attorney, clinical y forms
 * todavía no.
 *
 * `global-error` REEMPLAZA el layout raíz, por eso renderiza su propio
 * `<html>/<body>` y no puede usar next-intl: está fuera del provider. De ahí que
 * el mensaje vaya bilingüe y con estilos en línea (tampoco hay clases de
 * Tailwind garantizadas si lo que explotó fue el layout).
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
          background: '#0B0D12',
          color: '#E6E8EE',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Algo salió mal · Something went wrong
          </h1>
          <p style={{ color: '#8A90A2', marginBottom: '1.5rem' }}>
            Ocurrió un error inesperado. El equipo ya fue notificado.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 8,
              border: 'none',
              background: '#6366F1',
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
