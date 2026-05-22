import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import createPWA from '@ducanh2912/next-pwa';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withPWA = createPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-static',
          expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static',
          expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/_next\/image\?.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-image',
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Never cache Supabase or API routes
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/api\/.*/i,
        handler: 'NetworkOnly',
      },
    ],
  },
});

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

export default withPWA(withNextIntl(nextConfig));
