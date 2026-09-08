/**
 * Pedidos de bufete · los ESCRITORIOS de la clínica.
 *
 * Erick, 2026-09-07: "algo como Vigía para los correos, sin modelo". Cuando el
 * bufete aprieta "Pedirle esto a la clínica" no elige una persona ni escribe a
 * ciegas: elige un TEMA con botones, el tema cae en un escritorio, y el
 * servidor decide a quién le llega según quién atiende ese escritorio hoy.
 *
 * Este archivo es PURO —sin base, sin React— para que lo importen las dos
 * puntas: el diálogo del portal (para pintar los botones) y la ruta del pedido
 * (para validar lo que llega). Quién atiende cada escritorio vive en
 * `escritorios-server.ts`, que sí toca la base.
 *
 * Los tres escritorios y sus temas son los que dictó Erick:
 *   CLINICAL — lo médico, preguntas a los providers, plan de tratamiento.
 *   INTAKE   — admisión antes de la primera visita, PIP, datos del case
 *              manager y del abogado.
 *   BILLING  — ledger, firma del lien, saldo de liquidación, copia de notas del
 *              provider y HCFA.
 *
 * Los textos NO están acá: son claves de i18n (`phoenix.attorney.desk_*`,
 * `topic_*`), porque el portal legal se ve en inglés y en español.
 */

import type { MotivoAtencion } from '@/lib/vigia/queue';

/**
 * Los escritorios que el abogado ELIGE en el diálogo de pedidos. `REFERRALS`
 * queda afuera a propósito: un referido no es un tema, es otro botón ("¿Tenés
 * un referido?") con su propio formulario, y el sistema lo dirige solo.
 */
export const ESCRITORIOS_DE_PEDIDO = ['CLINICAL', 'INTAKE', 'BILLING'] as const;
export type EscritorioDePedido = (typeof ESCRITORIOS_DE_PEDIDO)[number];

/** Todos los escritorios: los tres de pedidos más el de referidos. Es lo que
 *  administra Configuración y lo que filtra la vista del admin. */
export const ESCRITORIOS = [...ESCRITORIOS_DE_PEDIDO, 'REFERRALS'] as const;
export type Escritorio = (typeof ESCRITORIOS)[number];

/**
 * Escritorio de RESPALDO: cuando el abogado no sabe dónde cae su pregunta
 * ("otro"), o cuando el escritorio elegido no tiene a nadie asignado. Admisión
 * es quien conoce el caso de punta a punta, así que lo que no tiene dueño
 * claro lo recibe ella y lo reparte.
 */
export const ESCRITORIO_RESPALDO: Escritorio = 'INTAKE';

/**
 * Sub-temas por escritorio. La clave viaja al servidor y se guarda en
 * `MessageThread.topic`; el texto (título del chip, asunto y cuerpo sugeridos)
 * sale de i18n con esa misma clave. El último de cada lista es el "otro" del
 * escritorio, para que ningún pedido quede sin poder salir.
 */
export const TEMAS: Record<EscritorioDePedido, readonly string[]> = {
  CLINICAL: ['treatment_plan', 'provider_question', 'treatment_status', 'other_clinical'],
  INTAKE:   ['intake_status', 'pip_info', 'case_manager_info', 'attorney_info', 'other_intake'],
  BILLING:  ['ledger', 'lien_signature', 'settlement_balance', 'records_and_bills', 'other_billing'],
};

export function esEscritorio(v: unknown): v is Escritorio {
  return typeof v === 'string' && (ESCRITORIOS as readonly string[]).includes(v);
}

export function esTemaDe(desk: EscritorioDePedido, topic: unknown): topic is string {
  return typeof topic === 'string' && TEMAS[desk].includes(topic);
}

/**
 * Cuando el pedido nace de la cola de Vigía ya sabemos de qué se trata: el
 * motivo de la fila decide el escritorio y el sub-tema, y el abogado solo
 * confirma. Un tratamiento parado es cosa del escritorio clínico; un caso sin
 * ninguna cita todavía está en admisión; un lien sin firma es facturación.
 */
export function escritorioDelMotivo(motivo: MotivoAtencion): { desk: EscritorioDePedido; topic: string } {
  switch (motivo) {
    case 'TRATAMIENTO_SIN_MOVIMIENTO': return { desk: 'CLINICAL', topic: 'treatment_status' };
    case 'SIN_NINGUNA_CITA':           return { desk: 'INTAKE',   topic: 'intake_status' };
    case 'LIEN_SIN_FIRMA_CASO_CERRADO': return { desk: 'BILLING', topic: 'lien_signature' };
  }
}
