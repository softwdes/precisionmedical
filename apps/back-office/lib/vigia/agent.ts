import OpenAI from 'openai';
import { db } from '@precision-medical/database';
import type { SessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';
import { ZONA_CLINICA } from '@/lib/fechas';
import { VIGIA_TOOLS, ejecutarHerramienta } from './tools';

/**
 * Vigía · el lazo del agente.
 *
 * Este es el ÚNICO archivo que sabe qué proveedor de modelo usamos. Todo lo
 * demás —las herramientas, el alcance, la pantalla, los botones— es agnóstico:
 * cambiar de proveedor es reescribir esto y nada más.
 *
 * Tres decisiones que valen la pena explicar:
 *
 * · **Sin streaming, por ahora.** Las respuestas son de dos o tres frases y
 *   tardan unos segundos; el streaming agrega un protocolo entero para ganar
 *   poco. Cuando haya respuestas largas se agrega, y solo acá.
 *
 * · **Los botones NO los elige el modelo.** Se derivan de qué herramientas
 *   corrieron. Un modelo inventando URLs es un modelo mandando gente a páginas
 *   que no existen — o peor, a un caso ajeno.
 *
 * · **El código de caso viaja; el id no.** Las herramientas hablan en códigos
 *   (`2026-0142`). El id interno se resuelve DESPUÉS del lazo, de este lado,
 *   solo para armar el link. El modelo nunca lo ve ni lo necesita.
 */

/** Tope de vueltas. Sin esto, un modelo confundido puede pedir herramientas para siempre. */
const MAX_VUELTAS = 6;

export const VIGIA_MODEL = process.env.VIGIA_MODEL ?? 'gpt-5.4-mini';

export interface VigiaStep {
  tool: string;
  sources: string[];
  count?: number;
}

/**
 * El botón viaja como CLAVE, no como texto.
 *
 * Si el servidor mandara "Abrir el caso MVA-3230" ya escrito, el botón queda en
 * español para siempre — que es justo el bug que se vio con el portal en inglés.
 * La pantalla traduce con su propio idioma; acá solo se decide CUÁL botón va.
 */
export interface VigiaAction {
  key: 'openCase' | 'pendingLiens' | 'caseList' | 'stalledList';
  /** Valores para la traducción, por ejemplo el código del caso. */
  params?: Record<string, string>;
  /** Solo el botón de UN caso navega (abre el expediente en la misma pantalla). */
  href?: string;
  /**
   * Los botones de LISTA no navegan: abren un modal encima de Vigía.
   *
   * Mandar al abogado a `/attorney/cases` le hacía perder la respuesta que
   * acababa de pedir. Ningún botón de Vigía saca de la pantalla.
   */
  kind?: 'stalled' | 'unsigned' | 'active';
}

export interface VigiaAnswer {
  answer: string;
  steps: VigiaStep[];
  sources: string[];
  actions: VigiaAction[];
  usage: { prompt: number; completion: number; total: number };
  model: string;
}

/** Hoy, en la zona de la clínica — el modelo lo necesita para "esta semana". */
function hoyEnClinica(): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA_CLINICA, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date());
}

