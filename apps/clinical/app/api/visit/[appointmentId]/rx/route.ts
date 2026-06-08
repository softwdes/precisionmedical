/**
 * GET  /api/visit/[appointmentId]/rx
 * POST /api/visit/[appointmentId]/rx
 *
 * B.19 — Prescripciones electrónicas.
 * Phase 1A: almacena en tabla local `prescriptions`.
 * Phase 2: integración real con API DAW/EPCS.
 *
 * Status:
 *   - Non-controlled → SENT (inmediato, sin DAW)
 *   - Controlled (II-V) → PENDING_DAW (guarda localmente, espera DAW)
 *
 * Usa $queryRaw/$executeRaw porque prescriptions se agregó en
 * migration 20260608040000 — regenerar prisma client cuando sea posible.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ appointmentId: string }> };

interface RawRx {
  id:                  string;
  appointment_id:      string;
  visit_note_id:       string | null;
  drug_name:           string;
  drug_generic:        string | null;
  dea_schedule:        string | null;
  dose:                string;
  frequency:           string;
  duration_str:        string;
  quantity_total:      number;
  refills:             number;
  clinical_indication: string;
  pharmacy_name:       string | null;
  pharmacy_address:    string | null;
  prescriber_name:     string | null;
  prescriber_dea:      string | null;
  status:              string;
  daw_rx_id:           string | null;
  daw_sent_at:         Date | null;
  created_at:          Date;
}

function toRx(r: RawRx) {
  return {
    id:                 r.id,
    appointmentId:      r.appointment_id,
    visitNoteId:        r.visit_note_id,
    drugName:           r.drug_name,
    drugGeneric:        r.drug_generic,
    deaSchedule:        r.dea_schedule,
    dose:               r.dose,
    frequency:          r.frequency,
    durationStr:        r.duration_str,
    quantityTotal:      r.quantity_total,
    refills:            r.refills,
    clinicalIndication: r.clinical_indication,
    pharmacyName:       r.pharmacy_name,
    pharmacyAddress:    r.pharmacy_address,
    prescriberName:     r.prescriber_name,
    prescriberDea:      r.prescriber_dea,
    status:             r.status,
    dawRxId:            r.daw_rx_id,
    dawSentAt:          r.daw_sent_at,
    createdAt:          r.created_at,
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;

  const appt = await db.appointment.findUnique({
    where:  { id: appointmentId },
    select: { id: true },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const rows = await db.$queryRaw<RawRx[]>`
    SELECT id, appointment_id, visit_note_id, drug_name, drug_generic, dea_schedule,
           dose, frequency, duration_str, quantity_total, refills, clinical_indication,
           pharmacy_name, pharmacy_address, prescriber_name, prescriber_dea,
           status, daw_rx_id, daw_sent_at, created_at
    FROM   prescriptions
    WHERE  appointment_id = ${appointmentId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ ok: true, prescriptions: rows.map(toRx) });
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const body = await req.json() as {
    drugName:           string;
    drugGeneric?:       string;
    deaSchedule?:       string | null;
    dose:               string;
    frequency:          string;
    durationStr:        string;
    quantityTotal:      number;
    refills:            number;
    clinicalIndication: string;
    pharmacyName?:      string;
    pharmacyAddress?:   string;
    prescriberName?:    string;
    prescriberDea?:     string;
    visitNoteId?:       string;
  };

  if (!body.drugName || !body.dose || !body.frequency ||
      !body.durationStr || !body.clinicalIndication) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const appt = await db.appointment.findUnique({
    where:  { id: appointmentId },
    select: { id: true, visitNote: { select: { id: true } } },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const visitNoteId = body.visitNoteId ?? appt.visitNote?.id ?? null;

  // Determine status: controlled → PENDING_DAW, non-controlled → SENT
  const isControlled = !!body.deaSchedule;
  const status       = isControlled ? 'PENDING_DAW' : 'SENT';

  await db.$executeRaw`
    INSERT INTO prescriptions
      (id, appointment_id, visit_note_id, drug_name, drug_generic, dea_schedule,
       dose, frequency, duration_str, quantity_total, refills, clinical_indication,
       pharmacy_name, pharmacy_address, prescriber_name, prescriber_dea, status)
    VALUES (
      gen_random_uuid()::text,
      ${appointmentId},
      ${visitNoteId},
      ${body.drugName},
      ${body.drugGeneric ?? null},
      ${body.deaSchedule ?? null},
      ${body.dose},
      ${body.frequency},
      ${body.durationStr},
      ${body.quantityTotal},
      ${body.refills},
      ${body.clinicalIndication},
      ${body.pharmacyName ?? null},
      ${body.pharmacyAddress ?? null},
      ${body.prescriberName ?? null},
      ${body.prescriberDea  ?? null},
      ${status}::rx_status
    )
  `;

  const [row] = await db.$queryRaw<RawRx[]>`
    SELECT id, appointment_id, visit_note_id, drug_name, drug_generic, dea_schedule,
           dose, frequency, duration_str, quantity_total, refills, clinical_indication,
           pharmacy_name, pharmacy_address, prescriber_name, prescriber_dea,
           status, daw_rx_id, daw_sent_at, created_at
    FROM   prescriptions
    WHERE  appointment_id = ${appointmentId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'CREATE_PRESCRIPTION',
    entityType:  'appointment',
    entityId:    appointmentId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata: {
      rxId:      row.id,
      drugName:  body.drugName,
      schedule:  body.deaSchedule ?? null,
      status,
    },
  });

  return NextResponse.json({ ok: true, prescription: toRx(row) }, { status: 201 });
}
