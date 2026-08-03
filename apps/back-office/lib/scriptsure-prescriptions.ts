import { db, writeAuditLog } from '@precision-medical/database';

/**
 * Mapeo y persistencia de recetas de ScriptSure — compartido por las DOS vías
 * de entrada, para que no divergan:
 *
 *  1. Webhook (`/api/scriptsure/webhook`) — DAW nos avisa cuando el doctor
 *     envía la receta. Es la vía definitiva, requiere registro con ellos.
 *  2. Sync on-demand (`/api/admin/scriptsure/sync/[appointmentId]`) — al cerrar
 *     el widget consultamos su drug history y traemos lo que se envió. Sirve
 *     mientras el webhook no está registrado, y como red de seguridad si un
 *     webhook se pierde.
 *
 * El mapeo es deliberadamente tolerante con los nombres de campo: la forma
 * exacta del payload de ScriptSure todavía no se vio con datos reales (su
 * staging estaba vacío al construir esto), así que se aceptan varios alias y
 * el crudo queda siempre en el audit log para ajustar sin perder nada.
 */

/** Primer valor no vacío entre varios nombres candidatos. */
export function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function asStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return undefined;
}

export interface MappedRx {
  drugName: string;
  dawRxId?: string;
  doctorId?: string;
  deaSchedule: string | null;
  dose: string;
  frequency: string;
  durationStr: string;
  quantityTotal: number;
  refills: number;
  clinicalIndication: string;
  pharmacyName: string | null;
  pharmacyAddress: string | null;
  voided: boolean;
  writtenAt: Date | null;
}

/**
 * Normaliza un objeto de receta de ScriptSure. Devuelve null si el payload no
 * parece una receta (otros tipos de webhook, entidades distintas, etc).
 */
export function mapRawRx(raw: Record<string, unknown>, outerStatus?: string): MappedRx | null {
  const rx = (raw.prescription ?? raw.rx ?? raw.data ?? raw) as Record<string, unknown>;

  const drugName = asStr(pick(rx, 'drugName', 'drugDescription', 'medicationName', 'description', 'name'));
  if (!drugName) return null;

  const statusRaw = (
    asStr(pick(rx, 'messageType', 'status', 'messageStatus', 'event', 'prescriptionStatus')) ??
    outerStatus ?? ''
  ).toLowerCase();

  const written = asStr(pick(rx, 'writtenDate', 'written_date', 'createdAt', 'dateWritten'));
  const writtenAt = written ? new Date(written) : null;

  const sig = asStr(pick(rx, 'directions', 'sig', 'patientDirections', 'instructions'));
  const daysSupply = asStr(pick(rx, 'daysSupply', 'days_supply'));

  return {
    drugName,
    dawRxId: asStr(pick(rx, 'rxId', 'prescriptionId', 'messageId', 'id')),
    doctorId: asStr(pick(rx, 'doctorId', 'prescriberId', 'userId')),
    deaSchedule: asStr(pick(rx, 'deaSchedule', 'schedule')) ?? null,
    dose: asStr(pick(rx, 'dose', 'strength')) ?? '—',
    frequency: sig ?? '—',
    durationStr: daysSupply ? `${daysSupply} días` : '—',
    quantityTotal: Number(pick(rx, 'quantity', 'dispenseQuantity', 'quantityTotal') ?? 0) || 0,
    refills: Number(pick(rx, 'refill', 'refills', 'refillCount') ?? 0) || 0,
    clinicalIndication: asStr(pick(rx, 'clinicalIndication', 'indication')) ?? '',
    pharmacyName: asStr(pick(rx, 'pharmacyName', 'pharmacy', 'destination')) ?? null,
    pharmacyAddress: asStr(pick(rx, 'pharmacyAddress', 'pharmacyAddressLine1')) ?? null,
    voided: statusRaw.includes('void') || statusRaw.includes('cancel') || statusRaw.includes('error'),
    writtenAt: writtenAt && !Number.isNaN(writtenAt.getTime()) ? writtenAt : null,
  };
}

/** Entrada del historial de medicamentos (Patient.medicalHistory.medications). */
interface MedEntry {
  id: string;
  name: string;
  status: 'IN_USE' | 'HISTORY';
  prescribedBy?: string;
  /** false/ausente = lo prescribió esta clínica; true = lo refiere el paciente */
  externalPrescriber?: boolean;
  /** Vínculo con la receta electrónica — evita duplicar en reenvíos/re-syncs */
  dawRxId?: string;
}

