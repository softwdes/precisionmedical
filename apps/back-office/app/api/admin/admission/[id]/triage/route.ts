/**
 * PUT /api/admin/admission/[id]/triage
 *
 * Upsert de signos vitales (TriageRecord) para una cita.
 * Llamado desde B.15 cuando la MA guarda los vitales.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const body = await req.json() as Record<string, unknown>;

    // Verify appointment exists
    const appt = await db.appointment.findUnique({ where: { id }, select: { id: true } });
    if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    // Auto-convert F→C and lbs+oz→kg when primary value provided
    const tempF = typeof body.tempFahrenheit === 'number' ? body.tempFahrenheit : null;
    const tempC = tempF !== null ? Math.round(((tempF - 32) * 5) / 9 * 10) / 10
                : (typeof body.tempCelsius === 'number' ? body.tempCelsius : null);

    const tempF2 = typeof body.tempFahrenheit2 === 'number' ? body.tempFahrenheit2 : null;
    const tempC2 = tempF2 !== null ? Math.round(((tempF2 - 32) * 5) / 9 * 10) / 10
                 : (typeof body.tempCelsius2 === 'number' ? body.tempCelsius2 : null);

    const lbs = typeof body.weightLbs === 'number' ? body.weightLbs : 0;
    const oz  = typeof body.weightOz  === 'number' ? body.weightOz  : 0;
    const kg  = lbs > 0 || oz > 0 ? Math.round(((lbs * 16 + oz) * 28.3495) / 1000 * 10) / 10 : null;

    const ft = typeof body.heightFt === 'number' ? body.heightFt : 0;
    const inches = typeof body.heightIn === 'number' ? body.heightIn : 0;
    const cm = ft > 0 || inches > 0 ? Math.round(((ft * 12 + inches) * 2.54) * 10) / 10 : null;

    const data = {
      // Height
      heightFt:       ft  || null,
      heightIn:       inches || null,
      heightCm:       cm,
      // Weight
      weightLbs:      lbs || null,
      weightOz:       oz  || null,
      weightKg:       kg,
      // BP 1st
      systolicMmhg:   n(body.systolicMmhg),
      diastolicMmhg:  n(body.diastolicMmhg),
      // Heart 1st
      pulseBpm:       n(body.pulseBpm),
      respiratoryRate:n(body.respiratoryRate),
      // Temp 1st
      tempFahrenheit: tempF,
      tempCelsius:    tempC,
      // Pain + O2
      painScale:      n(body.painScale),
      o2Saturation:   n(body.o2Saturation),
      o2Comment:      str(body.o2Comment),
      onRoomAir:      body.onRoomAir === false ? false : true,
      // 2nd reading
      systolicMmhg2:   n(body.systolicMmhg2),
      diastolicMmhg2:  n(body.diastolicMmhg2),
      pulseBpm2:       n(body.pulseBpm2),
      respiratoryRate2:n(body.respiratoryRate2),
      tempFahrenheit2: tempF2,
      tempCelsius2:    tempC2,
      // Vision
      visualAcuityRight: str(body.visualAcuityRight),
      visualAcuityLeft:  str(body.visualAcuityLeft),
      visualAcuityBoth:  str(body.visualAcuityBoth),
      visionCorrected:   body.visionCorrected === true,
      // Chief complaint
      chiefComplaint: str(body.chiefComplaint),
    };

    const triage = await db.triageRecord.upsert({
      where:  { appointmentId: id },
      create: { appointmentId: id, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true, triage });
  } catch (err) {
    console.error('[PUT /api/admin/admission/[id]/triage]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

function n(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v) && v !== 0) return v;
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}
