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

/**
 * `null` = el payload NO dijo nada del estado del envío.
 *
 * No es lo mismo que "enviada" y la diferencia es peligrosa: el historial de
 * medicamentos que devuelve ScriptSure (el que consume el sync) trae solo los
 * datos del fármaco, sin el estado del mensaje. Suponer `SENT` ahí convertía una
 * receta RECHAZADA por la farmacia en una receta "enviada" en la próxima
 * sincronización — ver el comentario del enum `RxStatus.ERROR` en el schema.
 */
export type MappedRxStatus = 'SENT' | 'VOIDED' | 'ERROR';

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
  /** `null` cuando el payload no informó estado — NO asumir "enviada". */
  status: MappedRxStatus | null;
  writtenAt: Date | null;
  /** Identificadores del fármaco — necesarios para repetir la receta */
  ndc: string | null;
  rxNorm: string | null;
  /** Tipo del código RxNorm (SCD, SBD…) — el mensaje a la farmacia lo exige */
  rxNormQualifier: string | null;
  routedMedId: string | null;
  gcnSeqno: string | null;
  scriptsureDrugId: string | null;
  /** Código NCPDP — ScriptSure resuelve la farmacia por acá, no por el nombre */
  pharmacyId: string | null;
  quantityQualifier: string | null;
  /**
   * El objeto del fármaco tal como vino, sin la receta anidada.
   *
   * Se guarda entero a propósito: su mensaje a la farmacia exige metadatos
   * (MED_NAME_TYPE_CD, MED_REF_*, la indicación estructurada) que no vale la
   * pena mapear uno por uno — al repetir se reenvía este objeto y listo.
   */
  drugPayload: Record<string, unknown> | null;
}

/**
 * Normaliza un objeto de receta de ScriptSure. Devuelve null si el payload no
 * parece una receta (otros tipos de webhook, entidades distintas, etc).
 */
