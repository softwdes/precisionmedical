import { db } from '@precision-medical/database';
import { DashboardClient } from './dashboard-client';
import { colaIntake } from '@/lib/cola-intake';

/**
 * B.29 — Panel de Recepción.
 *
 * ── Qué es esta pantalla, y qué dejó de ser ──────────────────────────────────
 *
 * Es **la cola diaria del centinela**, no un marcador. La decisión es de Erick
 * (2026-09-02) y sale de una medición: el dashboard tiene el récord raro de ser
 * la pantalla que más gente pisa (12 de 12) y en la que menos se trabaja (~6 min
 * por persona por día). Nadie *va* al dashboard: todos lo *cruzan*.
 *
 * En un lugar de paso un número no produce ninguna acción. "8 portales enviados
 * hoy" no le hace hacer nada a nadie en seis minutos. Lo único que aprovecha un
 * felpudo es una lista corta de nombres con un botón al lado.
 *
 * Por eso se fueron cuatro bloques que estaban acá abajo (Erick, 2026-09-08):
 *
 *  · **Cola por estado** — `ACTIVE = 2.817` es mentira conocida: la migración
 *    aplanó los casos cerrados. Un número que sabemos falso es peor que ninguno.
 *  · **Próximas citas (30 filas)** — copia peor del Calendario, que tiene vista
 *    de día de 15 minutos y 537 minutos de uso real contra los 216 de acá.
 *  · **Actividad reciente (20 eventos)** — copia peor de `/admin/metrics`, que
 *    además desglosa por persona.
 *  · **Los cuatro KPI grandes** (casos creados · portales enviados ·
 *    confirmaciones · agendas) — un marcador de productividad, y para eso está
 *    `/admin/metrics`.
 *
 * Quedan tres números, y los tres son una decisión, no un puntaje: cuántas citas
 * hay hoy (el DENOMINADOR de la cola — "17 de 41" significa algo, "17" solo no),
 * cuántos casos esperan el intake (la pileta de la que sale la cola de mañana) y
 * cuántos confirmados no tienen cita (trabajo de recepción esperando).
 *
 * ── Los "Atrasos del front office" siguen ────────────────────────────────────
 *
 * Las tres reglas de `attentionRequired` se quedan: no son un marcador, son tres
 * listas de casos con nombre y un enlace. Cambia el nombre para que no haya dos
 * cajas de "atención" en la misma pantalla.
 */

export default async function DashboardPage() {
  /**
   * La cola del centinela.
   *
   * Los bordes del día los resuelve `colaIntake()` con `ZONA_CLINICA`. El resto
   * de esta página ya no calcula "hoy" por su cuenta: las tres consultas de
   * atrasos son ventanas relativas ("hace más de una hora"), que no dependen de
   * dónde empieza el día. El viejo `new Date(y, m, d)` —la zona del SERVIDOR, con
   * un comentario que decía "Phase 2 con timezone lib propia"— se fue con los
   * KPI que lo usaban, y con él el bug de que una cita de las 7 de la mañana
   * cayera en el bucket equivocado media parte del año.
   */
  const intake = await colaIntake();

  const ahora = Date.now();
  const haceUnaHora  = new Date(ahora - 60 * 60 * 1000);
  const haceUnDia    = new Date(ahora - 24 * 60 * 60 * 1000);
  const haceDosDias  = new Date(ahora - 48 * 60 * 60 * 1000);

  const [
    newReferralsAged,   // NEW_REFERRAL > 1h sin portal enviado
    intakeStalled,      // INTAKE_PENDING > 24h (el paciente no respondió)
    confirmedNoSched,   // CONFIRMED > 48h sin agendar
    intakePendiente,    // la pileta: de acá sale la cola de mañana
    sinAgendar,         // confirmados esperando cita
  ] = await Promise.all([
    db.case.findMany({
      where: { status: 'NEW_REFERRAL', deletedAt: null, createdAt: { lte: haceUnaHora } },
      take: 10,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, caseCode: true, createdAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    db.case.findMany({
      where: { status: 'INTAKE_PENDING', deletedAt: null, intakeFormSentAt: { lte: haceUnDia } },
      take: 10,
      orderBy: { intakeFormSentAt: 'asc' },
      select: {
        id: true, caseCode: true, intakeFormSentAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    db.case.findMany({
      where: { status: 'CONFIRMED', deletedAt: null, firstAppointmentConfirmedAt: { lte: haceDosDias } },
      take: 10,
      orderBy: { firstAppointmentConfirmedAt: 'asc' },
      select: {
        id: true, caseCode: true, firstAppointmentConfirmedAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    db.case.count({ where: { status: 'INTAKE_PENDING', deletedAt: null } }),
    /**
     * Confirmado y sin ninguna cita viva. `none` con los estados muertos
     * excluidos, y no `appointments: { none: {} }` a secas: un caso cuya única
     * cita se canceló SÍ está esperando que alguien lo agende, y con el `none`
     * pelado quedaba invisible.
     */
    db.case.count({
      where: {
        status: 'CONFIRMED',
        deletedAt: null,
        appointments: { none: { status: { notIn: ['CANCELLED', 'NO_SHOW'] } } },
      },
    }),
  ]);

  const aVista = (f: (typeof intake.filas)[number]) => ({
    caseId: f.caseId,
    caseCode: f.caseCode,
    paciente: f.paciente,
    nombre: f.nombre,
    apellido: f.apellido,
    email: f.email,
    ...(f.idioma ? { idioma: f.idioma } : {}),
    // Las fechas cruzan como ISO: el panel las formatea con la zona de la
    // clínica, no con la del navegador de quien mira.
    cita: f.cita.toISOString(),
    provider: f.provider,
    diasHasta: f.diasHasta,
    minutosHasta: f.minutosHasta,
    nivel: f.nivel,
    prioridad: f.prioridad,
    pct: f.pct,
    faltan: f.faltan as string[],
    telefono: f.telefono,
    bloqueoEnvio: f.bloqueoEnvio,
    esMenor: f.esMenor,
    ultimoContacto: f.ultimoContacto
      ? { canal: f.ultimoContacto.canal, cuando: f.ultimoContacto.cuando.toISOString() }
      : null,
  });

  return (
    <DashboardClient
      intake={{
        filas: intake.filas.map(aVista),
        yaLlegaron: intake.yaLlegaron.map(aVista),
        citasEnVentana: intake.citasEnVentana,
        citasHoy: intake.citasHoy,
        titular: intake.titular ? aVista(intake.titular) : null,
      }}
      numeros={{ citasHoy: intake.citasHoy, intakePendiente, sinAgendar }}
      alerts={{
        newReferralsAged: newReferralsAged.map((c) => ({
          id: c.id, caseCode: c.caseCode, createdAt: c.createdAt,
          patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        })),
        intakeStalled: intakeStalled.map((c) => ({
          id: c.id, caseCode: c.caseCode, sentAt: c.intakeFormSentAt!,
          patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        })),
        confirmedNoSched: confirmedNoSched.map((c) => ({
          id: c.id, caseCode: c.caseCode, confirmedAt: c.firstAppointmentConfirmedAt!,
          patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        })),
      }}
    />
  );
}
