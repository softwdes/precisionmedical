'use client';

import { useTranslations } from 'next-intl';

/**
 * Traduce en el CLIENTE el error que devuelve una ruta del módulo Externos.
 *
 * El servidor no escribe copy: manda un CÓDIGO (`error`) y, cuando hace falta,
 * los datos para armar la frase (`params`). Antes mandaba la oración ya escrita
 * en español y el cliente la pintaba tal cual, así que la mitad de los errores
 * del módulo salían en español dentro de la app en inglés.
 *
 * `detail` es distinto: es el texto que devuelve Supabase (o quien sea aguas
 * arriba) y NO es nuestro. No se traduce — se muestra entre paréntesis detrás
 * del mensaje nuestro, porque tirarlo deja al soporte sin nada que mirar.
 */
export interface ServerErrorBody {
  error?: string | null;
  params?: Record<string, string | number> | null;
  detail?: string | null;
}

/** Los códigos que sabemos redactar. Uno que no esté acá cae al genérico. */
const KNOWN = new Set([
  'NO_EMAIL',
  'NOT_ACTIVE',
  'EMAIL_IN_USE',
  'AUTH_CREATE_FAILED',
  'USER_INSERT_FAILED',
  'NO_ACCESS',
  'NOT_A_LAWYER_ACCOUNT',
  'BAN_FAILED',
  'DUPLICATE_EMAIL',
  'CANNOT_DELETE_SELF',
  'FORBIDDEN',
  'NOT_FOUND',
  'FIRM_NOT_FOUND',
  'MISSING_ID',
  'INVALID_PAYLOAD',
]);

export function useServerError(): (body: ServerErrorBody | null | undefined, fallback?: string) => string {
  const t = useTranslations('phoenix.lawyers');

  return (body, fallback) => {
    const code = body?.error ?? null;
    const base = code && KNOWN.has(code)
      ? t(`srv${code}`, (body?.params ?? {}) as Record<string, string | number>)
      : (fallback ?? t('srvUnknown'));

    // El texto de aguas arriba se conserva, pero detrás y entre paréntesis: es
    // un dato para soporte, no la explicación que lee quien está usando la app.
    return body?.detail ? t('srvWithDetail', { message: base, detail: body.detail }) : base;
  };
}
