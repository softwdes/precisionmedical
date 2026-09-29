import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { FUENTES, puntosDelRegistro, type RewardSource } from '@precision-medical/database/premios';
import { resolveActor } from '@/lib/actor';
import { datosDelPaciente, participacionActual } from '@/lib/premios';

/**
 * "Registrar logro". Lo carga el empleado y queda PENDIENTE hasta que el Admin
 * lo verifica: nada suma sin verificar.
 *
 * Lo que decide el sistema y NO el cliente (aunque el diálogo lo muestre):
 *   · la clínica y si el paciente es NEW o EXISTING (`datosDelPaciente`);
 *   · los puntos, que se guardan en la fila para que cambiar la tabla después
 *     no reescriba lo ya trabajado.
 * Si el cliente mandara esos campos, se ignoran.
 *
 * El día tiene que caer en el mes abierto: un logro de septiembre no puede
 * entrar en octubre, porque el mes cerrado ya se pagó.
 */
const Body = z.object({
  categoryCode: z.string().min(1),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // `.nullish()` y no `.optional()`: los diálogos mandan `null` para lo vacío
  // (ver la trampa del `.default()` de zod).
  patientId: z.string().min(1).nullish(),
  source: z.enum(FUENTES as [RewardSource, ...RewardSource[]]).nullish(),
  notes: z.string().max(500).nullish(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  if (!actor.actorUserId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const part = await participacionActual(actor.actorUserId);
  if (!part) return NextResponse.json({ error: 'NOT_PARTICIPATING' }, { status: 403 });
  if (part.period.status !== 'OPEN') return NextResponse.json({ error: 'PERIOD_CLOSED' }, { status: 409 });

  const mes = part.period.month.toISOString().slice(0, 10);
  if (body.occurredOn.slice(0, 7) !== mes.slice(0, 7)) {
    return NextResponse.json({ error: 'DATE_OUTSIDE_PERIOD' }, { status: 400 });
  }

  const cat = await db.rewardCategory.findUnique({ where: { code: body.categoryCode } });
  if (!cat || !cat.active) return NextResponse.json({ error: 'CATEGORY_NOT_FOUND' }, { status: 404 });
  if (cat.requiresPatient && !body.patientId) return NextResponse.json({ error: 'PATIENT_REQUIRED' }, { status: 400 });
  if (cat.tracksSource && !body.source) return NextResponse.json({ error: 'SOURCE_REQUIRED' }, { status: 400 });

  let isNewPatient: boolean | null = null;
  let clinicId: string | null = null;
  if (body.patientId) {
    const existe = await db.patient.findUnique({ where: { id: body.patientId }, select: { id: true } });
    if (!existe) return NextResponse.json({ error: 'PATIENT_NOT_FOUND' }, { status: 404 });
    const datos = await datosDelPaciente(body.patientId, body.occurredOn, mes);
    isNewPatient = datos.isNewPatient;
    clinicId = datos.clinicId;
  }

  const source = cat.tracksSource ? (body.source ?? null) : null;
  const points = puntosDelRegistro(cat, isNewPatient, source);

  try {
    const entry = await db.rewardEntry.create({
      data: {
        periodId: part.period.id,
        userId: actor.actorUserId,
        categoryCode: cat.code,
        occurredOn: new Date(`${body.occurredOn}T00:00:00Z`),
        patientId: body.patientId ?? null,
        clinicId,
        source,
        isNewPatient,
        points,
        notes: body.notes?.trim() || null,
      },
      select: { id: true, points: true, isNewPatient: true },
    });

    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'REWARD_ENTRY_CREATE',
      entityType: 'reward_entries',
      entityId: entry.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      after: { categoryCode: cat.code, occurredOn: body.occurredOn, patientId: body.patientId ?? null, source, isNewPatient, points },
    });

    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido';
    return NextResponse.json({ error: 'REWARDS_FAILED', detail }, { status: 500 });
  }
}
