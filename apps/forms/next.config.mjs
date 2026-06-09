import createNextIntlPlugin from 'next-intl/plugin';
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
};

// Sentry wrapper — solo activo en CI/prod (DSN requerido).
// En dev local se salta para evitar problemas con symlinks de pnpm.
let finalConfig = withNextIntl(nextConfig);

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
