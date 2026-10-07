/**
 * B.10 — Schedule first appointment (post-CONFIRMED)
 *
 * POST /api/admin/cases/[id]/schedule-appointment
 *
 * Status flow: CONFIRMED → ACTIVE
 * Crea: Appointment con patient + case + clinic + provider + scheduledFor.
 * Audit log: action=SCHEDULE_FIRST_APPOINTMENT
 *
 * En Phase 1A no validamos overlapping slots — Phase 2 con calendar real
 * agregamos disponibilidad real del provider.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { enviarRecordatorioDeCita } from '@/lib/recordatorio-cita';
import { DURACION_CITA_POR_DEFECTO } from '@/lib/duracion-cita';
import { isWeekendInDenver, horarioYaPaso, findOverlappingAppointments, describeOverlap, overlapDetails, medirSobrecarga, findBlocksCovering, describeBlocks, citaDelPacienteElMismoDia, cuerpoMismoDia } from '@/lib/scheduling-rules';

const InputSchema = z.object({
  clinicId: z.string().min(1),
  /** Opcional desde el 2026-09-28: se asigna en el check-in. Ver el POST de
   *  `api/admin/appointments` para el porqué. */
  /**
   * El string VACIO se normaliza a null antes de validar.
   *
   * Los tres diálogos que crean citas arrancan el estado en `useState('')`, así
   * que "sin provider" viajaba como `providerId: ""`. Sin esto, `""` pasaba la
   * validación, llegaba entero al `create` y Prisma reventaba contra la clave
   * foránea: la pantalla mostraba "no se pudo completar la acción" y nada más,
   * porque un 500 no trae código de error que traducir.
   *
   * Un parámetro VACÍO no es un parámetro AUSENTE — el mismo error que tenía el
   * selector de horarios el 28-sep-2026, encontrado el mismo día.
   */
  providerId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().min(1).nullable().optional(),
  ),
  /** ISO date string · ej "2026-06-10T10:00:00.000Z" */
  scheduledFor: z.string().datetime({ message: 'Fecha/hora inválida (ISO 8601)' }),
  durationMinutes: z.number().int().min(15).max(240).default(DURACION_CITA_POR_DEFECTO),
  type: z.enum(['AUTO_ACCIDENT', 'FAMILY_PRACTICE', 'URGENT_CARE', 'FOLLOW_UP']).default('AUTO_ACCIDENT'),
  notes: z.string().max(2000).optional(),
  /** Ver PatchSchema en appointments/[id]/route.ts: el cruce avisa y deja decidir. */
  allowOverlap: z.boolean().optional(),
  /** Aceptar el aviso de agenda y guardar igual. Aparte de `allowOverlap`. */
  allowBlocked: z.boolean().optional(),
  /** Aceptar el aviso de sobrecarga de la franja. Ver el POST de appointments. */
  allowOverbook: z.boolean().optional(),
});

