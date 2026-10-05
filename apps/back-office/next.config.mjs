// @ts-check
// build trigger: 2026-07-21
import createNextIntlPlugin from 'next-intl/plugin';
import { cabecerasDeSeguridad } from '../../security-headers.mjs';
import withPWA from '@ducanh2912/next-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');


/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Dónde escribe el build. El default sigue siendo `.next` — esto solo abre la
   * puerta para mandarlo a otro lado con una variable de entorno.
   *
   * ── Para qué ────────────────────────────────────────────────────────────────
   *
   * Next 15.5 comparte `.next` entre `dev` y `build`, así que un `next build`
   * corrido mientras alguien tiene el dev server de ESTA app levantado rompe las
   * dos cosas: el build falla con `PageNotFoundError: Cannot find module for
   * page` en rutas que nadie tocó, y el dev server queda sirviendo 500 hasta que
   * se borra `.next` a mano. En un repo que comparten varias sesiones a la vez
   * eso ya pasó tres veces, y la última con Erick mirando la pantalla.
   *
   * Ahora se puede verificar un cambio sin pisarle el server a nadie:
   *
   *     NEXT_DIST_DIR=.next-verify npx next build
   *
   * El default no cambia, así que Vercel, `next dev` y cualquier script que ya
   * exista siguen usando `.next` sin enterarse.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Las cabeceras viven en `security-headers.mjs` de la raíz. Estaban acá y
  // SOLO acá: las otras cuatro apps no tenían ninguna hasta el 2026-10-05.
  async headers() {
    return cabecerasDeSeguridad('back-office');
  },
  // ── Prisma binary tracing (pnpm monorepo + Vercel) ───────────────────────────
  // El binario nativo .so.node no es trazado por Next.js automáticamente.
  // outputFileTracingRoot amplía el scope al monorepo root.
  // outputFileTracingIncludes lo incluye explícitamente en el bundle serverless.
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
    '@precision-medical/database',
    '@precision-medical/i18n',
    '@precision-medical/observability',
  ],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

const withPWAConfig = withPWA({
  dest: 'public',
  register: true,        // inyecta el registro del SW en el HTML antes de que React hidrate
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /^\/api\/.*/i,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst',
        options: { cacheName: 'bo-static', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } },
      },
      {
        urlPattern: /\/_next\/image.*/i,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'bo-images', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } },
      },
    ],
  },
});

// Sentry wrapper — solo activo en CI/prod (DSN requerido).
// En dev local se salta para evitar problemas con symlinks de pnpm.
let finalConfig = withPWAConfig(withNextIntl(nextConfig));

if (process.env.SENTRY_DSN) {
  const { withSentryConfig } = await import('@sentry/nextjs');
  finalConfig = withSentryConfig(finalConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  });
}

export default finalConfig;
