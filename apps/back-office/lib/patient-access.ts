/**
 * Guard compartido de las APIs que trabajan sobre la ficha de UN paciente.
 *
 * ## Por qué existe
 *
 * `/patients` y `/doctor/patients` son **la misma pantalla** (ver
 * `patients-data.tsx`): el portal médico la monta con `scopeProviderId` y el
 * cliente esconde las acciones administrativas. Ese recorte vivía SOLO en la
 * UI. El middleware deja pasar toda `/api/admin/patients/*` a un rol del portal
 * —y tiene que hacerlo, porque esas pantallas compartidas la consumen— así que
 * cada ruta era su propia puerta… y ninguna la tenía puesta:
 *
 *   · `DELETE /api/admin/patients/<id>` archivaba a CUALQUIER paciente de la
 *     clínica —cancelando sus citas futuras— sin mirar quién llamaba.
 *   · `PATCH` reescribía la ficha entera, SSN incluido.
 *   · `restore`, `upload-photo` y el `POST` de creación, igual.
 *   · Las lecturas (`cases`, `documents`, `medical-history`) devolvían el
 *     expediente de cualquiera: el "solo mis pacientes" de la lista se caía con
 *     una URL escrita a mano.
 *
 * Y no es solo el portal: `patients/*` queda fuera de `MODULE_API_ROUTES` a
 * propósito (es la ficha compartida de la clínica, no "datos del módulo
 * Patients"), así que el staff con el módulo Patients apagado tampoco tenía
 * freno del lado de la escritura.
 *
 * ## Las tres puertas
 *
 * Decisiones de Erick (2026-09-11), y el principio que las ordena: **lo que la
 * UI le oculta al provider se cierra también en la API; lo que le permite,
 * queda acotado a SUS pacientes.**
 *
 *   · lectura  — cualquier sesión del back-office, EL PORTAL INCLUIDO desde el
 *     2026-09-16: el provider ve toda la clínica igual que el mostrador. Lo que
 *     antes era un recorte ahora es una constancia — abrir un expediente que no
 *     es suyo queda registrado (`registrarFichaAjena`).
 *   · `write`  — corregir la ficha. Suma el filtro por ROL: CONTADOR y
 *     AUDITOR_AI no reescriben una ficha clínica (mismo criterio que
 *     `PUEDEN_EDITAR_HISTORIAL` en `patients/actions.ts`). El provider sí, con
 *     alcance.
 *   · `admin`  — crear, archivar, restaurar y cargar documentos de identidad.
 *     Trabajo de mostrador: un rol del portal NUNCA pasa, tenga o no alcance.
 *     Es lo que ya decía la UI escondiendo esos botones.
 *
 * La BÚSQUEDA por nombre (`search`, `autocomplete`) queda deliberadamente fuera
 * del recorte: el provider agenda desde su calendario y le derivan pacientes
 * que todavía no atendió, así que recortarla le impediría agendarlos. Lo que se
 * cierra es ABRIR el expediente, que es donde está el PHI.
 */

import { NextResponse } from 'next/server';
import { db, writeAuditLog, type UserRole } from '@precision-medical/database';
import { getSessionUser } from './session';
import { getDbUserByEmail } from './actor';
import {
  getSessionProvider, getSessionRole, PORTAL_ONLY_ROLES,
} from './get-session-provider';
import { alcanceDelProvider } from './patients-query';

/**
 * Roles que pueden CORREGIR la ficha de un paciente.
 *
 * Es la misma lista que gobierna el historial médico y por el mismo criterio:
 * por lo que hace cada uno, no por jerarquía. Recepción corrige un teléfono, el
 * asistente carga lo que el paciente menciona en el mostrador, el provider lo
 * que ve en la consulta. Fuera quedan CONTADOR, AUDITOR_AI y LAWYER, que leen
 * para su trabajo pero no tienen ningún motivo para reescribir una ficha.
 */
const PUEDEN_ESCRIBIR_FICHA: readonly UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'FRONT_DESK', 'EMPLOYEE', 'DOCTOR', 'PROVIDER',
];

