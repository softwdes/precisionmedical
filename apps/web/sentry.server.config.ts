import * as Sentry from '@sentry/nextjs';
import { buildServerOptions } from '@precision-medical/observability';

Sentry.init(
  buildServerOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  }),
);
