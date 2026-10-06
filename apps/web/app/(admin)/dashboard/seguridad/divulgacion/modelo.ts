/**
 * Qué cuenta como divulgación, y la forma de los datos. SIN importaciones de
 * servidor — la pantalla importa de acá.
 *
 * (Es la misma separación que hubo que hacer en el Centro de Seguridad: cuando
 * las constantes vivían junto a la consulta, el componente `use client` se
 * arrastraba el `server-only` y el Admin no compilaba. `tsc` no lo ve.)
 */

/**
 * Las acciones que significan "alguien vio algo que no es suyo".
 *
 * Salen de medir el registro real de Phoenix el 2026-10-06, no de imaginarlas:
 * son las únicas de lectura que la clínica escribe hoy. Lo que NO está acá
 * —crear, actualizar, subir— es trabajo, no divulgación.
 *
 *   PATIENTS_VIEWED_OTHER_CHART    19   abrir la ficha de un paciente ajeno
 *   VIEW_PATIENT_PHOTO             53   ver la foto de identidad
 *   VIEW_PATIENT_COLLECTIONS      107   ver el estado de cobranza
 *   DOCTOR_VIEW_AS                 15   entrar "como" un médico
 *   ATTORNEY_VIEW_AS                8   entrar "como" un abogado
 *   MESSAGING_VIEWED_OTHER_INBOX    4   abrir la bandeja de otra persona
 *   VIEW_LAB_RESULT                 4   abrir un resultado de laboratorio
 *   VIEW_MESSAGE_ATTACHMENT         4   abrir un adjunto de un mensaje
 *
 * ⚠️ Si se agrega una acción de lectura nueva en la clínica, hay que agregarla
 * ACÁ o no aparece: esta lista es la definición, no un filtro de conveniencia.
 * Y tres de ellas (`PATIENTS_VIEWED_OTHER_CHART`, `VIEW_PATIENT_PHOTO`,
 * `VIEW_PATIENT_COLLECTIONS`) todavía NO están en `ACTION_FAMILY` de
 * `packages/database`, así que las métricas por empleado no las cuentan como
 * acceso. Es un hueco aparte, anotado el 2026-10-06.
 */
export const ACCIONES_DIVULGACION = [
  'PATIENTS_VIEWED_OTHER_CHART',
  'VIEW_PATIENT_PHOTO',
  'VIEW_PATIENT_COLLECTIONS',
  'DOCTOR_VIEW_AS',
  'ATTORNEY_VIEW_AS',
  'MESSAGING_VIEWED_OTHER_INBOX',
  'VIEW_LAB_RESULT',
  'VIEW_MESSAGE_ATTACHMENT',
] as const;

export interface Divulgacion {
  accion: string;
  cuando: string;
  /** Quién miró. */
  quien: string;
  rol: string | null;
  /** A quién o qué miró. */
  sobre: string;
  /** Si lo mirado es un paciente — cambia qué tan sensible es la fila. */
  esPaciente: boolean;
  ip: string | null;
}

export interface DatosDivulgacion {
  eventos: Divulgacion[];
  desde: string;
  hasta: string;
  /** Falso cuando no se pudo leer: la pantalla lo dice en vez de mostrar cero. */
  ok: boolean;
}
