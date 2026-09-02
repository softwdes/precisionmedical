/**
 * El resumen que se guarda como nota interna al dar de alta un caso desde una
 * llamada — "Llamada inicial · 3m 12s / Tipo de caso: … / Cita agendada: …".
 *
 * Estaba armado a mano dentro de `api/admin/cases/route.ts`, en español duro, y
 * con dos problemas que reportó un tester el 2026-09-01:
 *
 * ── 1. Imprimía bufete y PIP en casos que no son MVA ────────────────────────
 *
 * El diálogo de alta solo MUESTRA la sección legal y de seguro cuando el tipo es
 * MVA, pero manda el payload igual y `lawyerStatus` arranca en `'HAS'` por
 * default. Así, un caso GENERAL terminaba con la línea "Bufete: sin asignar" —
 * que no es un dato faltante, es una afirmación falsa: dice que el paciente
 * tiene abogado y que falta cargar la firma. Y "Seguro PIP: pendiente" en un GM
 * es un pendiente inexistente, porque PIP es cobertura de seguro de AUTO.
 *
 * Que esos dos conceptos son exclusivos de MVA ya lo dice el código en otro
 * lado: en la firma del lien, `requiresLien = caseType === 'MVA'`.
 *
 * Medido antes del arreglo: de 239 notas de llamada inicial, **142 estaban en
 * casos no-MVA y las 142 llevaban las dos líneas**. GENERAL es además el tipo
 * mayoritario (1.858 contra 1.137 MVA), así que el ruido caía en el camino más
 * transitado.
 *
 * ── 2. Salía en español con la pantalla en inglés ───────────────────────────
 *
 * El back-office arranca en `en` (ver `i18n/request.ts`) y el contenido de la
 * nota estaba escrito en español a secas, así que el tester leía "INTERNAL
 * NOTES / Add note / Private" en inglés y el cuerpo en español.
 *
 * **Se escribe en el idioma de quien da el alta**, resuelto de la cookie
 * `locale` en el servidor y no pedido al cliente — mismo criterio que el idioma
 * del SMS del portal: un caller nuevo que se olvide de mandarlo no puede
 * reintroducir el bug.
 *
 * No se guarda estructurado para renderizarlo traducido después, y es a
 * propósito: `case_notes` no tiene columna JSON, agregarla es DDL sobre la base
 * de producción, y además haría que la nota automática se comportara distinto de
 * todas las notas humanas que están al lado — que son texto en el idioma en el
 * que las escribió su autor. Una nota es un registro de lo que se dijo en un
 * momento, no una vista. Las 239 notas viejas se quedan como están: reescribir
 * un registro histórico es peor que tenerlo en otro idioma.
 */

import esMessages from '@precision-medical/i18n/messages/es';
import enMessages from '@precision-medical/i18n/messages/en';
import { fechaHora } from './fechas';

export type Idioma = 'es' | 'en';

export type CaseType = 'MVA' | 'GENERAL' | 'WORKERS_COMP' | 'NURSING_HOME';

/**
 * ¿Este tipo de caso tiene bufete y PIP?
 *
 * Se exporta porque hay DOS consumidores: esta nota y el aviso que se le cuelga
 * a la cita ("Edson debe contactar para asignar bufete"). Tenerlo en un solo
 * predicado es lo que evita que uno se arregle y el otro no — el aviso de la
 * cita se había disparado en 8 citas de casos GENERAL.
 */
export function llevaBufeteYPip(caseType: CaseType): boolean {
  return caseType === 'MVA';
}

export interface DatosLlamadaInicial {
  caseType: CaseType;
  /** Valor del enum `source` — se traduce con `patients.referralSources`. */
  source: string;
  callDurationSeconds?: number | null;
  legal: {
    lawyerStatus?: 'HAS' | 'SEEKING' | 'DECLINED' | null;
    lawFirmId?: string | null;
    caseManagerName?: string | null;
  };
  insurance: { primaryInsuranceId?: string | null };
  appointment?: { scheduledFor: string } | null;
  /**
   * `undefined` = no se definió · `null` = tablet en clínica al llegar ·
   * objeto = se envió por los canales marcados. Los tres estados son distintos
   * y la nota los distingue, igual que antes.
   */
  formDelivery?: { sendEmail: boolean; sendSms: boolean } | null;
}