export function mapRawRx(raw: Record<string, unknown>, outerStatus?: string): MappedRx | null {
  const rx = (raw.prescription ?? raw.rx ?? raw.data ?? raw) as Record<string, unknown>;

  const drugName = asStr(pick(rx, 'drugName', 'drugDescription', 'medicationName', 'description', 'name'));
  if (!drugName) return null;

  // ScriptSure anida los datos del envío en `Prescription` (y el estado además
  // en `Prescription.Message`). Verificado con el primer payload real
  // 2026-08-05: el estado NO viene en el nivel superior — leerlo solo ahí
  // mostraba como "enviada" una receta que había fallado.
  const nested = (rx.Prescription ?? rx.prescription ?? {}) as Record<string, unknown>;
  const nestedMsg = (nested.Message ?? {}) as Record<string, unknown>;

  const statusRaw = (
    asStr(pick(nested, 'messageStatus', 'messageType', 'status', 'prescriptionStatus')) ??
    asStr(pick(nestedMsg, 'messageStatus', 'status')) ??
    asStr(pick(rx, 'messageType', 'status', 'messageStatus', 'event', 'prescriptionStatus')) ??
    outerStatus ?? ''
  ).toLowerCase();

  // Anulada y con error NO son lo mismo: la primera es una decisión del doctor,
  // la segunda un envío que falló y hay que reintentar.
  //
  // Y si no vino NINGÚN estado, se devuelve `null`: antes caía en `SENT` por
  // default, y como el sync reescribe la fila cada vez que se cierra el widget
  // (188 actualizaciones sobre 25 recetas en la base de prueba), una receta
  // marcada ERROR volvía a "enviada" sola en la siguiente pasada. Encontrado el
  // 2026-08-18 sobre la Adderall que el doctor reportó: 19:47 SENT → 19:48 ERROR
  // → y la próxima sincronización la habría dado por enviada otra vez.
  const status: MappedRxStatus | null =
    !statusRaw ? null
    : statusRaw.includes('void') || statusRaw.includes('cancel') ? 'VOIDED'
    : statusRaw.includes('error') || statusRaw.includes('fail') || statusRaw.includes('reject') ? 'ERROR'
    : 'SENT';

  const written = asStr(pick(nested, 'writtenDate', 'fillDate')) ??
    asStr(pick(rx, 'writtenDate', 'written_date', 'createdAt', 'dateWritten'));
  const writtenAt = written ? new Date(written) : null;

  // Las indicaciones pueden venir en el sig, en el formato armado o sueltas
  const script = (nested.PrescriptionScript ?? {}) as Record<string, unknown>;
  const sig =
    asStr(pick(rx, 'directions', 'sig', 'patientDirections', 'instructions')) ??
    asStr(pick(script, 'drugFormat'));

  const daysSupply = asStr(pick(nested, 'duration', 'daysSupply')) ??
    asStr(pick(rx, 'daysSupply', 'days_supply', 'drugDuration'));

  return {
    drugName,
    // `prescriptionId` de ScriptSure es el identificador estable de la receta;
    // `messageId` cambia entre reenvíos del mismo rx.
    dawRxId:
      asStr(pick(rx, 'prescriptionId')) ??
      asStr(pick(nested, 'prescriptionId', 'messageId')) ??
      asStr(pick(rx, 'rxId', 'messageId', 'id')),
    doctorId: asStr(pick(nested, 'doctorId', 'userId')) ?? asStr(pick(rx, 'doctorId', 'prescriberId', 'userId')),
    deaSchedule: asStr(pick(rx, 'deaSchedule', 'schedule', 'MED_REF_DEA_CD')) ?? null,
    dose: asStr(pick(rx, 'dose', 'strength', 'line1')) ?? '—',
    frequency: sig ?? '—',
    durationStr: daysSupply ? `${daysSupply} días` : '—',
    quantityTotal: Number(pick(rx, 'quantity', 'dispenseQuantity', 'quantityTotal') ?? 0) || 0,
    refills: Number(pick(nested, 'refill') ?? pick(rx, 'refill', 'refills', 'refillCount') ?? 0) || 0,
    clinicalIndication: asStr(pick(rx, 'clinicalIndication', 'indication')) ?? '',
    pharmacyName: asStr(pick(nested, 'pharmacy')) ?? asStr(pick(rx, 'pharmacyName', 'pharmacy', 'destination')) ?? null,
    pharmacyAddress: asStr(pick(rx, 'pharmacyAddress', 'pharmacyAddressLine1')) ?? null,
    status,
    writtenAt: writtenAt && !Number.isNaN(writtenAt.getTime()) ? writtenAt : null,
    // Vienen en el nivel superior del item del historial (no dentro de
    // `Prescription`). Verificado con el payload real del 2026-08-05.
    ndc: asStr(pick(rx, 'Ndc', 'ndc')) ?? null,
    rxNorm: asStr(pick(rx, 'RxNorm', 'rxNorm', 'rxcui')) ?? null,
    rxNormQualifier: asStr(pick(rx, 'rxnormQualifier', 'rxNormQualifier')) ?? null,
    routedMedId: asStr(pick(rx, 'ROUTED_MED_ID', 'routedMedId')) ?? null,
    gcnSeqno: asStr(pick(rx, 'GCN_SEQNO', 'gcnSeqno')) ?? null,
    scriptsureDrugId: asStr(pick(rx, 'drugId')) ?? null,
    pharmacyId: asStr(pick(nested, 'pharmacyId')) ?? asStr(pick(rx, 'pharmacyId')) ?? null,
    quantityQualifier: asStr(pick(rx, 'quantityQualifier')) ?? null,
    // Todo el objeto menos la receta anidada: esa describe el envío anterior
    // (farmacia, fechas, estado), no el fármaco, y al repetir se arma de nuevo.
    drugPayload: (() => {
      const { Prescription: _p, prescription: _p2, ...drug } = rx;
      return Object.keys(drug).length > 0 ? drug : null;
    })(),
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
 *
 * Una receta CON ERROR tampoco cuenta como activa: el paciente no la tiene, la
 * farmacia nunca la recibió.
 */
async function syncMedicationHistory(
  patientId: string,
  medicalHistory: unknown,
  rx: { drugName: string; dawRxId?: string; status: MappedRxStatus | null; prescriberName: string | null },
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
    /**
     * Anulada o con error → Anterior. Todo lo demás → Activo, **incluido el
     * estado desconocido**: estas entradas salen del listado de medicación
     * ACTUAL que devuelve ScriptSure, así que esconderlas contradiría a la
     * fuente — y en el panel clínico es peor omitir un medicamento que el
     * paciente podría estar tomando (interacciones) que mostrarlo de más.
     * Lo que dejó de fingirse es el estado del ENVÍO, que es otra cosa.
     */
    status: rx.status === 'VOIDED' || rx.status === 'ERROR' ? 'HISTORY' : 'IN_USE',
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
    dawRxId: mapped.dawRxId ?? null,
    dawSentAt: mapped.writtenAt ?? new Date(),
    ndc: mapped.ndc,
    rxNorm: mapped.rxNorm,
    rxNormQualifier: mapped.rxNormQualifier,
    routedMedId: mapped.routedMedId,
    gcnSeqno: mapped.gcnSeqno,
    scriptsureDrugId: mapped.scriptsureDrugId,
    pharmacyId: mapped.pharmacyId,
    quantityQualifier: mapped.quantityQualifier,
    drugPayload: (mapped.drugPayload ?? undefined) as never,
  };

  /**
   * El estado se trata aparte del resto de los campos.
   *
   * Sin estado informado: en una fila que YA existe no se toca —lo último que
   * se supo sigue siendo la mejor información que tenemos— y en una nueva queda
   * `PENDING_DAW`, que es "todavía no sabemos", no "salió bien". El resto de los
   * campos sí se actualiza siempre: la droga, la farmacia y el sig son el mismo
   * dato y no dependen del envío.
   */
  const saved = existing
    ? await db.prescription.update({
        where: { id: existing.id },
        data: mapped.status ? { ...data, status: mapped.status } : data,
      })
    : await db.prescription.create({
        data: {
          ...data,
          status: mapped.status ?? 'PENDING_DAW',
          appointmentId: params.appointmentId,
          visitNoteId: params.visitNoteId,
        },
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
      status: mapped.status ?? (existing ? 'sin cambio (el payload no informó)' : 'PENDING_DAW'),
      appointmentId: params.appointmentId,
    },
  });

  // Reconciliación: lo recetado entra al historial de medicamentos. Sin esto el
  // doctor tendría que re-tipear lo que acaba de prescribir, y el panel de
  // contexto clínico (que lee el historial) no lo mostraría en la próxima visita.
  await syncMedicationHistory(params.patientId, params.medicalHistory, {
    drugName: mapped.drugName,
    ...(mapped.dawRxId ? { dawRxId: mapped.dawRxId } : {}),
    status: mapped.status,
    prescriberName: params.prescriberName,
  });

  return { id: saved.id, created: !existing };
}