function systemPrompt(lawyer: SessionLawyer, locale: string): string {
  /**
   * El idioma sale de la SESIÓN, no de la pregunta.
   *
   * El portal está en inglés para la mitad de los bufetes; que el tablero diga
   * "Pending signatures" y el agente conteste en español es la clase de detalle
   * que hace que el producto parezca dos productos pegados. Y no puede salir de
   * la pregunta: alguien escribe una palabra en inglés y le cambia el idioma a
   * toda la pantalla.
   */
  const idioma = locale === 'es'
    ? '- Respondé SIEMPRE en español rioplatense, sin usted, aunque te pregunten en inglés.'
    : '- Answer ALWAYS in English, even if the question is in Spanish. Keep it plain and professional.';

  return [
    'Sos Vigía, el asistente del portal legal de Precision Medical, una clínica de lesiones personales en Utah.',
    `Le respondés a ${lawyer.firstName ?? 'un miembro'} del bufete ${lawyer.firmName ?? 'asociado'}.`,
    `Hoy es ${hoyEnClinica()}.`,
    '',
    'CÓMO RESPONDÉS:',
    idioma,
    '- Dos a cuatro frases. Sin listas salvo que te pidan un detalle largo.',
    '- TEXTO PLANO. Nada de markdown: sin **negritas**, sin viñetas, sin títulos. La pantalla no los interpreta y se ven los asteriscos.',
    '- Cuando una herramienta devuelva un total y una lista recortada, el número que decís es el TOTAL. Podés nombrar algunos ejemplos, aclarando que son algunos.',
    '- Con el número concreto adelante, y después el matiz que importa.',
    '- Como un paralegal con criterio: no repitas la tabla, decí qué significa y qué conviene mirar.',
    '',
    'REGLAS QUE NO SE ROMPEN:',
    '- Solo usás cifras que devolvieron las herramientas. Si no llamaste a una herramienta, no tenés el dato: decilo.',
    '- Nunca inventes ni estimes un número, una fecha ni un código de caso.',
    '- Te referís a los casos por su CÓDIGO (por ejemplo MVA-2435). Si te nombran a una PERSONA, usá buscar_paciente: es la única herramienta que trabaja con nombres.',
    '- Cuando la búsqueda por nombre traiga varios pacientes, nombralos con su caso al lado para que se distingan. Si trae uno solo, hablá de su caso directamente.',
    '- Si la pregunta trae una palabra que parece nombre propio y no es un código de caso, es una PERSONA: llamá a buscar_paciente antes que a cualquier otra herramienta.',
    '  Ejemplo: "¿Qué casos tiene Peterson?" → buscar_paciente con nombre "Peterson". NUNCA buscar_casos: esa no filtra por nombre y te va a devolver el despacho entero.',
    '- Si una herramienta devuelve FUERA_DE_ALCANCE, explicá que ese caso no está en el alcance de esta sesión y no intentes rodearlo.',
    `- Tu alcance es SOLO ${lawyer.firmName ?? 'el bufete de la sesión'}. Si preguntan por otro bufete, por otro abogado, por la clínica entera o por cualquier cosa fuera de este despacho: no llames ninguna herramienta y respondé únicamente que tu alcance es ${lawyer.firmName ?? 'este bufete'}.`,
    '- En ese caso NO des ningún número. Un número tuyo al lado de esa pregunta se lee como la respuesta, aunque le pongas una aclaración después. Ofrecé, si querés, mirar lo mismo dentro del despacho.',
    '- No prometas acciones: la pantalla agrega los botones sola.',
    '',
    'Si la pregunta no se puede responder con las herramientas que tenés, decí qué falta en una frase.',
  ].join('\n');
}

