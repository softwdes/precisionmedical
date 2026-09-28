import { db } from '@precision-medical/database';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionUser } from './session';
import { getSessionProvider } from './get-session-provider';

/**
 * ¿Puede esta sesión ESCRIBIR sobre esta cita?
 *
 * Existe porque el middleware deja pasar todo `/api/*` para el rol DOCTOR: el
 * portal médico reúsa las vistas administrativas y sus endpoints, así que
 * bloquear el prefijo rompería sus propias pantallas. La consecuencia es que un
 * doctor podía pegarle a la cita de OTRO doctor con un `fetch` a mano — nunca se
 * notó porque ninguna pantalla suya lo ofrecía. Al darle el check-in y los
 * desenlaces (que mueven estado y plata) esa puerta deja de ser teórica.
 *
 * El alcance NO se recorta para el staff del back-office: recepción marca la
 * llegada de cualquier doctor, que es justamente su trabajo. Quien se limita es
 * el rol que vive encerrado en el portal.
 *
 * Nota sobre "ver como doctor": `getSessionProvider` ya resuelve el doctor
 * elegido, pero la cookie solo la respeta quien tiene la capacidad, y esa gente
 * es admin o staff — no entra por esta rama. Un doctor común siempre se resuelve
 * a su propio perfil.
 */

/** Marca que el check-in salió del portal médico y no del mostrador. */
export const CHECK_IN_SOURCE_PORTAL = 'doctor-portal';

/** Roles cuya única casa es el portal médico (espejo del middleware). */
const PORTAL_ONLY = new Set(['DOCTOR', 'PROVIDER']);

export async function puedeEscribirLaCita(appointmentId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (!user?.email) return false;

  const role = await fetchDbRole(user.email);
  if (!PORTAL_ONLY.has(role)) return true;

  const provider = await getSessionProvider();
  if (!provider) return false;

  const propia = await db.appointment.findFirst({
    where:  { id: appointmentId, providerId: provider.id },
    select: { id: true },
  });
  return !!propia;
}

/**
 * ¿Puede esta sesión ASIGNAR una cita sin dueño a `providerId`?
 *
 * Es una pregunta distinta a `puedeEscribirLaCita`, y por eso vive aparte. Esa
 * pregunta "¿es TUYA?", y una cita sin asignar no es de nadie: a un provider le
 * daría 403 justo en el caso que hay que resolver — la cita que él quiere tomar.
 *
 * La regla:
 *
 *   · **El staff del back-office asigna a cualquiera.** Es su trabajo: el
 *     mostrador mira quién está atendiendo hoy y reparte.
 *   · **El provider solo se asigna A SÍ MISMO.** Puede tomar un paciente que
 *     nadie reclamó; no puede darle trabajo a un colega ni quitárselo.
 *
 * La otra mitad del candado —que la cita no tenga ya dueño— NO está acá sino en
 * el `updateMany` condicional de la ruta: es una carrera entre dos personas y se
 * gana en la escritura, no en el chequeo previo.
 */
export async function puedeAsignarseLaCita(providerId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (!user?.email) return false;

  const role = await fetchDbRole(user.email);
  if (!PORTAL_ONLY.has(role)) return true;

  const provider = await getSessionProvider();
  return !!provider && provider.id === providerId;
}

/**
 * ¿La llegada de esta cita la marcó el propio provider desde su portal?
 *
 * Es la mejor señal disponible de "hoy no hay asistente": si el doctor tuvo que
 * hacer el check-in él, tampoco va a haber nadie en el mostrador para cerrar la
 * visita. De eso depende que el resumen de la consulta le ofrezca el Checkout en
 * una visita PRESENCIAL — el mismo problema que ya se resolvió para las online
 * (`d2824599`), en el otro extremo del día.
 *
 * Sale del audit log y no de una columna nueva a propósito: el dato ya se
 * escribe ahí, `@@index([entityType, entityId])` lo cubre, y agregar una columna
 * obligaba a regenerar el cliente de Prisma — que en este repo es exactamente lo
 * que no se pudo hacer con `doctorDoneAt` y terminó en `$queryRaw`.
 */
export async function llegadaMarcadaPorElProvider(appointmentId: string): Promise<boolean> {
  const row = await db.auditLog.findFirst({
    where:   { action: 'CHECK_IN', entityType: 'appointment', entityId: appointmentId },
    orderBy: { createdAt: 'desc' },
    select:  { metadata: true },
  });
  const meta = row?.metadata as { source?: unknown } | null;
  return meta?.source === CHECK_IN_SOURCE_PORTAL;
}
