import { NextResponse } from 'next/server';

/**
 * Devuelve la version del build actual.
 *
 * Vercel inyecta VERCEL_GIT_COMMIT_SHA durante el build — el cliente
 * pollea este endpoint, guarda lo que vio al montar, y si el valor
 * cambia significa que hay deploy nuevo y muestra el banner "Actualizar".
 *
 * En dev local devolvemos 'dev' — sin polling util ni problema.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(): NextResponse {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_BUILD_VERSION ??
    'dev';
  return NextResponse.json(
    { version },
    {
      headers: {
        // Critico: no cachear NI en CDN NI en SW. Si Vercel o el Service
        // Worker cachean esta respuesta, el banner nunca aparece.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}
