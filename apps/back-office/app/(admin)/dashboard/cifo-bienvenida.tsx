'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { EVENTO_ABRIR, MARCA_ABRIR } from '@/components/layout/cifo-button';

/**
 * El saludo de CIFO — la bienvenida del día.
 *
 * CIFO a la izquierda, el texto tipeándose a la derecha como si hablara, y un
 * botón por cada cosa que menciona. Idea de Erick (2026-09-10).
 *
 * ── La regla que hace que esto no moleste: UNA VEZ POR DÍA ───────────────────
 *
 * El dashboard es el felpudo del sistema: las 12 personas del back-office lo
 * abren varias veces por día, y la pantalla tiene un trabajo urgente debajo
 * (quién llega sin el formulario firmado, con el botón de llamar).
 *
 * Una ventana centrada en CADA carga sería un peaje sobre exactamente eso. Así
 * que se muestra en la primera carga del día de cada persona y no vuelve. La
 * marca es la CLAVE DEL DÍA de la clínica —no `Date.now()` ni la medianoche del
 * navegador—, la misma con la que el servidor decide qué citas son "de hoy": si
 * alguien mira desde otra zona, el saludo cambia con el día de la clínica y no
 * con el suyo.
 *
 * Y como se cierra solo, hay un botón en la barra —entre Mensajes y el ícono del
 * celular— que lo trae de vuelta: `components/layout/cifo-button.tsx`. Abierto
 * a mano NO se auto-cierra.
 *
 * ── Si hay alguien ya tarde, ENCABEZA (antes lo silenciaba) ──────────────────
 *
 * La primera versión escondía el saludo entero cuando había un caso TARDE o
 * AHORA. Medido en producción, esa regla lo apagaba SIEMPRE: a media jornada
 * casi siempre hay alguien atrasado. Ahora esa línea va primera y en rojo, con
 * el botón para abrir el caso. Ver `page.tsx`.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 *
 * No consulta nada. Los tres números llegan ya calculados por la página, de las
 * mismas funciones que alimentan lo que está detrás. El saludo no puede
 * contradecir a la pantalla que tapa, porque es el mismo dato.
 */

/** Cuánto tarda en escribirse cada carácter, y la pausa entre frases. */
const MS_POR_CARACTER = 18;
const MS_ENTRE_LINEAS = 320;
/** Se va solo. Arranca a contar recién cuando terminó de hablar. */
const MS_HASTA_CERRAR = 9_000;
/** CIFO solo en el centro antes de que aparezca el globo. */
const MS_ENTRADA = 3_000;

/**
 * Referencia estable para "todavía no hay nada que escribir".
 *
 * Un `[]` escrito en el JSX sería un array nuevo por render y volvería a
 * disparar el efecto del tipeo en cada uno — el mismo bug que dejaba el panel
 * en blanco, por la puerta de al lado.
 */
const VACIO: string[] = [];

export interface DatosBienvenida {
  /** Clave del día de la CLÍNICA (`YYYY-MM-DD`). Es la marca de "ya lo vi". */
  hoy: string;
  citasHoy: number;
  sinLlegarTodavia: number;
  sinIntakeFirmado: number;
  liensCerradosSinFirma: number;
  /**
   * El caso que ya no espera, si lo hay. NO silencia el saludo: lo encabeza.
   * Ver el porqué —medido— en el comentario de `page.tsx`.
   */
  urgente: { caseId: string; caseCode: string; tarde: boolean } | null;
}

const CLAVE = 'cifo:saludo-visto';

