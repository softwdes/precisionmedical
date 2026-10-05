import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    '@precision-medical/auth',
    '@precision-medical/database',
    '@precision-medical/i18n',
    '@precision-medical/observability',
  ],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok.io'],

  /**
   * Cabeceras de seguridad. Esta app es PÚBLICA (sin sesión) y maneja datos de
   * pacientes, y no mandaba ninguna.
   *
   *  · X-Frame-Options / frame-ancestors: nadie puede incrustar estas pantallas
   *    en otra página (clickjacking: superponer un botón invisible sobre el
   *    formulario de firma).
   *  · nosniff: el navegador no adivina el tipo de un archivo subido.
   *  · Referrer-Policy: las rutas llevan el token en la URL; que no viaje a
   *    terceros.
   *  · Permissions-Policy: la cámara se permite SOLO acá (fotos del ID en el
   *    intake); micrófono, ubicación y pagos, no.
   *  · noindex: ningún buscador debe listar `/c/<token>`, `/confirmar/<token>`
   *    ni la consulta de cita.
   *
   * No hay CSP todavía: Next inyecta scripts en línea y una CSP estricta pide
   * nonces por request. Es el siguiente paso, no un detalle.
   */
  async headers() {
    const seguras = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ];
    return [{ source: '/:path*', headers: seguras }];
  },
};

// Sentry wrapper — solo activo en CI/prod (DSN requerido).
// En dev local se salta para evitar problemas con symlinks de pnpm.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

let finalConfig = withSerwist(withNextIntl(nextConfig));

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
