import * as Sentry from '@sentry/nextjs';
import { buildEdgeOptions } from '@precision-medical/observability';

// PHI zone — Sentry queda configurado pero inerte sin DSN (Phase 0 sin BAA).
Sentry.init(
  buildEdgeOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  }),
);
