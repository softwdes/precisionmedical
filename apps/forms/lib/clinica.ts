/**
 * Datos de contacto de la clínica que ve el paciente.
 *
 * El teléfono estaba escrito a mano en cuatro lugares de esta app —dos veces por
 * botón, el número visible y el `href` del `tel:` por separado— en tres pantallas
 * distintas: la portada, el enlace inválido y la confirmación final. Basta con
 * que alguien actualice el texto y se olvide del `href` para que el botón siga
 * marcando un número que ya no es de la clínica, sin que nada se vea roto.
 *
 * ⚠️ Esto es la línea que se le PUBLICA al paciente. No confundirla con
 * `TWILIO_PHONE_NUMBER`, que es el número desde el que sale el sistema de
 * llamadas del back-office. Si algún día son el mismo, la llamada del paciente
 * entra por `/api/twilio/incoming` — que hace sonar solo a los agentes con el
 * back-office abierto y corta sin buzón si no hay ninguno. Publicar un número
 * así en la pantalla que le dice "llámenos si le surge algo" es una decisión de
 * producto, no un detalle: hoy no está confirmado cuál de los dos es.
 */

/** Como se muestra en pantalla. */
export const TEL_CLINICA = '(801) 375-2207';

/** Para el `href="tel:"` — E.164, sin espacios ni paréntesis. */
export const TEL_CLINICA_E164 = '+18013752207';

/**
 * Props para que un `tel:` se comporte bien en los dos mundos.
 *
 * En el celular el enlace abre el discador y listo. En una computadora **no hace
 * nada** —así nace el reporte de "le hago clic y no pasa nada"—, así que ahí el
 * único trabajo útil es que el número se pueda seleccionar y copiar. Hacen falta
 * las dos cosas juntas:
 *
 *  · `userSelect: 'text'` porque un enlace no se selecciona por defecto.
 *  · `draggable: false` porque los navegadores hacen arrastrables los enlaces:
 *    arrastrar para marcar el número movía el enlace en lugar de seleccionar.
 *    Sin esto lo anterior queda a medias — se puede con doble clic, pero no
 *    arrastrando, que es como lo intenta cualquiera.
 */
export const TEL_SELECCIONABLE = {
  draggable: false,
  style: { userSelect: 'text', WebkitUserSelect: 'text' },
} as const;
