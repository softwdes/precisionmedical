/**
 * Nota clínica del doctor (B.18) — borrador
 *
 * GET /api/admin/visit-notes/[appointmentId]  → nota (o null si no existe aún)
 * PUT /api/admin/visit-notes/[appointmentId]  → upsert del borrador
 *
 * Seguridad: solo el doctor dueño de la cita (o SUPER_ADMIN/ADMIN) puede leer o
 * escribir. Una nota FIRMADA es inmutable — el PUT la rechaza con 409.
 * Los signos vitales NO se editan aquí: viven en el triaje (nodo 2).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';

type Ctx = { params: Promise<{ appointmentId: string }> };

const DxSchema = z.object({
  icd10Code: z.string().max(20).nullable().optional(),
  icd10Label: z.string().max(500).nullable().optional(),
  snomedCode: z.string().max(50).nullable().optional(),
  snomedLabel: z.string().max(500).nullable().optional(),
  diagnosisId: z.string().nullable().optional(),
});

/**
 * El PUT es PARCIAL: solo llegan las secciones que se tocaron.
 *
 * `diagnoses` es opcional y NO tiene default. Con `.default([])`, una llamada que
 * no mandara diagnósticos los BORRABA todos — inofensivo mientras el cliente
 * mandaba siempre la nota entera, mortal ahora que manda solo lo editado.
 *
 * `baseUpdatedAt` es la versión que el cliente tenía cuando cargó la nota. Si en
 * la base hay una más nueva, alguien más guardó en el medio y el PUT se rechaza
 * en vez de pisarlo (ver abajo).
 */
const NoteSchema = z.object({
  templateId: z.string().nullable().optional(),
  chiefComplaint: z.string().nullable().optional(),
  hpi: z.string().nullable().optional(),
  ros: z.string().nullable().optional(),
  physicalExam: z.string().nullable().optional(),
  assessment: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  diagnoses: z.array(DxSchema).optional(),
  baseUpdatedAt: z.string().optional(),
  /**
   * "Tomar la nota": el turno es del doctor mientras está en la consulta, pero
   * si se fue sin cerrarla el asistente tiene que poder terminarla — el paciente
   * está esperando en el mostrador. Queda en la auditoría.
   */
  takeover: z.boolean().optional(),
});

/**
 * Verifica sesión y acceso a la cita — pasa el doctor de la cita, los admins y
 * el staff del back-office (los asistentes completan la nota en borrador cuando
 * el doctor no lo hace). La FIRMA es otra ruta y ahí sí se exige al doctor.
 * Devuelve la respuesta de error si no pasa, o null si está autorizado.
 */
