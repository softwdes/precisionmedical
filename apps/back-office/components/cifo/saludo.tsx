'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { EVENTO_ABRIR, MARCA_ABRIR } from '@/components/layout/cifo-button';

/**
 * El saludo de CIFO — la maquinaria, sin saber de qué habla.
 *
 * CIFO entra solo al centro, y a los tres segundos se corre al costado y dice
 * sus frases tipeándolas, con un botón al lado de cada una. Idea de Erick
 * (2026-09-10).
 *
 * ── Por qué vive acá y no en la pantalla ────────────────────────────────────
 *
 * Lo usan DOS portales con contenidos que no se parecen en nada:
 *
 *   · el panel de la clínica  → citas del día, quién llega sin el formulario
 *     firmado, liens sin firmar (`app/(admin)/dashboard/cifo-bienvenida.tsx`)
 *   · el día del provider     → sus citas, quién lo espera en la sala, sus notas
 *     sin firmar (`app/doctor/cifo-saludo-provider.tsx`)
 *
 * Lo ÚNICO compartido es cómo aparece: la entrada, el tipeo, los tiempos, el
 * cierre. Los números no: cada portal arma sus frases y este componente no
 * pregunta de dónde salieron. Es la misma separación que ya hicimos con el
 * motor del agente (`lib/agente/`), y por la misma razón — si el contenido
 * viviera acá adentro, el día que cambie el de recepción se toca el del médico.
 *
 * ── La regla que hace que no moleste: UNA VEZ POR DÍA ───────────────────────
 *
 * La marca es la CLAVE DEL DÍA de la clínica, no `Date.now()` ni la medianoche
 * del navegador: si alguien mira desde otra zona, el saludo cambia con el día de
 * la clínica y no con el suyo.
 *
 * Y la llave de `localStorage` la elige QUIEN LLAMA, no este archivo. Con una
 * sola llave compartida, alguien que entra al panel y después a su portal vería
 * el saludo una vez y no en los dos — son dos mensajes distintos y cada uno
 * lleva su propia marca.
 */

/** Cuánto tarda en escribirse cada carácter, y la pausa entre frases. */
const MS_POR_CARACTER = 18;
const MS_ENTRE_LINEAS = 320;
/** Se va solo. Arranca a contar recién cuando terminó de hablar. */
const MS_HASTA_CERRAR = 9_000;
/** CIFO solo en el centro antes de que aparezca el globo. */
const MS_ENTRADA = 3_000;

export interface LineaSaludo {
  texto: string;
  /** Lo pinta en rojo: se reserva para lo que ya no admite espera. */
  urgente?: boolean;
  boton?: { etiqueta: string; ir: () => void };
}

