import type { AccionAgente, DefinicionAgente } from '@precision-medical/agente';
import { hoyEnClinica } from '@precision-medical/agente';
import { ZONA_CLINICA } from './phoenix';
import { HERRAMIENTAS_ADMIN } from './herramientas';
import type { AlcanceAdmin } from './alcance';

/**
 * CIFO en el Admin — la definición del agente.
 *
 * Acá hay cuatro cosas y ninguna más: el modelo, el prompt, el registro de
 * herramientas y los botones. El lazo, el streaming y el proveedor viven en
 * `packages/agente` y los comparte con la clínica.
 *
 * ── El modelo NO sale de una variable de entorno, a propósito ───────────────
 *
 * El Admin tenía `CIFO_MODEL=poolside/laguna-m.1:free` — un modelo que ya no
 * existe en el catálogo (verificado el 2026-09-12 contra los 445 disponibles).
 * Su agente viejo llevaba meses fallando en cada pregunta y nadie se enteró.
 *
 * Si este leyera esa variable, heredaría el mismo valor muerto y fallaría con la
 * clave nueva bien puesta — un día entero buscando el error en el lugar
 * equivocado. Así que el modelo es una constante, igual que en la clínica, y hay
 * un lugar menos donde equivocarse.
 */
export const MODELO_CIFO_ADMIN = 'gpt-5.4-mini';

/**
 * ── Por qué el alcance se INVIERTE otra vez ─────────────────────────────────
 *
 * Tercer agente, tercer alcance, y los tres distintos a propósito:
 *
 *   · Vigía (bufete)   → un bufete, sus casos, con nombres de sus clientes
 *   · CIFO clínica     → toda la clínica, SIN un solo nombre de paciente
 *   · CIFO Admin       → la EMPRESA: plata, cajas, sueldos, freelancers
 *
 * El del Admin no toca datos de pacientes: de la clínica solo trae CANTIDADES
 * —cuántas visitas, cuánto se cobró— y nunca una fila con nombre. Los únicos
 * nombres que maneja son de empleados y freelancers, que son la nómina de la
 * empresa y el dato accionable de su alcance.
 */
function systemPrompt(alcance: AlcanceAdmin, locale: string): string {
  const es = locale === 'es';
  const quien = alcance.nombre ? ` Hablás con ${alcance.nombre}.` : '';

  return es
    ? [
        `Sos CIFO, el asistente de administración de Precision Medical.${quien}`,
        `Hoy es ${hoyEnClinica(ZONA_CLINICA)}.`,
        '',
        'Tu alcance es la EMPRESA: la plata, las cajas, los sueldos, los freelancers y',
        'el volumen de trabajo de las clínicas. NO manejás historias clínicas ni datos',
        'de pacientes; de la clínica solo ves cantidades, nunca nombres de pacientes.',
        '',
        'Cómo contestar:',
        '- Usá las herramientas. No inventes ni estimes un número que podés pedir.',
        '- Sé breve y concreto. Dos o tres frases salvo que te pidan el detalle.',
        '- Los montos con su moneda, siempre. Hay cajas en dólares y en bolivianos.',
        '- Si una herramienta devuelve cero, decilo como lo que es. Cero cajas bajo el',
        '  mínimo es una buena noticia, no una falta de datos.',
        '- Si te preguntan algo fuera de tu alcance —una historia clínica, un paciente—',
        '  decí que eso no lo ves y que lo tiene el back-office de la clínica.',
        '',
        'Ojo con dos cosas que se malinterpretan fácil:',
        '- Sábado y domingo la clínica no abre. Si la herramienta de visitas te devuelve',
        '  `esHoy: false`, el número es del PRÓXIMO LUNES y tenés que decirlo así.',
        '- Una caja nunca usada está en cero y NO es un problema. La herramienta ya las',
        '  descarta; no las cuentes como cajas vacías.',
      ].join('\n')
    : [
        `You are CIFO, the administration assistant at Precision Medical.${quien}`,
        `Today is ${hoyEnClinica(ZONA_CLINICA)}.`,
        '',
        'Your scope is the BUSINESS: money, cash boxes, payroll, freelancers and the',
        'clinics\' workload. You do not handle medical records or patient data; from the',
        'clinic you only see counts, never patient names.',
        '',
        'How to answer:',
        '- Use the tools. Never invent or estimate a number you can look up.',
        '- Be short and concrete. Two or three sentences unless asked for detail.',
        '- Always include the currency. There are boxes in dollars and in bolivianos.',
        '- If a tool returns zero, say so plainly. Zero cash boxes below minimum is good',
        '  news, not missing data.',
        '- If asked something outside your scope — a medical record, a patient — say you',
        '  do not see that and that it lives in the clinic back-office.',
        '',
        'Two things that are easy to misread:',
        '- The clinic is closed on weekends. If the visits tool returns `esHoy: false`,',
        '  the number is for NEXT MONDAY and you must say so.',
        '- A cash box that was never used sits at zero and is NOT a problem. The tool',
        '  already excludes them; do not report them as empty boxes.',
      ].join('\n');
}

/**
 * Los botones que aparecen debajo de la respuesta.
 *
 * Salen de QUÉ herramientas usó el agente, no de adivinar la intención: si miró
 * las cajas, el botón lleva a Finanzas. Es el mismo criterio que en la clínica, y
 * la razón de que no haya un botón por defecto — un botón que no corresponde a lo
 * que acabás de leer gasta un clic y la confianza.
 */
async function armarAcciones(
  _alcance: AlcanceAdmin,
  toolsUsadas: Set<string>,
): Promise<AccionAgente[]> {
  const acciones: AccionAgente[] = [];
  const push = (key: string, href: string) => acciones.push({ key, params: {}, href });

  if (toolsUsadas.has('cajas_bajo_el_minimo')) push('verCajas', '/dashboard/finanzas');
  if (toolsUsadas.has('pagos_a_empleados')) push('verPagos', '/dashboard/petty-cash');
  if (toolsUsadas.has('pagos_a_freelancers')) push('verFreelancers', '/dashboard/freelancers');
  if (toolsUsadas.has('saldo_de_billeteras')) push('verBilleteras', '/dashboard/wallets');

  // Máximo dos: tres botones en una respuesta de dos frases es ruido.
  return acciones.slice(0, 2);
}

export const CIFO_ADMIN: DefinicionAgente<AlcanceAdmin> = {
  nombre: 'CIFO',
  modelo: MODELO_CIFO_ADMIN,
  herramientas: HERRAMIENTAS_ADMIN,
  systemPrompt,
  armarAcciones,
};
