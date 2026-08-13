/**
 * PUT /api/admin/admission/[id]/triage
 *
 * Upsert de signos vitales (TriageRecord) para una cita.
 * Llamado desde B.15 cuando la MA guarda los vitales.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    const body = await req.json() as Record<string, unknown>;

    // Verify appointment exists
    const appt = await db.appointment.findUnique({
      where: { id },
      select: { id: true, status: true, patientId: true },
    });
    if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    /**
     * Corrección = se ALTERAN vitales que ya existían, con el paciente ya en
     * sala. Las dos condiciones, no solo el estado de la cita.
     *
     * Antes bastaba con que la cita estuviera IN_PROGRESS/COMPLETED, y eso dejó
     * de alcanzar cuando el doctor pasó a poder cargar el triaje desde la
     * consulta (2026-08-13): su carga ORIGINAL —no había ninguna fila— habría
     * quedado auditada como `TRIAGE_VITALS_CORRECTED`, diciendo que alteró
     * números que nadie había tomado. El sentido de distinguir las dos acciones
     * es la trazabilidad clínica, así que la etiqueta tiene que ser cierta.
     */
    const yaExistia = await db.triageRecord.findUnique({
      where:  { appointmentId: id },
      select: { id: true },
    });
    const esCorreccionPostAdmision =
      !!yaExistia && (appt.status === 'IN_PROGRESS' || appt.status === 'COMPLETED');

    // Auto-convert F→C and lbs+oz→kg when primary value provided
    const tempF = typeof body.tempFahrenheit === 'number' ? body.tempFahrenheit : null;
    const tempC = tempF !== null ? Math.round(((tempF - 32) * 5) / 9 * 10) / 10
                : (typeof body.tempCelsius === 'number' ? body.tempCelsius : null);

    const tempF2 = typeof body.tempFahrenheit2 === 'number' ? body.tempFahrenheit2 : null;
    const tempC2 = tempF2 !== null ? Math.round(((tempF2 - 32) * 5) / 9 * 10) / 10
                 : (typeof body.tempCelsius2 === 'number' ? body.tempCelsius2 : null);

    /**
     * Altura y peso: los cm y los kg MANDAN si vienen.
     *
     * Antes se recalculaban siempre desde el par (`(ft·12+in)·2.54`) y se
     * ignoraba lo que mandaba el cliente. Eso pisaba el valor exacto: quien
     * escribía 170 cm terminaba con 170.2 guardado, porque el par redondeado a
     * 5 ft 7 in vuelve a convertirse en 170.18.
     *
     * La derivación desde el par se queda como respaldo para los clientes que
     * solo mandan pies/pulgadas — `apps/clinical` (el v2) sigue haciéndolo.
     */
    const dec2 = (n: number): number => Math.round(n * 100) / 100;

    const lbs = typeof body.weightLbs === 'number' ? body.weightLbs : 0;
    const oz  = typeof body.weightOz  === 'number' ? body.weightOz  : 0;
    const kg  = typeof body.weightKg === 'number' && body.weightKg > 0
      ? dec2(body.weightKg)
      : (lbs > 0 || oz > 0 ? dec2(((lbs * 16 + oz) * 28.3495) / 1000) : null);

    const ft = typeof body.heightFt === 'number' ? body.heightFt : 0;
    const inches = typeof body.heightIn === 'number' ? body.heightIn : 0;
    const cm = typeof body.heightCm === 'number' && body.heightCm > 0
      ? dec2(body.heightCm)
      : (ft > 0 || inches > 0 ? dec2((ft * 12 + inches) * 2.54) : null);

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

    // Actor real (sesión Supabase o headers x-actor-*) — se usa tanto para el
    // audit log como para sellar quién capturó los vitales.
    const actor = await resolveActor(req.headers);

    const triage = await db.triageRecord.upsert({
      where:  { appointmentId: id },
      create: {
        appointmentId:    id,
        // Quién hizo la carga original — solo en el create: una corrección
        // posterior NO debe pisar al capturador original.
        capturedByUserId: actor.actorUserId,
        capturedByName:   actor.actorName ?? actor.email ?? undefined,
        ...data,
      },
      update: data,
    });

    // Regla #3: los signos vitales son dato clínico, toda escritura se audita.
    // En una corrección post-admisión guardamos también QUIÉN la hizo: la
    // pantalla muestra "vitales corregidos {hora} · {nombre}" para que el doctor
    // sepa que los números cambiaron después de que él los vio.
    let correctedByName: string | null = null;
    if (esCorreccionPostAdmision) {
      correctedByName = actor.actorName ?? actor.email ?? null;
    }
    await writeAuditLog(db, {
      actorType:   actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole:   actor.actorRole,
      action:      esCorreccionPostAdmision ? 'TRIAGE_VITALS_CORRECTED' : 'TRIAGE_VITALS_SAVED',
      entityType:  'TriageRecord',
      entityId:    triage.id,
      metadata: {
        appointmentId:          id,
        patientId:              appt.patientId,
        appointmentStatus:      appt.status,
        postAdmissionCorrection: esCorreccionPostAdmision,
        correctedByName,
      },
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ ok: true, triage, postAdmissionCorrection: esCorreccionPostAdmision });
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