export function SaludoCifo({ lineas, hoy, clave }: {
  lineas: LineaSaludo[];
  /** `YYYY-MM-DD` en la zona de la clínica — la marca de "ya lo vi". */
  hoy: string;
  /** Llave de `localStorage`. Una por portal: ver el encabezado. */
  clave: string;
}): React.ReactElement | null {
  const [abierto, setAbierto] = React.useState<null | 'auto' | 'manual'>(null);

  /**
   * La decisión de mostrarlo va en un efecto y no en el primer render.
   *
   * `localStorage` no existe en el servidor, así que leerlo durante el render
   * daría una marca distinta en servidor y cliente y React tiraría el árbol
   * entero por hidratación. Con el efecto, el primer pintado es siempre "no hay
   * saludo" y el saludo entra un tick después — que además es lo que queremos
   * visualmente: aparece sobre la pantalla ya dibujada.
   */
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(clave) === hoy) return;
      window.localStorage.setItem(clave, hoy);
    } catch {
      /* Modo privado o cookies bloqueadas: que se vea igual, una vez por carga. */
    }
    setAbierto('auto');
  }, [hoy, clave]);

  /**
   * El botón de la barra — ver `components/layout/cifo-button.tsx`.
   *
   * Dos caminos porque el botón puede estar en esta pantalla o en otra: si ya
   * estamos acá llega un evento; si venimos de otra, llega una marca en
   * `sessionStorage` que se consume UNA vez (si no, el saludo reaparecería en
   * cada visita hasta cerrar el navegador).
   */
  React.useEffect(() => {
    const abrir = () => setAbierto('manual');
    window.addEventListener(EVENTO_ABRIR, abrir);
    try {
      if (window.sessionStorage.getItem(MARCA_ABRIR) === '1') {
        window.sessionStorage.removeItem(MARCA_ABRIR);
        setAbierto('manual');
      }
    } catch { /* da igual */ }
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  if (!abierto) return null;
  return <Panel lineas={lineas} auto={abierto === 'auto'} onCerrar={() => setAbierto(null)} />;
}

/**
 * El panel, en su propio componente.
 *
 * Separado a propósito: así los hooks del tipeo se montan cuando el saludo
 * aparece de verdad y no en cada carga de la pantalla para no hacer nada.
 */
function Panel({ lineas, auto, onCerrar }: {
  lineas: LineaSaludo[];
  /** `false` cuando lo abrió el botón de la barra: entonces NO se cierra solo. */
  auto: boolean;
  onCerrar: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.dashboard');

  /**
   * Dos tiempos: CIFO entra SOLO al centro, y recién después habla.
   *
   * Tiene una razón más allá de lo lindo: el saludo aparece encima de una
   * pantalla llena, y darle un momento sin texto hace que la vista aterrice en
   * él antes de tener que leer. Si todo aparece junto, el ojo no sabe dónde
   * empezar. Tres segundos del rango que pidió Erick (3 a 5): cinco se sienten
   * largos cuando ya sabés lo que va a decir, y esto se ve todos los días.
   */
  const [fase, setFase] = React.useState<'entrada' | 'hablando'>('entrada');
  React.useEffect(() => {
    const id = window.setTimeout(() => setFase('hablando'), MS_ENTRADA);
    return () => window.clearTimeout(id);
  }, []);

  /**
   * ⚠️ El tipeo se engancha a un STRING, no al array.
   *
   * La primera versión pasaba `lineas.map(x => x.texto)` como dependencia del
   * efecto. `.map()` devuelve un array nuevo en cada render, así que la
   * dependencia cambiaba de identidad siempre: escribía una letra → setState →
   * re-render → array nuevo → cleanup (cancela) → arranca de cero. El panel
   * quedaba con el cursor parpadeando y **cero texto**.
   *
   * Se arregló memoizando, pero eso dejaba la trampa armada para el que
   * escribiera el segundo portal: bastaba con no memoizar su lista. Enganchado a
   * un string, el bug ya no se puede reintroducir desde afuera — dos listas con
   * las mismas frases son la misma dependencia, vengan del array que vengan.
   */
  const firma = JSON.stringify(lineas.map((l) => l.texto));
  const textos = React.useMemo(() => JSON.parse(firma) as string[], [firma]);

  // El tipeo arranca recién en la segunda fase: pasarle los textos antes haría
  // que se escribieran contra un globo que todavía no existe.
  const { visibles, escribiendo, terminado } = useTipeo(fase === 'hablando' ? textos : VACIO);

  /** Cerrar con Escape, como cualquier capa del sistema. */
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCerrar]);

  /**
   * Se va solo, pero recién cuando terminó de hablar — y SOLO si apareció solo.
   *
   * Si lo abriste vos con el botón de la barra, se queda hasta que lo cierres:
   * un panel que pediste y se evapora a los nueve segundos es el mismo problema
   * que te hizo pedir el botón.
   */
  React.useEffect(() => {
    if (!auto || !terminado) return;
    const id = window.setTimeout(onCerrar, MS_HASTA_CERRAR);
    return () => window.clearTimeout(id);
  }, [auto, terminado, onCerrar]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-bg-0/70 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={t('saludoTitulo')}
    >
      {/* El clic de adentro no cierra: solo el del fondo. */}
      <div
        onClick={(e) => e.stopPropagation()}
        /*
          ⚠️ ACÁ NO VA `overflow`. NUNCA. El scroll vive dentro del globo.

          Regla de Erick (2026-09-11), y es estructural, no de gusto: este
          contenedor envuelve a CIFO **y** al globo, así que cualquier barra suya
          aparece al costado del robot, flotando sobre el fondo oscuro y sin nada
          que la explique. Lo único que puede crecer es el texto → el scroll es
          del texto, y va adentro de la tarjeta, donde está la X.

          Encima este es el contenedor que MÁS fácil desborda por unos pocos
          píxeles, porque sus hijos usan márgenes negativos para pisarse
          (`-mb-4` en móvil, y hasta recién un `sm:-mb-1` en escritorio que con
          `items-end` colgaba cuatro píxeles por debajo de la línea del flex).
          Con `overflow` puesto, esos cuatro píxeles sacaban una barra de
          pantalla completa.

          Se intentó arreglar DOS veces tocando el tope —`calc(100dvh-2rem)` y
          después `max-h-full`— y las dos fallaron, porque el problema nunca fue
          el tope sino QUIÉN scrollea.

          Cómo se reconoce en una captura: **el pulgar ocupa casi todo el riel**.
          Eso dice "me paso por poquito", no "no entra".
        */
        className="flex flex-col sm:flex-row items-center sm:items-end justify-center gap-0 sm:gap-4 w-full max-w-3xl"
      >
        {/*
          SON DOS CIFOS, y ese es el punto (Erick, 2026-09-10): `cifo-saluda`
          levanta la mano y `cifo-escribe` tiene la tableta. Primero saluda, y
          cuando empieza a hablar cambia al que escribe — el dibujo hace lo mismo
          que el texto en ese momento.

          Va SUELTO, sin caja detrás: el GIF es transparente y una tarjeta atrás
          lo convierte en una calcomanía pegada. La sombra es del propio dibujo
          (`drop-shadow` sigue el contorno, no el rectángulo), que es lo que lo
          despega del fondo sin encajonarlo.

          `relative z-10` porque CIFO va ANTES que el globo en el DOM: sin esto,
          al pisarse en móvil el globo le pasa por encima y le corta los pies.
        */}
        <img
          src={fase === 'entrada' ? '/cifo-saluda.gif' : '/cifo-escribe.gif'}
          alt=""
          aria-hidden="true"
          className={`shrink-0 relative z-10 select-none pointer-events-none drop-shadow-2xl transition-all duration-700 ease-out ${
            fase === 'entrada'
              ? 'w-56 sm:w-72 animate-in zoom-in-75 duration-500'
              : 'w-28 sm:w-40 -mb-4 sm:mb-0'
          }`}
        />

        {/*
          El segundo GIF se descarga DURANTE la entrada, no cuando hace falta.
          Sin esto, al cambiar de fase el `src` apunta a algo que todavía no
          llegó y CIFO desaparece un instante justo en el momento más visible.
          `hidden` no serviría —el navegador puede saltearse la descarga de lo
          que no se muestra—, así que el truco es un pixel transparente.
        */}
        {fase === 'entrada' && (
          <img src="/cifo-escribe.gif" alt="" aria-hidden="true" className="absolute w-px h-px opacity-0 pointer-events-none" />
        )}

        {/*
          El globo, que aparece DESPUÉS. Sin él en el árbol durante la entrada:
          si estuviera con `opacity-0` seguiría ocupando su ancho y CIFO no
          quedaría centrado, que es justo el efecto que se busca en esos
          segundos.
        */}
        {fase === 'hablando' && (
          <div className="relative flex-1 min-w-0 w-full rounded-lg bg-bg-1 p-5 pr-14 sm:pr-12 shadow-2xl animate-in fade-in slide-in-from-left-3 duration-500">
            {/* La X está desde el primer segundo. Hacerla esperar no agrega
                nada: quien lo quiere leer lo lee igual, y a quien está apurado
                lo dejás mirando una animación con un paciente esperando.

                Va FUERA del área que scrollea, así que no se va para arriba si
                alguna vez hay que scrollear: es la salida, y una salida que
                desaparece al mover la rueda no es una salida. */}
            <button
              type="button"
              onClick={onCerrar}
              aria-label={t('saludoCerrar')}
              className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 h-11 w-11 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded text-text-muted hover:text-text-1 hover:bg-white/[0.04]"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="text-[10px] uppercase tracking-wider font-semibold text-brand mb-2">
              {t('saludoTitulo')}
            </p>

            {/*
              El scroll vive ACÁ ADENTRO, y nunca en el contenedor de afuera
              (Erick, 2026-09-11: *"el scroll debería aparecer adentro del modal
              donde está la X y no afuera"*).

              Y tiene razón más allá del gusto: el contenedor de afuera también
              envuelve a CIFO, así que su barra aparecía al costado del robot,
              flotando sobre el fondo oscuro y sin nada que la explicara. Acá
              queda pegada al texto, que es lo único que puede crecer.

              El tope es `70dvh` y no una cuenta contra el padre: así el margen
              es amplio y la barra **no puede** salir por un redondeo de
              subpíxeles, que fue lo que la hizo aparecer las dos veces
              anteriores. Con cuatro frases cortas nunca se llega; existe para el
              teléfono en horizontal, o el día que alguien agregue seis líneas.
            */}
            <div className="space-y-2 max-h-[70dvh] overflow-y-auto overscroll-contain">
              {lineas.map((linea, i) => {
                if (i > visibles.length - 1) return null;
                const texto = visibles[i] ?? '';
                const listo = i < visibles.length - 1 || !escribiendo;
                return (
                  <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className={`text-sm ${
                      linea.urgente ? 'text-rose font-semibold' : 'text-text-1'
                    } ${i === 0 ? 'font-semibold' : ''}`}>
                      {texto}
                      {/* El cursor solo en la línea que se está escribiendo. */}
                      {!listo && <span className="inline-block w-[2px] h-[14px] ml-0.5 -mb-0.5 bg-brand animate-pulse" />}
                    </p>
                    {listo && linea.boton && (
                      <button
                        type="button"
                        onClick={() => { linea.boton!.ir(); onCerrar(); }}
                        /* 40px en el teléfono, 28 en escritorio. A 28 no se
                           acierta con el pulgar — Regla #4, el mismo criterio
                           con el que se subieron los de la cola de intake. */
                        className={`h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold transition-colors ${
                          linea.urgente
                            ? 'bg-rose/15 text-rose hover:bg-rose/25'
                            : 'bg-brand/15 text-brand hover:bg-brand/25'
                        }`}
                      >
                        {linea.boton.etiqueta}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Referencia estable para "todavía no hay nada que escribir".
 *
 * Un `[]` escrito en el JSX sería un array nuevo por render y volvería a
 * disparar el efecto del tipeo en cada uno — el mismo bug de arriba, por la
 * puerta de al lado.
 */
const VACIO: string[] = [];

/**
 * El tipeo, frase por frase.
 *
 * ── Por qué respeta `prefers-reduced-motion` ────────────────────────────────
 *
 * No es decoración: es TEXTO que aparece de a poco. Para alguien con esa
 * preferencia activada —que en iPad es un caso real— el efecto va de molesto a
 * mareante, y encima retrasa la información. Con la preferencia puesta, todo
 * aparece entero de una vez y el saludo sigue funcionando igual.
 */
function useTipeo(textos: string[]): { visibles: string[]; escribiendo: boolean; terminado: boolean } {
  const [visibles, setVisibles] = React.useState<string[]>([]);
  const [terminado, setTerminado] = React.useState(false);

  React.useEffect(() => {
    /**
     * Arrancar SIEMPRE de cero, y esto no es defensivo: es necesario.
     *
     * El panel llama a este hook primero con la lista vacía —mientras CIFO hace
     * su entrada solo— y esa pasada deja `terminado` en true, porque una lista
     * sin frases está terminada por definición. Sin este reset, al llegar los
     * textos de verdad el hook seguiría diciendo "ya terminé": no se vería el
     * cursor y, peor, el cierre automático arrancaría a contar antes de que
     * CIFO dijera la primera palabra.
     */
    setVisibles([]);
    setTerminado(false);
    if (textos.length === 0) return;

    const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (sinMovimiento) {
      setVisibles(textos);
      setTerminado(true);
      return;
    }

    let cancelado = false;
    const temporizadores: number[] = [];

    const escribirLinea = (i: number) => {
      if (cancelado || i >= textos.length) { if (!cancelado) setTerminado(true); return; }
      const texto = textos[i] ?? '';
      setVisibles((v) => [...v.slice(0, i), '']);

      let c = 0;
      const paso = () => {
        if (cancelado) return;
        c += 1;
        setVisibles((v) => { const n = [...v]; n[i] = texto.slice(0, c); return n; });
        if (c < texto.length) temporizadores.push(window.setTimeout(paso, MS_POR_CARACTER));
        else temporizadores.push(window.setTimeout(() => escribirLinea(i + 1), MS_ENTRE_LINEAS));
      };
      temporizadores.push(window.setTimeout(paso, MS_POR_CARACTER));
    };

    escribirLinea(0);
    return () => { cancelado = true; temporizadores.forEach(window.clearTimeout); };
  }, [textos]);

  return { visibles, escribiendo: !terminado, terminado };
}
