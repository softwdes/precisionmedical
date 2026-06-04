import withPWA from '@ducanh2912/next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default withPWA({
  dest: 'public',
  register: true,
  sw: 'sw.js',
  scope: '/',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
        handler: 'NetworkOnly',
      },
      {
        // API routes: NUNCA cachear. cacheOnFrontEndNav + aggressiveFrontEndNavCaching
        // hacen que next-pwa intercepte todo lo no listado y lo sirva con
        // StaleWhileRevalidate. Eso rompia el polling de /api/version (el banner
        // "Nueva version disponible" no se disparaba en mobile porque el SW
        // devolvia siempre la misma version cacheada al cliente).
        urlPattern: /\/api\/.*/i,
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
