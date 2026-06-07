import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@precision/ui',
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
