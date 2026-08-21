import { z } from 'zod';

/**
 * Validación del historial médico del paciente.
 *
 * `updateMedicalHistory` hacía `{ ...current, ...patch }` y lo escribía en el
 * JSON sin mirar nada: ni tipos, ni largos, ni fechas. Entraba texto de 200
 * caracteres pegado de cualquier lado y fechas como `1212-12-12` — el navegador
 * considera válido el año 1212 en un `type="date"`, así que el cliente tampoco
 * lo frenaba. En un campo de diagnóstico eso no es cosmético.
 *
 * PERO validar el patch completo dejaba registros trabados. Medido sobre los 17
 * pacientes con historial: 5 filas ya guardadas no cumplen (un nombre de 179
 * caracteres, fechas `1212-12-12`, `1234-12-12` y una futura). Como cada guardado
 * manda la sección ENTERA, una fila vieja hacía fallar todo el guardado — y el
 * usuario quedaba sin poder corregirla desde la pantalla.
 *
 * Por eso se valida lo que se ESTÁ ESCRIBIENDO: las filas nuevas o modificadas
 * tienen que cumplir; las que nadie tocó pasan tal cual. Si editás una fila
 * vieja mala, ahí sí se le exige el formato — que es cuando corresponde.
 */

/** Texto corto de un campo de formulario (nombre, dosis, relación). */
const corto = z.string().trim().max(120);
/** Texto libre de una nota o descripción. */
const largo = z.string().trim().max(2000);

/**
 * Fecha clínica en `YYYY-MM-DD`.
 *
 * 1900 descarta los años tecleados de más (1212), y el tope de hoy vale para lo
 * que YA pasó: un diagnóstico o una cirugía no pueden ser del futuro.
 */
const fechaClinica = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'fechaFormato')
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return false;
    return d.getUTCFullYear() >= 1900 && d.getTime() <= Date.now() + 24 * 60 * 60 * 1000;
  }, 'fechaRango');

/**
 * `YYYY` o `YYYY-MM-DD`, para lo que se recuerda a medias.
 *
 * Una cirugía de 2011 se recuerda por el año, no por el día — el formulario lo
 * dice: el campo se llama "Año" y sugiere "ej., 2018". Pero validaba con
 * `fechaClinica`, así que escribir 2018 moría con "la fecha debe ser
 * YYYY-MM-DD": el campo era imposible de completar como estaba pedido.
 *
 * Se acepta la fecha completa además del año porque las filas que ya existen
 * (intake y migración) la traen así, y porque cuando el dato se sabe exacto no
 * hay razón para perderlo.
 */
const anioOFecha = z.union([
  z.string().trim().regex(/^\d{4}$/).refine((v) => {
    const n = Number(v);
    return n >= 1900 && n <= new Date().getFullYear();
  }, 'anioRango'),
  fechaClinica,
]);

/** Estado de consumo (tabaco, alcohol, drogas). Vacío = sin registrar. */
const consumo = z.enum(['NEVER', 'FORMER', 'CURRENT']);

/** Año suelto (colonoscopía) — mismo criterio. */
const anio = z.string().trim().regex(/^\d{4}$/).refine((v) => {
  const n = Number(v);
  return n >= 1900 && n <= new Date().getFullYear();
}, 'anioRango');

const condicion = z.object({
  id: z.string(),
  condition: corto,
  diagnosedAt: fechaClinica.optional(),
  status: corto.optional(),
  comments: largo.optional(),
});

const medicamento = z.object({
  id: z.string(),
  name: corto,
  status: z.enum(['IN_USE', 'HISTORY']),
  dose: corto.optional(),
  instructions: largo.optional(),
  quantity: z.number().nonnegative().max(10_000).optional(),
  unit: corto.optional(),
  refills: corto.optional(),
  startDate: fechaClinica.optional(),
  autoExpire: z.boolean().optional(),
  autoRenew: z.boolean().optional(),
  prescribedBy: corto.optional(),
  diagnosisCode: corto.optional(),
  diagnosisLabel: corto.optional(),
  pharmacy: corto.optional(),
  pharmacyNote: largo.optional(),
  externalPrescriber: z.boolean().optional(),
});

/**
 * Cómo se valida cada sección.
 *
 *  · `fila`  — arreglo de objetos con `id`: se valida fila por fila, y solo las
 *              que cambiaron respecto de lo guardado.
 *  · `valor` — el resto (objetos de campos, arreglos de strings): se valida
 *              completo, pero solo si cambió.
 */
