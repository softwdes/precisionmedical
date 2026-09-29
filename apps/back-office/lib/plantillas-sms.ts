/**
 * Las plantillas de SMS que la clínica puede editar.
 *
 * Pedido de Erick (2026-09-28): que recepción pueda cambiar el texto de los
 * mensajes automáticos sin tocar código, en los dos idiomas.
 *
 * ── Cómo convive con el código que ya manda ─────────────────────────────────
 *
 * El texto por defecto SIGUE viviendo en `portal-message.ts`, en las funciones
 * que ya estaban. Acá abajo hay una copia de ese texto en forma de plantilla, y
 * una prueba verifica que las dos rindan **exactamente lo mismo** — si alguien
 * cambia una y no la otra, esa prueba se pone roja.
 *
 * Esa duplicación es deliberada y es lo que hace el cambio seguro: mientras
 * nadie edite nada, el SMS que sale es el que salía, por el mismo camino de
 * siempre. La plantilla solo entra en juego cuando existe una fila editada, y
 * "restaurar el original" es **borrar la fila**, no copiar un texto de vuelta.
 *
 * ── La sintaxis, y por qué tiene condicionales ──────────────────────────────
 *
 *   {fecha}              se reemplaza por el valor
 *   {?telefono}...{/telefono}   el bloque aparece SOLO si el valor no está vacío
 *
 * Sin los condicionales harían falta cuatro plantillas por mensaje, una por
 * combinación de campos presentes. Hoy mismo `Murray - Surgery` no tiene
 * dirección cargada: con una plantilla plana ese paciente recibiría
 * "oficina Murray - Surgery, ." con el hueco a la vista.
 *
 * ── El alfabeto ────────────────────────────────────────────────────────────
 *
 * Los textos van SIN ACENTOS. No es descuido: un solo acento pasa el SMS a
 * UCS-2 y el segmento cae de 153 a 67 caracteres, así que el mismo mensaje
 * puede pasar de 3 segmentos a 5 y cada uno se cobra. El editor lo muestra en
 * vivo (ver `lib/sms-segmentos.ts`), pero el default arranca limpio.
 */

export type LangPlantilla = 'es' | 'en';

/**
 * Las claves editables. El sufijo `_online` no es un capricho: una cita de
 * telemedicina cambia el mensaje ENTERO —sin dirección y sin hora de llegada—,
 * no una palabra, y meter las dos en una sola plantilla con condicionales daría
 * un texto que nadie puede leer para editarlo.
 */
export const CLAVES_PLANTILLA = [
  'cita_alta',
  'cita_alta_online',
  'cita_cambio',
  'cita_cambio_online',
] as const;

/**
 * ⚠️ El link del formulario NO es editable todavía, y no por falta de ganas.
 *
 * Su vista previa se arma EN EL NAVEGADOR (`send-portal-dialog.tsx`), que no
 * puede leer la base. Si el servidor usara el texto editado y la vista previa
 * siguiera armando el original, recepción vería un texto y al paciente le
 * llegaría otro.
 *
 * Eso ya pasó en ese mismo archivo y está documentado ahí: "antes era una
 * copia local que se desincronizo: mostraba el texto viejo mientras el
 * servidor ya mandaba el nuevo". Entra cuando la vista previa lea la
 * plantilla, no antes.
 */

export type ClavePlantilla = (typeof CLAVES_PLANTILLA)[number];

/** Las variables que cada plantilla puede usar. El editor las ofrece como piezas. */
export const VARIABLES: Record<ClavePlantilla, readonly string[]> = {
  cita_alta:          ['paciente', 'fecha', 'sede', 'direccion', 'horaLlegada', 'telefono'],
  cita_alta_online:   ['paciente', 'fecha', 'enlace', 'telefono'],
  cita_cambio:        ['paciente', 'fecha', 'fechaAnterior', 'sede', 'direccion', 'horaLlegada', 'telefono'],
  cita_cambio_online: ['paciente', 'fecha', 'fechaAnterior', 'enlace', 'telefono'],
};

