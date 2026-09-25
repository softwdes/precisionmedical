'use client';

import * as React from 'react';
import { marcarCortinaMostrada } from './use-novedad';

/**
 * La cortina de versión: el número tomando la pantalla entera.
 *
 * ── Por qué NO va adentro del globo de CIFO ─────────────────────────────────
 *
 * La primera versión era una tarjeta arriba de las frases del saludo. Erick la
 * probó y el diagnóstico fue exacto: *"solo muestra igual que cuando doy clic
 * al icono de CIFO"*. Y claro — una tarjeta más adentro de un panel que ya
 * existe no se lee como un acontecimiento, se lee como un renglón.
 *
 * Un lanzamiento pasa cada varias semanas y es la única vez que vale la pena
 * interrumpir a alguien con algo que no es trabajo. Así que ocupa todo: el
 * número enorme, un barrido de luz cruzando la pantalla y los módulos entrando
 * en fila. Dura seis segundos y no vuelve hasta la próxima versión.
 *
 * ── Todo con tokens, ni un hex ──────────────────────────────────────────────
 *
 * El fondo, el resplandor y el barrido salen de `brand` y de los `-text`, que
 * cambian con el tema. Un hex acá se vería bien en oscuro y sería un cartel
 * blanco sobre blanco en claro — trampa que este repo ya pagó dos veces.
 *
 * ── Y se puede salir en cualquier momento ───────────────────────────────────
 *
 * Clic en cualquier lado, Escape, o el botón. Esto aparece a las nueve de la
 * mañana sobre la pantalla de alguien que tiene un paciente esperando: que sea
 * lindo no le da derecho a retener a nadie.
 */

/**
 * Que ya se mostró en esta sesión del navegador. Vive en `sessionStorage` y no
 * en `localStorage` a propósito: no es "la vio" —eso lo decide el descarte— sino
 * "ya le tapé la pantalla una vez hoy".
 */
const CLAVE_SESION = 'cifo:cortina-mostrada';

/** Cuánto queda en pantalla si nadie la toca. */
const MS_EN_PANTALLA = 6_000;

export interface DatosCortina {
  /** `3.10`. Texto, nunca número. */
  version: string;
  /** Módulos que cambiaron, ya filtrados por audiencia y en el idioma de la app. */
  modulos: string[];
  /**
   * Los textos llegan ARMADOS, en el idioma de la app.
   *
   * Este paquete no puede llamar a `next-intl`: el namespace no existe en las
   * dos apps y la etiqueta saldría cruda en pantalla, como ya pasó con
   * `PHOENIX.DASHBOARD.SALUDOTITULO` en producción.
   */
  etiqueta: string;
  /** "8 cambios" · "8 changes". Vacío para no mostrarlo. */
  resumen: string;
  /** Texto del botón de salida. */
  cerrar: string;
  /**
   * Cambia en cada pedido. Es lo que hace que tocar la insignia del sidebar
   * vuelva a abrirla aunque los datos sean los mismos de antes.
   */
  nonce: number;
}

