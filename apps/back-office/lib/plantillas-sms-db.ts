/**
 * El puente entre el catálogo de plantillas y la base.
 *
 * Vive aparte de `plantillas-sms.ts` a propósito: ese archivo es PURO —no
 * importa Prisma— y por eso se puede correr en una prueba sin base. Acá vive lo
 * único que necesita la base: buscar si alguien editó el texto.
 */

import { db } from '@precision-medical/database';
import {
  armarSms, DEFAULTS, CLAVES_PLANTILLA,
  type ClavePlantilla, type LangPlantilla,
} from '@/lib/plantillas-sms';

/**
 * El SMS listo para mandar, con el texto editado si existe.
 *
 * NO lanza si la base falla: un aviso que explota no puede tumbar lo que lo
 * disparó —agendar una cita, por ejemplo—, así que un error de lectura cae al
 * texto original, que es exactamente lo que se mandaba antes de que esto
 * existiera. Peor caso: sale el mensaje viejo. Que es un mensaje correcto.
 */
export async function armarSmsDeLaBase(args: {
  clave: ClavePlantilla;
  lang: LangPlantilla;
  valores: Record<string, string | null | undefined>;
}): Promise<string> {
  let editada: string | null = null;
  try {
    const fila = await db.smsTemplate.findUnique({
      where: { key_lang: { key: args.clave, lang: args.lang } },
      select: { body: true },
    });
    editada = fila?.body ?? null;
  } catch (err) {
    console.error('[plantillas] no se pudo leer la plantilla %s/%s: %s',
      args.clave, args.lang, err instanceof Error ? err.message : String(err));
  }
  return armarSms({ clave: args.clave, lang: args.lang, editada, valores: args.valores });
}

/** Lo que hay editado, por clave e idioma. Para el editor y para la vista previa. */
export async function cargarPlantillas(): Promise<
  Record<string, { body: string; updatedAt: string; updatedByUserId: string | null }>
> {
  const filas = await db.smsTemplate.findMany({
    select: { key: true, lang: true, body: true, updatedAt: true, updatedByUserId: true },
  });
  const salida: Record<string, { body: string; updatedAt: string; updatedByUserId: string | null }> = {};
  for (const f of filas) {
    // Solo las claves que el catálogo conoce: una fila de una clave que se
    // eliminó del código no tiene que aparecer en la pantalla.
    if (!(CLAVES_PLANTILLA as readonly string[]).includes(f.key)) continue;
    salida[`${f.key}:${f.lang}`] = {
      body: f.body,
      updatedAt: f.updatedAt.toISOString(),
      updatedByUserId: f.updatedByUserId,
    };
  }
  return salida;
}

/** El texto que hay que mostrar en el editor: el editado, o el original. */
export function textoVigente(
  editadas: Record<string, { body: string }>,
  clave: ClavePlantilla,
  lang: LangPlantilla,
): { texto: string; esOriginal: boolean } {
  const fila = editadas[`${clave}:${lang}`];
  return fila
    ? { texto: fila.body, esOriginal: false }
    : { texto: DEFAULTS[clave][lang], esOriginal: true };
}