/**
 * Refleja la receta en el historial de medicamentos: alta como Activo, o pasa a
 * Anterior si se anuló. Dedupe por `dawRxId` (o por nombre en las entradas
 * viejas que no lo tienen) para que re-sincronizar no duplique la lista.
 */
async function syncMedicationHistory(
  patientId: string,
  medicalHistory: unknown,
  rx: { drugName: string; dawRxId?: string; voided: boolean; prescriberName: string | null },
): Promise<void> {
  const mh = (medicalHistory ?? {}) as { medications?: MedEntry[] };
  const meds = [...(mh.medications ?? [])];

  const idx = meds.findIndex((m) =>
    (rx.dawRxId && m.dawRxId === rx.dawRxId) ||
    (!m.dawRxId && !m.externalPrescriber && m.name.toLowerCase() === rx.drugName.toLowerCase()),
  );

  const entry: MedEntry = {
    id: idx >= 0 ? meds[idx]!.id : crypto.randomUUID(),
    name: rx.drugName,
    status: rx.voided ? 'HISTORY' : 'IN_USE',
    externalPrescriber: false,
    ...(rx.prescriberName ? { prescribedBy: rx.prescriberName } : {}),
    ...(rx.dawRxId ? { dawRxId: rx.dawRxId } : {}),
  };

  if (idx >= 0) meds[idx] = entry;
  else meds.push(entry);

  await db.patient.update({
    where: { id: patientId },
    data: { medicalHistory: { ...mh, medications: meds } as object },
  });
}

/**
 * Guarda (o actualiza) la receta y la refleja en el historial de medicamentos.
 * Dedupe por `dawRxId`: el mismo rx puede llegar por webhook Y por sync, o
 * repetirse con otro estado — nunca se duplica.
 */
export async function persistPrescription(params: {
  appointmentId: string;
  visitNoteId: string | null;
  patientId: string;
  medicalHistory: unknown;
  prescriberName: string | null;
  mapped: MappedRx;
  source: 'WEBHOOK' | 'SYNC';
  ipAddress?: string;
}): Promise<{ id: string; created: boolean }> {
  const { mapped } = params;

  const existing = mapped.dawRxId
    ? await db.prescription.findFirst({ where: { dawRxId: mapped.dawRxId }, select: { id: true } })
    : null;

  const data = {
    drugName: mapped.drugName,
    deaSchedule: mapped.deaSchedule,
    dose: mapped.dose,
    frequency: mapped.frequency,
    durationStr: mapped.durationStr,
    quantityTotal: mapped.quantityTotal,
    refills: mapped.refills,
    clinicalIndication: mapped.clinicalIndication,
    pharmacyName: mapped.pharmacyName,
    pharmacyAddress: mapped.pharmacyAddress,
    prescriberName: params.prescriberName,
    status: (mapped.voided ? 'VOIDED' : 'SENT') as 'VOIDED' | 'SENT',
    dawRxId: mapped.dawRxId ?? null,
    dawSentAt: mapped.writtenAt ?? new Date(),
  };

  const saved = existing
    ? await db.prescription.update({ where: { id: existing.id }, data })
    : await db.prescription.create({
        data: { ...data, appointmentId: params.appointmentId, visitNoteId: params.visitNoteId },
      });

  await writeAuditLog(db, {
    actorType: 'SYSTEM',
    action: existing ? 'SCRIPTSURE_RX_UPDATED' : 'SCRIPTSURE_RX_RECEIVED',
    entityType: 'prescriptions',
    entityId: saved.id,
    ...(params.ipAddress ? { ipAddress: params.ipAddress } : {}),
    metadata: {
      source: params.source,
      dawRxId: mapped.dawRxId ?? null,
      drugName: mapped.drugName,
      status: data.status,
      appointmentId: params.appointmentId,
    },
  });

  // Reconciliación: lo recetado entra al historial de medicamentos. Sin esto el
  // doctor tendría que re-tipear lo que acaba de prescribir, y el panel de
  // contexto clínico (que lee el historial) no lo mostraría en la próxima visita.
  await syncMedicationHistory(params.patientId, params.medicalHistory, {
    drugName: mapped.drugName,
    ...(mapped.dawRxId ? { dawRxId: mapped.dawRxId } : {}),
    voided: mapped.voided,
    prescriberName: params.prescriberName,
  });

  return { id: saved.id, created: !existing };
}
