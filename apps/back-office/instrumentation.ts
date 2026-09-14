import * as Sentry from '@sentry/nextjs';

/**
 * Que falte el par de Storage de Phoenix se avisa al arrancar, no cuando un
 * archivo no abre.
 *
 * ── Lo que pasó el 13-sep-2026 ──────────────────────────────────────────────
 * `SUPABASE_STORAGE_URL` y `SUPABASE_STORAGE_SERVICE_KEY` nunca se cargaron en
 * producción. Doce archivos las resuelven con la cadena
 * `SUPABASE_STORAGE_URL ?? SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL`, así que
 * al faltar cayeron al proyecto **Admin**, que no tiene los buckets de la
 * clínica. Resultado: las fotos de identidad de un paciente migrado no salían
 * —y la pantalla decía "faltan documentos"— mientras la base, el bucket y el
 * código estaban los tres bien.
 *
 * En local NO se reproduce, y ese es el detalle que lo escondió: en
 * `.env.local` el `SUPABASE_URL` del respaldo también apunta a Phoenix, así que
 * la cadena da lo mismo esté o no el par. Solo se rompe donde las dos variables
 * son de proyectos distintos, que es exactamente producción.
 *
 * Por eso el chequeo va acá y no en cada ruta: se corre UNA vez al arrancar el
 * server, antes de que nadie abra nada, y va también a Sentry — un `console`
 * en una función serverless lo lee quien lo está buscando, y nadie lo busca
 * hasta que un usuario reporta que algo no se ve.
 */
function revisarStorageDePhoenix(): void {
  const faltan = (['SUPABASE_STORAGE_URL', 'SUPABASE_STORAGE_SERVICE_KEY'] as const)
    .filter((v) => !process.env[v]);
  if (faltan.length === 0) return;

  const aviso =
    `[config] Faltan ${faltan.join(' y ')}. Sin eso, todo lo que vive en Storage ` +
    '(documentos del caso y del paciente, fotos de identidad, órdenes y resultados ' +
    'de laboratorio, adjuntos de mensajería y las descargas del portal del abogado) ' +
    'se resuelve contra el proyecto Supabase equivocado y falla en silencio.';

  console.error(aviso);
  Sentry.captureMessage(aviso, 'error');
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    revisarStorageDePhoenix();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
