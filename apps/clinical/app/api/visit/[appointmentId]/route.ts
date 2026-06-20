/**
 * GET  /api/visit/[appointmentId]
 * POST /api/visit/[appointmentId]
 *
 * B.18 — Nota de visita del doctor.
 * GET:  Devuelve appointment + triageRecord (para pre-llenar vitales) + visitNote si existe.
 * POST: Upsert del borrador de nota (DRAFT). Guarda vitales + 6 secciones SOAP + diagnósticos.
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
        },
      },
      case: {
        select: {
          id: true, caseCode: true, accidentType: true, accidentDate: true,
          primaryInsurance: { select: { id: true, name: true } },
          primaryPolicyNumber: true,
          attorney: { select: { id: true, firstName: true, lastName: true } },
          lawFirm: { select: { id: true, firmName: true } },
        },
      },
      clinic:      { select: { id: true, name: true } },
      provider:    { select: { id: true, firstName: true, lastName: true, specialty: true } },
      triageRecord: true,
      // Guardrail fields — included so visit-client can show blocking UI

      visitNote: {
        include: {
          diagnoses: {
            include: { diagnosis: { select: { id: true, icd10Code: true, snomedCode: true } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ ok: true, appointment: appt });
}

// ─── POST (save draft) ────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const actor = actorFromHeaders(req.headers);

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      status: true,
      visitNote: { select: { id: true, status: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // No se puede editar una nota firmada
  if (appt.visitNote?.status === 'SIGNED') {
    return NextResponse.json({ error: 'ALREADY_SIGNED' }, { status: 409 });
  }

  const body = await req.json() as {
    templateId?: string;
    // vitales
    heightFt?: number; heightIn?: number; heightCm?: number;
    weightLbs?: number; weightOz?: number; weightKg?: number;
    systolicMmhg?: number; diastolicMmhg?: number;
    pulseBpm?: number; respRate?: number;
    tempFahrenheit?: number; tempCelsius?: number;
    painScale?: number; o2Saturation?: number; onRoomAir?: boolean;
    // SOAP
    chiefComplaint?: string; hpi?: string; ros?: string;
    physicalExam?: string; assessment?: string; plan?: string;
    // diagnósticos
    diagnoses?: Array<{
      icd10Code?: string; icd10Label?: string;
      snomedCode?: string; snomedLabel?: string;
      diagnosisId?: string; sortOrder?: number;
    }>;
  };

  const noteFields = {
    templateId:    body.templateId    ?? null,
    heightFt:      body.heightFt      ?? null,
    heightIn:      body.heightIn      ?? null,
    heightCm:      body.heightCm      ?? null,
    weightLbs:     body.weightLbs     ?? null,
    weightOz:      body.weightOz      ?? null,
    weightKg:      body.weightKg      ?? null,
    systolicMmhg:  body.systolicMmhg  ?? null,
    diastolicMmhg: body.diastolicMmhg ?? null,
    pulseBpm:      body.pulseBpm      ?? null,
    respRate:      body.respRate       ?? null,
    tempFahrenheit: body.tempFahrenheit ?? null,
    tempCelsius:   body.tempCelsius    ?? null,
    painScale:     body.painScale      ?? null,
    o2Saturation:  body.o2Saturation   ?? null,
    onRoomAir:     body.onRoomAir      ?? null,
    chiefComplaint: body.chiefComplaint ?? null,
    hpi:           body.hpi            ?? null,
    ros:           body.ros            ?? null,
    physicalExam:  body.physicalExam   ?? null,
    assessment:    body.assessment     ?? null,
    plan:          body.plan           ?? null,
  };

  // Upsert nota + reemplazar diagnósticos en transacción
  const note = await db.$transaction(async (tx) => {
    const saved = await tx.visitNote.upsert({
      where:  { appointmentId },
      update: noteFields,
      create: { appointmentId, ...noteFields, status: 'DRAFT' },
    });

    // Reemplazar diagnósticos si se enviaron
    if (body.diagnoses !== undefined) {
      await tx.visitNoteDiagnosis.deleteMany({ where: { noteId: saved.id } });
      if (body.diagnoses.length > 0) {
        await tx.visitNoteDiagnosis.createMany({
          data: body.diagnoses.map((d, i) => ({
            noteId:     saved.id,
            icd10Code:  d.icd10Code  ?? null,
            icd10Label: d.icd10Label ?? null,
            snomedCode: d.snomedCode ?? null,
            snomedLabel: d.snomedLabel ?? null,
            diagnosisId: d.diagnosisId ?? null,
            sortOrder:   d.sortOrder ?? i,
          })),
        });
      }
    }

    return saved;
  });

  // Si el appointment está SCHEDULED/CONFIRMED → IN_PROGRESS
  if (appt.status === 'SCHEDULED' || appt.status === 'CONFIRMED') {
    await db.appointment.update({
      where: { id: appointmentId },
      data:  { status: 'IN_PROGRESS' },
    });
  }

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    action:      'SAVE_VISIT_NOTE',
    entityType:  'appointment',
    entityId:    appointmentId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { visitNoteId: note.id, status: 'DRAFT' },
  });

  return NextResponse.json({ ok: true, note });
}
