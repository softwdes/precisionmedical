import { db } from '@precision-medical/database';
import type { SessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';
import { hoyEnClinica, preguntar, preguntarUnaVez } from '@/lib/agente/lazo';
import type {
  AccionAgente, DefinicionAgente, EventoAgente, PasoAgente, PasoCrudo, RespuestaAgente,
} from '@/lib/agente/tipos';
import { VIGIA_TOOLS } from './tools';

/**
 * Vigía · el agente del portal legal.
 *
 * El lazo ya NO vive acá: se mudó a `lib/agente/lazo.ts` el 2026-09-08, cuando
 * Erick decidió que la clínica tenga su propio agente (CIFO). Lo que queda
 * en este archivo es lo único que distingue a Vigía de cualquier otro agente, y
 * son cuatro cosas:
 *
 *   1. su alcance — `SessionLawyer`, el bufete de la sesión;
 *   2. su prompt;
 *   3. su registro de herramientas (`./tools`);
 *   4. sus botones.
 *
 * Nada de este archivo sabe del proveedor del modelo ni del streaming. Y los
 * nombres exportados son los de antes (`preguntarAVigiaStream`, `VigiaAnswer`…)
 * para que ni la ruta ni la pantalla noten la mudanza.
 */

export const VIGIA_MODEL = process.env.VIGIA_MODEL ?? 'gpt-5.4-mini';

/** Los cuatro botones de Vigía. El motor los trata como strings; el union vive acá. */
export type VigiaActionKey = 'openCase' | 'pendingLiens' | 'caseList' | 'stalledList';

/**
 * Los tipos que ya consumían la ruta y el componente, ahora con la forma del
 * motor. Se re-exportan con el nombre viejo a propósito: renombrarlos habría
 * tocado la pantalla sin cambiarle nada.
 */
export type VigiaStep = PasoAgente;
export type VigiaAction = AccionAgente;
export type VigiaEvent = EventoAgente;
export type VigiaAnswer = RespuestaAgente;

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
    '- Si para responder necesitás VARIAS herramientas, pedilas TODAS JUNTAS en la misma respuesta. Pedir una, esperar, y después pedir la otra duplica lo que tarda: cada vuelta es un viaje entero. Solo encadená cuando el argumento de la segunda dependa del resultado de la primera.',
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

/**
 * Los botones, derivados de lo que se consultó.
 *
 * `codigos` son los códigos de caso que salieron de los pasos: se resuelven a id
 * DENTRO DEL ALCANCE para abrir el caso en su modal, igual que hace la lista. Si
 * el modelo inventara un código ajeno, el `findMany` no lo encuentra y el botón
 * no aparece.
 */
async function armarAcciones(
  lawyer: SessionLawyer,
  toolsUsadas: Set<string>,
  codigos: Set<string>,
): Promise<VigiaAction[]> {
  const acciones: VigiaAction[] = [];

  // Un caso concreto gana: es el botón más útil de todos.
  if (codigos.size > 0) {
    const codes = [...codigos].slice(0, 3);
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

/**
 * De qué códigos habló cada paso.
 *
 * Además del argumento `caso` —que es lo que hace el motor por defecto— Vigía
 * necesita una regla propia: **`buscar_paciente` no RECIBE un caso, lo
 * ENCUENTRA**. Si dio con uno solo, ese es el botón: se busca a una persona para
 * entrar a su caso, no para leer un código. Con varios no se elige por el
 * abogado.
 */
function codigosTocados({ name, args, data }: PasoCrudo): string[] {
  const codigos: string[] = [];
  if (typeof args.caso === 'string') codigos.push(args.caso.trim());

  if (name === 'buscar_paciente') {
    const encontrados = (data as { casos?: Array<{ caso?: string }> } | null)?.casos;
    if (encontrados?.length === 1 && encontrados[0]?.caso) codigos.push(encontrados[0].caso);
  }

  return codigos;
}

/** Vigía, en la forma que el motor entiende. */
export const VIGIA: DefinicionAgente<SessionLawyer> = {
  nombre: 'Vigía',
  modelo: VIGIA_MODEL,
  herramientas: VIGIA_TOOLS,
  systemPrompt,
  armarAcciones,
  codigosTocados,
};

/** El lazo, en streaming. Misma firma que antes de la mudanza. */
export function preguntarAVigiaStream(
  lawyer: SessionLawyer,
  pregunta: string,
  locale: string,
): AsyncGenerator<VigiaEvent> {
  return preguntar(VIGIA, lawyer, pregunta, locale);
}

/** La versión de una sola respuesta. Misma firma que antes de la mudanza. */
export function preguntarAVigia(
  lawyer: SessionLawyer,
  pregunta: string,
  locale: string,
): Promise<VigiaAnswer> {
  return preguntarUnaVez(VIGIA, lawyer, pregunta, locale);
}
