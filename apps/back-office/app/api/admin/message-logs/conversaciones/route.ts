/**
 * GET /api/admin/message-logs/conversaciones — la pestaña *Actionable*.
 *
 * Una fila por CONVERSACIÓN, no por mensaje. Es la diferencia con
 * `/api/admin/message-logs`, que es el registro de envíos: acá la pregunta no
 * es "¿este mensaje llegó?" sino "¿con quién hay algo pendiente?".
 *
 * `?pendientes=1` deja solo las que esperan respuesta. La definición de
 * pendiente, y por qué no es "sin leer", está en `lib/conversaciones-sms.ts`.
 *
 * Va bajo `message-logs` a propósito: el middleware ya gobierna ese prefijo con
 * el módulo `patients`, así que quien ve los mensajes ve las conversaciones.
 * Son el mismo dato mirado de dos formas, no dos permisos.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkPatientStaff } from '@/lib/patient-access';
import { contarPendientes, listarConversaciones, mensajesDeConversacion } from '@/lib/conversaciones-sms';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  const { searchParams } = new URL(req.url);
  /**
   * Con `?clave=` devuelve UNA conversación con sus mensajes, en vez de la
   * lista. Es lo que abre el hilo — y funciona con `tel:` igual que con
   * `pac:`, que es todo el punto del cambio.
   */
  const clave = searchParams.get('clave');
  if (clave) {
    return NextResponse.json({ mensajes: await mensajesDeConversacion(clave) });
  }

  const soloPendientes = searchParams.get('pendientes') === '1';
  const q = searchParams.get('q')?.trim() || undefined;

  const [conversaciones, pendientes] = await Promise.all([
    listarConversaciones({ soloPendientes, q }),
    /**
     * El contador va SIEMPRE sin filtrar por búsqueda: es el mismo número del
     * badge del menú, y si cambiara al escribir en el buscador dejaría de ser
     * un indicador para pasar a ser otra columna de la lista.
     */
    contarPendientes(),
  ]);

  return NextResponse.json({ conversaciones, pendientes });
}

/**
 * PUT — decir a QUÉ paciente pertenece una conversación sin vincular.
 *
 * Cuando el número coincide con varios —lo normal acá: las familias comparten
 * línea— el sistema no elige. Lo elige una persona, una vez, y queda guardado:
 * se escribe el `patientId` en TODOS los mensajes de ese número, así el hilo
 * aparece desde entonces en la ficha del paciente y el próximo mensaje que
 * entre ya llega resuelto.
 *
 * ⚠️ Esto mete mensajes en la ficha clínica de alguien, así que queda en el
 * audit log con el número y la cantidad de filas tocadas. Si se eligió mal,
 * tiene que poder responderse quién lo hizo.
 */
const Asignar = z.object({
  /** `tel:<10 digitos>` — una conversación ya vinculada no se reasigna acá. */
  clave: z.string().startsWith('tel:'),
  patientId: z.string().min(1),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  let datos;
  try {
    datos = Asignar.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const digitos = datos.clave.slice(4);
  const paciente = await db.patient.findUnique({
    where: { id: datos.patientId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!paciente) return NextResponse.json({ error: 'PACIENTE_NO_ENCONTRADO' }, { status: 404 });

  const res = await db.messageLog.updateMany({
    where: {
      channel: 'SMS',
      patientId: null,
      OR: [{ toAddress: { endsWith: digitos } }, { fromAddress: { endsWith: digitos } }],
    },
    data: { patientId: paciente.id },
  });

  const actor = await resolveActor(req.headers);
  await writeAuditLog(db, {
    actorType:   actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole:   actor.actorRole,
    action:      'ASSIGN_SMS_CONVERSATION',
    entityType:  'patients',
    entityId:    paciente.id,
    ipAddress:   actor.ipAddress,
    userAgent:   actor.userAgent,
    // El NÚMERO y cuántos mensajes se movieron. El texto no: ya está en
    // `message_logs` y duplicar PHI duplica lo que hay que proteger.
    metadata: { numero: digitos, mensajes: res.count } as Prisma.JsonValue,
  });

  return NextResponse.json({ ok: true, mensajes: res.count });
}