/**
 * Roles del MOSTRADOR: los únicos que crean, archivan, restauran y cargan
 * documentos de identidad. Es `PUEDEN_ESCRIBIR_FICHA` sin los del portal.
 */
const STAFF_ADMINISTRATIVO: readonly UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'FRONT_DESK', 'EMPLOYEE',
];

export interface PatientActor {
  email: string;
  /** users.id (cuid de Phoenix) — el FK que espera el audit log. */
  userId: string | null;
  role: string;
  /** true si la sesión vive solo en el portal médico (DOCTOR / PROVIDER). */
  portalOnly: boolean;
  /** Provider de la sesión cuando la hay; null para el staff administrativo. */
  providerId: string | null;
}

type Resultado =
  | { deny: NextResponse; actor?: never }
  | { deny?: never; actor: PatientActor };

interface Opciones {
  /** Escritura de la ficha — filtra por rol además del alcance. */
  write?: boolean;
  /** Acción de mostrador — además, ningún rol del portal pasa. */
  admin?: boolean;
}

const no = (error: string, status: number) =>
  ({ deny: NextResponse.json({ error }, { status }) }) as const;

/**
 * Quién es y qué puede, ANTES de tocar la ficha de `patientId`.
 *
 * El 403 de alcance no distingue "no existe" de "no es tuyo" a propósito: los
 * ids son cuid, no se enumeran, y contestar distinto convierte el guard en un
 * oráculo de qué pacientes tiene la clínica.
 */
export async function checkPatientAccess(
  patientId: string,
  opts: Opciones = {},
): Promise<Resultado> {
  const base = await resolverSesion(opts);
  if (base.deny) return base;

  const { actor } = base;

  // El staff administrativo ve la clínica entera; el recorte es del portal.
  if (!actor.portalOnly) return { actor };

  /**
   * LEER: toda la clínica, igual que el staff (Erick, 2026-09-16).
   *
   * Hasta hoy un rol del portal solo podía abrir el expediente de SUS
   * pacientes. La decisión lo cambia: «el provider ve todo sin restricción, la
   * única diferencia es que puede filtrar sus pacientes». O sea que el alcance
   * dejó de ser un muro y pasó a ser una COMODIDAD de la lista.
   *
   * Y tenía que cambiar acá y no solo en la pantalla: el guard y la lista usan
   * la misma regla a propósito. Si la lista mostrara la clínica entera y el
   * guard siguiera recortando, cada fila ajena daría 403 al hacerle clic.
   *
   * Lo que NO se abrió, porque no es lo que se pidió:
   *   · `write` — corregir la ficha sigue acotado a sus pacientes (abajo).
   *   · `admin` — crear, archivar, restaurar y documentos de identidad siguen
   *     cerrados a todo el portal; lo corta `resolverSesion` antes de llegar.
   * La lista del portal además monta la ficha en `soloLectura`, así que desde
   * esta pantalla no hay camino de escritura que pueda chocar con el recorte.
   *
   * Lo que el recorte SÍ sigue haciendo es separar "abrió a su paciente" de
   * "abrió el expediente de otro" — que es lo único que se registra. Ver
   * `registrarFichaAjena`.
   */
  const suyo = await db.patient.findFirst({
    where: { AND: [{ id: patientId }, alcanceDelProvider(actor.providerId)] },
    select: { id: true },
  });

  if (!opts.write) {
    if (!suyo) await registrarFichaAjena(patientId, actor);
    return { actor };
  }

  /**
   * ESCRIBIR: "mi paciente" = lo atiendo **o lo traje yo**. La regla vive en
   * `patients-query.ts`, que es de donde sale el filtro de la lista.
   */
  if (!suyo) return no('OUT_OF_SCOPE', 403);

  return { actor };
}

