import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: [
    '@precision-medical/ui',
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
};

export default withNextIntl(nextConfig);
