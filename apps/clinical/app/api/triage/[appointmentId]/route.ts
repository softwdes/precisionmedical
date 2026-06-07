/**
 * GET  /api/triage/[appointmentId]
 * POST /api/triage/[appointmentId]
 *
 * B.16 — Triaje (Medical Assistant).
 * GET:  Devuelve appointment + patient info + triage record si existe.
 * POST: Guarda/actualiza el triage record y marca el appointment IN_PROGRESS.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog, actorFromHeaders } from '@precision-medical/database';

type Ctx = { params: Promise<{ appointmentId: string }> };

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        select: {
          id: true, firstName: true, lastName: true,
          dateOfBirth: true, phone: true, email: true,
          accidentType: true, insuranceCarrier: true, policyNumber: true,
          lawyerReferrer: {
            select: { id: true, firmName: true, firstName: true, lastName: true, phone: true },
          },
        },
      },
      // Caso del paciente (MVA principal)
      case: {
        select: {
          id: true, caseCode: true, accidentType: true,
          primaryInsurance: { select: { id: true, name: true, claimsPhone: true } },
          primaryPolicyNumber: true,
          attorney: { select: { id: true, firstName: true, lastName: true } },
          lawFirm: { select: { id: true, firmName: true } },
        },
      },
      clinic:      { select: { id: true, name: true } },
      provider:    { select: { id: true, firstName: true, lastName: true, specialty: true } },
      triageRecord: true,
    },
  });

  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ ok: true, appointment: appt });
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const body = await req.json();

  // Upsert triage record
  const triage = await db.triageRecord.upsert({
    where:  { appointmentId },
    update: {
      heightFt:          body.heightFt       ?? null,
      heightIn:          body.heightIn       ?? null,
      heightCm:          body.heightCm       ?? null,
      weightLbs:         body.weightLbs      ?? null,
      weightOz:          body.weightOz       ?? null,
      weightKg:          body.weightKg       ?? null,
      systolicMmhg:      body.systolicMmhg   ?? null,
      diastolicMmhg:     body.diastolicMmhg  ?? null,
      pulseBpm:          body.pulseBpm       ?? null,
      tempFahrenheit:    body.tempFahrenheit  ?? null,
      tempCelsius:       body.tempCelsius     ?? null,
      o2Saturation:      body.o2Saturation   ?? null,
      onRoomAir:         body.onRoomAir      ?? true,
      visualAcuityRight: body.visualAcuityRight ?? null,
      visualAcuityLeft:  body.visualAcuityLeft  ?? null,
      visualAcuityBoth:  body.visualAcuityBoth  ?? null,
      visionCorrected:   body.visionCorrected   ?? false,
      chiefComplaint:    body.chiefComplaint    ?? null,
      capturedByUserId:  actor.actorUserId      ?? undefined,
      capturedByName:    body.capturedByName    ?? 'MA',
    },
    create: {
      appointmentId,
      heightFt:          body.heightFt       ?? null,
      heightIn:          body.heightIn       ?? null,
      heightCm:          body.heightCm       ?? null,
      weightLbs:         body.weightLbs      ?? null,
      weightOz:          body.weightOz       ?? null,
      weightKg:          body.weightKg       ?? null,
      systolicMmhg:      body.systolicMmhg   ?? null,
      diastolicMmhg:     body.diastolicMmhg  ?? null,
      pulseBpm:          body.pulseBpm       ?? null,
      tempFahrenheit:    body.tempFahrenheit  ?? null,
      tempCelsius:       body.tempCelsius     ?? null,
      o2Saturation:      body.o2Saturation   ?? null,
      onRoomAir:         body.onRoomAir      ?? true,
      visualAcuityRight: body.visualAcuityRight ?? null,
      visualAcuityLeft:  body.visualAcuityLeft  ?? null,
      visualAcuityBoth:  body.visualAcuityBoth  ?? null,
      visionCorrected:   body.visionCorrected   ?? false,
      chiefComplaint:    body.chiefComplaint    ?? null,
      capturedByUserId:  actor.actorUserId      ?? undefined,
      capturedByName:    body.capturedByName    ?? 'MA',
    },
  });

  // Si el appointment no está ya IN_PROGRESS, actualizarlo
  if (appt.status !== 'IN_PROGRESS' && appt.status !== 'COMPLETED') {
    await db.appointment.update({
      where: { id: appointmentId },
      data:  { status: 'IN_PROGRESS' },
    });
  }

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      'SAVE_TRIAGE',
    entityType:  'appointment',
    entityId:    appointmentId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { triageRecordId: triage.id },
  });

  return NextResponse.json({ ok: true, triage });
}