/**
 * La red que faltaba: una excepción tiene que salir como `INTERNAL_ERROR`.
 *
 * Sin esto, cualquier falla no prevista sale como un 500 pelado, SIN campo
 * `error`. El cliente traduce por código, no encuentra ninguno, y muestra el
 * genérico "no se pudo completar la acción" — que no dice nada y no deja
 * rastro para soporte.
 *
 * Pasó de verdad el 28-sep-2026: un `providerId` vacío reventaba contra la
 * clave foránea y la pantalla se quedaba muda. El GET de este módulo ya tenía
 * su catch desde siempre; los POST que GUARDAN, no.
 *
 * El `console.error` es lo único que ve soporte: el detalle de la excepción no
 * viaja al cliente a propósito — puede traer nombres de pacientes.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    return await agendarDesdeElCaso(req, ctx);
  } catch (err) {
    console.error('[POST /api/admin/cases/[id]/schedule-appointment]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

async function agendarDesdeElCaso(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await resolveActor(req.headers);
  const { id: caseId } = await ctx.params;

  let parsed;
  try {
    parsed = InputSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  /**
   * El MOTIVO es obligatorio, igual que en `/api/admin/appointments`.
   *
   * Es el mismo acto —crear una cita— por otra puerta, así que tiene que pedir
   * lo mismo: si una puerta lo exige y la otra no, la gente aprende cuál usar
   * para saltearlo. Ver el docblock de la otra ruta.
   */
  if (!parsed.notes?.trim()) {
    return NextResponse.json({ error: 'REASON_REQUIRED' }, { status: 400 });
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      caseCode: true,
      status: true,
      patientId: true,
      patient: { select: { firstName: true, lastName: true } },
      deletedAt: true,
    },
  });

  if (!caseRecord || caseRecord.deletedAt) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  // Validation: solo se agenda desde CONFIRMED
  if (caseRecord.status !== 'CONFIRMED') {
    return NextResponse.json(
      {
        error: 'INVALID_STATUS',
        params: { status: caseRecord.status, esperado: 'CONFIRMED' },
        currentStatus: caseRecord.status,
      },
      { status: 409 },
    );
  }

  // Validar que la sede exista, y el provider SOLO si vino: la cita puede nacer
  // sin asignar y resolverse en el check-in. Un id de provider inventado sigue
  // siendo un error — lo que es válido es no mandar ninguno.
  const [clinic, provider] = await Promise.all([
    db.clinic.findUnique({ where: { id: parsed.clinicId }, select: { id: true, name: true } }),
    parsed.providerId
      ? db.provider.findUnique({
          where: { id: parsed.providerId },
          select: { id: true, firstName: true, lastName: true, specialty: true, status: true },
        })
      : Promise.resolve(null),
  ]);

  if (!clinic) {
    return NextResponse.json({ error: 'CLINIC_NOT_FOUND' }, { status: 404 });
  }
  if (parsed.providerId && (!provider || provider.status !== 'ACTIVE')) {
    return NextResponse.json({ error: 'PROVIDER_NOT_FOUND_OR_INACTIVE' }, { status: 404 });
  }

  // Validar que scheduledFor sea futuro. La regla y su hora de gracia viven en
  // lib/scheduling-rules; acá estaba escrita a mano y SIN gracia, así que un
  // horario elegido a las 8:59 y guardado a las 9:01 se rechazaba.
  //
  // Registrar una visita pasada a propósito se hace por /api/admin/appointments
  // (bandera `allowPast`), que es la ruta que usa el diálogo de citas.
  const scheduledForDate = new Date(parsed.scheduledFor);
  if (horarioYaPaso(scheduledForDate)) {
    return NextResponse.json(
      { error: 'INVALID_DATE' },
      { status: 400 },
    );
  }

  // Ninguna clínica atiende sábado/domingo (ver /api/admin/appointments POST)
  if (isWeekendInDenver(scheduledForDate)) {
    return NextResponse.json(
      { error: 'WEEKEND_NOT_ALLOWED' },
      { status: 400 },
    );
  }

  // ─── Verificar cruce con otra cita del doctor (P1) ─────────────────────
  // Ver lib/scheduling-rules: antes esto era un findFirst sin orden que solo
  // chequeaba el cruce contra UNA candidata de la ventana.
  /**
   * ─── Sobrecarga de la franja ─────────────────────────────────────────────
   *
   * Solo cuando la cita va SIN provider. Con provider ya la cuida el chequeo
   * de cruce, que es más preciso: mira una agenda concreta.
   *
   * Sin provider no hay agenda que mirar, así que se cuenta cuánta gente cabe:
   * si a esa hora ya hay tantos pacientes como providers atienden ese día en
   * esa sede, el que entra no tiene quién lo vea.
   *
   * Bandera propia (`allowOverbook`) y no `allowOverlap`: son dos motivos
   * distintos y aceptar uno no puede hacer pasar el otro en silencio — el
   * mismo criterio con el que ya conviven `allowOverlap` y `allowBlocked`.
   */
  if (!parsed.providerId && !parsed.allowOverbook) {
    const carga = await medirSobrecarga({
      clinicId:        parsed.clinicId,
      start:           scheduledForDate,
      durationMinutes: parsed.durationMinutes,
    });
    if (carga && carga.ocupadas >= carga.capacidad) {
      return NextResponse.json({
        error: 'CAPACITY_WARNING',
        ocupadas:  carga.ocupadas,
        capacidad: carga.capacidad,
        canOverride: true,
      }, { status: 409 });
    }
  }
  // Sin provider no hay con qué chocar (ver el POST de api/admin/appointments).
  if (!parsed.allowOverlap && parsed.providerId) {
    const overlaps = await findOverlappingAppointments({
      providerId:      parsed.providerId,
      start:           scheduledForDate,
      durationMinutes: parsed.durationMinutes,
    });
    if (overlaps.length > 0) {
      const detalle = overlapDetails(overlaps)!;
      return NextResponse.json(
        {
          error:   'SLOT_CONFLICT',
          message: describeOverlap(overlaps),
          conflictAppointmentId: overlaps[0]!.id,
          conflictAt:      detalle.at,
          conflictPatient: detalle.patient,
          overlapCount: overlaps.length,
          canOverride: true,
        },
        { status: 409 },
      );
    }
  }

  // El mismo paciente el mismo día con OTRO provider (ver lib/scheduling-rules).
  // Es el tercer camino que guarda una cita y era el único sin este aviso.
  if (!parsed.allowOverlap) {
    const otra = await citaDelPacienteElMismoDia({
      patientId:  caseRecord.patientId,
      start:      scheduledForDate,
      providerId: parsed.providerId ?? null,
    });
    if (otra) return NextResponse.json(cuerpoMismoDia(otra), { status: 409 });
  }

  /**
   * Los avisos de agenda: avisan, no impiden (Devin, 2026-09-17).
   *
   * Bandera aparte de `allowOverlap` a propósito: son dos motivos distintos y
   * quien agenda puede aceptar uno y no el otro. Con una sola bandera, aceptar
   * el cruce de citas habría hecho pasar el almuerzo en silencio.
   */
  if (!parsed.allowBlocked) {
    const bloqueos = await findBlocksCovering({
      providerId:      parsed.providerId,
      start:           new Date(parsed.scheduledFor),
      durationMinutes: parsed.durationMinutes,
    });
    if (bloqueos.length > 0) {
      return NextResponse.json({
        error:   'BLOCKED_SLOT',
        message: describeBlocks(bloqueos),
        blockIds: bloqueos.map((b) => b.id),
        canOverride: true,
      }, { status: 409 });
    }
  }

  // Transaction: crear Appointment + Case.status → ACTIVE
  const result = await db.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        createdByUserId: actor.actorUserId,
        createdByName:   actor.actorName,
        patientId: caseRecord.patientId,
        caseId: caseRecord.id,
        clinicId: parsed.clinicId,
        providerId: parsed.providerId,
        scheduledFor: scheduledForDate,
        durationMinutes: parsed.durationMinutes,
        type: parsed.type,
        status: 'SCHEDULED',
        notes: parsed.notes ?? null,
      },
    });

    const updatedCase = await tx.case.update({
      where: { id: caseRecord.id },
      data: { status: 'ACTIVE' },
      select: { id: true, caseCode: true, status: true },
    });

    return { appointment, updatedCase };
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'SCHEDULE_FIRST_APPOINTMENT',
    entityType: 'cases',
    entityId: caseRecord.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      caseCode: caseRecord.caseCode,
      patientName: `${caseRecord.patient.firstName} ${caseRecord.patient.lastName}`,
      appointmentId: result.appointment.id,
      clinicId: clinic.id,
      clinicName: clinic.name,
      // `null` cuando la cita nace sin asignar: en el historial eso es un dato,
      // no un hueco — dice que se reservó el horario sin saber quién atendía.
      providerId: provider?.id ?? null,
      providerName: provider ? `${provider.firstName} ${provider.lastName}` : null,
      providerSpecialty: provider?.specialty ?? null,
      scheduledFor: scheduledForDate.toISOString(),
      durationMinutes: parsed.durationMinutes,
      type: parsed.type,
      previousStatus: 'CONFIRMED',
      newStatus: 'ACTIVE',
    },
  });

  // El recordatorio al paciente. Tercero de los tres caminos por los que nace
  // una cita —los otros dos son `/api/admin/appointments` y el alta de caso—:
  // si el aviso colgara de uno solo, agendar por otro lado no avisaría nada y
  // nadie sabría por qué a unos pacientes les llega y a otros no. No lanza.
  const recordatorioCita = await enviarRecordatorioDeCita({
    appointmentId: result.appointment.id,
    actorUserId:   actor.actorUserId,
    actorName:     actor.actorName,
  });

  return NextResponse.json({
    ok: true,
    recordatorioCita,
    appointment: {
      id: result.appointment.id,
      scheduledFor: result.appointment.scheduledFor,
      durationMinutes: result.appointment.durationMinutes,
      type: result.appointment.type,
      status: result.appointment.status,
      clinic: { id: clinic.id, name: clinic.name },
      /** `null` = sin asignar; quién atiende se decide en el check-in. */
      provider: provider
        ? {
            id: provider.id,
            firstName: provider.firstName,
            lastName: provider.lastName,
            specialty: provider.specialty,
          }
        : null,
    },
    case: result.updatedCase,
  });
}
