'use client';

/**
 * Límite de error catastrófico de los formularios del paciente.
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
 * Es la app que más lo necesitaba: la usan los PACIENTES desde su teléfono, así
 * que un error acá no lo ve nadie del equipo — el paciente abandona el formulario
 * y no llama. Por eso el mensaje no dice "el equipo fue notificado" sino qué
 * hacer: reintentar y, si sigue, llamar a la clínica.
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
            No pudimos cargar el formulario. Podés reintentar; si sigue igual, llamá a la clínica. · We couldn’t load the form. Try again; if it keeps failing, call the clinic.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 8,
              border: 'none',
              background: '#06B6D4',
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
