/**
 * GET  /api/visit/[appointmentId]/lab
 * POST /api/visit/[appointmentId]/lab
 *
 * B.20 — Órdenes de laboratorio / imaging.
 * GET:  Retorna todas las órdenes para este appointment.
 * POST: Crea una nueva orden.
 *
 * Usa $queryRaw/$executeRaw porque lab_orders se agregó
 * en migration 20260608030000 — regenerar prisma client cuando sea posible.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ appointmentId: string }> };

interface RawLabOrder {
  id:                  string;
  appointment_id:      string;
  visit_note_id:       string | null;
  order_type:          string;
  study_name:          string;
  loinc_code:          string | null;
  clinical_indication: string;
  urgency:             string;
  preferred_center:    string | null;
  icd10_codes:         string[];
  status:              string;
  ordered_at:          Date;
  ordered_by_name:     string | null;
  created_at:          Date;
}

function toLabOrder(r: RawLabOrder) {
  return {
    id:                 r.id,
    appointmentId:      r.appointment_id,
    visitNoteId:        r.visit_note_id,
    orderType:          r.order_type,
    studyName:          r.study_name,
    loincCode:          r.loinc_code,
    clinicalIndication: r.clinical_indication,
    urgency:            r.urgency,
    preferredCenter:    r.preferred_center,
    icd10Codes:         r.icd10_codes,
    status:             r.status,
    orderedAt:          r.ordered_at,
    orderedByName:      r.ordered_by_name,
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

  const rows = await db.$queryRaw<RawLabOrder[]>`
    SELECT id, appointment_id, visit_note_id, order_type, study_name, loinc_code,
           clinical_indication, urgency, preferred_center, icd10_codes,
           status, ordered_at, ordered_by_name, created_at
    FROM   lab_orders
    WHERE  appointment_id = ${appointmentId}
    ORDER BY ordered_at DESC
  `;

  return NextResponse.json({ ok: true, orders: rows.map(toLabOrder) });
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const body = await req.json() as {
    orderType:          string;
    studyName:          string;
    loincCode?:         string;
    clinicalIndication: string;
    urgency?:           string;
    preferredCenter?:   string;
    icd10Codes?:        string[];
    orderedByName?:     string;
    visitNoteId?:       string;
  };

  if (!body.orderType || !body.studyName || !body.clinicalIndication) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const appt = await db.appointment.findUnique({
    where:  { id: appointmentId },
    select: { id: true, visitNote: { select: { id: true } } },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const visitNoteId = body.visitNoteId ?? appt.visitNote?.id ?? null;
  const urgency      = body.urgency ?? 'ROUTINE';
  const icd10Codes   = body.icd10Codes ?? [];

  // Insert new order
  await db.$executeRaw`
    INSERT INTO lab_orders
      (id, appointment_id, visit_note_id, order_type, study_name, loinc_code,
       clinical_indication, urgency, preferred_center, icd10_codes,
       status, ordered_at, ordered_by_name)
    VALUES (
      gen_random_uuid()::text,
      ${appointmentId},
      ${visitNoteId},
      ${body.orderType}::lab_order_type,
      ${body.studyName},
      ${body.loincCode ?? null},
      ${body.clinicalIndication},
      ${urgency}::lab_order_urgency,
      ${body.preferredCenter ?? null},
      ${icd10Codes}::text[],
      'ORDERED'::lab_order_status,
      now(),
      ${body.orderedByName ?? null}
    )
  `;

  // Return the new order
  const [row] = await db.$queryRaw<RawLabOrder[]>`
    SELECT id, appointment_id, visit_note_id, order_type, study_name, loinc_code,
           clinical_indication, urgency, preferred_center, icd10_codes,
           status, ordered_at, ordered_by_name, created_at
    FROM   lab_orders
    WHERE  appointment_id = ${appointmentId}
    ORDER BY ordered_at DESC
    LIMIT  1
  `;

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId ?? undefined,
    action:      'CREATE_LAB_ORDER',
    entityType:  'appointment',
    entityId:    appointmentId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    {
      orderId:   row.id,
      orderType: body.orderType,
      studyName: body.studyName,
      urgency,
    },
  });

  return NextResponse.json({ ok: true, order: toLabOrder(row) }, { status: 201 });
}