// ─── Rechazo NCPDP de Surescripts ────────────────────────────────────────────

/**
 * El aviso de rechazo que manda Surescripts cuando la farmacia no acepta la
 * receta. Forma real, capturada del primer aviso que llegó (2026-08-19 20:01):
 *
 * ```
 * Message.Body.Error.Code            = "900"
 * Message.Body.Error.Description     = "The receiver is unable to accept
 *                                       messages sent using supported NCPDP schema"
 * Message.Header.RelatesToMessageID  = "E164FE38..."   (el NewRx original)
 * Message.Header.SentTime            = "2026-08-19T20:01:21.643Z"
 * ```
 *
 * No trae paciente ni medicamento: es un error de sobre, no de receta. Por eso
 * `mapRawRx` lo descartaba (no encuentra `drugName`) y el rechazo se perdía hasta
 * la próxima sincronización — que es exactamente lo que vio el doctor: la
 * pantalla decía "enviada" varios minutos después de que la farmacia la rechazara.
 */
export interface ErrorNcpdp {
  code: string;
  description: string;
  /** MessageID del NewRx original, en la mensajería de ELLOS (no es `dawRxId`). */
  relatesTo: string | null;
  sentTime: string | null;
}

export function leerErrorNcpdp(payload: Record<string, unknown>): ErrorNcpdp | null {
  const msg = (payload.Message ?? payload.message) as Record<string, unknown> | undefined;
  if (!msg) return null;
  const body = (msg.Body ?? msg.body) as Record<string, unknown> | undefined;
  const err = (body?.Error ?? body?.error) as Record<string, unknown> | undefined;
  if (!err) return null;

  const code = asStr(pick(err, 'Code', 'code'));
  const description = asStr(pick(err, 'Description', 'description'));
  if (!code && !description) return null;

  const header = (msg.Header ?? msg.header ?? {}) as Record<string, unknown>;
  return {
    code: code ?? '—',
    description: description ?? 'Surescripts rechazó el envío sin detalle',
    relatesTo: asStr(pick(header, 'RelatesToMessageID', 'relatesToMessageID')) ?? null,
    sentTime: asStr(pick(header, 'SentTime', 'sentTime')) ?? null,
  };
}

