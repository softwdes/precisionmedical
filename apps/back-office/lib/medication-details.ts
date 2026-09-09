import { db } from '@precision-medical/database';

/**
 * Le pega a cada medicamento del historial los datos de la receta que lo generó.
 *
 * El historial del paciente (`Patient.medicalHistory.medications`) guarda lo
 * mínimo —nombre, estado, quién lo receta y el `dawRxId`—, mientras que la dosis,
 * las indicaciones, la cantidad, la farmacia y el estado del envío viven en la
 * tabla `prescriptions`. El provider veía "Lisinopril · Activo" y nada más, con
 * todo el detalle guardado a un join de distancia (pedido del provider vía
 * Erick, 2026-09-09).
 *
 * `dawRxId` es la llave: la escribe la sincronización de ScriptSure en cada
 * entrada que sale de una receta electrónica. Las entradas cargadas a mano no lo
 * tienen y quedan como están — su detalle lo escribe la MA en el formulario.
 *
 * Se resuelve en el servidor, junto con el resto del contexto del paciente: la
 * lista ya llega armada y la pantalla no dispara otra vuelta.
 */

/** Un guion es como el mapeo de ScriptSure marca "no vino el dato". No es texto. */
const SIN_DATO = '—';
const limpio = (v: string | null | undefined): string | null =>
  v && v.trim() && v.trim() !== SIN_DATO ? v.trim() : null;

/**
 * Parte el `frequency` de ScriptSure en cantidad e indicaciones.
 *
 * Su campo NO es el sig limpio: viene con la presentación y la cantidad
 * pegadas adelante. Medido en las 24 recetas reales de la base (2026-09-09):
 *
 *   `10 mg tablet -  90 Tablet -  Take 1 tablet by mouth daily`
 *
 * Mostrarlo crudo repetía tres veces lo mismo en la fila (presentación arriba,
 * otra vez en el sig, y la cantidad al pie) — que es justo el defecto del
 * sistema que reemplazamos.
 *
 * De acá sale además la cantidad LEGIBLE. La columna `quantityQualifier` guarda
 * el código NCI de la unidad (`C48542` = Tablet, `C28254` = Milliliter): no hay
 * tabla para traducirlo y "90 C48542" no es una cantidad. El texto que ellos ya
 * arman sí lo es.
 *
 * Si el formato no coincide, se devuelve el campo entero como indicaciones: es
 * preferible mostrar de más que perder el sig por un separador distinto.
 */
function partirSig(
  dose: string | null,
  frequency: string | null,
  quantityTotal: number,
): { sig: string | null; quantity: string | null } {
  const cantidadNumerica = quantityTotal > 0 ? String(quantityTotal) : null;
  if (!frequency) return { sig: null, quantity: cantidadNumerica };

  const partes = frequency.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (partes.length >= 3 && dose && partes[0] === dose.trim()) {
    return {
      sig: partes.slice(2).join(' - ') || null,
      quantity: partes[1] || cantidadNumerica,
    };
  }
  return { sig: frequency, quantity: cantidadNumerica };
}

export interface MedicationRxDetail {
  /** Presentación tal como la da ScriptSure ("10 mg tablet"). */
  dose: string | null;
  /** Solo las indicaciones ("Take 1 tablet by mouth daily") — ver `partirSig`. */
  sig: string | null;
  /** Cantidad legible ("90 Tablet"), no el código NCI — ver `partirSig`. */
  quantity: string | null;
  refills: number | null;
  pharmacyName: string | null;
  prescriberName: string | null;
  /** ISO. Cuándo se envió a la farmacia. */
  sentAt: string | null;
  /** `SENT` · `ERROR` · `PENDING_DAW` · `VOIDED` · `DRAFT` */
  rxStatus: string;
  /** Lista controlada (II-V) cuando aplica. */
  deaSchedule: string | null;
}

