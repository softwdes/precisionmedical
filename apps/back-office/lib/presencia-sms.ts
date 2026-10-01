/**
 * Ventana de presencia en una conversación de SMS — compartida cliente/servidor.
 *
 * Vive en su propio archivo y sin importar Prisma, por la misma razón que
 * `lib/twilio-presence.ts`: lo necesita el hook del navegador, y arrastrar el
 * cliente de base al bundle del cliente mete cosas donde no van.
 */

/** Cada cuánto avisa el navegador que esa persona sigue mirando. */
export const PRESENCIA_SMS_HEARTBEAT_MS = 20_000;

/**
 * Cuánto vale una fila antes de considerarse muerta.
 *
 * ⚠️ Es CORTO a propósito, al revés que el de las llamadas (150 s).
 *
 * Allá un latido perdido sacaría a alguien del grupo de timbrado, así que
 * conviene ser tolerante: una fila un poco vieja es mejor que dejar al paciente
 * sonando contra nadie.
 *
 * Acá es al revés. Una fila vieja dice "Pamela está viendo esto" cuando Pamela
 * cerró la pestaña hace dos minutos, y la otra persona espera contra nadie o —
 * peor— no contesta creyendo que ya hay alguien. **El aviso falso es peor que
 * la ausencia de aviso**, así que se prefiere perder presencia real antes que
 * mostrar presencia inventada.
 *
 * 2.25× el latido: tolera uno perdido por una request lenta y nada más.
 */
export const PRESENCIA_SMS_TTL_MS = 45_000;

/** El instante desde el cual una fila todavía cuenta como viva. */
export function vivaDesde(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - PRESENCIA_SMS_TTL_MS);
}

/**
 * La clave de conversación, idéntica a la de `lib/conversaciones-sms.ts`.
 *
 * Se repite acá en lugar de importarla porque ese módulo trae Prisma y éste
 * tiene que poder correr en el navegador. Son cuatro líneas; importar la base
 * entera al bundle del cliente para ahorrárselas sería un mal negocio.
 *
 * ⚠️ Si cambia una, cambia la otra: dos claves distintas significan dos
 * personas mirando "la misma" conversación sin verse.
 */
export function claveDeConversacion(args: {
  patientId?: string | null;
  numero?: string | null;
}): string | null {
  if (args.patientId) return `pac:${args.patientId}`;
  const digitos = (args.numero ?? '').replace(/[^0-9]/g, '').slice(-10);
  return digitos.length === 10 ? `tel:${digitos}` : null;
}