/**
 * Deja constancia de que alguien del portal abrió un expediente que NO es suyo.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Hasta el 2026-09-16 el recorte hacía de control sin proponérselo: un provider
 * no podía abrir la ficha de un paciente ajeno, así que no hacía falta anotar
 * nada. Con la decisión de Erick —el portal ve toda la clínica— desapareció el
 * recorte y NO quedó nada en su lugar: medido sobre todo el back-office, las
 * únicas acciones de lectura auditadas eran las dos de suplantación, la bandeja
 * ajena, un resultado de laboratorio y un adjunto. Abrir una ficha no dejaba
 * rastro.
 *
 * Esto no repone el recorte —el acceso sigue abierto, que es lo que se pidió—:
 * repone la CONSTANCIA. La pregunta que una auditoría hace es "quién miró qué",
 * y sin esto no se podía contestar sobre 5.735 pacientes.
 *
 * ── Dos decisiones de diseño ────────────────────────────────────────────────
 *
 * · **Solo lo AJENO.** Registrar cada apertura de cada ficha llenaría la tabla
 *   con el trabajo normal del día y volvería invisible lo que importa. La señal
 *   es mirar fuera del panel propio.
 * · **`await` y ANTES de servir.** Si el dato saliera primero y el registro
 *   fallara después, habría divulgación sin constancia — y en serverless la
 *   instancia se congela al devolver la respuesta, así que un `.catch()` suelto
 *   directamente se pierde. Es la regla que ya rige la bandeja ajena.
 */
export async function registrarFichaAjena(
  patientId: string,
  actor: PatientActor,
): Promise<void> {
  await writeAuditLog(db, {
    actorType: 'HUMAN_USER',
    actorUserId: actor.userId,
    // `PatientActor.role` es `string` porque lo resuelve la sesión; el audit log
    // espera el enum. El valor sale de la misma tabla que lo define.
    actorRole: (actor.role || null) as UserRole | null,
    action: 'PATIENTS_VIEWED_OTHER_CHART',
    entityType: 'patients',
    entityId: patientId,
    metadata: {
      abiertoPor: actor.email,
      providerId: actor.providerId,
      // "Ajeno" significa: ninguna cita con este provider y no lo trajo él.
      motivo: 'fuera-de-su-panel',
    },
  });
}

/**
 * La misma constancia desde una PÁGINA del portal.
 *
 * La ficha del portal es un server component que consulta Prisma directo, sin
 * pasar por `checkPatientAccess` —ese guard es de las APIs—, así que abrir la
 * pantalla no pasaría por el registro de arriba. Y la pantalla es justamente
 * donde se ve el expediente entero.
 *
 * Resuelve la sesión por su cuenta y no hace nada si quien mira no es del
 * portal: el mostrador ve la clínica entera por definición de su trabajo y
 * anotarlo sería ruido, no trazabilidad.
 */
export async function auditarFichaAjenaDesdeLaPagina(patientId: string): Promise<void> {
  const role = (await getSessionRole()) ?? '';
  if (!PORTAL_ONLY_ROLES.has(role)) return;

  const user = await getSessionUser();
  if (!user?.email) return;

  const provider = await getSessionProvider();
  const suyo = await db.patient.findFirst({
    where: { AND: [{ id: patientId }, alcanceDelProvider(provider?.id ?? null)] },
    select: { id: true },
  });
  if (suyo) return;

  const dbUser = await getDbUserByEmail(user.email);
  await registrarFichaAjena(patientId, {
    email: user.email,
    userId: dbUser?.id ?? null,
    role,
    portalOnly: true,
    providerId: provider?.id ?? null,
  });
}

/**
 * La misma puerta partiendo de un CASO.
 *
 * Un caso pertenece a un paciente, así que el alcance es el del paciente y no
 * hace falta una segunda regla. Lo usan los botones de la lista que editan o
 * cancelan el caso de una fila: viven en esta pantalla y arrastraban el mismo
 * agujero que la ficha.
 */
export async function checkCaseAccess(
  caseId: string,
  opts: Opciones = {},
): Promise<Resultado> {
  const base = await resolverSesion(opts);
  if (base.deny) return base;
  if (!base.actor.portalOnly) return base;

  const caso = await db.case.findUnique({
    where: { id: caseId },
    select: { patientId: true },
  });
  if (!caso) return no('OUT_OF_SCOPE', 403);

  return checkPatientAccess(caso.patientId, opts);
}

