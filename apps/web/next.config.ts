import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: [
    '@precision/ui',
    '@precision-medical/auth',
    '@precision-medical/api',
    '@precision-medical/database',
    '@precision-medical/i18n',
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

export default withNextIntl(nextConfig);
