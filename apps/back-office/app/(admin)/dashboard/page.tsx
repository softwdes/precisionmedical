import { db } from '@precision-medical/database';
import { DashboardClient } from './dashboard-client';
import { colaIntake } from '@/lib/cola-intake';
import { atrasosRecepcion } from '@/lib/atrasos-recepcion';
import { canAskSentinel } from '@/lib/sentinel-access';

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

  /**
   * Los tres atrasos y las dos pilas grandes.
   *
   * El criterio vive en `lib/atrasos-recepcion.ts` y ya no acá, porque ahora lo
   * pregunta una SEGUNDA punta: la herramienta `atrasos_de_recepcion` de
   * Sentinel. Si el panel y el agente lo definieran por su lado, el día que
   * alguien mueva un umbral los dos números se contradicen en la misma sesión —
   * es la misma razón por la que `colaIntake()` tampoco vive en su pantalla.
   */
  const atrasos = await atrasosRecepcion();

  /**
   * Sentinel: la capacidad es OPT-IN, así que la caja no se dibuja para quien no
   * la tiene. `configurado` se decide en el SERVIDOR — si falta la clave del
   * proveedor, la caja se muestra bloqueada desde el arranque en vez de dejar
   * preguntar al vacío y fallar después del clic. La variable nunca cruza al
   * cliente: viaja el booleano, no el valor.
   *
   * El caso de ejemplo sale de la cola de HOY, no de un código inventado: la
   * primera versión de Vigía sugería un código que no existía y el agente
   * contestaba —correctamente— que no lo encontraba, con lo que parecía roto
   * justo cuando funcionaba bien.
   */
  const puedeSentinel = await canAskSentinel();
  const sentinel = puedeSentinel
    ? {
        configurado: !!process.env.OPENAI_API_KEY,
        casoEjemplo: intake.titular?.caseCode ?? intake.filas[0]?.caseCode ?? null,
      }
    : null;
  const { intakePendiente, sinAgendar } = atrasos;

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
      sentinel={sentinel}
      numeros={{ citasHoy: intake.citasHoy, intakePendiente, sinAgendar }}
      alerts={{
        newReferralsAged: atrasos.sinPortal.map((c) => ({
          id: c.id, caseCode: c.caseCode, createdAt: c.desde, patientName: c.paciente ?? '—',
        })),
        intakeStalled: atrasos.intakeSinRespuesta.map((c) => ({
          id: c.id, caseCode: c.caseCode, sentAt: c.desde, patientName: c.paciente ?? '—',
        })),
        confirmedNoSched: atrasos.confirmadoSinAgenda.map((c) => ({
          id: c.id, caseCode: c.caseCode, confirmedAt: c.desde, patientName: c.paciente ?? '—',
        })),
      }}
    />
  );
}
