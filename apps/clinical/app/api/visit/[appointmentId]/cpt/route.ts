/**
 * GET  /api/visit/[appointmentId]/cpt
 * POST /api/visit/[appointmentId]/cpt
 *
 * B.21 — Servicios CPT asignados a la visita.
 * GET:  Retorna CPTs asignados al visitNote de este appointment.
 * POST: add | remove | update_fee
 *
 * Usa $queryRaw/$executeRaw porque visit_service_codes se agregó
 * en migration 20260608020000 — regenerar prisma client cuando sea posible.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ appointmentId: string }> };

// ─── Raw-query types ──────────────────────────────────────────────────────────
interface RawCpt {
  id: string;
  visit_note_id: string;
  service_code_id: string | null;
  cpt_code: string;
  description: string;
  fee_catalog: string;   // Decimal comes as string from pg driver
  fee_override: string | null;
  override_reason: string | null;
  modifier: string | null;
  units: number;
}

function toCpt(r: RawCpt) {
  return {
    id:             r.id,
    visitNoteId:    r.visit_note_id,
    serviceCodeId:  r.service_code_id,
    cptCode:        r.cpt_code,
    description:    r.description,
    feeCatalog:     Number(r.fee_catalog),
    feeOverride:    r.fee_override !== null ? Number(r.fee_override) : null,
    overrideReason: r.override_reason,
    modifier:       r.modifier,
    units:          r.units,
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;

  // Resolve visitNoteId from appointment
  const appt = await db.appointment.findUnique({
    where:  { id: appointmentId },
    select: { id: true, visitNote: { select: { id: true } } },
  });

  if (!appt)          return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!appt.visitNote) return NextResponse.json({ ok: true, cpts: [] });

  const visitNoteId = appt.visitNote.id;

  const rows = await db.$queryRaw<RawCpt[]>`
    SELECT id, visit_note_id, service_code_id, cpt_code, description,
           fee_catalog::text, fee_override::text, override_reason, modifier, units
    FROM   visit_service_codes
    WHERE  visit_note_id = ${visitNoteId}
    ORDER BY created_at ASC
  `;

  return NextResponse.json({ ok: true, cpts: rows.map(toCpt) });
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const body = await req.json() as {
    action: 'add' | 'remove' | 'update_fee';
    // add
    cptCode?:       string;
    description?:   string;
    feeCatalog?:    number;
    serviceCodeId?: string;
    modifier?:      string;
    // remove / update_fee
    cptId?:         string;
    // update_fee
    feeOverride?:   number | null;
    overrideReason?: string;
  };

  // Resolve visitNote
  const appt = await db.appointment.findUnique({
    where:  { id: appointmentId },
    select: { id: true, status: true, visitNote: { select: { id: true, status: true } } },
  });

  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Allow CPT mutation only if note is not yet signed
  if (appt.visitNote?.status === 'SIGNED') {
    return NextResponse.json({ error: 'NOTE_SIGNED' }, { status: 409 });
  }

  // ── add ──
  if (body.action === 'add') {
    if (!body.cptCode || !body.description || body.feeCatalog == null) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    // Ensure visitNote exists (create DRAFT if needed)
    let visitNoteId: string;
    if (appt.visitNote) {
      visitNoteId = appt.visitNote.id;
    } else {
      const note = await db.visitNote.create({
        data: { appointmentId, status: 'DRAFT' },
        select: { id: true },
      });
      visitNoteId = note.id;
    }

    // Try to find matching ServiceCode in catalog
    let serviceCodeId: string | null = body.serviceCodeId ?? null;
    if (!serviceCodeId && body.cptCode) {
      const sc = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM service_codes WHERE code = ${body.cptCode} AND is_active = true LIMIT 1
      `;
      if (sc.length > 0) serviceCodeId = sc[0].id;
    }

    // Upsert (unique on visit_note_id + cpt_code)
    await db.$executeRaw`
      INSERT INTO visit_service_codes
        (id, visit_note_id, service_code_id, cpt_code, description, fee_catalog, modifier)
      VALUES (
        gen_random_uuid()::text,
        ${visitNoteId},
        ${serviceCodeId},
        ${body.cptCode},
        ${body.description},
        ${body.feeCatalog},
        ${body.modifier ?? null}
      )
      ON CONFLICT (visit_note_id, cpt_code) DO UPDATE
        SET description   = EXCLUDED.description,
            fee_catalog   = EXCLUDED.fee_catalog,
            service_code_id = COALESCE(EXCLUDED.service_code_id, visit_service_codes.service_code_id),
            updated_at    = now()
    `;

    const [row] = await db.$queryRaw<RawCpt[]>`
      SELECT id, visit_note_id, service_code_id, cpt_code, description,
             fee_catalog::text, fee_override::text, override_reason, modifier, units
      FROM   visit_service_codes
      WHERE  visit_note_id = ${visitNoteId} AND cpt_code = ${body.cptCode}
    `;

    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId ?? undefined,
      action:      'ADD_CPT_TO_VISIT',
      entityType:  'appointment',
      entityId:    appointmentId,
      ipAddress:   actor.ipAddress,
      userAgent:   actor.userAgent,
      metadata:    { cptCode: body.cptCode, feeCatalog: body.feeCatalog },
    });

    return NextResponse.json({ ok: true, cpt: toCpt(row) });
  }

  // ── remove ──
  if (body.action === 'remove') {
    if (!body.cptId) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

    // Verify belongs to this appointment's visit note
    const [existing] = await db.$queryRaw<{ cpt_code: string }[]>`
      SELECT vsc.cpt_code
      FROM   visit_service_codes vsc
      JOIN   visit_notes vn ON vn.id = vsc.visit_note_id
      WHERE  vsc.id = ${body.cptId} AND vn.appointment_id = ${appointmentId}
    `;
    if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    await db.$executeRaw`DELETE FROM visit_service_codes WHERE id = ${body.cptId}`;

    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId ?? undefined,
      action:      'REMOVE_CPT_FROM_VISIT',
      entityType:  'appointment',
      entityId:    appointmentId,
      ipAddress:   actor.ipAddress,
      userAgent:   actor.userAgent,
      metadata:    { cptCode: existing.cpt_code },
    });

    return NextResponse.json({ ok: true });
  }

  // ── update_fee ──
  if (body.action === 'update_fee') {
    if (!body.cptId) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

    const feeOverride = body.feeOverride != null ? body.feeOverride : null;

    await db.$executeRaw`
      UPDATE visit_service_codes
      SET    fee_override    = ${feeOverride},
             override_reason = ${body.overrideReason ?? null},
             updated_at      = now()
      WHERE  id = ${body.cptId}
    `;

    const [row] = await db.$queryRaw<RawCpt[]>`
      SELECT id, visit_note_id, service_code_id, cpt_code, description,
             fee_catalog::text, fee_override::text, override_reason, modifier, units
      FROM   visit_service_codes
      WHERE  id = ${body.cptId}
    `;

    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId ?? undefined,
      action:      'OVERRIDE_CPT_FEE',
      entityType:  'appointment',
      entityId:    appointmentId,
      ipAddress:   actor.ipAddress,
      userAgent:   actor.userAgent,
      metadata:    { cptCode: row.cpt_code, feeOverride, reason: body.overrideReason },
    });

    return NextResponse.json({ ok: true, cpt: toCpt(row) });
  }

  return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
