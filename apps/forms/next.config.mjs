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
   * CSP: entra en modo SOLO-REPORTE (`Content-Security-Policy-Report-Only`): el
   * navegador avisa en la consola de lo que bloquearía, pero NO bloquea nada.
   * Esta app maneja kioscos y formularios en uso con pacientes; activarla de
   * golpe y descubrir en producción que se llevó puesta la foto del ID o el
   * service worker sería peor que no tenerla. Se pasa a `Content-Security-Policy`
   * cuando un tiempo de uso real no haya dejado avisos.
   *
   * Es una CSP pragmática, no la estricta: Next.js inyecta scripts en línea y
   * una política sin 'unsafe-inline' exige nonces por request. Lo que SÍ da
   * ya: nada de scripts, estilos ni conexiones a dominios que no sean los de la
   * lista, ningún iframe ajeno, formularios solo hacia este sitio, ni etiquetas
   * base u object inyectadas.
   */
  async headers() {
    const dev = process.env.NODE_ENV === 'development';
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      // blob: para la vista previa de la foto del ID antes de subirla; supabase para las ya subidas.
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io${dev ? ' ws: wss:' : ''}`,
      "media-src 'self' blob:",
      // el service worker (serwist) y sus workers
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    const seguras = [
      { key: 'Content-Security-Policy-Report-Only', value: csp },
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
