import { db } from '@precision-medical/database';
import { hoyEnClinica, preguntar, preguntarUnaVez } from '@/lib/agente/lazo';
import type {
  AccionAgente, DefinicionAgente, EventoAgente, PasoAgente, RespuestaAgente,
} from '@/lib/agente/tipos';
import { CIFO_TOOLS } from './tools';
import type { AlcanceClinica } from './alcance';

/**
 * CIFO · el agente de la clínica.
 *
 * Decisión de Erick, 2026-09-08: *"para los abogados sea Vigía y para nosotros
 * creamos el propio llamado CIFO"*. Son dos productos con dos nombres, y no
 * es cosmética — las herramientas, las preguntas y el riesgo de exponer datos
 * del paciente son distintos en cada lado. Llamarlos igual escondía justamente
 * la diferencia que hay que vigilar.
 *
 * Este archivo son las cuatro cosas que distinguen a CIFO de cualquier otro
 * agente: su alcance, su prompt, su registro de herramientas y sus botones. El
 * lazo, el streaming y el proveedor viven en `lib/agente/`, compartidos con
 * Vigía, para que un bug arreglado se arregle en los dos.
 *
 * Dónde vive: el panel de recepción. No es un menú nuevo a propósito — el
 * dashboard es el felpudo del sistema (lo cruzan 12 de 12 personas, ~6 min cada
 * una) y Vigía, que vive detrás de un menú de un portal que casi nadie abre,
 * lleva 27 preguntas en dos semanas y ni un abogado real.
 */

/**
 * La ENV sigue llamandose `SENTINEL_MODEL` a proposito: esta puesta en Vercel
 * con ese nombre y renombrarla alla es un paso aparte. Ojo tambien con que
 * `CIFO_MODEL` YA existe como env del CIFO del Admin (apps/web): si esto pasara
 * a leer esa clave y alguien la define a nivel equipo, la clinica cambiaria de
 * modelo sin que nadie lo pida.
 */
export const MODELO_CIFO = process.env.SENTINEL_MODEL ?? process.env.VIGIA_MODEL ?? 'gpt-5.4-mini';

/** Los botones de CIFO. El motor los trata como strings; el union vive acá. */
export type CifoActionKey =
  | 'workQueue'      // ir a la cola de intake del panel
  | 'openCase'       // abrir un caso concreto
  | 'notesBoard'     // la pantalla de supervisión de notas
  | 'firmRequests';  // los pedidos de bufetes

export type CifoStep = PasoAgente;
export type CifoAction = AccionAgente;
export type CifoEvent = EventoAgente;
export type CifoAnswer = RespuestaAgente;

function systemPrompt(alcance: AlcanceClinica, locale: string): string {
  const idioma = locale === 'es'
    ? '- Respondé SIEMPRE en español rioplatense, sin usted, aunque te pregunten en inglés.'
    : '- Answer ALWAYS in English, even if the question is in Spanish. Keep it plain and professional.';

  return [
    'Sos CIFO, el asistente del panel de recepción de Precision Medical, una clínica de lesiones personales en Utah.',
    `Le respondés a ${alcance.nombre ?? 'alguien del equipo'}, del staff de la clínica.`,
    `Hoy es ${hoyEnClinica()}.`,
    '',
    'CÓMO RESPONDÉS:',
    idioma,
    '- Dos a cuatro frases. Sin listas salvo que te pidan un detalle largo.',
    '- TEXTO PLANO. Nada de markdown: sin **negritas**, sin viñetas, sin títulos. La pantalla no los interpreta y se ven los asteriscos.',
    '- Con el número concreto adelante, y después el matiz que importa.',
    '- Cuando una herramienta devuelva un total y una lista recortada, el número que decís es el TOTAL.',
    '- Como una jefa de recepción con criterio: no repitas la tabla, decí qué significa y qué conviene hacer primero.',
    '',
    'REGLAS QUE NO SE ROMPEN:',
    '- Solo usás cifras que devolvieron las herramientas. Si no llamaste a una herramienta, no tenés el dato: decilo.',
    '- Si para responder necesitás VARIAS herramientas, pedilas TODAS JUNTAS en la misma respuesta. Cada vuelta es un viaje entero.',
    '- Nunca inventes ni estimes un número, una fecha ni un código de caso.',
    /**
     * Las dos reglas de nombres, y son la razón de ser de este agente.
     *
     * No alcanza con que las herramientas no devuelvan nombres: el modelo tiene
     * que saber que NO los tiene, para que no invente uno ni prometa buscarlo.
     * Y tiene que decir qué hacer en su lugar, porque la pregunta "¿qué tiene
     * María?" va a llegar igual.
     */
    '- NO TENÉS NOMBRES DE PACIENTES y no los vas a tener nunca. Todas tus herramientas hablan por CÓDIGO DE CASO (por ejemplo MVA-3419). Nunca inventes un nombre ni digas que vas a buscar a una persona.',
    '- Si te preguntan por un paciente por su nombre, decí en una frase que trabajás por código de caso y que para buscar a alguien por su nombre está el buscador de pacientes, arriba de la pantalla. No intentes adivinar de quién se trata.',
    '- Los nombres de PROVIDER sí los tenés, y solo para las notas pendientes. Usalos con naturalidad ahí y en ningún otro lado.',
    '',
    'QUÉ MIRA CADA HERRAMIENTA, para que no las confundas:',
    '- cola_de_intake mide el tiempo que FALTA para la cita: son los que van a llegar sin firmar.',
    '- atrasos_de_recepcion mide el tiempo TRANSCURRIDO desde un evento del caso: es deuda acumulada.',
    '- Las dos son "atención requerida" y no son la misma cosa. Si preguntan "¿qué hay pendiente?", mirá las dos.',
    '',
    'LO QUE NO HACÉS:',
    '- No mandás nada ni llamás a nadie. Solo leés. Las acciones las hace la persona con los botones de la pantalla.',
    '- No prometas acciones: la pantalla agrega los botones sola.',
    '',
    'Si la pregunta no se puede responder con las herramientas que tenés, decí qué falta en una frase.',
  ].join('\n');
}

