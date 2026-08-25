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
    // `now` es el ancla del changelog. El sha NO sirve para eso: con
    // `turbo-ignore` salteando builds, Vercel crea deployments para commits que
    // nunca buildearon esta app, asi que `VERCEL_GIT_COMMIT_SHA` en runtime
    // apunta a un commit que no tiene fila en `releases`. La hora del server
    // —no la del cliente, para no comerse el desfasaje de reloj— si sirve
    // siempre: lo desplegado despues de que arranco la pestaña es nuevo.
    { version, now: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}
