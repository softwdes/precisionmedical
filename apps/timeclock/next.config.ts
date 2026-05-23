import withPWA from '@ducanh2912/next-pwa';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ url }: { url: URL }) => url.hostname.includes('supabase.co'),
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /^\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
})(nextConfig);
