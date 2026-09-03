import { db, isMinor } from '@precision-medical/database';
import { decryptField } from '@/lib/decrypt';
import { claveDia } from '@/lib/fechas';
import { progresoIntake, intakeFirmado, type MissingKey } from '@/lib/intake-progreso';

/**
 * El centinela de la clínica · los que llegan sin el intake firmado.
 *
 * La cola del dashboard: casos con cita en los próximos días cuyo intake no está
 * completo ni firmado, ordenados por cuánto falta para que el paciente aparezca
 * en el mostrador.
 *
 * Es la contracara de `lib/vigia/queue.ts`, la cola del bufete, y comparte su
 * regla de oro: **la definición vive en un módulo, no en la pantalla**. Acá el
 * "incompleto" sale de `lib/intake-progreso.ts`, el mismo que pinta la barra en
 * la lista de pacientes. Si cada pantalla lo calculara por su lado, el día que
 * alguien toque un chequeo los dos números se contradicen.
 *
 * ── Los días se cuentan por CLAVE DE DÍA, no restando milisegundos ───────────
 *
 * Todo el bucket depende de "cuántos días faltan", y eso no es una división por
 * 86.400.000: entre hoy y mañana hay 23 o 25 horas dos veces al año. Así que se
 * compara la clave `YYYY-MM-DD` de la zona de la clínica (`claveDia`), que es
 * exacta por construcción.
 *
 * Por lo mismo la consulta trae una ventana UTC holgada y el recorte fino se
 * hace acá con las claves. Es a propósito: son ~70 citas en la ventana, y
 * pagarlas todas sale más barato que meter aritmética de zona horaria en el
 * `where` — que es donde `dashboard/page.tsx` se equivoca hoy (calcula "hoy" con
 * `new Date(y, m, d)`, la zona del SERVIDOR, con un comentario que dice "Phase 2
 * con timezone lib propia").
 */

/** Hasta cuántos días adelante mira la cola. */
export const DIAS_VENTANA = 5;

/** Estados de cita que NO cuentan: la persona no va a venir. */
const ESTADOS_MUERTOS = ['CANCELLED', 'NO_SHOW'] as const;

/**
 * Estados que significan que el paciente YA ESTÁ o YA ESTUVO en la clínica.
 *
 * Separarlos no es cosmético: a estos no se los llama —ya están acá— y su
 * intake se firma en la tablet del mostrador. Mezclarlos con los que todavía no
 * llegaron convertía la cola en una lista donde el 74% no era una llamada.
 */
const ESTADOS_LLEGO = ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CHECKED_OUT'] as const;

export interface FilaIntake {
  caseId: string;
  caseCode: string;
  patientId: string;
  /** Para la PANTALLA. Nunca sale hacia un modelo de lenguaje. */
  paciente: string | null;
  /**
   * Nombre y apellido por separado, además del armado.
   *
   * No es duplicación: `SendPortalDialog` y `IntakeFormLinkDialog` piden un
   * `caseInfo.patient` con los dos campos sueltos, y partir el nombre completo
   * por el primer espacio se rompe con "Maria del Carmen".
   */
  nombre: string;
  apellido: string;
  /** Decide en qué idioma sale el SMS o el correo. */
  idioma: 'es' | 'en' | undefined;
  /** Cita más próxima dentro de la ventana. */
  citaId: string;
  cita: Date;
  provider: string | null;
  /** 0 = hoy, 1 = mañana… Nunca negativo: el pasado no entra. */
  diasHasta: number;
  /** Ya hizo check-in (o ya salió): no es una llamada, es la tablet. */
  yaLlego: boolean;
  /** Cuánto lleva hecho del intake, y qué le falta. */
  pct: number;
  faltan: MissingKey[];
  /** Teléfono al que hay que llamar, ya desencriptado. `null` = no se puede. */
  telefono: string | null;
  email: string | null;
  /**
   * Por qué no se puede enviar el enlace, si no se puede. La pantalla MUESTRA
   * el botón y lo bloquea con este motivo — nunca lo esconde.
   */
  bloqueoEnvio: 'SIN_TUTOR' | 'SIN_TELEFONO_NI_EMAIL' | null;
  esMenor: boolean;
  /**
   * Lo último que se le mandó o se le habló. `null` = nadie lo contactó nunca.
   *
   * Es la columna que hace que la cola sirva para trabajar EN EQUIPO: sin esto,
   * tres personas llaman al mismo paciente en la misma mañana y ninguna se
   * enteró de las otras.
   */
  ultimoContacto: { canal: 'SMS' | 'EMAIL' | 'LLAMADA'; cuando: Date } | null;
}