async function denyAccess(appointmentId: string): Promise<NextResponse | null> {
  const { deny } = await checkAppointmentAccess(appointmentId);
  return deny ?? null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const denied = await denyAccess(appointmentId);
  if (denied) return denied;

  const note = await db.visitNote.findUnique({
    where: { appointmentId },
    include: { diagnoses: { orderBy: { sortOrder: 'asc' } } },
  });

  return NextResponse.json({ note });
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  // `actorCita` distingue al DOCTOR de la cita del resto: el turno de la nota
  // depende de eso, no del rol.
  const { deny, actor: actorCita } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;
  const actor = await resolveActor(req.headers);

  let parsed;
  try { parsed = NoteSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const existing = await db.visitNote.findUnique({
    where: { appointmentId },
    select: { id: true, status: true, updatedAt: true },
  });

  // Nota firmada = inmutable (HIPAA)
  if (existing?.status === 'SIGNED') {
    return NextResponse.json({ error: 'NOTE_ALREADY_SIGNED' }, { status: 409 });
  }

  /**
   * EL TURNO. Mientras el doctor está en la consulta, la nota es suya.
   *
   * El flujo real es secuencial: el doctor la llena con el paciente adentro, sale,
   * y ahí el asistente la ve completa y la termina. Los dos escribiendo a la vez no
   * es colaboración, es la lotería de quién guarda último.
   *
   * El turno se decide por un HECHO del negocio —la consulta abierta y sin
   * cerrar— y no por quién se conectó primero: una conexión se cae, se duerme la
   * iPad o alguien deja la pestaña abierta, y un candado así queda trabado con el
   * paciente esperando. Este se libera solo cuando el doctor cierra la consulta.
   */
  const cita = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      status: true,
      doctorDoneAt: true,
      provider: { select: { firstName: true, lastName: true } },
    },
  });
  const enConsulta = cita?.status === 'IN_PROGRESS' && !cita?.doctorDoneAt;
  if (enConsulta && !actorCita.isProviderOwner && !parsed.takeover) {
    return NextResponse.json({
      error: 'NOTE_IN_CONSULT',
      doctorName: cita?.provider
        ? `Dr. ${cita.provider.firstName} ${cita.provider.lastName}`.trim()
        : null,
    }, { status: 409 });
  }

  /**
   * CONTROL DE VERSIÓN. Si la nota cambió después de la que tiene el cliente, no
   * se guarda: se devuelve la versión de la base para que la pantalla muestre el
   * conflicto y decida una persona.
   *
   * Sin esto el `PUT` era ciego. Con el guardado parcial los choques ya son raros
   * —dos personas tienen que tocar la MISMA sección—, pero "raro" sobre un
   * registro clínico sigue siendo inaceptable: el texto perdido no deja rastro.
   */
  if (parsed.baseUpdatedAt && existing) {
    const base = new Date(parsed.baseUpdatedAt).getTime();
    if (Number.isFinite(base) && existing.updatedAt.getTime() > base) {
      const actual = await db.visitNote.findUnique({
        where: { appointmentId },
        include: { diagnoses: { orderBy: { sortOrder: 'asc' } } },
      });
      return NextResponse.json({ error: 'STALE_NOTE', note: actual }, { status: 409 });
    }
  }

  const { diagnoses, baseUpdatedAt: _base, takeover, ...sections } = parsed;

  const note = await db.$transaction(async (tx) => {
    const saved = existing
      ? await tx.visitNote.update({ where: { appointmentId }, data: sections })
      : await tx.visitNote.create({ data: { appointmentId, ...sections } });

    // Los diagnósticos se reemplazan completos, pero SOLO si vinieron: es una
    // lista, no un campo, y el cliente la manda únicamente cuando la tocó.
    if (diagnoses) {
      await tx.visitNoteDiagnosis.deleteMany({ where: { noteId: saved.id } });
      if (diagnoses.length) {
        await tx.visitNoteDiagnosis.createMany({
          data: diagnoses.map((d, i) => ({
            noteId: saved.id,
            icd10Code: d.icd10Code ?? null,
            icd10Label: d.icd10Label ?? null,
            snomedCode: d.snomedCode ?? null,
            snomedLabel: d.snomedLabel ?? null,
            diagnosisId: d.diagnosisId ?? null,
            sortOrder: i,
          })),
        });
      }
    }

    return tx.visitNote.findUnique({
      where: { id: saved.id },
      include: { diagnoses: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  // Audit solo al CREAR la nota (Regla #3). Los autoguardados posteriores no se
  // registran para no inundar el log; la firma sí deja su propia entrada.
  if (!existing && note) {
    await writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CREATE_VISIT_NOTE',
      entityType: 'visit_notes',
      entityId: note.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { appointmentId, templateId: parsed.templateId ?? null },
    });
  }

  /**
   * Tomar la nota con la consulta abierta SÍ se audita, y en cada guardado.
   *
   * Es el único momento en que alguien escribe sobre el turno de otro. Sin la
   * traza, el día que un doctor pregunte quién le cambió el examen físico
   * mientras atendía no hay con qué responderle. Es al revés que los
   * autoguardados normales, que no se registran para no inundar el log: esto
   * pasa poquísimas veces y cada vez importa.
   */
  if (enConsulta && takeover && !actorCita.isProviderOwner && note) {
    writeAuditLog(db, {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TAKEOVER_VISIT_NOTE',
      entityType: 'visit_notes',
      entityId: note.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: {
        appointmentId,
        takenBy: actorCita.name,
        doctorOnDuty: cita?.provider
          ? `Dr. ${cita.provider.firstName} ${cita.provider.lastName}`.trim()
          : null,
        sections: Object.keys(sections),
      },
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, note });
}