export function CifoBienvenida({ datos }: { datos: DatosBienvenida }): React.ReactElement | null {
  const t = useTranslations('phoenix.dashboard');
  const router = useRouter();

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
      if (window.localStorage.getItem(CLAVE) === datos.hoy) return;
      window.localStorage.setItem(CLAVE, datos.hoy);
    } catch {
      /* Modo privado o cookies bloqueadas: que se vea igual, una vez por carga. */
    }
    setAbierto('auto');
  }, [datos.hoy]);

  /**
   * El botón de la barra — ver `components/layout/cifo-button.tsx`.
   *
   * Dos caminos porque el botón puede estar en esta pantalla o en otra: si ya
   * estamos acá llega un evento; si venimos de otra, llega una marca en
   * `sessionStorage` que se consume UNA vez (si no, el saludo reaparecería en
   * cada visita al dashboard hasta cerrar el navegador).
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
  return <Panel datos={datos} t={t} router={router} auto={abierto === 'auto'} onCerrar={() => setAbierto(null)} />;
}

/**
 * El panel, en su propio componente.
 *
 * Separado a propósito: así los hooks del tipeo se montan cuando el saludo
 * aparece de verdad y no en cada carga del dashboard para no hacer nada.
 */
function Panel({
  datos, t, router, auto, onCerrar,
}: {
  datos: DatosBienvenida;
  t: ReturnType<typeof useTranslations>;
  router: ReturnType<typeof useRouter>;
  /** `false` cuando lo abrió el botón de la barra: entonces NO se cierra solo. */
  auto: boolean;
  onCerrar: () => void;
}): React.ReactElement {
  /**
   * Las frases y su acción. Solo entran las que tienen algo que decir: con la
   * cola en cero, la línea de la cola no existe — un "0 pendientes" ocupa el
   * mismo espacio que un dato y no pide nada.
   */
  const lineas = React.useMemo(() => {
    const l: { texto: string; urgente?: boolean; boton?: { etiqueta: string; ir: () => void } }[] = [
      { texto: t('saludoHola') },
    ];

    /**
     * Lo que no espera va PRIMERO, antes que el panorama del día. Si alguien ya
     * está atrasado, ese es el titular de CIFO — el resto de los números pueden
     * esperar quince segundos, esa persona no.
     */
    if (datos.urgente) {
      l.push({
        texto: datos.urgente.tarde
          ? t('saludoTarde', { caso: datos.urgente.caseCode })
          : t('saludoAhora', { caso: datos.urgente.caseCode }),
        urgente: true,
        boton: {
          etiqueta: t('saludoVerCaso'),
          ir: () => router.push(`/dashboard?case=${datos.urgente!.caseId}`),
        },
      });
    }

    l.push({
      texto: t('saludoCitas', { citas: datos.citasHoy, faltan: datos.sinLlegarTodavia }),
      boton: { etiqueta: t('saludoVerAgenda'), ir: () => router.push('/calendar') },
    });

    if (datos.sinIntakeFirmado > 0) {
      l.push({
        texto: t('saludoSinIntake', { n: datos.sinIntakeFirmado }),
        boton: {
          etiqueta: t('saludoVerCola'),
          ir: () => document.getElementById('cola-intake')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        },
      });
    }

    /**
     * Los liens van SIN botón, y es a propósito.
     *
     * No existe ninguna pantalla del back-office que liste "casos cerrados con
     * el lien sin firmar": la firma solo se ve por bufete, adentro de la ficha
     * de cada abogado. El botón apuntaba a `/billing`, donde no hay nada de
     * liens — o sea que decía "Ver facturación" y te dejaba sin forma de
     * encontrar esos casos.
     *
     * Un botón que no lleva a lo que promete es peor que no tenerlo: gasta un
     * clic y la confianza. Cuando exista esa lista, acá va su enlace.
     */
    if (datos.liensCerradosSinFirma > 0) {
      l.push({ texto: t('saludoLiens', { n: datos.liensCerradosSinFirma }) });
    }

    l.push({ texto: t('saludoCierre') });
    return l;
  }, [datos, t, router]);

  /**
   * ⚠️ El array de textos va MEMOIZADO, y no es cosmética.
   *
   * Antes esto era `useTipeo(lineas.map((x) => x.texto))`. `.map()` devuelve un
   * array NUEVO en cada render, así que la dependencia del efecto del tipeo
   * cambiaba de identidad cada vez: escribía una letra → setState → re-render →
   * array nuevo → cleanup (cancela) → el efecto arranca de cero. Un bucle que
   * dejaba el panel con el cursor parpadeando y **cero texto**, que es
   * exactamente lo que se vio en pantalla.
   */
  const textos = React.useMemo(() => lineas.map((x) => x.texto), [lineas]);

  /**
   * Dos tiempos: CIFO entra SOLO al centro, y recién después habla.
   *
   * Pedido de Erick (2026-09-10). Tiene una razón más allá de lo lindo: el
   * saludo aparece encima de una pantalla llena, y darle un momento sin texto
   * hace que la vista aterrice en él antes de tener que leer. Si todo aparece
   * junto, el ojo no sabe dónde empezar.
   *
   * Tres segundos, del rango que pidió (3 a 5). Cinco se sienten largos cuando
   * ya sabés lo que va a decir, y esto se ve todos los días.
   */
  const [fase, setFase] = React.useState<'entrada' | 'hablando'>('entrada');
  React.useEffect(() => {
    const id = window.setTimeout(() => setFase('hablando'), MS_ENTRADA);
    return () => window.clearTimeout(id);
  }, []);

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

          Y se achica al aparecer el globo, para cederle el lugar. La transición
          la hace el navegador con `transition-all`; no hay animación a mano.
        */}
        <img
          src={fase === 'entrada' ? '/cifo-saluda.webp' : '/cifo-escribe.webp'}
          alt=""
          aria-hidden="true"
          className={`shrink-0 select-none pointer-events-none drop-shadow-2xl transition-all duration-700 ease-out ${
            fase === 'entrada'
              ? 'w-52 sm:w-72 animate-in zoom-in-75 duration-500'
              : 'w-24 sm:w-40 -mb-1'
          }`}
        />

        {/*
          El segundo GIF se descarga DURANTE la entrada, no cuando hace falta.
          Son 600 KB: sin esto, al cambiar de fase el `src` apunta a algo que
          todavía no llegó y CIFO desaparece un instante justo en el momento más
          visible. `hidden` no serviría —el navegador puede saltearse la descarga
          de lo que no se muestra—, así que el truco es un pixel transparente.
        */}
        {fase === 'entrada' && (
          <img src="/cifo-escribe.webp" alt="" aria-hidden="true" className="absolute w-px h-px opacity-0 pointer-events-none" />
        )}

        {/*
          El globo, que aparece DESPUÉS. Sin él en el árbol durante la entrada:
          si estuviera con `opacity-0` seguiría ocupando su ancho y CIFO no
          quedaría centrado, que es justo el efecto que se busca en esos
          segundos.
        */}
        {fase === 'hablando' && (
          <div className="relative flex-1 min-w-0 w-full rounded-lg bg-bg-1 p-5 pr-12 shadow-2xl animate-in fade-in slide-in-from-left-3 duration-500">
            {/* Acá iría el sonido, y por eso NO está todavía: el navegador BLOQUEA
                el audio que arranca solo en una página con la que nadie interactuó
                aún, que es exactamente este caso —primera carga del día, recién
                entrando—. Cuando haya un archivo de voz, la forma que sí funciona
                es dispararlo con el primer clic dentro del panel. */}
            <button
              type="button"
              onClick={onCerrar}
              aria-label={t('saludoCerrar')}
              className="absolute top-2.5 right-2.5 h-9 w-9 inline-flex items-center justify-center rounded text-text-muted hover:text-text-1 hover:bg-white/[0.04]"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="text-[10px] uppercase tracking-wider font-semibold text-brand mb-2">
              {t('saludoTitulo')}
            </p>

            <div className="space-y-2">
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
                        className={`h-7 px-2.5 rounded text-[11.5px] font-semibold transition-colors ${
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
    // `textos` se arma con useMemo arriba: cambia solo si cambian los números.
  }, [textos]);

  const escribiendo = !terminado;
  return { visibles, escribiendo, terminado };
}
