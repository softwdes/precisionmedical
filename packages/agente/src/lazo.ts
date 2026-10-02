import OpenAI from 'openai';
import type {
  AccionAgente, DefinicionAgente, EventoAgente, Herramienta,
  PasoAgente, RespuestaAgente, ResultadoHerramienta,
} from './tipos';

/**
 * El motor de agentes · el lazo.
 *
 * Este es el ÚNICO archivo del monorepo que sabe qué proveedor de modelo usamos.
 * Todo lo demás —las herramientas, el alcance, la pantalla, los botones— es
 * agnóstico: cambiar de proveedor es reescribir esto y nada más.
 *
 * Salió de `lib/vigia/agent.ts` (2026-09-08) con el comportamiento intacto,
 * para que el segundo agente —CIFO, el de la clínica— no lo copie. Las
 * cuatro decisiones que valen la pena explicar, y que son las que un fork
 * habría duplicado:
 *
 * · **En streaming.** El lazo es un generador que emite lo que pasa: cada
 *   herramienta que termina y cada pedazo de la respuesta a medida que el modelo
 *   la escribe. El total no baja —son las mismas llamadas— pero la espera
 *   percibida sí: la primera palabra a ~1,5 s en vez de todo a los 4.
 *
 * · **`stream()` y no `create()`.** Además de los pedazos de texto, el helper
 *   ENSAMBLA las llamadas a herramientas que llegan partidas en fragmentos.
 *   Hacerlo a mano es acumular por índice, y es donde se rompen estas cosas.
 *
 * · **Las herramientas de una vuelta corren EN PARALELO.** Antes se hacía
 *   `await` una por una: si el modelo pedía dos —el resumen de un caso y su
 *   facturación, que es lo normal cuando preguntan "cuánto debe"— la segunda
 *   esperaba a la primera sin necesitarla. Con dos consultas de ~1 s eso es un
 *   segundo de regalo en cada pregunta.
 *
 * · **El código de caso viaja; el id no.** Las herramientas hablan en códigos.
 *   El id interno se resuelve DESPUÉS del lazo, de este lado, solo para armar el
 *   link. El modelo nunca lo ve ni lo necesita.
 */

/** Tope por defecto. Sin esto, un modelo confundido puede pedir herramientas para siempre. */
const MAX_VUELTAS_DEFAULT = 6;

/**
 * Hoy, en la zona de la clínica — el modelo lo necesita para entender "esta
 * semana". Se exporta porque lo usan los prompts de cada agente.
 *
 * La zona entra por PARÁMETRO y no se importa: este paquete lo usan dos apps
 * (el back-office y el Admin) y cada una tiene su propio `lib/fechas`. Importar
 * el de una acá adentro ataría el motor a esa app, que es justo lo que se quiso
 * evitar al sacarlo. Quien llama pasa su constante — ver el envoltorio de
 * `apps/back-office/lib/agente/lazo.ts`.
 */
export function hoyEnClinica(zona: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: zona, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date());
}

/**
 * Los dos textos que escribe el SERVIDOR, no el modelo.
 *
 * Viven en el motor y no en cada agente porque no hablan del dominio: hablan de
 * que el agente no llegó a una respuesta, y eso se dice igual en los dos.
 */
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
 * De qué códigos habló un paso, cuando el agente no lo define.
 *
 * El argumento `caso` es la convención de las herramientas que reciben UN caso.
 * Un agente cuyas herramientas encuentren el caso en vez de recibirlo tiene que
 * sobrescribir `codigosTocados` — Vigía lo hace por `buscar_paciente`.
 */
function codigosPorDefecto(args: Record<string, unknown>): string[] {
  return typeof args.caso === 'string' ? [args.caso.trim()] : [];
}

/** Ejecuta una herramienta por nombre. Un nombre desconocido no revienta: se le avisa al modelo. */
async function ejecutar<A>(
  herramientas: readonly Herramienta<A>[],
  alcance: A,
  name: string,
  args: Record<string, unknown>,
): Promise<ResultadoHerramienta> {
  const tool = herramientas.find((t) => t.name === name);
  if (!tool) return { data: { error: 'HERRAMIENTA_DESCONOCIDA', name }, sources: [] };
  // El `as never` es por el union de firmas del registro; cada `run` valida lo suyo.
  return (tool.run as (a: A, x: unknown) => Promise<ResultadoHerramienta>)(alcance, args);
}

