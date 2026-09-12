import { hoyEnClinica as hoyEn } from '@precision-medical/agente';
import { ZONA_CLINICA } from '@/lib/fechas';

/**
 * El motor de agentes — ahora vive en `packages/agente`.
 *
 * Este archivo quedó como ENVOLTORIO a propósito. El motor se mudó al paquete
 * compartido cuando el Admin pasó a ser el tercer consumidor (2026-09-12), y
 * dejar acá los mismos nombres significa que **nada de lo que ya está en
 * producción cambió de import**: `lib/vigia/agent.ts`, `lib/cifo/agent.ts` y
 * las dos rutas siguen escribiendo `@/lib/agente/lazo` como el primer día.
 *
 * Es la diferencia entre una mudanza y un refactor: el paquete es la única
 * copia del código, pero el radio de explosión del cambio es este archivo.
 */
export { preguntar, preguntarUnaVez } from '@precision-medical/agente';
export type {
  AccionAgente, DefinicionAgente, EventoAgente, PasoAgente, RespuestaAgente,
} from '@precision-medical/agente';

/**
 * Hoy, en la zona de la clínica.
 *
 * En el paquete la zona entra por parámetro —no puede importar el `lib/fechas`
 * de una app sin atarse a ella— y acá se le pone la de esta. Los prompts de
 * Vigía y CIFO la siguen llamando sin argumentos, igual que antes.
 */
export function hoyEnClinica(): string {
  return hoyEn(ZONA_CLINICA);
}