/**
 * La misma puerta cuando todavía no hay paciente (la creación) o cuando la
 * ruta ya resolvió el alcance por su cuenta.
 */
export async function checkPatientStaff(opts: Opciones = {}): Promise<Resultado> {
  return resolverSesion(opts);
}

async function resolverSesion(opts: Opciones): Promise<Resultado> {
  const user = await getSessionUser();
  const email = user?.email;
  if (!email) return no('UNAUTHORIZED', 401);

  const role = (await getSessionRole()) ?? '';
  const portalOnly = PORTAL_ONLY_ROLES.has(role);

  if (opts.admin && portalOnly) return no('FORBIDDEN', 403);
  if (opts.admin && !STAFF_ADMINISTRATIVO.includes(role as UserRole)) {
    return no('FORBIDDEN', 403);
  }
  if (opts.write && !PUEDEN_ESCRIBIR_FICHA.includes(role as UserRole)) {
    return no('FORBIDDEN', 403);
  }

  /**
   * Un rol del portal sin ficha de Provider no se puede recortar, y sin recorte
   * vería la clínica entera — que es exactamente el agujero que esto cierra.
   * Mismo criterio que `alcanceDePacientes()`.
   */
  const provider = portalOnly || !opts.admin ? await getSessionProvider() : null;
  if (portalOnly && !provider) return no('FORBIDDEN', 403);

  const dbUser = await getDbUserByEmail(email);

  return {
    actor: {
      email,
      userId: dbUser?.id ?? null,
      role,
      portalOnly,
      providerId: provider?.id ?? null,
    },
  };
}

/**
 * Recorte de la sesión para las consultas de MUCHOS pacientes (la lista).
 *
 * `pedido` es la señal que manda el cliente ("quiero el modo recortado"), no la
 * identidad: QUIÉN es el provider lo dice la sesión. Mandar el id por query
 * param era el agujero original de `patients/list` —cambiarlo mostraba los
 * pacientes de otro médico, borrarlo el padrón entero— y por eso el param solo
 * enciende el modo.
 *
 * Un rol que vive solo en el portal queda recortado SIEMPRE, mande o no el
 * param.
 */
export async function alcanceDePacientes(
  pedido: string,
): Promise<{ ok: true; providerId: string | null } | { ok: false }> {
  const role = await getSessionRole();
  const portalOnly = !!role && PORTAL_ONLY_ROLES.has(role);

  /**
   * Sin pedido: lista completa, TAMBIÉN para el portal (Erick, 2026-09-16).
   *
   * Antes un rol del portal caía siempre en el recorte, pidiera o no. Ahora el
   * provider ve toda la clínica igual que el staff y el recorte es su filtro
   * "mis pacientes" — ver el comentario de lectura en `checkPatientAccess`.
   */
  if (!pedido) return { ok: true, providerId: null };

  const provider = await getSessionProvider();

  /**
   * Pidió el recorte y no hay ficha de Provider: no hay nada por lo que
   * recortar. Al portal se le contesta 403 en vez de devolverle la clínica
   * entera en silencio — pidió "mis pacientes" y una lista completa sería otra
   * cosa que la que pidió. El staff no tiene a quién recortar y ve todo.
   */
  if (!provider) return portalOnly ? { ok: false } : { ok: true, providerId: null };

  return { ok: true, providerId: provider.id };
}

/**
 * ¿La sesión es de un rol que vive solo en el portal médico?
 *
 * Para las pantallas y rutas que no recortan POR paciente pero sí tienen que
 * servir menos datos —`autocomplete` le da la dirección del paciente a quien
 * elige un tutor legal, y eso es trabajo de mostrador, no de consulta—.
 */
export async function sesionEsDelPortal(): Promise<boolean> {
  const role = await getSessionRole();
  return !!role && PORTAL_ONLY_ROLES.has(role);
}
