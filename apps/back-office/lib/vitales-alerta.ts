/**
 * Signos vitales fuera de rango — los umbrales, en UN solo lugar.
 *
 * ── Por qué acá y no en cada pantalla ───────────────────────────────────────
 *
 * Los vitales se muestran en cuatro lugares (el formulario de triaje, el
 * Resumen de Day Admission, Mi Día del provider y la nota impresa). Con los
 * números repartidos, alcanza con que alguien toque uno para que el Resumen
 * diga "alto" y Mi Día no diga nada del mismo paciente. Un umbral clínico
 * duplicado es un umbral que va a divergir.
 *
 * ── Por qué NO es "arriba de 120 en rojo" ───────────────────────────────────
 *
 * Fue el pedido original (clínica, 2026-09-03) y se cambió con acuerdo de Erick
 * el mismo día. 120 no es peligroso: es el TECHO de lo normal. Según ACC/AHA
 * 2017 la sistólica normal es <120, 120-129 es "elevada" (no es enfermedad),
 * 130-139 etapa 1, ≥140 etapa 2 y ≥180 crisis.
 *
 * Con el rojo desde 121 se pinta cerca de la mitad de las tomas de una
 * población adulta normal, y ahí pasa lo único que no queremos: el rojo deja de
 * significar algo. Un 190/115 real quedaría igual de marcado que un 122/78. Son
 * DOS niveles a propósito — el rojo se reserva para que cuando aparezca, se mire.
 *
 * ── Por qué existe `IMPOSIBLE` ──────────────────────────────────────────────
 *
 * En la base hay sistólicas de 1 y de 500 (mediana 5: son datos de prueba, pero
 * el dedo se resbala igual en producción). Un 500 no es una crisis, es un typo,
 * y pintarlo como emergencia enseña a desconfiar de la alerta. Fuera de lo
 * fisiológicamente posible se pide REVISAR EL DATO, que no es un aviso clínico.
 *
 * ── Por qué los menores no se evalúan ───────────────────────────────────────
 *
 * Un pulso de 120 es normal a los 2 años y peligroso a los 40. Estos umbrales
 * son de ADULTO. Hay 343 menores en el padrón (5,5%), así que no es un caso de
 * borde: en menores se devuelve `PEDIATRICO` y la pantalla DICE que no se
 * evaluó, en vez de callarse y parecer que está todo bien.
 */

/** Qué tan grave, de menos a más. El orden importa: `peorNivel` lo usa. */
export type NivelVital = 'NORMAL' | 'ATENCION' | 'CRITICO' | 'IMPOSIBLE' | 'PEDIATRICO';

const ORDEN: Record<NivelVital, number> = {
  NORMAL: 0, PEDIATRICO: 1, ATENCION: 2, IMPOSIBLE: 3, CRITICO: 4,
};

/**
 * Cada signo que sabemos evaluar.
 *
 * `altura` y `peso` son distintos al resto: NO tienen umbral clínico. Un metro
 * sesenta no es ni bueno ni malo. Están acá solo para atajar el error de carga
 * —había dos triajes guardados que dicen que el paciente mide 170 pies— y por
 * eso su único nivel posible es `IMPOSIBLE`.
 */
export type ClaveVital =
  | 'presion' | 'pulso' | 'respiracion' | 'temperatura' | 'oxigeno' | 'dolor'
  | 'altura' | 'peso';

export interface Umbral {
  /** Fuera de esto es un error de carga, no un hallazgo clínico. */
  posible: [number, number];
  /** `[bajo, alto]` — por fuera es CRITICO. `null` en el extremo que no aplica. */
  critico: [number | null, number | null];
  /** `[bajo, alto]` — por fuera es ATENCION (dentro de lo crítico manda crítico). */
  atencion: [number | null, number | null];
}

/**
 * Los números.
 *
 * Presión y temperatura salen de ACC/AHA 2017 y de la definición de fiebre
 * (≥100.4 °F / 38 °C). El resto son los rangos de adulto de uso corriente. Si
 * la clínica los cambia, se cambian ACÁ y las cuatro pantallas se enteran.
 *
 * `atencion` incluye el extremo BAJO donde tiene sentido: una sistólica de 85 o
 * una temperatura de 94 °F no son "normales" solo porque el pedido hablaba de
 * valores altos.
 */