export function CortinaVersion({
  datos,
  onDescartada,
}: {
  datos: DatosCortina | null;
  /**
   * Se llama cuando la persona la cierra A PROPÓSITO — el botón, el fondo o
   * Escape. **No** cuando se cierra sola.
   *
   * ── Por qué la diferencia importa ───────────────────────────────────────
   *
   * Antes esto se llamaba `onMostrada` y se disparaba al ABRIR. El efecto era
   * que la insignia dejaba de latir un segundo después de cargar la página:
   * el punto ámbar aparecía, llegaba el changelog, la cortina se abría, y el
   * punto se apagaba sin que nadie lo hubiera mirado.
   *
   * Erick lo notó al revés —*"falta el punto ámbar parpadeante"*— y tenía
   * razón en lo de fondo: un aviso que se marca como visto por mostrarse no
   * distingue entre quien lo leyó y quien no estaba frente a la pantalla.
   *
   * Ahora "visto" significa que la persona hizo algo. Si la cortina se cerró
   * sola a los seis segundos, el punto sigue latiendo — nadie la miró.
   *
   * Lo que ya NO depende de esto es si la cortina vuelve a salir: eso lo
   * decide `marcarCortinaMostrada`, que se escribe al abrir. Atarlo acá hacía
   * que reapareciera todas las mañanas, porque el camino normal es dejarla
   * cerrarse sola (Erick, 2026-09-24). Las dos llaves están explicadas en
   * `use-novedad.ts`.
   */
  onDescartada?: () => void;
}): React.ReactElement | null {
  const [abierta, setAbierta] = React.useState(false);
  const nonce = datos?.nonce ?? null;
  /** Primitivo, no el objeto: sirve de dependencia sin reabrir la cortina. */
  const version = datos?.version ?? null;

  const alDescartar = React.useRef(onDescartada);
  alDescartar.current = onDescartada;

  /** Cierra. `aProposito` distingue el clic de la persona del reloj. */
  const cerrar = React.useCallback((aProposito: boolean) => {
    setAbierta(false);
    if (aProposito) alDescartar.current?.();
  }, []);

  /**
   * ⚠️ La dependencia es `nonce`, un número — no el objeto `datos`.
   *
   * Un objeto armado en el render del padre cambia de identidad en cada render;
   * enganchado a él, este efecto reabriría la cortina para siempre, incluso
   * después de que la cerraran. Es la misma trampa que `saludo.tsx` documenta
   * para el tipeo, y acá el síntoma sería mucho peor.
   */
  React.useEffect(() => {
    if (nonce === null || version === null) return;
    /*
     * Nunca encima de alguien que está trabajando.
     *
     * Este efecto NO corre solo al cargar la página: se dispara cada vez que el
     * sondeo detecta un despliegue nuevo con la pestaña abierta. Y la cortina es
     * `fixed inset-0 z-[100]`, mientras que los diálogos de Radix van en `z-50`:
     * cae POR ENCIMA de cualquier ventana abierta y se come el clic que la
     * persona estaba por dar. Con varios despliegues en un mismo día —como el
     * 24-sep— eso es literalmente el "hago clic y no pasa nada" que reportó
     * cobranza sobre el buscador de cargos.
     *
     * `[data-state="open"]` es lo que distingue un diálogo de Radix realmente
     * abierto. Hace falta el filtro: el `SideDrawer` de novedades también lleva
     * `role="dialog"` pero se monta SIEMPRE (escondido con `translate-x-full`),
     * así que sin él la cortina no saldría jamás.
     *
     * Se marca como mostrada igual. El aviso no se pierde —la insignia sigue con
     * su punto ámbar y el panel tiene la nota entera—, y taparle la pantalla a
     * quien está cobrando cuesta mucho más que saltear una cortina.
     */
    if (document.querySelector('[role="dialog"][data-state="open"]') !== null) {
      marcarCortinaMostrada(version);
      return;
    }
    setAbierta(true);
    // Que ya se mostró en ESTA sesión del navegador. Sin esto, una cortina que
    // se cerró sola volvería a taparle la pantalla en cada navegación hasta que
    // la persona la descarte — y eso la convierte en un castigo.
    try { window.sessionStorage.setItem(CLAVE_SESION, '1'); } catch { /* da igual */ }
    /*
     * Y que ya se mostró esta VERSIÓN, para siempre. Es lo único que impide que
     * vuelva mañana: el camino normal es mirarla y dejar que se cierre sola, y
     * eso nunca contó como "vista" (ver las dos llaves en `use-novedad.ts`).
     *
     * Ojo con la tentación de unificarla con `onDescartada`: son distintas a
     * propósito. Esta dice "ya le tapé la pantalla"; aquélla, "la miró". El
     * punto ámbar de la insignia sigue latiendo hasta que la persona la toque.
     */
    marcarCortinaMostrada(version);
  }, [nonce, version]);

  React.useEffect(() => {
    if (!abierta) return;
    const salir = (e: KeyboardEvent): void => { if (e.key === 'Escape') cerrar(true); };
    window.addEventListener('keydown', salir);
    const id = window.setTimeout(() => cerrar(false), MS_EN_PANTALLA);
    return () => { window.removeEventListener('keydown', salir); window.clearTimeout(id); };
  }, [abierta, cerrar]);

  if (!abierta || datos === null) return null;

  return (
    <div
      onClick={() => cerrar(true)}
      role="dialog"
      aria-modal="true"
      aria-label={datos.etiqueta}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-bg-0/95 backdrop-blur-lg animate-in fade-in duration-500"
    >
      <style>{`
        @keyframes pm-cortina-barrido {
          from { transform: translateX(-100%) skewX(-12deg) }
          to   { transform: translateX(220%) skewX(-12deg) }
        }
        @keyframes pm-cortina-numero {
          0%   { opacity: 0; transform: scale(.82) }
          60%  { opacity: 1; transform: scale(1.04) }
          100% { opacity: 1; transform: scale(1) }
        }
        @keyframes pm-cortina-sube {
          from { opacity: 0; transform: translateY(14px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes pm-cortina-aura {
          0%   { opacity: 0;   transform: scale(.6) }
          45%  { opacity: .55; transform: scale(1) }
          100% { opacity: .22; transform: scale(1.15) }
        }
        @media (prefers-reduced-motion: reduce) {
          .pm-cortina-barrido { display: none }
          .pm-cortina-anim { animation: none !important; opacity: 1 !important; transform: none !important }
        }
      `}</style>

      {/* El resplandor detrás del número. Es lo que hace que la pantalla se
          sienta encendida y no solo oscurecida. */}
      <div
        aria-hidden="true"
        className="pm-cortina-anim pointer-events-none absolute h-[70vmin] w-[70vmin] rounded-full bg-brand/25 blur-[90px]"
        style={{ animation: 'pm-cortina-aura 1.4s ease-out forwards' }}
      />

      {/* El barrido cruza la PANTALLA entera, no la tarjeta: es el efecto de
          página que pidió Erick. */}
      <div
        aria-hidden="true"
        className="pm-cortina-barrido pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-brand/20 to-transparent"
        style={{ animation: 'pm-cortina-barrido 1.5s 400ms ease-out' }}
      />

      <p
        className="pm-cortina-anim relative text-xs sm:text-sm uppercase tracking-[0.35em] text-brand-text opacity-0"
        style={{ animation: 'pm-cortina-sube 500ms 150ms ease-out forwards' }}
      >
        {datos.etiqueta}
      </p>

      <p
        className="pm-cortina-anim relative mt-2 text-[22vmin] sm:text-[18vmin] font-bold leading-none tracking-tighter text-text-1 opacity-0"
        style={{ animation: 'pm-cortina-numero 900ms 250ms cubic-bezier(.22,1.2,.36,1) forwards' }}
      >
        v{datos.version}
      </p>

      {datos.resumen !== '' && (
        <p
          className="pm-cortina-anim relative mt-1 text-sm text-text-2 opacity-0"
          style={{ animation: 'pm-cortina-sube 500ms 900ms ease-out forwards' }}
        >
          {datos.resumen}
        </p>
      )}

      <div className="relative mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-2 px-6">
        {datos.modulos.map((modulo, i) => (
          <span
            key={modulo}
            className="pm-cortina-anim rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs sm:text-sm text-brand-text opacity-0"
            style={{ animation: `pm-cortina-sube 450ms ${1100 + i * 130}ms ease-out forwards` }}
          >
            {modulo}
          </span>
        ))}
      </div>

      {/* CIFO, que es quien lo cuenta. Va al costado y chico: el protagonista
          acá es el número, no él. */}
      <img
        src="/cifo-saluda.gif"
        alt=""
        aria-hidden="true"
        className="pm-cortina-anim pointer-events-none absolute bottom-0 right-2 w-32 select-none opacity-0 drop-shadow-2xl sm:w-44"
        style={{ animation: 'pm-cortina-sube 700ms 1300ms ease-out forwards' }}
      />

      <button
        type="button"
        onClick={() => cerrar(true)}
        className="pm-cortina-anim relative mt-10 rounded-md border border-border bg-bg-1/80 px-4 py-2 text-sm text-text-2 opacity-0 transition-colors hover:text-text-1"
        style={{ animation: 'pm-cortina-sube 400ms 1600ms ease-out forwards' }}
      >
        {datos.cerrar}
      </button>
    </div>
  );
}