const T = {
  es: {
    llamada:        'Llamada inicial',
    desconocido:    'desconocido',
    tipoDeCaso:     'Tipo de caso',
    referidoPor:    'Referido por',
    bufeteAsignado: 'Bufete: asignado',
    bufeteSin:      'Bufete: sin asignar',
    cm:             'CM',
    busca:          '🔍 Paciente busca abogado · Edson revisar',
    sinAbogado:     '⚠ Sin abogado · cash o seguro propio',
    pipCapturado:   'Seguro PIP: capturado',
    pipPendiente:   'Seguro PIP: pendiente',
    citaAgendada:   'Cita agendada',
    citaPendiente:  'Cita: pendiente de agendar',
    formEmailSms:   'Formulario enviado por email y SMS',
    formEmail:      'Formulario enviado por email',
    formSms:        'Formulario enviado por SMS',
    formTablet:     'Formulario: tablet en clínica al llegar',
    formSinDefinir: 'Formulario: sin definir',
    tipos: {
      MVA: 'Accidente de tránsito (MVA)', GENERAL: 'Medicina general',
      WORKERS_COMP: 'Accidente laboral', NURSING_HOME: 'Hogar de ancianos',
    } as Record<CaseType, string>,
  },
  en: {
    llamada:        'Initial call',
    desconocido:    'unknown',
    tipoDeCaso:     'Case type',
    referidoPor:    'Referred by',
    bufeteAsignado: 'Law firm: assigned',
    bufeteSin:      'Law firm: not assigned',
    cm:             'CM',
    busca:          '🔍 Patient is looking for an attorney · Edson to review',
    sinAbogado:     '⚠ No attorney · cash or own insurance',
    pipCapturado:   'PIP insurance: captured',
    pipPendiente:   'PIP insurance: pending',
    citaAgendada:   'Appointment scheduled',
    citaPendiente:  'Appointment: not scheduled yet',
    formEmailSms:   'Form sent by email and SMS',
    formEmail:      'Form sent by email',
    formSms:        'Form sent by SMS',
    formTablet:     'Form: clinic tablet on arrival',
    formSinDefinir: 'Form: not set',
    tipos: {
      MVA: 'Motor vehicle accident (MVA)', GENERAL: 'General medicine',
      WORKERS_COMP: 'Workers comp', NURSING_HOME: 'Nursing home',
    } as Record<CaseType, string>,
  },
} as const;

/** Etiqueta del origen — reusa el catálogo que ya usan las pantallas. */
function etiquetaDeOrigen(source: string, lang: Idioma): string {
  const cat = (lang === 'en' ? enMessages : esMessages) as {
    patients?: { referralSources?: Record<string, string> };
  };
  // Si aparece un valor de enum sin traducir, se muestra crudo antes que vacío:
  // "OTHER" es fea pero legible; una línea en blanco esconde el dato.
  return cat.patients?.referralSources?.[source] ?? source;
}

function duracion(segundos: number | null | undefined, lang: Idioma): string {
  if (!segundos) return T[lang].desconocido;
  return `${Math.floor(segundos / 60)}m ${segundos % 60}s`;
}

/** Línea del estado legal, o `null` si este caso no lleva bufete. */
function lineaLegal(d: DatosLlamadaInicial, lang: Idioma): string | null {
  if (!llevaBufeteYPip(d.caseType)) return null;
  const t = T[lang];
  switch (d.legal.lawyerStatus) {
    case 'HAS':
      return (d.legal.lawFirmId ? t.bufeteAsignado : t.bufeteSin)
        + (d.legal.caseManagerName ? ` · ${t.cm}: ${d.legal.caseManagerName}` : '');
    case 'SEEKING':  return t.busca;
    case 'DECLINED': return t.sinAbogado;
    // Sin dato: no se inventa ninguna de las tres. Antes el default `'HAS'` del
    // esquema hacía que "no se preguntó" se viera igual que "sí tiene abogado".
    default: return null;
  }
}

function lineaFormulario(d: DatosLlamadaInicial, lang: Idioma): string {
  const t = T[lang];
  if (d.formDelivery === null)      return t.formTablet;
  if (d.formDelivery === undefined) return t.formSinDefinir;
  const { sendEmail, sendSms } = d.formDelivery;
  if (sendEmail && sendSms) return t.formEmailSms;
  if (sendEmail)            return t.formEmail;
  if (sendSms)              return t.formSms;
  return t.formSinDefinir;
}

export function construirNotaLlamadaInicial(
  d: DatosLlamadaInicial,
  lang: Idioma,
): string {
  const t = T[lang];

  return [
    `${t.llamada} · ${duracion(d.callDurationSeconds, lang)}`,
    `${t.tipoDeCaso}: ${t.tipos[d.caseType] ?? d.caseType}`,
    `${t.referidoPor}: ${etiquetaDeOrigen(d.source, lang)}`,
    lineaLegal(d, lang),
    // PIP solo en MVA — en un caso general no hay cobertura de auto que capturar.
    llevaBufeteYPip(d.caseType)
      ? (d.insurance.primaryInsuranceId ? t.pipCapturado : t.pipPendiente)
      : null,
    /**
     * La hora va en la zona de la CLÍNICA, con el helper del proyecto.
     *
     * Antes era un `toLocaleString` sin `timeZone`, así que tomaba la zona del
     * proceso: en local salía bien y en Vercel —que corre en UTC— una cita de
     * las 3 PM de Utah quedaba escrita como 9:00 PM. Y como la nota es texto
     * guardado, el error se congelaba ahí para siempre.
     */
    d.appointment
      ? `${t.citaAgendada}: ${fechaHora(d.appointment.scheduledFor, lang === 'en' ? 'en-US' : 'es-US')}`
      : t.citaPendiente,
    lineaFormulario(d, lang),
  ].filter(Boolean).join('\n');
}