export const UMBRALES: Record<Exclude<ClaveVital, 'presion' | 'dolor'>, Umbral> & {
  sistolica: Umbral; diastolica: Umbral; dolor: Umbral;
} = {
  sistolica:    { posible: [40, 300],  critico: [90, 180],   atencion: [100, 130] },
  diastolica:   { posible: [20, 200],  critico: [50, 120],   atencion: [60, 90] },
  pulso:        { posible: [20, 250],  critico: [45, 130],   atencion: [51, 100] },
  respiracion:  { posible: [4, 60],    critico: [8, 28],     atencion: [12, 20] },
  temperatura:  { posible: [80, 115],  critico: [95, 103],   atencion: [97, 100.4] },
  oxigeno:      { posible: [50, 100],  critico: [90, null],  atencion: [94, null] },
  /** El dolor es auto-reportado y no tiene rojo: ya se pintaba ámbar desde 7 en
   *  Mi Día y se respeta ese corte para no cambiarle el significado a nadie. */
  dolor:        { posible: [0, 10],    critico: [null, null], atencion: [null, 7] },
  /*
   * Altura y peso: SOLO `posible`. Sin crítico ni atención a propósito — no son
   * un hallazgo clínico y pintarlos de ámbar por ser altos o bajos sería opinar
   * sobre el cuerpo del paciente.
   *
   * Los extremos están anchos para que no moleste a nadie real: un recién
   * nacido mide ~50 cm y pesa ~3 kg, y la persona más alta registrada llegó a
   * 272 cm. Lo que atajan es el dedo resbalado —170 escrito en la casilla de
   * pies da 5.374 cm— no el caso raro.
   */
  altura:       { posible: [30, 280],  critico: [null, null], atencion: [null, null] },
  peso:         { posible: [0.3, 500], critico: [null, null], atencion: [null, null] },
};

export interface Hallazgo {
  clave: ClaveVital;
  nivel: NivelVital;
  /** El valor tal como se muestra: `186/104`, `38.9`, `88`. */
  texto: string;
  /** Qué umbral se cruzó, para decirlo al lado del valor: `≥180/120`. */
  limite: string | null;
  /** `1` o `2` — cuál de las dos tomas. Un pico ya resuelto no es un pico. */
  toma: 1 | 2;
}

function nivelDe(v: number, u: Umbral): NivelVital {
  if (v < u.posible[0] || v > u.posible[1]) return 'IMPOSIBLE';
  if (u.critico[0] !== null && v < u.critico[0]) return 'CRITICO';
  if (u.critico[1] !== null && v >= u.critico[1]) return 'CRITICO';
  if (u.atencion[0] !== null && v < u.atencion[0]) return 'ATENCION';
  if (u.atencion[1] !== null && v >= u.atencion[1]) return 'ATENCION';
  return 'NORMAL';
}

/** El extremo que se cruzó, en texto. `null` si no se cruzó ninguno. */
function limiteDe(v: number, u: Umbral, unidad = ''): string | null {
  if (v < u.posible[0] || v > u.posible[1]) return null;
  if (u.critico[0] !== null && v < u.critico[0]) return `<${u.critico[0]}${unidad}`;
  if (u.critico[1] !== null && v >= u.critico[1]) return `≥${u.critico[1]}${unidad}`;
  if (u.atencion[0] !== null && v < u.atencion[0]) return `<${u.atencion[0]}${unidad}`;
  if (u.atencion[1] !== null && v >= u.atencion[1]) return `≥${u.atencion[1]}${unidad}`;
  return null;
}

export interface VitalesLeidos {
  /**
   * Opcionales para no romper a los que ya llaman con los seis clínicos. Se
   * mandan en cm y kg porque ese es el valor real que se guarda: el par de
   * pies/pulgadas se deriva de acá, no al revés.
   */
  heightCm?: number | null;
  weightKg?: number | null;
  systolicMmhg: number | null;
  diastolicMmhg: number | null;
  pulseBpm: number | null;
  respiratoryRate: number | null;
  tempFahrenheit: number | null;
  o2Saturation: number | null;
  painScale: number | null;
  systolicMmhg2?: number | null;
  diastolicMmhg2?: number | null;
  pulseBpm2?: number | null;
  respiratoryRate2?: number | null;
  tempFahrenheit2?: number | null;
}

/** Años cumplidos, o `null` sin fecha de nacimiento. */
export function edadEnAnios(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const hoy = new Date();
  let a = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) a--;
  return a;
}

/** Desde acá valen los umbrales de adulto. */
export const EDAD_ADULTO = 18;

/**
 * Todo lo que está fuera de rango, lo peor primero.
 *
 * `edad` es obligatoria y puede ser `null`: sin fecha de nacimiento NO se
 * inventa que es adulto. Se devuelve `PEDIATRICO` —"no evaluado"— igual que con
 * un menor, porque el riesgo de callarse es el mismo.
 */
