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
    // `now` es el ancla del changelog. El sha NO sirve para eso: con
    // `turbo-ignore` salteando builds, Vercel crea deployments para commits que
    // nunca buildearon esta app, asi que `VERCEL_GIT_COMMIT_SHA` en runtime
    // apunta a un commit que no tiene fila en `releases`. La hora del server
    // —no la del cliente, para no comerse el desfasaje de reloj— si sirve
    // siempre: lo desplegado despues de que arranco la pestaña es nuevo.
    { version, now: new Date().toISOString() },
    {
      headers: {
        // Critico: no cachear NI en CDN NI en SW.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}