export interface ColaIntake {
  /** Los que todavía no llegaron, ordenados por urgencia. */
  filas: FilaIntake[];
  /** Los de hoy que ya están en la clínica: se firman en el mostrador. */
  yaLlegaron: FilaIntake[];
  /** Total de citas en la ventana — el DENOMINADOR de la cola. */
  citasEnVentana: number;
}

/** Diferencia en días entre dos claves `YYYY-MM-DD`. Exacta: son fechas de calendario. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

const nombreDe = (p: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null =>
  `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim() || null;

/**
 * Rellena `ultimoContacto` de todas las filas, en DOS consultas.
 *
 * Se hace al final y en lote a propósito: por fila serían 60 viajes a la base
 * para una pantalla que se mira de paso.
 *
 * Las dos fuentes son las que ya existen y no hay una tercera: `message_logs`
 * guarda cada SMS y cada email con su estado real de entrega, y `call_logs`
 * cada llamada de Twilio. El `intakeFormSentAt` del caso NO se usa: solo guarda
 * el último envío y se sobrescribe, así que no distingue "le mandamos hace 3
 * días" de "le mandamos hace 3 días y además lo llamamos ayer".
 */
async function ponerUltimoContacto(filas: FilaIntake[]): Promise<void> {
  if (filas.length === 0) return;
  const casos = filas.map((f) => f.caseId);

  const [mensajes, llamadas] = await Promise.all([
    db.messageLog.findMany({
      where: { caseId: { in: casos } },
      orderBy: { createdAt: 'desc' },
      select: { caseId: true, channel: true, createdAt: true },
    }),
    db.callLog.findMany({
      where: { caseId: { in: casos } },
      orderBy: { createdAt: 'desc' },
      select: { caseId: true, createdAt: true },
    }),
  ]);

  const ultimo = new Map<string, FilaIntake['ultimoContacto']>();
  const quedarse = (caseId: string, cand: NonNullable<FilaIntake['ultimoContacto']>): void => {
    const previo = ultimo.get(caseId);
    if (!previo || cand.cuando > previo.cuando) ultimo.set(caseId, cand);
  };

  for (const m of mensajes) {
    if (m.caseId) quedarse(m.caseId, { canal: m.channel, cuando: m.createdAt });
  }
  for (const ll of llamadas) {
    if (ll.caseId) quedarse(ll.caseId, { canal: 'LLAMADA', cuando: ll.createdAt });
  }

  for (const f of filas) f.ultimoContacto = ultimo.get(f.caseId) ?? null;
}

