import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: [
    '@precision-medical/auth',
    '@precision-medical/i18n',
    '@precision-medical/observability',
    '@precision-medical/database',
  ],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

let finalConfig = withNextIntl(nextConfig);

// Sentry: solo cargar si SENTRY_DSN está seteado (evita error de symlink en dev)
if (process.env.SENTRY_DSN) {
  const { withSentryConfig } = await import('@sentry/nextjs');
  finalConfig = withSentryConfig(finalConfig, {
    org:                   process.env.SENTRY_ORG,
    project:               process.env.SENTRY_PROJECT,
    silent:                !process.env.CI,
    widenClientFileUpload: true,
    disableLogger:         true,
    automaticVercelMonitors: false,
  });
}

export default finalConfig;