const SECCIONES = {
  visitInfo: { valor: z.object({
    referredBy: largo.optional(), mainReason: largo.optional(), otherConcerns: largo.optional(),
    noCurrentMeds: z.boolean().optional(), broughtMedList: z.boolean().optional(),
    noSignificantHistory: z.boolean().optional(),
  }).strict() },
  healthInfo: { valor: z.object({
    goals: largo.optional(),
    // 1–10: la escala que muestra el formulario
    selfRating: z.number().int().min(1).max(10).nullable().optional(),
  }).strict() },
  allergies: { valor: largo },
  problems: { fila: condicion, max: 200 },
  history: { fila: condicion, max: 200 },
  medications: { fila: medicamento, max: 300 },
  surgeries: { fila: z.object({
    id: z.string(), procedure: corto, date: anioOFecha.optional(), notes: largo.optional(),
  }), max: 200 },
  familyHistory: { fila: z.object({
    id: z.string(), relation: corto, condition: corto,
  }), max: 200 },
  providers: { fila: z.object({
    id: z.string(), name: corto, specialty: corto.optional(), notes: largo.optional(),
  }), max: 100 },
  vaccines: { valor: z.array(corto).max(100) },
  cognitiveStatus: { valor: z.array(z.object({ name: corto, status: corto })).max(100) },
  functionalStatus: { valor: z.array(z.object({ name: corto, status: corto })).max(100) },
  implantedDevices: { valor: z.array(corto).max(100) },
  systemsReview: { valor: z.array(corto).max(200) },
  healthExams: { valor: z.object({
    bloodTestDate: fechaClinica.optional(), normalResults: z.boolean().optional(),
    colonoscopyYear: anio.optional(), abnormal: z.boolean().optional(),
  }).strict() },
  /**
   * El consumo va como VOCABULARIO, no texto libre.
   *
   * La pantalla ya lo trataba como estado (pinta el alcohol como píldora de
   * color), y una píldora con "2 copas los findes" adentro no comunica nada. Con
   * el enum el dato es comparable y el color significa algo.
   *
   * Se puede apretar así sin migración porque la sección estaba VACÍA para todos
   * los pacientes: nada la escribía —ni el intake, ni la migración, ni una API—,
   * el único camino de entrada era un lápiz que nunca se conectó.
   *
   * `work` y `children` siguen libres: son texto por naturaleza.
   */
  socialHistory: { valor: z.object({
    work: largo.optional(), children: largo.optional(),
    tobacco: consumo.optional(), alcohol: consumo.optional(), drugs: consumo.optional(),
  }).strict() },
  comments: { fila: z.object({
    id: z.string(), date: z.string(), text: largo, author: corto.optional(),
  }), max: 500 },
} as const;

type Seccion = keyof typeof SECCIONES;

const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Códigos de fallo. El cliente los traduce; el path interno del esquema NO viaja
 * al usuario.
 *
 * Antes el error era `${seccion}.${path}: ${mensaje}` y se mostraba tal cual en
 * un toast: "surgeries.date: la fecha debe ser YYYY-MM-DD". Un path de Zod, en
 * español, con la interfaz en inglés, y filtrando nombres de columnas. Los
 * mensajes de los validadores propios son ahora estos códigos (ver
 * `fechaClinica`), así que `issue.message` ES el código.
 */
export type CodigoValidacion =
  | 'fechaFormato' | 'fechaRango' | 'anioRango'
  | 'muyLargo' | 'valorInvalido'
  | 'seccionDesconocida' | 'listaEsperada' | 'demasiadas';

const CODIGOS_PROPIOS = new Set<string>(['fechaFormato', 'fechaRango', 'anioRango']);

/** Traduce un issue de Zod a uno de nuestros códigos. */
function codigoDeIssue(i: z.ZodIssue): CodigoValidacion {
  if (CODIGOS_PROPIOS.has(i.message)) return i.message as CodigoValidacion;
  if (i.code === 'too_big') return 'muyLargo';
  return 'valorInvalido';
}

export type ResultadoValidacion =
  | { ok: true; data: Record<string, unknown> }
  /**
   * `donde` y `max` son para el log del servidor y para que el llamador pueda
   * dar contexto — NO para mostrarle el path al usuario.
   */
  | { ok: false; code: CodigoValidacion; donde: string; max?: number };

/**
 * Valida el patch contra lo ya guardado y devuelve lo que se puede escribir.
 *
 * Solo revisa lo que cambió: una fila vieja que no cumple pasa mientras nadie
 * la toque, y en el momento en que se edita se le exige el formato.
 */
export function validarHistorial(
  actual: Record<string, unknown>,
  patch: Record<string, unknown>,
): ResultadoValidacion {
  const salida: Record<string, unknown> = {};

  for (const [clave, valorNuevo] of Object.entries(patch)) {
    if (!(clave in SECCIONES)) {
      // Una sección inventada entraría al JSON y quedaría ahí para siempre sin
      // que nadie la lea. Mejor rechazar que acumular basura invisible.
      return { ok: false, code: 'seccionDesconocida', donde: clave };
    }
    const def = SECCIONES[clave as Seccion] as { fila?: z.ZodTypeAny; valor?: z.ZodTypeAny; max?: number };
    const valorActual = actual[clave];

    if (igual(valorActual, valorNuevo)) { salida[clave] = valorNuevo; continue; }

    if (def.fila) {
      if (!Array.isArray(valorNuevo)) return { ok: false, code: 'listaEsperada', donde: clave };
      if (def.max && valorNuevo.length > def.max) {
        return { ok: false, code: 'demasiadas', donde: clave, max: def.max };
      }
      const previas = new Map<string, unknown>();
      for (const it of (Array.isArray(valorActual) ? valorActual : [])) {
        const id = (it as { id?: string })?.id;
        if (id) previas.set(id, it);
      }
      const filas: unknown[] = [];
      for (const fila of valorNuevo) {
        const id = (fila as { id?: string })?.id;
        // Fila intacta: se guarda como está aunque no cumpla. Es dato viejo, y
        // rechazarlo trabaría toda la sección.
        if (id && previas.has(id) && igual(previas.get(id), fila)) { filas.push(fila); continue; }
        const r = def.fila.safeParse(fila);
        if (!r.success) {
          const i = r.error.issues[0];
          return { ok: false, code: codigoDeIssue(i), donde: `${clave}.${i.path.join('.')}` };
        }
        filas.push(r.data);
      }
      salida[clave] = filas;
      continue;
    }

    const r = def.valor!.safeParse(valorNuevo);
    if (!r.success) {
      const i = r.error.issues[0];
      return {
        ok: false,
        code: codigoDeIssue(i),
        donde: i.path.length ? `${clave}.${i.path.join('.')}` : clave,
      };
    }
    salida[clave] = r.data;
  }

  return { ok: true, data: salida };
}

/** Largos que el cliente replica en `maxLength` — un solo lugar para los dos. */
export const LARGO_CORTO = 120;
export const LARGO_LARGO = 2000;
