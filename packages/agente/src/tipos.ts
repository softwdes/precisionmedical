/**
 * El motor de agentes · los tipos.
 *
 * Salieron de `lib/vigia/agent.ts` sin cambiarles la forma: son los mismos que
 * ya viajan por NDJSON hasta la pantalla del portal legal, con los nombres
 * genéricos. Vigía los re-exporta con sus nombres viejos para que ni la ruta ni
 * el componente noten la mudanza.
 *
 * Por qué existe este paquete: el lazo del agente acumula bugs ya encontrados
 * —el preámbulo que hay que borrar, las llamadas a herramientas que llegan
 * partidas, la ejecución en paralelo— y hay que escribir un SEGUNDO agente para
 * la clínica (CIFO, Erick 2026-09-08). Copiar el archivo empieza igual y
 * termina con el bug arreglado en una sola de las dos copias.
 *
 * Lo que el motor NO sabe: quién pregunta, qué puede ver, ni qué herramientas
 * hay. Todo eso entra por `DefinicionAgente`.
 */

/** Una herramienta que corrió, con las tablas que leyó. La pantalla lo muestra como "fuente". */
export interface PasoAgente {
  tool: string;
  sources: string[];
  count?: number;
}

/**
 * El botón viaja como CLAVE, no como texto.
 *
 * Si el servidor mandara "Abrir el caso MVA-3230" ya escrito, el botón queda en
 * un idioma para siempre — que es justo el bug que se vio con el portal en
 * inglés. La pantalla traduce con su propio idioma; acá solo se decide CUÁL
 * botón va.
 *
 * `key` es un string y no un union porque cada agente tiene sus propios
 * botones: los de Vigía abren listas del bufete, los de CIFO van a abrir
 * otras cosas. El union vive en el agente, no acá.
 */
export interface AccionAgente {
  key: string;
  /** Valores para la traducción, por ejemplo el código del caso. */
  params?: Record<string, string>;
  /** Cuando el botón navega. Los de lista no llevan href: abren un modal. */
  href?: string;
  /** Qué lista abre, cuando abre una. Lo interpreta la pantalla del agente. */
  kind?: string;
}

/**
 * Lo que viaja mientras el agente trabaja.
 *
 * `reset` existe por un caso raro pero real: el modelo a veces escribe una frase
 * ANTES de decidir que necesita una herramienta. Esa frase ya se mostró, y
 * cuando la vuelta termina pidiendo herramientas hay que borrarla — si no, queda
 * un pedazo de texto huérfano arriba de la respuesta de verdad.
 */
export type EventoAgente =
  | { type: 'step'; step: PasoAgente }
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; answer: RespuestaAgente };

export interface RespuestaAgente {
  answer: string;
  steps: PasoAgente[];
  sources: string[];
  actions: AccionAgente[];
  usage: { prompt: number; completion: number; total: number };
  model: string;
}

/** Lo que devuelve una herramienta: el dato y de dónde salió. */
export interface ResultadoHerramienta {
  data: unknown;
  /** Tablas que se leyeron. */
  sources: string[];
  /** Filas consideradas, para el pie de la respuesta. */
  count?: number;
}

/**
 * Una herramienta del agente.
 *
 * `A` es el ALCANCE: la sesión del abogado en Vigía, y lo que decidamos en
 * CIFO. El motor lo recibe y lo pasa tal cual, sin mirarlo nunca: por eso
 * ninguna herramienta puede recibir un alcance que no venga de la sesión.
 *
 * `parameters` es el JSON Schema de los argumentos. Va como objeto y no como
 * `unknown` porque el SDK del proveedor exige eso mismo (`FunctionParameters`);
 * el motor no lo valida, solo lo entrega.
 */
export interface Herramienta<A> {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  run(alcance: A, args: never): Promise<ResultadoHerramienta>;
}

/** Lo que el motor necesita saber de un paso para sacarle códigos de caso. */
export interface PasoCrudo {
  name: string;
  args: Record<string, unknown>;
  data: unknown;
}

/**
 * Todo lo que distingue a un agente de otro. Son cuatro cosas y ninguna es el
 * lazo.
 */
export interface DefinicionAgente<A> {
  /** Para los logs y para el `model` de la respuesta. No se le muestra al modelo. */
  readonly nombre: string;
  /** El modelo del proveedor. Sale de una variable de entorno en cada agente. */
  readonly modelo: string;
  /** Las herramientas que se le ofrecen. */
  readonly herramientas: readonly Herramienta<A>[];

  /** El prompt de sistema. Recibe el alcance para poder nombrar a quién le habla. */
  systemPrompt(alcance: A, locale: string): string;

  /**
   * Los botones, derivados de QUÉ herramientas corrieron — nunca elegidos por el
   * modelo. Un modelo inventando URLs es un modelo mandando gente a páginas que
   * no existen, o peor, a un caso ajeno.
   */
  armarAcciones(
    alcance: A,
    toolsUsadas: Set<string>,
    codigosTocados: Set<string>,
  ): Promise<AccionAgente[]>;

  /**
   * De qué códigos de caso habló este paso, para armar el botón "abrir el caso".
   *
   * Si se omite, el motor toma el argumento `caso` cuando existe. Vigía lo
   * sobrescribe porque `buscar_paciente` no RECIBE un caso: lo encuentra.
   */
  codigosTocados?(paso: PasoCrudo): string[];

  /** Tope de vueltas del lazo. Por defecto 6. */
  readonly maxVueltas?: number;
}