/**
 * Las que NO pueden faltar. Si alguien borra la fecha de un aviso de cita, el
 * paciente recibe un mensaje sin fecha y nos enteramos por un no-show: se
 * rechaza al guardar, no al mandar.
 */
export const OBLIGATORIAS: Record<ClavePlantilla, readonly string[]> = {
  cita_alta:          ['fecha'],
  cita_alta_online:   ['fecha'],
  cita_cambio:        ['fecha'],
  cita_cambio_online: ['fecha'],
};

/**
 * El cierre legal. Va FUERA del editor y se pega solo.
 *
 * Lo exige el operador (A2P 10DLC). Si alguien lo borra, el carrier filtra los
 * mensajes y llegan como "no entregado" con el error 30007 — indistinguible de
 * "el paciente lo ignoró". No es una preferencia de redacción.
 */
export const CIERRE: Record<LangPlantilla, string> = {
  es: 'Mensaje automatico, no responda. HELP ayuda, STOP para salir.',
  en: 'Automated message, do not reply. HELP for help, STOP to opt out.',
};

/**
 * El texto original de cada plantilla, en las dos lenguas.
 *
 * ⚠️ Tiene que rendir IGUAL que la función de `portal-message.ts` que le
 * corresponde. La prueba lo verifica; si la tocás, corré la prueba.
 *
 * El cierre NO está acá: lo agrega `renderPlantilla`.
 */
export const DEFAULTS: Record<ClavePlantilla, Record<LangPlantilla, string>> = {
  cita_alta: {
    en: 'Precision Medical: {?paciente}Appointment for {paciente}{/paciente}{?!paciente}Your appointment is{/!paciente} {fecha}, {sede}{?direccion}, {direccion}{/direccion}. Arrive at {horaLlegada} for check-in; 15+ min late may be rescheduled.{?telefono} Questions: {telefono}.{/telefono}',
    es: 'Precision Medical: {?paciente}Cita de {paciente}{/paciente}{?!paciente}Su cita es{/!paciente} el {fecha}, {sede}{?direccion}, {direccion}{/direccion}. Llegue {horaLlegada} para el registro; 15+ min tarde puede reprogramarse.{?telefono} Consultas: {telefono}.{/telefono}',
  },
  cita_alta_online: {
    en: 'Precision Medical: {?paciente}Appointment for {paciente}{/paciente}{?!paciente}Your appointment{/!paciente} is a video visit on {fecha}. {?enlace}Join from: {enlace}{/enlace}{?!enlace}The clinic will contact you at that time.{/!enlace}{?telefono} Questions: {telefono}.{/telefono}',
    es: 'Precision Medical: {?paciente}Cita de {paciente}{/paciente}{?!paciente}Su cita es{/!paciente} por videollamada el {fecha}. {?enlace}Conectese desde: {enlace}{/enlace}{?!enlace}La clinica lo contactara a esta hora.{/!enlace}{?telefono} Consultas: {telefono}.{/telefono}',
  },
  cita_cambio: {
    en: 'Precision Medical: {?paciente}The appointment for {paciente}{/paciente}{?!paciente}Your appointment{/!paciente} CHANGED. It is now {fecha}, {sede}{?direccion}, {direccion}{/direccion}. Arrive at {horaLlegada} for check-in.{?fechaAnterior} This replaces the one on {fechaAnterior}.{/fechaAnterior}{?telefono} Questions: {telefono}.{/telefono}',
    es: 'Precision Medical: {?paciente}La cita de {paciente}{/paciente}{?!paciente}Su cita{/!paciente} CAMBIO de fecha. Ahora es el {fecha}, {sede}{?direccion}, {direccion}{/direccion}. Llegue {horaLlegada} para el registro.{?fechaAnterior} Reemplaza la del {fechaAnterior}.{/fechaAnterior}{?telefono} Consultas: {telefono}.{/telefono}',
  },
  cita_cambio_online: {
    en: 'Precision Medical: {?paciente}The appointment for {paciente}{/paciente}{?!paciente}Your appointment{/!paciente} CHANGED. It is now a video visit on {fecha}.{?fechaAnterior} This replaces the one on {fechaAnterior}.{/fechaAnterior} {?enlace}Join from: {enlace}{/enlace}{?!enlace}The clinic will contact you at that time.{/!enlace}{?telefono} Questions: {telefono}.{/telefono}',
    es: 'Precision Medical: {?paciente}La cita de {paciente}{/paciente}{?!paciente}Su cita{/!paciente} CAMBIO de fecha. Ahora es por videollamada el {fecha}.{?fechaAnterior} Reemplaza la del {fechaAnterior}.{/fechaAnterior} {?enlace}Conectese desde: {enlace}{/enlace}{?!enlace}La clinica lo contactara a esa hora.{/!enlace}{?telefono} Consultas: {telefono}.{/telefono}',
  },
};