/** Lo que guarda el JSON del historial, más el detalle cuando se pudo resolver. */
export interface MedicationConDetalle {
  id?: string;
  name: string;
  status: string;
  dose?: string;
  instructions?: string;
  /** Cantidad de las entradas cargadas a mano — texto libre ("30 tabletas"). */
  quantity?: string;
  prescribedBy?: string;
  externalPrescriber?: boolean;
  dawRxId?: string;
  /** Datos de la receta electrónica. Ausente en lo cargado a mano. */
  rx?: MedicationRxDetail;
}

type EntradaCruda = Record<string, unknown>;

/**
 * Entra `unknown[]` a propósito: la lista viene de un JSON sin esquema y hay
 * llamadores que ya la tienen tipada de otra forma. Se valida acá adentro —
 * cualquier entrada sin `name` se descarta en vez de romper la pantalla.
 */
export async function conDetalleDeReceta(
  patientId: string,
  medications: readonly unknown[] | undefined | null,
): Promise<MedicationConDetalle[]> {
  const entradas = (medications ?? []).filter(
    (m): m is EntradaCruda => !!m && typeof m === 'object' && typeof (m as EntradaCruda).name === 'string',
  );
  if (entradas.length === 0) return [];

  const base = entradas.map((m) => ({
    ...(typeof m.id === 'string' ? { id: m.id } : {}),
    name: m.name as string,
    status: typeof m.status === 'string' ? m.status : 'IN_USE',
    ...(typeof m.dose === 'string' ? { dose: m.dose } : {}),
    ...(typeof m.instructions === 'string' ? { instructions: m.instructions } : {}),
    ...(typeof m.quantity === 'string' ? { quantity: m.quantity } : {}),
    ...(typeof m.prescribedBy === 'string' ? { prescribedBy: m.prescribedBy } : {}),
    ...(typeof m.externalPrescriber === 'boolean' ? { externalPrescriber: m.externalPrescriber } : {}),
    ...(typeof m.dawRxId === 'string' ? { dawRxId: m.dawRxId } : {}),
  }));

  const rxIds = [...new Set(base.map((m) => m.dawRxId).filter((v): v is string => !!v))];
  if (rxIds.length === 0) return base;

  /**
   * Acotado al paciente por la cita, no solo por `dawRxId`. El id viene de un
   * JSON que se edita desde varias pantallas; si alguna vez queda uno mal
   * copiado, el peor caso tiene que ser "no encuentro el detalle", nunca
   * "muestro la receta de otro paciente".
   */
  const filas = await db.prescription.findMany({
    where: { dawRxId: { in: rxIds }, appointment: { patientId } },
    select: {
      // `quantityQualifier` NO se trae: guarda el código NCI de la unidad
      // (`C48542`), que no sirve para mostrar. La cantidad legible sale de
      // `frequency` — ver `partirSig`.
      dawRxId: true, dose: true, frequency: true, quantityTotal: true,
      refills: true, pharmacyName: true,
      prescriberName: true, dawSentAt: true, status: true, deaSchedule: true,
    },
  });

  const porRxId = new Map<string, MedicationRxDetail>();
  for (const f of filas) {
    if (!f.dawRxId) continue;
    const dose = limpio(f.dose);
    const { sig, quantity } = partirSig(dose, limpio(f.frequency), f.quantityTotal);
    porRxId.set(f.dawRxId, {
      dose,
      sig,
      quantity,
      refills: f.refills,
      pharmacyName: limpio(f.pharmacyName),
      prescriberName: limpio(f.prescriberName),
      sentAt: f.dawSentAt ? f.dawSentAt.toISOString() : null,
      rxStatus: f.status,
      deaSchedule: limpio(f.deaSchedule),
    });
  }

  return base.map((m) => {
    const rx = m.dawRxId ? porRxId.get(m.dawRxId) : undefined;
    return rx ? { ...m, rx } : m;
  });
}