export async function colaIntake(opts?: { dias?: number }): Promise<ColaIntake> {
  const ventana = opts?.dias ?? DIAS_VENTANA;
  const hoy = claveDia(new Date());

  /**
   * Ventana UTC holgada: un día para atrás y `ventana + 2` para adelante. El
   * recorte exacto lo hace la clave de día más abajo — acá solo se acota lo que
   * viaja desde la base.
   */
  const ahora = Date.now();
  const desde = new Date(ahora - 36 * 3_600_000);
  const hasta = new Date(ahora + (ventana + 2) * 86_400_000);

  const citas = await db.appointment.findMany({
    where: {
      scheduledFor: { gte: desde, lt: hasta },
      status: { notIn: ESTADOS_MUERTOS as unknown as never[] },
      case: { deletedAt: null },
    },
    orderBy: { scheduledFor: 'asc' },
    select: {
      id: true, scheduledFor: true, status: true,
      provider: { select: { firstName: true, lastName: true } },
      case: {
        select: {
          id: true, caseCode: true,
          intakeFormCompletedAt: true, consentsData: true,
          accidentDate: true, accidentType: true,
          intakeSubmission: { select: { id: true } },
          autoInsurance: { select: { id: true } },
          patient: {
            select: {
              id: true, firstName: true, lastName: true, dateOfBirth: true,
              phone: true, email: true, preferredLanguage: true,
              addressLine1: true, addressCity: true,
              emergencyContactName: true, race: true, sex: true, maritalStatus: true,
              guardianPatient: { select: { firstName: true, lastName: true, phone: true, email: true } },
            },
          },
        },
      },
    },
  });

  const filas: FilaIntake[] = [];
  const yaLlegaron: FilaIntake[] = [];
  /** Un caso puede tener dos citas en la ventana: la más próxima manda. */
  const vistos = new Set<string>();
  let citasEnVentana = 0;

  for (const a of citas) {
    const c = a.case;
    if (!c?.patient) continue;

    const dias = diasEntre(hoy, claveDia(a.scheduledFor));
    if (dias < 0 || dias > ventana) continue;
    citasEnVentana++;

    // El denominador cuenta CITAS; las filas, casos. Por eso el dedup va
    // después de contar y las citas vienen ordenadas por fecha.
    if (vistos.has(c.id)) continue;

    const p = c.patient;
    const caso = {
      intakeFormCompletedAt: c.intakeFormCompletedAt,
      consentsData: c.consentsData as Record<string, unknown> | null,
      accidentDate: c.accidentDate,
      accidentType: c.accidentType,
      hasIntakeSubmission: !!c.intakeSubmission,
      hasAutoInsurance: !!c.autoInsurance,
    };
    if (intakeFirmado(caso)) continue;

    vistos.add(c.id);

    /**
     * Los campos del paciente vienen CIFRADOS (AES-256-GCM). Se desencriptan
     * acá porque esto corre en el servidor; nada de esto sale del back-office
     * sin pasar por la pantalla de alguien que ya puede ver la ficha.
     */
    const domicilio = decryptField(p.addressLine1);
    const ciudad = decryptField(p.addressCity);
    const emergencia = decryptField(p.emergencyContactName);
    const telPaciente = decryptField(p.phone);

    const { pct, faltan } = progresoIntake(caso, {
      addressLine1: domicilio,
      addressCity: ciudad,
      dateOfBirth: p.dateOfBirth,
      emergencyContactName: emergencia,
      race: p.race,
      sex: p.sex,
      maritalStatus: p.maritalStatus,
    });

    /**
     * A quién se le manda el enlace. Mismo criterio que `send-portal-link`: si
     * el paciente es menor, al TUTOR — y sin tutor cargado el envío está
     * bloqueado, no es que falle después del clic.
     */
    const menor = isMinor(p.dateOfBirth);
    const tutor = p.guardianPatient;
    const destino = menor ? tutor : p;
    const telDestino = destino ? decryptField(destino.phone) : null;
    const mailDestino = destino?.email ?? null;

    const bloqueoEnvio: FilaIntake['bloqueoEnvio'] =
      menor && !tutor ? 'SIN_TUTOR'
      : !telDestino && !mailDestino ? 'SIN_TELEFONO_NI_EMAIL'
      : null;

    const fila: FilaIntake = {
      caseId: c.id,
      caseCode: c.caseCode,
      patientId: p.id,
      paciente: nombreDe(p),
      nombre: p.firstName,
      apellido: p.lastName,
      // Cualquier otro valor se deja en `undefined` para que el diálogo resuelva
      // el idioma con su propia lógica en vez de forzarle uno inventado.
      idioma: p.preferredLanguage === 'es' || p.preferredLanguage === 'en' ? p.preferredLanguage : undefined,
      citaId: a.id,
      cita: a.scheduledFor,
      provider: nombreDe(a.provider),
      diasHasta: dias,
      yaLlego: (ESTADOS_LLEGO as readonly string[]).includes(a.status),
      pct,
      faltan,
      // Llamar usa el teléfono del destino, y si el menor no tiene tutor cae al
      // del paciente: alguien contesta ese número, y es mejor que un botón
      // muerto en la única fila que más urge.
      telefono: telDestino ?? telPaciente,
      email: mailDestino,
      bloqueoEnvio,
      esMenor: menor,
      // Lo rellena `ponerUltimoContacto()` en lote, al final.
      ultimoContacto: null,
    };

    if (fila.yaLlego) yaLlegaron.push(fila);
    else filas.push(fila);
  }

  // La cita más próxima primero; a igual día, el que menos tiene hecho —
  // necesita más tiempo para completarlo.
  filas.sort((x, y) => x.cita.getTime() - y.cita.getTime() || x.pct - y.pct);
  yaLlegaron.sort((x, y) => x.cita.getTime() - y.cita.getTime());

  await ponerUltimoContacto([...filas, ...yaLlegaron]);

  return { filas, yaLlegaron, citasEnVentana };
}