/**
 * Los botones, derivados de QUÉ herramientas corrieron — nunca elegidos por el
 * modelo.
 *
 * El código de caso hay que resolverlo a ID acá, igual que en Vigía. La primera
 * versión no lo hacía —"un viaje menos a la base"— y el botón quedaba muerto: el
 * modal del panel abre por `?case=<id>`, no por código, así que sin la búsqueda
 * no hay nada que apretar. Una consulta por respuesta es el precio de que el
 * botón funcione.
 *
 * Y de paso es la misma red que en Vigía: si el modelo inventara un código, el
 * `findMany` no lo encuentra y el botón simplemente no aparece.
 */
async function armarAcciones(
  _alcance: AlcanceClinica,
  toolsUsadas: Set<string>,
  codigos: Set<string>,
): Promise<CifoAction[]> {
  const acciones: CifoAction[] = [];

  // Un caso concreto gana: es el botón más útil de todos.
  if (codigos.size > 0) {
    const rows = await db.case.findMany({
      where: { caseCode: { in: [...codigos].slice(0, 2) }, deletedAt: null },
      select: { id: true, caseCode: true },
    });
    for (const r of rows) {
      acciones.push({
        key: 'openCase',
        params: { caso: r.caseCode },
        // El caso abre EN el panel, sobre la respuesta que se acaba de pedir.
        href: `/dashboard?case=${r.id}`,
      });
    }
  }

  if (toolsUsadas.has('cola_de_intake') || toolsUsadas.has('pulso_del_dia')) {
    acciones.push({ key: 'workQueue', kind: 'intake' });
  }
  if (toolsUsadas.has('notas_sin_firmar')) {
    acciones.push({ key: 'notesBoard', href: '/doctor/notes' });
  }
  if (toolsUsadas.has('pedidos_de_bufetes')) {
    acciones.push({ key: 'firmRequests', href: '/messages' });
  }

  return acciones.slice(0, 3);
}

/** CIFO, en la forma que el motor entiende. */
export const CIFO: DefinicionAgente<AlcanceClinica> = {
  nombre: 'CIFO',
  modelo: MODELO_CIFO,
  herramientas: CIFO_TOOLS,
  systemPrompt,
  armarAcciones,
  // Sin `codigosTocados`: el default del motor (el argumento `caso`) alcanza,
  // porque ninguna herramienta de CIFO ENCUENTRA un caso — o lo recibe por
  // código, o devuelve una lista de códigos.
};

/** El lazo, en streaming. */
export function preguntarACifoStream(
  alcance: AlcanceClinica,
  pregunta: string,
  locale: string,
): AsyncGenerator<CifoEvent> {
  return preguntar(CIFO, alcance, pregunta, locale);
}

/** La versión de una sola respuesta, para scripts de prueba. */
export function preguntarACifo(
  alcance: AlcanceClinica,
  pregunta: string,
  locale: string,
): Promise<CifoAnswer> {
  return preguntarUnaVez(CIFO, alcance, pregunta, locale);
}