/**
 * Preguntarle a un agente, en streaming.
 *
 * `alcance` no se mira ni se modifica nunca acá: entra por parámetro y se le
 * pasa tal cual a cada herramienta. Es lo que garantiza que el alcance venga de
 * la sesión y no de algo que el modelo pueda inventar.
 */
export async function* preguntar<A>(
  def: DefinicionAgente<A>,
  alcance: A,
  pregunta: string,
  locale: string,
): AsyncGenerator<EventoAgente> {
  const client = new OpenAI();
  const maxVueltas = def.maxVueltas ?? MAX_VUELTAS_DEFAULT;

  const especs = def.herramientas.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: def.systemPrompt(alcance, locale) },
    { role: 'user', content: pregunta },
  ];

  const steps: PasoAgente[] = [];
  const sources = new Set<string>();
  const toolsUsadas = new Set<string>();
  const codigosTocados = new Set<string>();
  let prompt = 0, completion = 0;

  const cerrar = async (answer: string): Promise<RespuestaAgente> => ({
    answer,
    steps,
    sources: [...sources],
    actions: await def.armarAcciones(alcance, toolsUsadas, codigosTocados),
    usage: { prompt, completion, total: prompt + completion },
    model: def.modelo,
  });

  for (let vuelta = 0; vuelta < maxVueltas; vuelta++) {
    const corriendo = client.chat.completions.stream({
      model: def.modelo,
      messages,
      /**
       * Sin esto la respuesta NO trae el consumo.
       *
       * En streaming la API omite el bloque `usage` salvo que se lo pidas, así
       * que `res.usage` venía `undefined` y el `?? 0` de abajo lo tapaba sin un
       * solo error. Resultado: las 23 preguntas que hubo quedaron registradas
       * con **0 tokens**, y no había forma de saber cuánto gasta el agente —
       * justo cuando hizo falta saberlo (Erick, 2026-10-02: "nos quedamos sin
       * créditos"). El contador estaba, pero contaba cero.
       */
      stream_options: { include_usage: true },
      // Sin herramientas no se manda el campo: la API rechaza un array vacío.
      ...(especs.length > 0 ? { tools: especs } : {}),
    });

    let escrito = 0;
    const pedazos: string[] = [];
    corriendo.on('content.delta', (d: { delta: string }) => { pedazos.push(d.delta); });

    // Se emiten a medida que llegan, sin esperar a que termine la vuelta.
    for await (const _chunk of corriendo) {
      while (escrito < pedazos.length) {
        yield { type: 'delta', text: pedazos[escrito]! };
        escrito++;
      }
    }
    while (escrito < pedazos.length) { yield { type: 'delta', text: pedazos[escrito]! }; escrito++; }

    const res = await corriendo.finalChatCompletion();
    prompt += res.usage?.prompt_tokens ?? 0;
    completion += res.usage?.completion_tokens ?? 0;

    const msg = res.choices[0]?.message;
    if (!msg) break;

    // Escribió algo y ADEMÁS pide herramientas: lo escrito era un preámbulo.
    if (msg.tool_calls?.length && escrito > 0) yield { type: 'reset' };

    // Sin herramientas pedidas: esto ya es la respuesta.
    if (!msg.tool_calls?.length) {
      yield { type: 'done', answer: await cerrar(msg.content?.trim() || sinRespuesta(locale)) };
      return;
    }

    messages.push(msg);

    /**
     * El orden de los resultados NO importa para el modelo, pero sí que cada
     * `tool_result` lleve su `tool_call_id`: se responde a la llamada, no a la
     * posición.
     */
    const llamadas = msg.tool_calls.filter((c) => c.type === 'function');

    const resultados = await Promise.all(llamadas.map(async (call) => {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // Argumentos rotos: se le devuelve el error al modelo en vez de tirar la
        // request. Suele corregirse solo en la vuelta siguiente.
        return { call, args, result: null };
      }
      return { call, args, result: await ejecutar(def.herramientas, alcance, call.function.name, args) };
    }));

    for (const { call, args, result } of resultados) {
      if (!result) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'ARGUMENTOS_INVALIDOS' }) });
        continue;
      }

      toolsUsadas.add(call.function.name);
      result.sources.forEach((s) => sources.add(s));
      const paso: PasoAgente = { tool: call.function.name, sources: result.sources, count: result.count };
      steps.push(paso);
      yield { type: 'step', step: paso };

      const crudo = { name: call.function.name, args, data: result.data };
      for (const codigo of def.codigosTocados?.(crudo) ?? codigosPorDefecto(args)) {
        if (codigo) codigosTocados.add(codigo);
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result.data),
      });
    }
  }

  // Se acabaron las vueltas sin una respuesta final.
  yield { type: 'done', answer: await cerrar(seQuedoSinVueltas(locale)) };
}