/** Las herramientas, en el formato que espera la API. */
const TOOL_SPECS = VIGIA_TOOLS.map((t) => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

/** Los dos textos que escribe el servidor, no el modelo — también en su idioma. */
function sinRespuesta(locale: string): string {
  return locale === 'es'
    ? 'No pude armar una respuesta con lo que tengo.'
    : 'I could not put together an answer with what I have.';
}

function seQuedoSinVueltas(locale: string): string {
  return locale === 'es'
    ? 'Me quedé dando vueltas sin llegar a una respuesta. Probá con una pregunta más concreta.'
    : 'I went in circles without reaching an answer. Try a more specific question.';
}

/**
 * Los botones, derivados de lo que se consultó.
 *
 * `casos` son los códigos que el modelo pidió por herramienta: se resuelven a id
 * para abrir el caso en su modal, igual que hace la lista.
 */
async function armarAcciones(
  lawyer: SessionLawyer,
  toolsUsadas: Set<string>,
  casosTocados: Set<string>,
): Promise<VigiaAction[]> {
  const acciones: VigiaAction[] = [];

  // Un caso concreto gana: es el botón más útil de todos.
  if (casosTocados.size > 0) {
    const codes = [...casosTocados].slice(0, 3);
    const rows = await db.case.findMany({
      where: { AND: [lawyerCaseFilter(lawyer), { caseCode: { in: codes } }] },
      select: { id: true, caseCode: true },
    });
    for (const r of rows) {
      const tab = toolsUsadas.has('facturacion_de_caso') ? 'finanzas' : 'caso';
      acciones.push({ key: 'openCase', params: { caso: r.caseCode }, href: `/attorney/vigia?case=${r.id}&tab=${tab}` });
    }
  }

  if (toolsUsadas.has('liens_pendientes')) {
    acciones.push({ key: 'pendingLiens', kind: 'unsigned' });
  }
  if (toolsUsadas.has('casos_frenados')) {
    acciones.push({ key: 'stalledList', kind: 'stalled' });
  }
  if (toolsUsadas.has('buscar_casos') || toolsUsadas.has('metricas_del_bufete')) {
    // El panorama termina en la lista de casos abiertos, no en el tablero: es
    // donde se puede hacer algo.
    acciones.push({ key: 'caseList', kind: 'active' });
  }

  return acciones.slice(0, 3);
}

export async function preguntarAVigia(
  lawyer: SessionLawyer,
  pregunta: string,
  locale: string,
): Promise<VigiaAnswer> {
  const client = new OpenAI();

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt(lawyer, locale) },
    { role: 'user', content: pregunta },
  ];

  const steps: VigiaStep[] = [];
  const sources = new Set<string>();
  const toolsUsadas = new Set<string>();
  const casosTocados = new Set<string>();
  let prompt = 0, completion = 0;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await client.chat.completions.create({
      model: VIGIA_MODEL,
      messages,
      tools: TOOL_SPECS,
    });

    prompt += res.usage?.prompt_tokens ?? 0;
    completion += res.usage?.completion_tokens ?? 0;

    const msg = res.choices[0]?.message;
    if (!msg) break;

    // Sin herramientas pedidas: esto ya es la respuesta.
    if (!msg.tool_calls?.length) {
      const actions = await armarAcciones(lawyer, toolsUsadas, casosTocados);
      return {
        answer: msg.content?.trim() || sinRespuesta(locale),
        steps,
        sources: [...sources],
        actions,
        usage: { prompt, completion, total: prompt + completion },
        model: VIGIA_MODEL,
      };
    }

    messages.push(msg);

    for (const call of msg.tool_calls) {
      // El SDK admite otros tipos de llamada; solo ejecutamos funciones.
      if (call.type !== 'function') continue;

      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // Argumentos rotos: se le devuelve el error al modelo en vez de tirar la
        // request. Suele corregirse solo en la vuelta siguiente.
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'ARGUMENTOS_INVALIDOS' }) });
        continue;
      }

      const result = await ejecutarHerramienta(lawyer, call.function.name, args);

      toolsUsadas.add(call.function.name);
      result.sources.forEach((s) => sources.add(s));
      steps.push({ tool: call.function.name, sources: result.sources, count: result.count });
      if (typeof args.caso === 'string') casosTocados.add(args.caso.trim());

      /**
       * La búsqueda por nombre no recibe un caso, lo ENCUENTRA. Si dio con uno
       * solo, ese es el botón: se busca a una persona para entrar a su caso, no
       * para leer un código. Con varios no se elige por el abogado.
       */
      const encontrados = (result.data as { casos?: Array<{ caso?: string }> } | null)?.casos;
      if (call.function.name === 'buscar_paciente' && encontrados?.length === 1 && encontrados[0]?.caso) {
        casosTocados.add(encontrados[0].caso);
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result.data),
      });
    }
  }

  // Se acabaron las vueltas sin una respuesta final.
  return {
    answer: seQuedoSinVueltas(locale),
    steps,
    sources: [...sources],
    actions: await armarAcciones(lawyer, toolsUsadas, casosTocados),
    usage: { prompt, completion, total: prompt + completion },
    model: VIGIA_MODEL,
  };
}
