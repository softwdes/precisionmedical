/**
 * PATCH /api/admin/appointments/:id
 *
 * Actualización parcial de una cita: status, notes, durationMinutes.
 * Usado por:
 *   - "Cancelar cita" en AppointmentDetailPanel → { status: 'CANCELLED' }
 *   - "Editar" en AppointmentDetailPanel         → { notes, durationMinutes }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, Prisma, writeAuditLog } from '@precision-medical/database';
import { avisarReprogramacion, avisarCancelacion } from '@/lib/recordatorio-cita';
import { resolveActor } from '@/lib/actor';
import { isWeekendInDenver, findOverlappingAppointments, describeOverlap, overlapDetails, findBlocksCovering, describeBlocks } from '@/lib/scheduling-rules';
import { pagadoPorCodigoCpt, respuestaYaPagado } from '@/lib/charge-payments';
import { puedeEscribirLaCita } from '@/lib/appointment-scope';
import { porQueNoSePuedeEliminar } from '@/lib/citas-vigentes';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const appt = await db.appointment.findUnique({
    where: { id },
    select: { id: true, plannedServiceCodes: true },
  });
  if (!appt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json(appt);
}

const PlannedServiceSchema = z.object({
  id:          z.string(),
  code:        z.string(),
  description: z.string(),
  fee:         z.number(),
  category:    z.string(),
});

const PatchSchema = z.object({
  status:               z.enum(['SCHEDULED','CONFIRMED','CANCELLED','NO_SHOW','COMPLETED']).optional(),
  /**
   * Cancelacion del MISMO DIA: el horario ya se perdio, asi que la visita
   * conserva sus servicios y admite un cobro de penalidad. Es intencion de
   * recepcion (elige el boton), no un calculo de fechas — asi se puede perdonar
   * la penalidad cuando hubo una razon legitima.
   */
  cancelledSameDay:     z.boolean().optional(),
  notes:                z.string().max(2000).nullable().optional(),
  durationMinutes:      z.number().int().min(5).max(480).optional(),
  plannedServiceCodes:  z.array(PlannedServiceSchema).optional(),
  clinicId:             z.string().min(1).optional(),
  providerId:           z.string().min(1).nullable().optional(),
  scheduledFor:         z.string().datetime().optional(),
  type:                 z.enum(['AUTO_ACCIDENT','FAMILY_PRACTICE','URGENT_CARE','FOLLOW_UP','CONSULTATION']).optional(),
  isOnline:             z.boolean().optional(),
  meetingUrl:           z.string().url().nullable().optional(),
  /**
   * El cruce de horarios avisa y deja decidir, no bloquea (regla confirmada por
   * Erick 2026-08-05): el 409 SLOT_CONFLICT trae `canOverride`, y el cliente
   * reintenta con esto en true cuando el usuario elige solapar igual.
   */
  allowOverlap:         z.boolean().optional(),
  /** Aceptar el aviso de agenda y guardar igual. Aparte de `allowOverlap`. */
  allowBlocked:         z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Al menos un campo requerido' });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const actor  = await resolveActor(req.headers);

  let parsed: z.infer<typeof PatchSchema>;
  try {
    parsed = PatchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const existing = await db.appointment.findUnique({
    where: { id },
    select: { id: true, status: true, caseId: true, providerId: true, scheduledFor: true, durationMinutes: true, clinicId: true, isOnline: true },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  /**
   * Un doctor solo escribe sobre SUS citas.
   *
   * Va despues del `findUnique` para no pagar la consulta del guard cuando la
   * cita ni existe, y despues del parse para que un payload invalido siga dando
   * 400 y no un 403 enganoso. El staff del back-office no se recorta: recepcion
   * sella el desenlace de la cita de cualquier doctor, que es su trabajo.
   */
  if (!(await puedeEscribirLaCita(id))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  /**
   * ─── Deshacer un desenlace ───────────────────────────────────────────────
   *
   * Volver de NO_SHOW o CANCELLED a una cita viva, y SOLO si todavía no se
   * cobró nada.
   *
   * Por qué hace falta: desde el 2026-09-14 la fecha de una cita se bloquea por
   * ESTADO y no por reloj, así que una cita vencida sin atender se reprograma
   * normal. Pero las que sí tienen desenlace quedaban congeladas **sin vuelta
   * atrás**: el panel del calendario sabe poner NO_SHOW, CANCELLED y VOIDED, y
   * no tiene ningún botón para deshacerlos. Con una agenda que cambia a último
   * momento eso es una trampa — recepción marca no-show, el paciente aparece
   * veinte minutos tarde, y la cita ya no se puede mover nunca más. La única
   * salida era crear otra y dejar la vieja como un no-show falso, que ensucia
   * la métrica del doctor y deja cobrada una penalidad que no correspondía.
   *
   * Por qué NO se resuelve aflojando el candado de la fecha: si se pudiera
   * mover la fecha de un no-show, el día de la penalidad se muda con ella y se
   * termina cobrando por un día en que el paciente sí vino. El candado está
   * bien puesto; lo que faltaba era la puerta de salida.
   *
   * Por qué solo sin cargos: marcar no-show abre el catálogo y genera un
   * servicio facturable. Deshacer el estado sin deshacer la plata dejaría un
   * cobro sin desenlace que lo explique — peor que no poder deshacer. Con
   * cargos, esto responde 409 y dice qué hay que quitar primero; quitarlos es
   * una decisión de facturación y tiene su propia pantalla.
   *
   * CHECKED_IN e IN_PROGRESS no entran acá, y no por olvido: el esquema de
   * entrada de este endpoint no los acepta. Son hechos físicos —el paciente
   * llegó, está en consulta— y se deshacen desde Admisión, que es donde se
   * sellaron.
   */
  const DESENLACE_REVERSIBLE = ['NO_SHOW', 'CANCELLED'];
  const VUELVE_A_VIVA        = ['SCHEDULED', 'CONFIRMED'];

  if (
    parsed.status !== undefined
    && DESENLACE_REVERSIBLE.includes(existing.status)
    && VUELVE_A_VIVA.includes(parsed.status)
  ) {
    const [servicios, cobros] = await Promise.all([
      db.appointmentService.count({ where: { appointmentId: id } }),
      db.appointmentBilling.count({ where: { appointmentId: id } }),
    ]);

    if (servicios > 0 || cobros > 0) {
      return NextResponse.json({
        error: 'HAS_CHARGES',
        message: 'Esta cita ya tiene cargos registrados. Quitalos primero desde Servicios y después se puede reabrir.',
        servicios,
        cobros,
      }, { status: 409 });
    }
  }

  /**
   * Cancelar algo ya cancelado: se rechaza.
   *
   * No es redundancia inofensiva. Las dos clases de cancelacion se distinguen por
   * `cancelledSameDay`, y la del MISMO DIA cobra penalidad y consume el horario.
   * Re-cancelar con "con aviso" sobreescribia esa bandera en silencio y **borraba
   * la penalidad** — un PATCH sin guarda escribe el `status` que le manden.
   *
   * Es lo que cierra el agujero de verdad: apagar el boton en el modal no
   * alcanza, porque el modal se puede reabrir con datos viejos en cache y ahi el
   * boton vuelve a estar disponible.
   *
   * Deliberadamente NO se bloquea todo lo demas sobre una cita cancelada:
   * corregir la nota o el motivo despues sigue siendo legitimo.
   */
  if (existing.status === 'CANCELLED' && parsed.status === 'CANCELLED') {
    return NextResponse.json({
      error:   'ALREADY_CANCELLED',
      message: 'La cita ya está cancelada',
    }, { status: 409 });
  }

  // COMPLETED appointments: only plannedServiceCodes may be updated (Step 4 billing happens post-visit)
  if (existing.status === 'COMPLETED') {
    const keys = Object.keys(parsed);
    const onlyServices = keys.length === 1 && keys[0] === 'plannedServiceCodes';
    if (!onlyServices) {
      return NextResponse.json({ error: 'IMMUTABLE', message: 'No se puede modificar una cita completada' }, { status: 422 });
    }
  }

  /**
   * Un CPT ya cobrado no se saca de la lista.
   *
   * Los CPT los paga el seguro, pero pueden tener plata del PACIENTE encima —un
   * copago es exactamente eso—, y quitarlos de `plannedServiceCodes` dejaba el
   * cobro huérfano: `sync-billing` no borra una fila con pagos, así que el
   * código desaparecía del tab de Servicios y su monto seguía vivo en el de
   * Pagar sin nada que lo explicara. Misma regla que férulas, labs y efectivo
   * (ver lib/charge-payments.ts): primero se anula el pago.
   */
  if (parsed.plannedServiceCodes !== undefined) {
    const pagados = await pagadoPorCodigoCpt(id);
    if (pagados.size > 0) {
      const quedan = new Set(parsed.plannedServiceCodes.map((s) => s.code));
      const quitado = [...pagados.entries()].find(([code]) => !quedan.has(code));
      if (quitado) return respuestaYaPagado(quitado[1]);

      /**
       * Y tampoco se le baja el monto por debajo de lo cobrado.
       *
       * Desde que el monto se puede corregir (2026-09-22) quitar el cargo dejó
       * de ser la única forma de hacer desaparecer esa plata: bajarlo a $20
       * cuando se cobraron $166 deja el saldo en cero por `max(0, …)` de
       * sync-billing y los $146 de más no figuran en ningún lado. Mismo
       * remedio que para quitarlo: primero se anula el pago.
       */
      const rebajado = parsed.plannedServiceCodes.find(
        (s) => (pagados.get(s.code) ?? 0) > (s.fee ?? 0));
      if (rebajado) return respuestaYaPagado(pagados.get(rebajado.code)!);
    }
  }

  // Ninguna clínica atiende sábado/domingo (ver /api/admin/appointments POST)
  if (parsed.scheduledFor !== undefined && isWeekendInDenver(new Date(parsed.scheduledFor))) {
    return NextResponse.json({
      error: 'WEEKEND_NOT_ALLOWED',
      message: 'No se pueden agendar citas en fin de semana.',
    }, { status: 400 });
  }

  // Nota: NO hay chequeo de fecha pasada acá, a diferencia del POST (que
  // rechaza con DATE_IN_PAST). Es deliberado — regla confirmada por Erick
  // 2026-08-05: mover una cita a una fecha pasada es libre, sirve para corregir
  // registros viejos. No agregar el guard sin volver a preguntar.

  // Chequeo de cruce con otra cita del mismo doctor. Solo corre si algo
  // relacionado al horario realmente cambió, y excluye esta misma cita (si no,
  // siempre "chocaría" consigo misma). La lógica vive en lib/scheduling-rules
  // porque los tres endpoints que guardan una cita la necesitan igual.
  const timingChanged = parsed.scheduledFor !== undefined || parsed.providerId !== undefined || parsed.durationMinutes !== undefined;
  if (timingChanged && !parsed.allowOverlap) {
    const effectiveProviderId = parsed.providerId !== undefined ? parsed.providerId : existing.providerId;
    const effectiveDuration   = parsed.durationMinutes ?? existing.durationMinutes;
    const newStart = parsed.scheduledFor !== undefined ? new Date(parsed.scheduledFor) : new Date(existing.scheduledFor);

    if (effectiveProviderId) {
      const overlaps = await findOverlappingAppointments({
        providerId:           effectiveProviderId,
        start:                newStart,
        durationMinutes:      effectiveDuration,
        excludeAppointmentId: id,
      });
      if (overlaps.length > 0) {
        const detalle = overlapDetails(overlaps)!;
        return NextResponse.json({
          error:   'SLOT_CONFLICT',
          // `message` es el respaldo en español; el cartel arma su propia frase
          // con los tres campos de abajo y el idioma de quien mira.
          message: describeOverlap(overlaps),
          conflictAppointmentId: overlaps[0]!.id,
          conflictAt:      detalle.at,
          conflictPatient: detalle.patient,
          overlapCount: overlaps.length,
          // El cruce avisa y deja decidir: el cliente puede reintentar con
          // allowOverlap para solapar a propósito.
          canOverride: true,
        }, { status: 409 });
      }
    }
  }

  /**
   * Los avisos de agenda: avisan, no impiden (Devin, 2026-09-17).
   *
   * Bandera aparte de `allowOverlap` a propósito: son dos motivos distintos y
   * quien agenda puede aceptar uno y no el otro. Con una sola bandera, aceptar
   * el cruce de citas habría hecho pasar el almuerzo en silencio.
   */
  if (timingChanged && !parsed.allowBlocked) {
    const bloqueos = await findBlocksCovering({
      // Se recalculan acá y no se reusan las del bloque de arriba: viven dentro
      // de su `if` y el aviso tiene que valer también cuando la cita no tiene
      // provider —un almuerzo general pisa igual—.
      providerId:      parsed.providerId !== undefined ? parsed.providerId : existing.providerId,
      start:           parsed.scheduledFor !== undefined ? new Date(parsed.scheduledFor) : new Date(existing.scheduledFor),
      durationMinutes: parsed.durationMinutes ?? existing.durationMinutes,
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

  let updated;
  try {
    updated = await db.appointment.update({
      where: { id },
      data: {
        ...(parsed.status               !== undefined && { status:               parsed.status }),
        ...(parsed.cancelledSameDay     !== undefined && { cancelledSameDay:     parsed.cancelledSameDay }),
        ...(parsed.notes                !== undefined && { notes:                parsed.notes }),
        ...(parsed.durationMinutes      !== undefined && { durationMinutes:      parsed.durationMinutes }),
        ...(parsed.plannedServiceCodes  !== undefined && { plannedServiceCodes:  parsed.plannedServiceCodes }),
        ...(parsed.clinicId             !== undefined && { clinicId:             parsed.clinicId }),
        ...(parsed.providerId           !== undefined && { providerId:           parsed.providerId }),
        ...(parsed.scheduledFor         !== undefined && { scheduledFor:         new Date(parsed.scheduledFor) }),
        ...(parsed.type                 !== undefined && { type:                 parsed.type }),
        ...(parsed.isOnline             !== undefined && { isOnline:             parsed.isOnline }),
        ...(parsed.meetingUrl           !== undefined && { meetingUrl:           parsed.meetingUrl }),
      },
      select: { id: true, status: true, notes: true, durationMinutes: true, clinicId: true, providerId: true, scheduledFor: true, type: true },
    });
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    return NextResponse.json({ error: 'DB_ERROR', message: msg }, { status: 500 });
  }

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    // Reabrir una cita cerrada lleva su propia acción: en el historial, "volvió
    // a estar viva" no es lo mismo que "se le cambió algo", y es lo que hay que
    // poder buscar si mañana alguien pregunta por qué un no-show desapareció.
    action:
      parsed.status === 'CANCELLED' ? 'CANCEL_APPOINTMENT'
      : (DESENLACE_REVERSIBLE.includes(existing.status) && parsed.status !== undefined
          && VUELVE_A_VIVA.includes(parsed.status)) ? 'REOPEN_APPOINTMENT'
      : 'UPDATE_APPOINTMENT',
    entityType:  'appointments',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    after:       updated as unknown as Prisma.JsonValue,
    metadata:    { changes: parsed },
  });

  /**
   * Al paciente le avisamos que su cita se movió.
   *
   * Hasta acá esta ruta no le decía NADA a nadie: aceptaba cambiar la fecha, la
   * sede, el provider y la duración, y el paciente —que ya tenía su SMS con la
   * hora vieja— se presentaba cuando le habían dicho la primera vez. Es peor
   * que no haber avisado nunca: el sistema le dio un dato y después lo cambió
   * a sus espaldas.
   *
   * Cuándo sí: los tres cambios que le cambian el día al paciente.
   *
   *   · la FECHA Y HORA  — tiene que venir en otro momento
   *   · la SEDE          — tiene que manejar a otra dirección
   *   · presencial ⇄ en línea — o maneja al pedo, o se queda esperando en casa
   *
   * Cuándo no: el provider y la duración. Son cosas nuestras — el paciente
   * llega a la misma hora al mismo lugar, y un correo por cada ajuste interno
   * entrena a no leer los correos de la clínica, que es el costo que después se
   * paga en el aviso que sí importaba.
   *
   * La sede entró después de escribir esto mirando solo el reloj. Mandar a
   * alguien a un edificio equivocado es exactamente el mismo daño que mandarlo
   * a la hora equivocada, y no lo cubre `scheduledFor`.
   *
   * Por correo y no por SMS — decisión de Erick, 2026-09-18.
   *
   * `existing` se leyó ANTES del update: para acá la fila ya tiene los datos
   * nuevos y los anteriores no están en ninguna parte. La fecha vieja es
   * justamente lo que hace que el correo se distinga de un recordatorio.
   */
  const cambio = <T,>(nuevo: T | undefined, viejo: T) => nuevo !== undefined && nuevo !== viejo;

  const cambioLaHora =
    parsed.scheduledFor !== undefined &&
    new Date(parsed.scheduledFor).getTime() !== new Date(existing.scheduledFor).getTime();

  const seMovio =
    cambioLaHora
    || cambio(parsed.clinicId, existing.clinicId)
    || cambio(parsed.isOnline, existing.isOnline);

  // Una cita cancelada no se "reprograma": si en el mismo PATCH se la cancela,
  // mandarle la fecha nueva sería decirle que la espere.
  const avisoReprogramacion = (seMovio && parsed.status !== 'CANCELLED')
    ? await avisarReprogramacion({
        appointmentId:        id,
        scheduledForAnterior: cambioLaHora ? new Date(existing.scheduledFor) : null,
        actorUserId:          actor.actorUserId,
        actorName:            actor.actorName,
      })
    : null;

  /**
   * Y el aviso de cancelación.
   *
   * Solo en la TRANSICIÓN a cancelada: `existing.status !== 'CANCELLED'`. Sin
   * eso, cualquier PATCH posterior sobre una cita ya cancelada —corregir la
   * nota, cargar el motivo— le mandaría el correo de nuevo. (El guard de
   * `ALREADY_CANCELLED` de más arriba tapa el caso más común, pero depende de
   * que el caller mande `status`, y esta condición no depende de nada.)
   *
   * NO_SHOW no entra: "no viniste" y "te la cancelamos" son cosas distintas, y
   * mandarle la segunda a quien faltó es contarle mal lo que pasó.
   */
  const avisoCancelacion = (parsed.status === 'CANCELLED' && existing.status !== 'CANCELLED')
    ? await avisarCancelacion({
        appointmentId: id,
        actorUserId:   actor.actorUserId,
        actorName:     actor.actorName,
      })
    : null;

  return NextResponse.json({ ok: true, appointment: updated, avisoReprogramacion, avisoCancelacion });
}

/**
 * DELETE /api/admin/appointments/:id — eliminar (lógico) una cita mal cargada
 *
 * ── Qué es esto y qué NO es ─────────────────────────────────────────────────
 *
 * NO es cancelar. Cancelar significa *el paciente no viene*: es un hecho
 * clínico y de facturación, puede llevar penalidad y cuenta en las
 * estadísticas. Esto es para la cita que **nunca debió existir** — una prueba,
 * un duplicado, el paciente equivocado (Erick, 2026-09-23: *"han estado
 * haciendo pruebas y a veces se equivocan y deben eliminarla"*).
 *
 * Hasta hoy la única salida era cancelarla, y eso ensuciaba justo el número con
 * el que la clínica cobra las penalidades.
 *
 * ── No borra la fila ────────────────────────────────────────────────────────
 *
 * Marca `deletedAt` y la cita desaparece de todas las pantallas menos de la
 * papelera ("Citas eliminadas" en el calendario), desde donde se puede
 * restaurar. Su horario vuelve a estar libre en el acto. Erick: *"no hay
 * problema que lo eliminen todos, igual no se perderá y se podrá ver"*.
 *
 * ── Quién puede ─────────────────────────────────────────────────────────────
 *
 * Cualquiera que pueda escribir la cita — decisión de Erick, y se sostiene
 * porque es reversible y queda registrado con nombre y motivo. El único
 * recorte es el de siempre: un provider no toca la cita de otro
 * (`puedeEscribirLaCita`).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!(await puedeEscribirLaCita(id))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const existing = await db.appointment.findUnique({
    where:  { id },
    select: { id: true, status: true, scheduledFor: true, deletedAt: true, patientId: true, clinicId: true, providerId: true },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (existing.deletedAt) {
    return NextResponse.json({ error: 'ALREADY_DELETED' }, { status: 409 });
  }

  /**
   * La cita con RASTRO no se elimina: se cancela.
   *
   * Sin esta traba, eliminar sería el atajo cómodo para deshacer un no-show y
   * la clínica perdería el historial con el que cobra. El motivo viaja al
   * cliente para que el cartel diga QUÉ hay que hacer en su lugar, no un
   * "no se puede" pelado.
   */
  const motivo = await porQueNoSePuedeEliminar(id);
  if (motivo) {
    return NextResponse.json({ error: 'HAS_HISTORY', reason: motivo }, { status: 409 });
  }

  const body   = await req.json().catch(() => ({}));
  const razon  = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
  const actor  = await resolveActor(req.headers);

  const borrada = await db.appointment.update({
    where: { id },
    data: {
      deletedAt:     new Date(),
      deletedById:   actor.actorUserId,
      deletedByName: actor.actorName,
      deleteReason:  razon || null,
    },
    select: { id: true, deletedAt: true, deleteReason: true },
  });

  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'DELETE_APPOINTMENT',
    entityType:  'appointments',
    entityId:    id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    // El `before` guarda dónde estaba: es lo que permite entender la papelera
    // sin abrir la cita, y lo que queda si algún día se purga de verdad.
    before:      existing as unknown as Prisma.JsonValue,
    after:       borrada  as unknown as Prisma.JsonValue,
    metadata:    { reason: razon || null },
  });

  /**
   * Al paciente NO se le avisa, a propósito.
   *
   * Una cita eliminada es una que nunca debió existir: avisarle de la
   * cancelación de algo que —para él— no pasó es peor que el silencio. La que
   * sí avisa es la cancelación, que es el camino para "el paciente no viene".
   */
  return NextResponse.json({ ok: true, appointment: borrada });
}
