/**
 * POST /api/admin/appointments/[id]/sign-token/send
 *
 * Le manda al paciente el link de confirmación de SU cita, por SMS o por
 * correo. Hasta hoy el modal del QR solo sabía DIBUJARLO: recepción tenía que
 * copiar la dirección a mano y pegarla en otro lado (Erick, 2026-10-08).
 *
 * ── El texto lo escribe la persona, no una plantilla ────────────────────────
 *
 * Decisión de Erick: *"que sea suelto, en el caso que necesiten editar algo; si
 * no, lo dejarán así en la mayoría de los casos"*. O sea, un texto por defecto
 * que casi siempre se manda tal cual, y que se puede retocar antes de enviar.
 *
 * Por eso NO es una plantilla guardada. Y por eso tampoco cae en la trampa que
 * tiene documentada el link del formulario: ahí la vista previa se arma en el
 * navegador y el servidor mandaba otra cosa, así que recepción veía un texto y
 * al paciente le llegaba otro. Acá **se manda exactamente el texto que viajó en
 * el pedido**: lo que se vio es lo que salió.
 *
 * ── El link dura 4 horas y el mensaje lo dice ───────────────────────────────
 *
 * También decisión de Erick. Importa sobre todo por correo: un SMS se lee en
 * minutos, un correo puede leerse a la noche. El cliente arma el texto por
 * defecto con esa advertencia; si alguien la borra, el link sigue venciendo
 * igual — por eso la ruta devuelve `expiresAt` y la pantalla lo muestra aparte.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { puedeEscribirLaCita } from '@/lib/appointment-scope';
import { emitirTokenDeFirma } from '@/lib/sign-token';
import { telefonoDe } from '@/lib/telefono-paciente';
import { sendSms } from '@/lib/sms';
import { sendEmail, correoUsable } from '@/lib/email';

const Entrada = z.object({
  via: z.enum(['SMS', 'EMAIL']),
  /** 800 caracteres ≈ 6 segmentos, el mismo techo que la respuesta del buzón. */
  texto: z.string().trim().min(1).max(800),
  /** Solo para el correo. El SMS no tiene asunto. */
  asunto: z.string().trim().min(1).max(160).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // Mismo guard que emitir el QR: mandar el link es abrirle la puerta a un
  // tercero, no leer la cita.
  if (!(await puedeEscribirLaCita(id))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  let datos: z.infer<typeof Entrada>;
  try {
    datos = Entrada.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'INVALID_PAYLOAD', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 },
    );
  }

  const actor = await resolveActor(req.headers);

  /**
   * El token se emite ACÁ y no se recibe del cliente.
   *
   * Si el cliente mandara la URL, bastaría con pedirle a la ruta que mande
   * cualquier dirección al teléfono de un paciente. Además así se reusa el que
   * ya existe en vez de dejar huérfano el que el paciente tenga abierto.
   */
  const r = await emitirTokenDeFirma(id, actor);
  if (!r.ok) {
    const status = r.motivo === 'APPOINTMENT_NOT_FOUND' ? 404 : 409;
    return NextResponse.json({ ok: false, error: r.motivo }, { status });
  }

  const cita = await db.appointment.findUnique({
    where:  { id },
    select: {
      caseId: true,
      patient: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          phone: true, phone2: true,
        },
      },
    },
  });
  if (!cita) return NextResponse.json({ ok: false, error: 'APPOINTMENT_NOT_FOUND' }, { status: 404 });

  const contexto = {
    patientId:    cita.patient.id,
    caseId:       cita.caseId,
    sentByUserId: actor.actorUserId,
    sentByName:   actor.actorName,
  };

  if (datos.via === 'SMS') {
    // `telefonoDe` y no `.phone`: la ficha tiene principal Y celular, y medido
    // el 2026-10-06 hay 3.076 pacientes con SOLO el celular cargado.
    const telefono = telefonoDe(cita.patient);
    if (!telefono) return NextResponse.json({ ok: false, error: 'SIN_TELEFONO' }, { status: 409 });

    /**
     * Se dio de baja con STOP: Twilio lo rechazaría igual, pero un 21610
     * después de mandar deja a quien escribió creyendo que llegó. Se chequea
     * antes para poder decirlo en la pantalla.
     */
    const baja = await db.messageLog.findFirst({
      where:  { toAddress: telefono, errorCode: 21610 },
      select: { id: true },
    });
    if (baja) return NextResponse.json({ ok: false, error: 'DIO_DE_BAJA' }, { status: 409 });

    const res = await sendSms({ to: telefono, body: datos.texto, ...contexto });
    await registrar(id, actor, 'SMS', res.ok, telefono);
    return NextResponse.json({
      ok: res.ok, via: 'SMS', to: res.to, error: res.error,
      expiresAt: r.token.expiresAt.toISOString(),
    }, { status: res.ok ? 200 : 502 });
  }

  // ── Correo ────────────────────────────────────────────────────────────────
  const correo = correoUsable(cita.patient.email);
  if (!correo) return NextResponse.json({ ok: false, error: 'SIN_EMAIL' }, { status: 409 });

  const res = await sendEmail({
    to:      correo,
    toName:  `${cita.patient.firstName} ${cita.patient.lastName}`.trim(),
    subject: datos.asunto ?? 'Precision Medical',
    text:    datos.texto,
    // El cuerpo es el mismo texto que se vio en pantalla; solo se respetan los
    // saltos de linea. Nada de plantilla HTML: lo que se vio es lo que sale.
    html:    `<p>${datos.texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`,
    ...contexto,
  });
  await registrar(id, actor, 'EMAIL', res.ok, correo);
  return NextResponse.json({
    ok: res.ok, via: 'EMAIL', to: res.to, error: res.error,
    expiresAt: r.token.expiresAt.toISOString(),
  }, { status: res.ok ? 200 : 502 });
}

/**
 * El audit del ENVÍO, aparte del que ya escribe la emisión del token.
 *
 * Son dos hechos distintos: emitir el link y mandárselo a alguien. El segundo
 * es una divulgación —sale de la clínica hacia un teléfono o una casilla— y
 * tiene que poder responderse "quién se lo mandó y a dónde".
 *
 * El destino va COMPLETO a propósito: si mañana alguien pregunta por qué un
 * paciente recibió el link de otro, el número es el único dato que lo contesta.
 */
async function registrar(
  appointmentId: string,
  actor: Awaited<ReturnType<typeof resolveActor>>,
  via: 'SMS' | 'EMAIL',
  ok: boolean,
  destino: string,
): Promise<void> {
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'SEND_APPOINTMENT_SIGN_LINK',
    entityType:  'appointments',
    entityId:    appointmentId,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    metadata:    { via, ok, destino },
  });
}
