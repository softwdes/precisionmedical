import { NextResponse } from 'next/server';

/**
 * Devuelve la versión del build actual.
 * Vercel inyecta VERCEL_GIT_COMMIT_SHA en build-time. El cliente pollea
 * este endpoint y muestra el banner "Actualizar" si el SHA cambia.
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
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}
