/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@precision/ui', '@precision/db', '@precision/lib', '@precision/ai',
    '@fullcalendar/react', '@fullcalendar/core', '@fullcalendar/daygrid',
    '@fullcalendar/timegrid', '@fullcalendar/interaction',
  ],
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['@precision/ui', '@precision/db'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