/** Ventana para atribuir el rechazo. El aviso llega segundos después del envío. */
const VENTANA_RECHAZO_MS = 15 * 60 * 1000;

export type ResultadoRechazo =
  | { tipo: 'no-es-error' }
  | { tipo: 'marcada'; prescriptionId: string; dawRxId: string | null; code: string }
  | { tipo: 'ambigua'; candidatas: number; code: string }
  | { tipo: 'sin-candidata'; code: string };

/**
 * Marca como rechazada la receta a la que corresponde el aviso.
 *
 * **La atribución es por TIEMPO y solo cuando no hay ambigüedad.** El aviso no
 * dice a qué receta pertenece —su `RelatesToMessageID` es de la mensajería de
 * ellos y nosotros nunca vemos ese id— así que se busca entre las recetas que
 * todavía figuran como enviadas o pendientes de los últimos 15 minutos:
 *
 *  · exactamente UNA → se marca con error;
 *  · varias → **no se adivina**: queda el rechazo en la auditoría y el estado
 *    real lo corrige la sincronización, que sí sabe cuál falló. Marcar la
 *    equivocada sería peor que esperar.
 *
 * Todo queda en el audit log con el código y el texto de Surescripts, atribuido
 * o no: es la única traza que explica por qué una receta cambió de estado sola.
 */
export async function marcarRechazoNcpdp(
  payload: Record<string, unknown>,
  sourceIp: string,
): Promise<ResultadoRechazo> {
  const err = leerErrorNcpdp(payload);
  if (!err) return { tipo: 'no-es-error' };

  const desde = new Date(Date.now() - VENTANA_RECHAZO_MS);
  const candidatas = await db.prescription.findMany({
    where: { status: { in: ['SENT', 'PENDING_DAW'] }, createdAt: { gte: desde } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, dawRxId: true, drugName: true, createdAt: true },
  });

  const comun = {
    actorType: 'SYSTEM' as const,
    entityType: 'prescriptions',
    ipAddress: sourceIp,
  };

  if (candidatas.length !== 1) {
    await writeAuditLog(db, {
      ...comun,
      action: 'SCRIPTSURE_RX_REJECTED',
      entityId: 'sin-atribuir',
      metadata: {
        code: err.code,
        description: err.description,
        relatesTo: err.relatesTo ?? '—',
        candidatas: String(candidatas.length),
        nota: candidatas.length === 0
          ? 'ninguna receta reciente en estado enviada/pendiente'
          : 'varias candidatas: no se adivina, lo corrige la sincronización',
      },
    }).catch(() => undefined);
    return candidatas.length === 0
      ? { tipo: 'sin-candidata', code: err.code }
      : { tipo: 'ambigua', candidatas: candidatas.length, code: err.code };
  }

  const rx = candidatas[0]!;
  await db.prescription.update({ where: { id: rx.id }, data: { status: 'ERROR' } });

  await writeAuditLog(db, {
    ...comun,
    action: 'SCRIPTSURE_RX_REJECTED',
    entityId: rx.id,
    metadata: {
      code: err.code,
      description: err.description,
      relatesTo: err.relatesTo ?? '—',
      drugName: rx.drugName,
      dawRxId: rx.dawRxId ?? '—',
      atribucion: 'unica receta reciente en enviada/pendiente',
    },
  }).catch(() => undefined);

  return { tipo: 'marcada', prescriptionId: rx.id, dawRxId: rx.dawRxId, code: err.code };
}
