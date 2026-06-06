/**
 * Opciones base de Sentry compartidas por todas las apps y runtimes.
 *
 * Principios:
 *  - `enabled` solo si hay DSN y no estamos en desarrollo → el código se puede
 *    desplegar "inactivo" (sin DSN) sin enviar nada, ideal mientras no haya BAA
 *    en la zona PHI.
 *  - `sendDefaultPii: false` → Sentry no adjunta IP, cookies ni headers de usuario.
 *  - `beforeSend` / `beforeBreadcrumb` → scrubbing de PHI/PII (ver scrubbing.ts).
 *  - Session Replay DESACTIVADO a propósito (graba el DOM = riesgo de fuga de PHI).
 */

import type { BrowserOptions, NodeOptions } from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from './scrubbing';

export interface BaseConfig {
  /** DSN del proyecto Sentry. Si es undefined/'' Sentry queda inactivo. */
  dsn: string | undefined;
  /** 'production' | 'preview' | 'development' (NODE_ENV o VERCEL_ENV). */
  environment: string;
  /** Hash del release para correlacionar con source maps (opcional). */
  release?: string;
  /** Muestreo de performance tracing. Default 0.1 (10%). */
  tracesSampleRate?: number;
}

function shared(config: BaseConfig) {
  return {
    dsn: config.dsn,
    enabled: Boolean(config.dsn) && config.environment !== 'development',
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate ?? 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/** Opciones para el navegador (sentry.client.config.ts). */
export function buildClientOptions(config: BaseConfig): BrowserOptions {
  return {
    ...shared(config),
    // Session Replay forzado a 0 — no capturamos DOM (riesgo PHI).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  };
}

/** Opciones para el runtime Node (sentry.server.config.ts). */
export function buildServerOptions(config: BaseConfig): NodeOptions {
  return shared(config);
}

/** Opciones para el runtime Edge / middleware (sentry.edge.config.ts). */
export function buildEdgeOptions(config: BaseConfig): NodeOptions {
  return shared(config);
}
