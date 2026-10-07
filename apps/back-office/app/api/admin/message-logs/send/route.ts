/**
 * POST /api/admin/message-logs/send — escribirle un SMS a un paciente.
 *
 * Hasta el 2026-09-28 el sistema solo mandaba textos que armaba él: el link del
 * formulario y los avisos de cita. **Ninguna ruta aceptaba texto de una
 * persona.** Con la bandeja de entrantes encendida eso quedó a la vista: se
 * podía leer "no puedo el martes" y no había cómo contestarlo.
 *
 * ── Quién puede ────────────────────────────────────────────────────────────
 *
 * Staff administrativo, no cualquiera con sesión. El middleware gobierna esta
 * ruta con el módulo `patients`, y ese módulo lo consume TAMBIÉN el portal
 * médico (`DOCTOR_PORTAL_MODULES`): sin el chequeo de adentro, un provider
 * podría mandarle mensajes a pacientes desde su portal. Mismo razonamiento que
 * `lawyers/quick-create`, que pisó este mismo charco.
 *
 * ── Los dos frenos, y por qué no son opcionales ────────────────────────────
 *
 * `21610` — el paciente respondió STOP. Twilio ya lo bloqueó de su lado y
 * devuelve ese código. Se chequea ANTES de escribir: la pantalla tiene que
 * decir "este paciente se dio de baja" mientras se escribe, no después de
 * mandar. Que el envío falle igual no alcanza — quien escribió cree que llegó.
 *
 * Horario — un SMS de la clínica a las 11 de la noche es un problema, y no hay
 * ninguna razón operativa para mandarlo: la clínica atiende de 08 a 18
 * ([[regla-horario-de-atencion]]). Se bloquea fuera de esa franja y se deja
 * forzar explícitamente, porque "urgente de verdad" existe y no lo decide el
 * código.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, isMinor, writeAuditLog, type Prisma } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import { resolveActor } from '@/lib/actor';
import { telefonoDe } from '@/lib/telefono-paciente';
import { sendSms } from '@/lib/sms';

export const dynamic = 'force-dynamic';


const Entrada = z.object({
  /**
   * El paciente, cuando se sabe quién es. `null` es un caso REAL y no un
   * error: un número que coincide con varias fichas —las familias comparten
   * línea— o alguien que no es paciente de nadie. Hoy ya hay una
   * conversación así, y el día que la clínica use solo este sistema van a
   * escribir abogados, ajustadores y farmacias.
   */
  patientId: z.string().min(1).nullable().default(null),
  /** Obligatorio cuando no hay paciente: es el único destino que queda. */
  numero: z.string().min(7).max(20).optional(),
  /**
   * 800 caracteres ≈ 6 segmentos. No es un límite técnico —Twilio parte solo—
   * sino el punto donde un SMS dejó de ser un SMS: si hace falta más, es una
   * llamada.
   */
  body: z.string().trim().min(1).max(800),
  /** Mandar fuera del horario de atención, a sabiendas. */
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  let datos;
  try {
    datos = Entrada.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const paciente = datos.patientId ? await db.patient.findUnique({
    where: { id: datos.patientId },
    select: {
      id: true, firstName: true, lastName: true, phone: true, phone2: true, dateOfBirth: true,
      guardianPatient: { select: { firstName: true, lastName: true, phone: true, phone2: true } },
    },
  }) : null;
  if (datos.patientId && !paciente) {
    return NextResponse.json({ error: 'PACIENTE_NO_ENCONTRADO' }, { status: 404 });
  }

  /**
   * A quién se le escribe. Misma regla que los avisos de cita: si es menor y
   * tiene apoderado, el mensaje va al apoderado — al menor no le sirve de nada
   * y además no es quien decide.
   */
  const apoderado = paciente && isMinor(paciente.dateOfBirth) ? paciente.guardianPatient : null;
  /**
   * Sin paciente, el destino es el número de la conversación. Con paciente,
   * manda su ficha —o la del apoderado— y NO lo que venga del navegador: si
   * el cliente pudiera elegir el destino de un mensaje atado a una ficha
   * clínica, cualquiera podría mandarle el historial de alguien a su propio
   * teléfono.
   */
  /**
   * `telefonoDe` y no `.phone` a secas: la ficha tiene DOS campos y el
   * segundo es el CELULAR.
   *
   * Esta ruta miraba solo el principal. Medido el 2026-10-06: **3.076 de
   * 5.824 pacientes tienen cargado SOLO el celular**, así que para el
   * mostrador figuraban como imposibles de contactar teniendo el número a la
   * vista en su ficha. Y al revés: de las 17 fallas reales de Twilio, 14 son
   * el código 30006 —"este número no recibe SMS"—, que es lo que pasa al
   * escribirle a un fijo.
   *
   * `telefonoDe` ya existía desde el 2026-09-15 con esta misma medición, y lo
   * usan siete pantallas y el envío del portal. Las dos rutas que MANDAN SMS
   * —esta y el recordatorio— eran las únicas que no lo habían adoptado.
   *
   * Sigue ganando el principal cuando hay dos: de los 1.252 con ambos campos,
   * solo 239 tienen números distintos de verdad; en el resto es el mismo
   * número cargado dos veces. Esto NO cambia a dónde le llega a nadie que hoy
   * recibe bien — solo alcanza a quien no recibía nada.
   */
  const telefono = paciente
    ? (telefonoDe(apoderado) ?? telefonoDe(paciente)) ?? undefined
    : datos.numero?.trim();
  if (!telefono) return NextResponse.json({ error: 'SIN_TELEFONO' }, { status: 409 });

  // Se dio de baja: Twilio lo rechazaría igual, pero un 21610 después de
  // escribir es peor que un aviso antes.
  const baja = await db.messageLog.findFirst({
    where: { toAddress: telefono, errorCode: 21610 },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (baja) {
    return NextResponse.json(
      { error: 'DADO_DE_BAJA', desde: baja.createdAt },
      { status: 409 },
    );
  }

  /**
   * Acá había un bloqueo por horario: fuera de 8-18 la ruta devolvía 409 y no
   * mandaba nada. Erick lo sacó el 2026-10-06.
   *
   * El caso que lo tumbó: Beatriz le estaba CONTESTANDO a una paciente que
   * acababa de escribirle a las 16:58 ("Ok perfecto ya lo voy a llenar,
   * muchas gracias"), y el sistema no la dejó responder "De nada". Impedir
   * una respuesta a alguien que está del otro lado escribiendo en ese momento
   * no protege a nadie: deja a la paciente sin respuesta y obliga a llamar.
   *
   * Esta franja tampoco era la de la ley. La restricción de horario que
   * existe de verdad para SMS en EE.UU. es 8:00-21:00 en la hora del que
   * recibe, y aplica a lo comercial, no a un mensaje de la clínica sobre la
   * cita de su propio paciente. La de acá era una decisión nuestra, más
   * estricta que la norma, y le pegaba al caso que más importa.
   *
   * Lo que SÍ queda protegiendo al paciente: la baja por STOP (21610) y el
   * teléfono vacío, dos renglones más arriba. Esos son del paciente; el
   * horario era nuestro.
   */

  const actor = await resolveActor(req.headers);

  const res = await sendSms({
    to: telefono,
    body: datos.body,
    patientId:    paciente?.id ?? null,
    sentByUserId: actor.actorUserId ?? null,
    sentByName:   actor.actorName ?? null,
  });

  /**
   * Queda en la auditoría aunque `message_logs` ya lo registre.
   *
   * Son dos preguntas distintas: el registro de mensajes contesta "qué se le
   * mandó a este paciente" y el audit log contesta "qué hizo esta persona". Un
   * texto libre a un paciente es una acción de alguien, no un aviso del
   * sistema, y es la única de esta pantalla que no se puede deshacer.
   */
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'SEND_PATIENT_SMS',
    entityType:  'patients',
    entityId:    paciente?.id ?? '(sin paciente)',
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    {
      messageLogId: res.messageLogId,
      enviado: res.ok,
      // El TEXTO no va acá: ya está en `message_logs`, y duplicar PHI en una
      // segunda tabla es duplicar la superficie que hay que proteger.
      caracteres: datos.body.length,

      aApoderado: apoderado !== null,
    } as Prisma.JsonValue,
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? 'ERROR_ENVIO', detalle: res.errorDetail, messageLogId: res.messageLogId },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, messageLogId: res.messageLogId, aApoderado: apoderado !== null });
}