export function hallazgosVitales(
  v: VitalesLeidos,
  edad: number | null,
): Hallazgo[] {
  const esAdulto = edad !== null && edad >= EDAD_ADULTO;

  /* La presión se evalúa como PAR y se reporta como uno: el doctor lee
     "186/104", no dos hallazgos separados que hay que volver a juntar. */
  const presion = (s: number | null, d: number | null, toma: 1 | 2): Hallazgo | null => {
    if (s === null && d === null) return null;
    const ns = s !== null ? nivelDe(s, UMBRALES.sistolica)  : 'NORMAL';
    const nd = d !== null ? nivelDe(d, UMBRALES.diastolica) : 'NORMAL';
    const nivel = ORDEN[ns] >= ORDEN[nd] ? ns : nd;
    if (nivel === 'NORMAL') return null;
    const limite = ORDEN[ns] >= ORDEN[nd]
      ? (s !== null ? limiteDe(s, UMBRALES.sistolica)  : null)
      : (d !== null ? limiteDe(d, UMBRALES.diastolica) : null);
    return {
      clave: 'presion', nivel, toma, limite,
      texto: `${s ?? '—'}/${d ?? '—'}`,
    };
  };

  const simple = (
    clave: ClaveVital, valor: number | null, u: Umbral, toma: 1 | 2, unidad = '',
  ): Hallazgo | null => {
    if (valor === null) return null;
    const nivel = nivelDe(valor, u);
    if (nivel === 'NORMAL') return null;
    return { clave, nivel, toma, texto: `${valor}${unidad}`, limite: limiteDe(valor, u, unidad) };
  };

  const crudos: (Hallazgo | null)[] = [
    presion(v.systolicMmhg, v.diastolicMmhg, 1),
    presion(v.systolicMmhg2 ?? null, v.diastolicMmhg2 ?? null, 2),
    simple('pulso',       v.pulseBpm,              UMBRALES.pulso,       1),
    simple('pulso',       v.pulseBpm2 ?? null,     UMBRALES.pulso,       2),
    simple('respiracion', v.respiratoryRate,       UMBRALES.respiracion, 1),
    simple('respiracion', v.respiratoryRate2 ?? null, UMBRALES.respiracion, 2),
    simple('temperatura', v.tempFahrenheit,        UMBRALES.temperatura, 1, '°F'),
    simple('temperatura', v.tempFahrenheit2 ?? null, UMBRALES.temperatura, 2, '°F'),
    simple('oxigeno',     v.o2Saturation,          UMBRALES.oxigeno,     1, '%'),
    simple('dolor',       v.painScale,             UMBRALES.dolor,       1, '/10'),
    /* Altura y peso no tienen 2ª toma: no se vuelven a medir en la misma visita. */
    simple('altura',      v.heightCm ?? null,      UMBRALES.altura,      1, ' cm'),
    simple('peso',        v.weightKg ?? null,      UMBRALES.peso,        1, ' kg'),
  ];

  return crudos
    .filter((h): h is Hallazgo => h !== null)
    /* Un `IMPOSIBLE` se reporta igual —es un dato a corregir— pero en un menor
       lo clínico no se evalúa: el número sigue estando mal escrito. */
    .map((h) => (esAdulto || h.nivel === 'IMPOSIBLE' ? h : { ...h, nivel: 'PEDIATRICO' as NivelVital }))
    .filter((h) => h.nivel !== 'NORMAL' && h.nivel !== 'PEDIATRICO')
    .sort((a, b) => ORDEN[b.nivel] - ORDEN[a.nivel]);
}

/** El nivel más grave de una lista — el que decide el color del resumen. */
export function peorNivel(hs: Hallazgo[]): NivelVital {
  return hs.reduce<NivelVital>((peor, h) => (ORDEN[h.nivel] > ORDEN[peor] ? h.nivel : peor), 'NORMAL');
}

/**
 * ¿Hay vitales cargados pero no se pueden evaluar? (menor de edad, o sin fecha
 * de nacimiento). Es lo que la pantalla necesita para DECIRLO en vez de mostrar
 * los números sin marca y parecer que está todo bien.
 */
export function sinEvaluar(v: VitalesLeidos, edad: number | null): boolean {
  const hayAlgo = v.systolicMmhg !== null || v.pulseBpm !== null
    || v.respiratoryRate !== null || v.tempFahrenheit !== null || v.o2Saturation !== null;
  return hayAlgo && !(edad !== null && edad >= EDAD_ADULTO);
}

/** Clases de Tailwind por nivel — una sola tabla para las cuatro pantallas. */
export const TONO_NIVEL: Record<NivelVital, { chip: string; texto: string }> = {
  CRITICO:    { chip: 'bg-rose/15 border border-rose/40 text-rose',      texto: 'text-rose font-bold' },
  IMPOSIBLE:  { chip: 'bg-amber/10 border border-amber/30 text-amber',   texto: 'text-amber font-semibold' },
  ATENCION:   { chip: 'bg-amber/10 border border-amber/30 text-amber',   texto: 'text-amber font-semibold' },
  PEDIATRICO: { chip: 'bg-white/[0.04] border border-border text-text-muted', texto: 'text-text-2' },
  NORMAL:     { chip: '', texto: 'text-text-2' },
};
