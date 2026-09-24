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
  /**
   * Puente hacia las rutas que TODAVÍA redactan.
   *
   * La migración tiene dos mitades —la ruta deja de escribir, el cliente
   * empieza a traducir— y no caen el mismo día. Sin este campo, convertir un
   * cliente cuya ruta no se migró le borra el texto y deja el código crudo en
   * pantalla: el arreglo a medias sale peor que no haber empezado.
   *
   * Con esto, convertir un cliente es SIEMPRE seguro: si hay código conocido
   * gana la frase traducida, y si no, se muestra lo que mandó el servidor
   * —como antes—. La deuda no se esconde: `pnpm i18n:audit` sigue contando
   * cada `message:` que quede en las rutas.
   */
  message?: string | null;
}

/**
 * Los códigos que sabemos redactar. Uno que no esté acá cae al genérico — a
 * propósito: una lista blanca explícita hace que agregar un código sea un paso
 * consciente, y el cruce automático de `pnpm i18n:audit` la compara contra lo
 * que emiten las rutas.
 */
const KNOWN = new Set([
  // Acceso al portal legal
  'NO_EMAIL',
  'NOT_ACTIVE',
  'EMAIL_IN_USE',
  'AUTH_CREATE_FAILED',
  'USER_INSERT_FAILED',
  'NO_ACCESS',
  'NOT_A_LAWYER_ACCOUNT',
  'BAN_FAILED',
  'CANNOT_DELETE_SELF',
  'MEMBER_NOT_IN_FIRM',
  // Genéricos
  'FORBIDDEN',
  'NOT_FOUND',
  'FIRM_NOT_FOUND',
  'MISSING_ID',
  'INVALID_PAYLOAD',
  // Duplicados
  'DUPLICATE_EMAIL',
  'DUPLICATE_NAME',
  'DUPLICATE_IN_CARRIER',
  'DUPLICATE_CODE',
  'DUPLICATE_PATIENT',
  'EMAIL_TAKEN',
  // Agenda
  'DATE_IN_PAST',
  'INVALID_DATE',
  'WEEKEND_NOT_ALLOWED',
  'SLOT_CONFLICT',
  'HAS_CHARGES',
  'ALREADY_CANCELLED',
  'IMMUTABLE',
  // Caso y paciente
  'INVALID_STATUS',
  'INVALID_CASE_STATUS',
  'ALREADY_ARCHIVED',
  'GUARDIAN_REQUIRED',
  'GUARDIAN_EMAIL_IS_PATIENT_EMAIL',
  'NOT_INACTIVE',
  // Catálogos y archivos
  'CARRIER_NOT_FOUND',
  'FOLDER_NOT_EMPTY',
  'HAS_APPOINTMENTS',
  'TARGET_DELETED',
  'INVALID_CODE_PREFIX',
]);

export function useServerError(): (body: ServerErrorBody | null | undefined, fallback?: string) => string {
  // `phoenix.errores` y no `phoenix.lawyers`: el patrón se estrenó en Externos
  // pero lo usa cualquier pantalla que reciba un error de una ruta.
  const t = useTranslations('phoenix.errores');

  return (body, fallback) => {
    const code = body?.error ?? null;
    const base = code && KNOWN.has(code)
      // 1. Código conocido: la frase se arma en el idioma de quien mira.
      ? t(`srv${code}`, (body?.params ?? {}) as Record<string, string | number>)
      // 2. Ruta sin migrar: se muestra lo que mandó, como antes. Ver `message`.
      : (body?.message
        // 3. Ni código ni texto: lo que pida el llamador, o el genérico.
        ?? fallback ?? t('srvUnknown'));

    // El texto de aguas arriba se conserva, pero detrás y entre paréntesis: es
    // un dato para soporte, no la explicación que lee quien está usando la app.
    return body?.detail ? t('srvWithDetail', { message: base, detail: body.detail }) : base;
  };
}
