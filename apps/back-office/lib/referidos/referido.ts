/**
 * Referido desde el portal legal · el contrato del formulario.
 *
 * Es lo que el abogado llena en "¿Tenés un referido?" y lo que después precarga
 * el wizard de nuevo caso en la clínica. Puro (zod + tipos) para que lo importen
 * las dos puntas: el diálogo del portal valida antes de mandar, la ruta valida
 * lo que llega, y `patients-client` lo lee para armar el `initialState`.
 *
 * Qué se le pide y qué NO (Erick, 2026-09-07):
 *  · Cliente: nombre, apellido y teléfono obligatorios; email, fecha de
 *    nacimiento e idioma opcionales. Si es menor, el wizard pide el tutor.
 *  · Accidente: fecha obligatoria; ciudad, estado, lugar y descripción.
 *  · Seguro: opcional y plegado — el abogado que lo sabe lo llena. Va como
 *    texto: "State Farm" escrito a mano no siempre coincide con el catálogo, y
 *    un seguro mal casado es peor que ninguno. La recepcionista lo elige con el
 *    dato a la vista.
 *  · Nota libre y "necesita cita esta semana" (→ URGENT).
 *  · NO se pide el case manager del bufete (Erick, 2026-09-08): quien manda ES
 *    la firma, y su ficha ya está en Externals con teléfono y correo.
 *  · Nada de dirección, SSN ni tutor: eso lo completa la clínica con el paciente.
 */

import { z } from 'zod';

const texto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) => texto(max).optional().or(z.literal('').transform(() => undefined));

export const ReferidoSchema = z.object({
  cliente: z.object({
    firstName: texto(100).min(1),
    lastName:  texto(100).min(1),
    phone:     texto(30).min(7),
    email:     z.string().trim().email().optional().or(z.literal('').transform(() => undefined)),
    /** YYYY-MM-DD */
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
    language:  z.enum(['es', 'en']).default('en'),
  }),
  accidente: z.object({
    /** YYYY-MM-DD */
    date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    city:        opcional(80),
    state:       opcional(2),
    place:       opcional(200),
    description: opcional(2000),
  }),
  seguro: z.object({
    carrier:        opcional(120),
    policyNumber:   opcional(60),
    claimNumber:    opcional(60),
    adjusterName:   opcional(120),
    adjusterPhone:  opcional(30),
    thirdPartyCarrier: opcional(120),
  }).optional(),
  notes: opcional(2000),
  /** El cliente tiene dolor o el bufete necesita la primera cita esta semana. */
  urgente: z.boolean().default(false),
});

export type ReferidoPayload = z.infer<typeof ReferidoSchema>;

export type ReferidoStatus = 'PENDING' | 'CREATED' | 'DISCARDED';

/** Lo que el wizard necesita del referido, además del payload. */
export interface ReferidoParaWizard {
  id: string;
  status: ReferidoStatus;
  payload: ReferidoPayload;
  firm: { id: string; label: string; subtitle?: string };
  attorney: { id: string; label: string; subtitle?: string } | null;
  caseCode: string | null;
  convertedByName: string | null;
}

/**
 * Ciudad + estado + lugar en UN texto, que es lo que tiene el wizard
 * (`accidentLocation` es un campo solo). "Salt Lake City, UT · I-15 y 600 S".
 */
export function lugarDelAccidente(a: ReferidoPayload['accidente']): string {
  const ciudadEstado = [a.city, a.state].filter(Boolean).join(', ');
  return [ciudadEstado, a.place].filter(Boolean).join(' · ');
}

/**
 * Lo que el abogado sabe del seguro, como bloque de texto para las notas del
 * caso. Se precarga en `accidentNotes` para que la recepcionista lo tenga
 * delante al elegir la aseguradora del catálogo; puede borrarlo o dejarlo.
 */
export function notasDelReferido(p: ReferidoPayload, etiquetas: {
  seguro: string; poliza: string; reclamo: string; ajustador: string; tercero: string;
  notaDelBufete: string;
}): string {
  const lineas: string[] = [];
  if (p.accidente.description) lineas.push(p.accidente.description);
  const s = p.seguro;
  if (s && (s.carrier || s.policyNumber || s.claimNumber || s.adjusterName || s.thirdPartyCarrier)) {
    const partes = [
      s.carrier ? `${etiquetas.seguro}: ${s.carrier}` : null,
      s.policyNumber ? `${etiquetas.poliza}: ${s.policyNumber}` : null,
      s.claimNumber ? `${etiquetas.reclamo}: ${s.claimNumber}` : null,
      s.adjusterName ? `${etiquetas.ajustador}: ${s.adjusterName}${s.adjusterPhone ? ` (${s.adjusterPhone})` : ''}` : null,
      s.thirdPartyCarrier ? `${etiquetas.tercero}: ${s.thirdPartyCarrier}` : null,
    ].filter(Boolean);
    lineas.push(partes.join(' · '));
  }
  if (p.notes) lineas.push(`${etiquetas.notaDelBufete}: ${p.notes}`);
  return lineas.join('\n');
}
