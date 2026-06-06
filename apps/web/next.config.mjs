import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [{ url: '/offline', revision: '1' }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@precision/ui',
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