/** El link del portal ya trae su propio HELP/STOP adentro: no se le pega otro. */
const SIN_CIERRE_AUTOMATICO = new Set<ClavePlantilla>([]);

/**
 * Reemplaza variables y resuelve los bloques condicionales.
 *
 * `{?x}...{/x}` aparece si `x` tiene valor; `{?!x}...{/!x}` si NO lo tiene.
 * Los condicionales se resuelven ANTES que las variables, para que una llave
 * que quedó dentro de un bloque descartado no se intente reemplazar.
 */
export function renderPlantilla(
  plantilla: string,
  valores: Record<string, string | null | undefined>,
): string {
  let salida = plantilla;

  // Negativos primero: `{?!x}` contiene `{?x}` como subcadena y resolverlos al
  // revés dejaría el `!` suelto en el texto.
  salida = salida.replace(/\{\?!(\w+)\}([\s\S]*?)\{\/!\1\}/g,
    (_, nombre: string, cuerpo: string) => (valores[nombre] ? '' : cuerpo));

  salida = salida.replace(/\{\?(\w+)\}([\s\S]*?)\{\/\1\}/g,
    (_, nombre: string, cuerpo: string) => (valores[nombre] ? cuerpo : ''));

  salida = salida.replace(/\{(\w+)\}/g, (_, nombre: string) => valores[nombre] ?? '');

  // Los huecos dejan espacios dobles: se normalizan para que el texto no delate
  // qué campo faltaba.
  return salida.replace(/[ \t]{2,}/g, ' ').trim();
}

/** El mensaje completo: la plantilla resuelta más el cierre legal. */
export function armarSms(args: {
  clave: ClavePlantilla;
  lang: LangPlantilla;
  /** El texto editado, si existe. Sin esto se usa el original. */
  editada?: string | null;
  valores: Record<string, string | null | undefined>;
}): string {
  const cuerpo = renderPlantilla(args.editada?.trim() || DEFAULTS[args.clave][args.lang], args.valores);
  if (SIN_CIERRE_AUTOMATICO.has(args.clave)) return cuerpo;
  return `${cuerpo} ${CIERRE[args.lang]}`;
}

/** Las variables obligatorias que le faltan a un texto. Vacío = se puede guardar. */
export function faltantes(clave: ClavePlantilla, texto: string): string[] {
  return OBLIGATORIAS[clave].filter((v) => !texto.includes(`{${v}}`));
}

/** Las variables que el texto usa y NO existen para esa plantilla. */
export function desconocidas(clave: ClavePlantilla, texto: string): string[] {
  const permitidas = new Set(VARIABLES[clave]);
  const usadas = [...texto.matchAll(/\{\??!?(\w+)\}/g)].map((m) => m[1] as string);
  return [...new Set(usadas.filter((v) => !permitidas.has(v)))];
}
