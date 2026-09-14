import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [{ url: '/offline', revision: '1' }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * El binario de Prisma, para que viaje en el paquete serverless.
   *
   * ── Por qué hacía falta acá, si esta app casi no usa Prisma ────────────────
   *
   * Justamente por eso. El ÚNICO archivo del Admin que lo toca es
   * `app/api/push/subscribe/route.ts`, que resuelve el id de la persona en la
   * base de la clínica antes de guardar su suscripción. Como no hay otro camino
   * que lo ejercite, el faltante no se notaba en ninguna pantalla: solo rompía
   * el botón de activar los avisos, y de una forma que parecía otra cosa.
   *
   * El síntoma que lo destapó (Erick, 2026-09-13, en el teléfono): aceptaba el
   * permiso, salía "no se pudieron cambiar los avisos" y **después desaparecía
   * el icono**. El navegador ya había creado la suscripción; el servidor no
   * pudo guardarla; y al releer el estado, el control la encontraba y la daba
   * por encendida — el peor lugar posible, porque se ve activado y no puede
   * llegar nada.
   *
   * `transpilePackages` no alcanza: compila el paquete, pero el `.so.node` es
   * un binario nativo que el trazado de Next no sigue solo en un monorepo de
   * pnpm. Es la misma configuración que `apps/back-office` lleva desde que se
   * desplegó, con el mismo comentario.
   */
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingIncludes: {
    '/**': [
      '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
      '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/schema.prisma',
    ],
  },
  transpilePackages: [
    '@precision/ui',
    '@precision-medical/agente',
    '@precision-medical/auth',
    '@precision-medical/api',
    '@precision-medical/database',
    '@precision-medical/i18n',
    '@precision-medical/observability',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/icon' },
      { source: '/apple-touch-icon.png', destination: '/apple-icon' },
      { source: '/apple-touch-icon-precomposed.png', destination: '/apple-icon' },
      { source: '/apple-touch-icon-:size.png', destination: '/apple-icon' },
      { source: '/apple-touch-icon-:size-precomposed.png', destination: '/apple-icon' },
    ];
  },
  async redirects() {
    return [
      { source: '/dashboard/payments',     destination: '/dashboard/employees?tab=pagos',          permanent: false },
      { source: '/dashboard/petty-cash',   destination: '/dashboard/finanzas',                     permanent: false },
      { source: '/dashboard/fx',           destination: '/dashboard/finanzas?tab=fx',              permanent: false },
      { source: '/dashboard/wallets',      destination: '/dashboard/finanzas?tab=wallets',         permanent: false },
      { source: '/dashboard/appointments', destination: '/dashboard/metricas?tab=citas',           permanent: false },
      { source: '/dashboard/lawyers',      destination: '/dashboard/metricas?tab=abogados',        permanent: false },
      { source: '/dashboard/providers',    destination: '/dashboard/metricas?tab=proveedores',     permanent: false },
      { source: '/dashboard/metrics',      destination: '/dashboard/metricas',                     permanent: false },
      { source: '/dashboard/tasks',        destination: '/dashboard',                              permanent: false },
      { source: '/dashboard/attendance',   destination: '/dashboard/employees',                    permanent: false },
      { source: '/dashboard/patients',     destination: '/dashboard',                              permanent: false },
      { source: '/dashboard/commissions',  destination: '/dashboard',                              permanent: false },
    ];
  },
};

// Sentry debe ser el wrapper más externo (sobre Serwist + next-intl).
// org/project/authToken se leen de las env vars en build (Vercel).
// Si no hay SENTRY_AUTH_TOKEN, el build no falla: solo no sube source maps.
export default withSentryConfig(withSerwist(withNextIntl(nextConfig)), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  // tunnelRoute desactivado: el middleware de auth bloquearía la ruta proxy.
});
