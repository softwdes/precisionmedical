/**
 * Portal Médico · Mi Día (B.17 — D1)
 *
 * Server component: citas del día del doctor (Denver, DST-aware) + notas DRAFT
 * pendientes de firma. Todo scoped por el Provider de la sesión.
 * Navegable por día: ?date=YYYY-MM-DD (default hoy) — igual que Day Admission.
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal } from '@/lib/decrypt';
import { getSessionProvider } from '@/lib/get-session-provider';
import { COVERAGE_LIST_SELECT, resolveCoverage, serializeCoverage } from '@/lib/coverage';
import { claveDia, rangoDelDia, DIA_MS } from '@/lib/fechas';
import { MyDayClient, type MyDayAppointment } from './my-day-client';
import { CifoSaludoProvider } from './cifo-saludo-provider';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('myDay') };
}

/**
 * El rango del día y la clave de día viven en `lib/fechas` (`rangoDelDia`,
 * `claveDia`). Estaban duplicados acá —y `dayKeyOf` era una copia exacta de
 * `claveDia`, que ya existía— hasta que el parte de la mañana necesitó el mismo
 * cálculo: dos copias del rango son dos conteos que se separan el día que
 * alguien toque una sola.
 */

export default async function DoctorMyDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}): Promise<React.ReactElement> {
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { date: dateParam } = await searchParams;
  const requested = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  const { start, end, key: dateKey } = rangoDelDia(requested);
  const todayKey = claveDia(new Date());
  const prevDate = claveDia(new Date(start.getTime() - DIA_MS / 2));
  const nextDate = claveDia(new Date(end.getTime() + DIA_MS / 2));

  // Las tres en paralelo: cada round-trip a la base cuesta ~150 ms, no vale
  // encadenarlas (`doctorDoneAt` va en SQL directo, ver nota más abajo).
  const [appts, pendingNotesTotal, doneRows] = await Promise.all([
    db.appointment.findMany({
      where: {
        providerId: provider.id,
        scheduledFor: { gte: start, lt: end },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      orderBy: { scheduledFor: 'asc' },
      select: {
        id: true,
        scheduledFor: true,
        durationMinutes: true,
        status: true,
        type: true,
        isOnline: true,
        meetingUrl: true,
        checkedInAt: true,
        attendanceSignedAt: true,
        /* La fecha de nacimiento va para EVALUAR los vitales: los umbrales
           son de adulto y en un menor no aplican. */
        patient: { select: { firstName: true, lastName: true, dateOfBirth: true } },
        // `caseType` alimenta la sugerencia de cobertura (un MVA sugiere lien).
        // `consentsData` NO se trae acá: es el JSON de todos los consentimientos
        // y por 20 filas es payload que la lista no usa — la sugerencia derivada
        // del intake solo hace falta en el diálogo, que trae un caso solo.
        case: { select: { id: true, caseCode: true, caseType: true, ...COVERAGE_LIST_SELECT } },
        clinic: { select: { name: true } },
        /* Los SEIS vitales que evalúa `hallazgosVitales`, no cuatro.
           Antes traía solo presión, pulso y dolor, así que un O₂ de 86 o una
           fiebre de 103.5 nunca se podían pintar acá: la alerta existiría y
           esta pantalla no tendría con qué dispararla. */
        triageRecord: { select: {
          id: true, systolicMmhg: true, diastolicMmhg: true, pulseBpm: true, painScale: true,
          respiratoryRate: true, tempFahrenheit: true, o2Saturation: true,
        } },
        visitNote: { select: { status: true } },
      },
    }),
    // Notas SIN CERRAR del doctor — el MISMO criterio que /api/admin/pending-notes,
    // para que el KPI y la cola de abajo no muestren números distintos.
    // Incluye las visitas atendidas sin ninguna nota: la fila se crea al primer
    // guardado, así que un doctor que no escribió nada no deja borrador (medido en
    // la base: 38 de 53 pendientes eran de este tipo).
    db.appointment.count({
      where: {
        providerId: provider.id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        AND: [
          { OR: [{ checkedInAt: { not: null } }, { status: { in: ['IN_PROGRESS', 'COMPLETED'] } }] },
          { OR: [{ visitNote: { is: null } }, { visitNote: { status: 'DRAFT' } }] },
        ],
      },
    }),
    // `doctorDoneAt` con SQL directo (ver nota en la página de consulta: el
    // cliente de Prisma quedó sin regenerar por un lock de Windows).
    db.$queryRaw<Array<{ id: string; doctorDoneAt: Date | null }>>`
      SELECT id, "doctorDoneAt" FROM appointments
       WHERE "providerId" = ${provider.id}
         AND "scheduledFor" >= ${start} AND "scheduledFor" < ${end}
         AND "doctorDoneAt" IS NOT NULL
    `,
  ]);

  const doneMap = new Map(doneRows.map((r) => [r.id, r.doctorDoneAt]));

  const appointments: MyDayAppointment[] = appts.map((a) => ({
    id: a.id,
    scheduledFor: a.scheduledFor.toISOString(),
    durationMinutes: a.durationMinutes,
    status: a.status,
    type: a.type,
    isOnline: a.isOnline,
    meetingUrl: a.meetingUrl,
    checkedInAt: a.checkedInAt?.toISOString() ?? null,
    attendanceSignedAt: a.attendanceSignedAt?.toISOString() ?? null,
    hasTriage: !!a.triageRecord,
    triage: a.triageRecord
      ? {
          systolic: a.triageRecord.systolicMmhg,
          diastolic: a.triageRecord.diastolicMmhg,
          pulse: a.triageRecord.pulseBpm,
          pain: a.triageRecord.painScale,
          respRate: a.triageRecord.respiratoryRate,
          tempF: a.triageRecord.tempFahrenheit,
          o2: a.triageRecord.o2Saturation,
        }
      : null,
    noteStatus: a.visitNote?.status ?? null,
    doctorDoneAt: doneMap.get(a.id)?.toISOString() ?? null,
    patientDob: a.patient.dateOfBirth?.toISOString() ?? null,
    patientFirstName: decryptFieldOrOriginal(a.patient.firstName) ?? '',
    patientLastName: decryptFieldOrOriginal(a.patient.lastName) ?? '',
    caseId: a.case?.id ?? null,
    caseCode: a.case?.caseCode ?? null,
    coverage: serializeCoverage(resolveCoverage(a.case ?? {})),
    clinicName: a.clinic.name,
  }));

  /**
   * El saludo de CIFO, con los números de ESTE provider.
   *
   * Sale entero de `appointments`, que ya está armado arriba para pintar la
   * lista: **cero consultas nuevas**. Es la misma regla que en el panel de
   * recepción — si el saludo consultara por su cuenta, podría contradecir a la
   * pantalla que está tapando.
   *
   * Solo cuando se mira HOY: esta pantalla navega por fecha con las flechas, y
   * un "te esperan hace 12 minutos" mientras mirás el martes pasado sería
   * mentira.
   */
  const esHoy = dateKey === todayKey;
  const yaSalio = (s: string) => s === 'COMPLETED' || s === 'CHECKED_OUT';
  // Ya llegó y todavía no entró: ni atendiéndose ni terminado. Ese es el que
  // está sentado en la sala.
  const enSala = appointments.find(
    (a) => a.checkedInAt !== null && a.status !== 'IN_PROGRESS' && !yaSalio(a.status),
  );
  const saludo = {
    hoy: todayKey,
    citasHoy: appointments.length,
    porAtender: appointments.filter((a) => !yaSalio(a.status)).length,
    notasSinCerrar: pendingNotesTotal,
    esperando: enSala
      ? {
          appointmentId: enSala.id,
          paciente: `${enSala.patientFirstName} ${enSala.patientLastName}`.trim(),
          minutos: Math.max(0, Math.round((Date.now() - new Date(enSala.checkedInAt!).getTime()) / 60_000)),
        }
      : null,
  };

  return (
    <>
      {esHoy && <CifoSaludoProvider datos={saludo} />}
      <MyDayClient
        doctorName={`${provider.firstName} ${provider.lastName}`}
        appointments={appointments}
        unsignedTotal={pendingNotesTotal}
        dateKey={dateKey}
        isToday={esHoy}
        prevDate={prevDate}
        nextDate={nextDate}
      />
    </>
  );
}