/**
 * La versión de una sola respuesta, para quien no necesita el streaming
 * (scripts de prueba y cualquier consumidor que solo quiera el resultado).
 * Consume el generador y devuelve lo último.
 */
export async function preguntarUnaVez<A>(
  def: DefinicionAgente<A>,
  alcance: A,
  pregunta: string,
  locale: string,
): Promise<RespuestaAgente> {
  let ultima: RespuestaAgente | null = null;
  for await (const ev of preguntar(def, alcance, pregunta, locale)) {
    if (ev.type === 'done') ultima = ev.answer;
  }
  if (!ultima) throw new Error(`el agente ${def.nombre} no produjo respuesta`);
  return ultima;
}

/**
 * Por qué falló, en los términos que le importan a quien está mirando.
 *
 * `falla` es el cajón de lo transitorio: reintentar tiene sentido.
 * `sin_saldo` y `sin_clave` NO: por más que reintente, no va a andar.
 */
export type CausaFallo = 'sin_saldo' | 'sin_clave' | 'falla';

/**
 * Traduce el error del proveedor a una causa.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Porque sin esto la pantalla decía *"No pude responder. Probá de nuevo en un
 * momento"* para TODO, incluido quedarse sin saldo. Y eso es mentira con
 * consecuencia: invita a reintentar algo que no puede funcionar, y la clínica
 * queda creyendo que el agente está fallando cuando lo que hay que hacer es
 * cargar la cuenta. Erick se quedó sin créditos el 2026-10-02 y el sistema no
 * se lo dijo.
 *
 * Vive acá —el único archivo que conoce al proveedor— y no en cada ruta, para
 * que las tres apps clasifiquen igual. Si mañana se cambia de proveedor, los
 * códigos cambian en un solo lugar.
 *
 * Se mira el error ANTES que el `status`: un 429 puede ser falta de saldo (que
 * no se arregla reintentando) o un límite de velocidad (que sí). Tratarlos
 * igual manda a cargar la tarjeta a quien solo tenía que esperar diez segundos.
 *
 * ⚠️ **El `type` manda sobre el `code`, y eso está MEDIDO.** La primera versión
 * de esta función miraba `code === 'insufficient_quota'` y habría fallado: con
 * la cuenta vacía de verdad, el 2026-10-02, el proveedor devolvió
 *
 *     status 429 · type "insufficient_quota" · code "credit_balance_exhausted"
 *
 * O sea que `insufficient_quota` es el TYPE, no el code. El `type` es la
 * familia y es estable; el `code` es el motivo puntual y el proveedor lo cambia
 * sin avisar (`credit_balance_exhausted` no figura en su documentación). Por eso
 * se decide por el type, y los codes conocidos quedan como red de abajo.
 *
 * Si alguna vez hay que tocar esto, la forma de saber la verdad es pedirle algo
 * a la API con la cuenta en el estado que se quiere clasificar y mirar lo que
 * contesta. Adivinar el código del proveedor es cómo nació este bug.
 */
export function causaDelFallo(err: unknown): CausaFallo {
  const e = err as {
    status?: number; code?: string; type?: string;
    error?: { code?: string; type?: string };
  } | null;
  // El SDK expone los campos sueltos; una respuesta cruda los trae en `error`.
  const code = e?.code ?? e?.error?.code;
  const type = e?.type ?? e?.error?.type;

  if (type === 'insufficient_quota') return 'sin_saldo';
  if (code === 'credit_balance_exhausted'
    || code === 'insufficient_quota'
    || code === 'billing_hard_limit_reached') return 'sin_saldo';

  if (type === 'invalid_request_error' && code === 'invalid_api_key') return 'sin_clave';
  if (code === 'invalid_api_key' || e?.status === 401) return 'sin_clave';

  return 'falla';
}

export type { AccionAgente, DefinicionAgente, EventoAgente, PasoAgente, RespuestaAgente };
