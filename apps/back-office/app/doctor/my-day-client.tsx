'use client';
import { localeApp } from '@/lib/fechas';

/**
 * Portal Médico · Mi Día (B.17) — client
 *
 * Diseño aprobado por gerencia: hero "Siguiente paciente" (gradiente emerald→cyan),
 * cola del día con estados, bloque amber "Acción requerida" (notas sin firmar).
 * Identidad del módulo: violet (Regla #5).
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Ban, CalendarCheck2, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Hourglass, QrCode, RefreshCw, Sun, UserX, Video,
} from 'lucide-react';
import { PageHeader, KpiCard, EmptyState, TagPill, PersonAvatar, DatePicker } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { AppointmentSignQrDialog } from '@/components/calendar/appointment-sign-qr-dialog';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import { OnlineBadge, OnlineMeetingBox } from '@/components/visit/online-visit';
import { PendingNotes } from '@/components/visit/pending-notes';
import { ChargePickerDialog, type BillableItem } from '@/components/visit/charge-picker-dialog';
import { agregarCargo, leerCargos, type PlannedService } from '@/lib/charges';
import { useLiveSync } from '@/lib/use-live-sync';
import { LiveStatus } from '@/components/ui-phoenix/live-status';
import type { CoverageDTO } from '@/lib/coverage';

/**
 * Los tres desenlaces de una cita que no se atendió — el MISMO juego que la fila
 * de Day Admission (`admission-client.tsx`).
 *
 * Está acá porque en la clínica pasa seguido que no hay recepcionista ni
 * asistente y el provider hace todo (Erick, 31-ago-2026). El camino del mostrador
 * NO cambia: los dos lados pegan al mismo endpoint, así que la cola del asistente
 * y Mi Día no se pueden separar.
 */
type Desenlace = 'noShow' | 'cancel' | 'cancelSameDay';

/** Consumió el horario → corresponde penalidad (ver lib/appointment-outcome). */
const cobraPenalidad = (tipo: Desenlace): boolean => tipo !== 'cancel';

/**
 * Los tres desenlaces, en el mismo orden que la fila del mostrador.
 *
 * Va a nivel de módulo y NO dentro de `MyDayClient`: un componente definido
 * adentro de otro cambia de identidad en cada render, así que React desmonta y
 * vuelve a montar el subárbol entero — es la misma trampa que hacía saltar la
 * tabla de usuarios. Acá se llevaría puesto el foco del teclado en medio del
 * pulso de 5 s.
 */
function OutcomeButtons({
  appt, compact = false, onPick,
}: {
  appt: MyDayAppointment;
  compact?: boolean;
  onPick: (appt: MyDayAppointment, tipo: Desenlace) => void;
}): React.ReactElement {
  const ta = useTranslations('phoenix.admission');
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => onPick(appt, 'noShow')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 hover:text-text-1 transition-colors"
      >
        <UserX className="w-3 h-3" />
        {ta('noShow')}
      </button>
      <button
        type="button"
        onClick={() => onPick(appt, 'cancel')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 hover:text-text-1 transition-colors"
      >
        <Ban className="w-3 h-3" />
        {ta('cancel')}
      </button>
      <button
        type="button"
        onClick={() => onPick(appt, 'cancelSameDay')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-amber/40 text-amber text-xs hover:bg-amber/10 transition-colors"
      >
        <Ban className="w-3 h-3" />
        {/* "Canceló el mismo día" no entra en un teléfono al lado de las otras. */}
        <span className={compact ? 'hidden' : 'hidden sm:inline'}>{ta('cancelSameDay')}</span>
        <span className={compact ? 'inline' : 'sm:hidden'}>{ta('cancelSameDayShort')}</span>
      </button>
    </div>
  );
}

export interface MyDayAppointment {
  id: string;
  scheduledFor: string; // ISO
  durationMinutes: number;
  status: string;
  type: string;
  isOnline: boolean;
  meetingUrl: string | null;
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
  hasTriage: boolean;
  /** Mini-resumen de vitales del triaje (null si no hay registro) */
  triage: { systolic: number | null; diastolic: number | null; pulse: number | null; pain: number | null } | null;
  noteStatus: string | null; // DRAFT | SIGNED | null
  /** El doctor ya terminó con este paciente (el asistente cierra la cita) */
  doctorDoneAt: string | null;
  patientFirstName: string;
  patientLastName: string;
  caseId: string | null;
  caseCode: string | null;
  /** ¿Quién paga? Referencia para el doctor antes de entrar a la consulta. */
  coverage: CoverageDTO;
  clinicName: string;
}

interface Props {
  doctorName: string;
  appointments: MyDayAppointment[];
  /** Notas sin cerrar del doctor — mismo criterio que la cola de abajo */
  unsignedTotal: number;
  /** Día visualizado (YYYY-MM-DD, Denver) y navegación */
  dateKey: string;
  isToday: boolean;
  prevDate: string;
  nextDate: string;
}

const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'PENDING'];

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeApp(), {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });
}

/** Hoy en Denver (YYYY-MM-DD) — para marcar "hoy" en el DatePicker */
function todayKeyClient(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function MyDayClient({
  doctorName, appointments, unsignedTotal, dateKey, isToday, prevDate, nextDate,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  /**
   * El vocabulario de la llegada y de los desenlaces vive en `phoenix.admission`
   * — una sola copia para las dos pantallas. Si el mostrador y el portal dijeran
   * cosas distintas de la misma acción, la primera discusión sobre una penalidad
   * sería sobre cuál de los dos textos vale. Mismo criterio que la consulta.
   */
  const ta = useTranslations('phoenix.admission');
  /** Las palabras de la firma nacieron en el panel de la cita; una sola copia. */
  const tc = useTranslations('phoenix.calendar');
  const router = useRouter();
  const [now, setNow] = React.useState(() => Date.now());
  const [isRefreshing, startRefresh] = React.useTransition();
  /**
   * Cita cuyo QR de firma está abierto.
   *
   * El provider reparte el QR cuando está SOLO: sin nadie en el mostrador, la
   * firma de la confirmación tiene que salir de acá o el paciente pasa a consulta
   * sin firmar. Decisión de Erick (2026-08-31) — misma razón por la que esta
   * pantalla ya ofrece los desenlaces que normalmente hace recepción.
   */
  const [qrTarget, setQrTarget] = React.useState<MyDayAppointment | null>(null);
  /** id de la cita que se está abriendo — deshabilita solo ESE botón. */
  const [attending, setAttending] = React.useState<string | null>(null);

  // ── Llegada y desenlaces (reflejo de Day Admission) ──
  const [checkingIn, setCheckingIn] = React.useState<string | null>(null);
  const [desenlaceTarget, setDesenlaceTarget] = React.useState<{ appt: MyDayAppointment; tipo: Desenlace } | null>(null);
  const [sellando, setSellando] = React.useState(false);
  /** Cita a la que le falta la penalidad — abre el picker apenas se sella. */
  const [cargoTarget, setCargoTarget] = React.useState<MyDayAppointment | null>(null);
  const [cargosActuales, setCargosActuales] = React.useState<PlannedService[]>([]);
  const [cargoError, setCargoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Sincronización en vivo con Day Admission por pulso: el check-in y el triaje
  // del asistente aparecen solos. Antes era un `router.refresh()` cada 30 s — un
  // re-render del server component completo, cambiara algo o no. Ahora el pulso
  // (~60 bytes) decide si vale la pena.
  const { lastSyncedAt, failing, syncNow } = useLiveSync({
    url: `/api/admin/pulse?date=${dateKey}`,
    enabled: isToday,
    onChange: () => router.refresh(),
  });

  const sorted = [...appointments].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const completed = sorted.filter(a => a.status === 'COMPLETED');
  const active = sorted.filter(a => ACTIVE.includes(a.status));
  // Llegada = status de llegada O checkedInAt registrado — defensa contra
  // degradaciones de status (bug real: un confirm tardío pisó IN_PROGRESS).
  const arrived = (a: MyDayAppointment): boolean =>
    a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS' || !!a.checkedInAt;
  const waiting = active.filter(a => arrived(a) && !a.doctorDoneAt);

  // Hero solo aplica al día de HOY: en consulta > en espera con triaje > en espera > próxima futura.
  // Los que el doctor ya terminó salen del hero — le toca al asistente cobrarlos.
  // En días pasados/futuros se muestra la lista completa sin hero ni CTA.
  const pending = active.filter(a => !a.doctorDoneAt);
  const hero = isToday
    ? (pending.find(a => a.status === 'IN_PROGRESS')
      ?? pending.find(a => arrived(a) && a.hasTriage)
      ?? pending.find(arrived)
      ?? pending.find(a => new Date(a.scheduledFor).getTime() >= now - 15 * 60_000)
      ?? pending[0]
      ?? null)
    : null;

  const queue = active.filter(a => a.id !== hero?.id);
  const minsTo = hero ? Math.round((new Date(hero.scheduledFor).getTime() - now) / 60_000) : 0;
  const heroArrived = !!hero && arrived(hero);
  // La consulta vive DENTRO del portal (antes apuntaba a clinical.lienmaster.net,
  // que no está deployado y devolvía error de DNS).
  const consultHref = (apptId: string): string => `/doctor/consultation/${apptId}`;

  /**
   * Atender: el único verbo del doctor. "Este paciente pasa conmigo AHORA".
   *
   * Hace toda la contabilidad que falte —marca la llegada si nadie la marcó,
   * pasa a sala— y abre la consulta. El doctor no piensa en check-in: piensa en
   * a quién atiende.
   *
   * Por qué desapareció el candado que exigía triaje (era la regla de Erick del
   * 28-jul: "listo para atender = check-in + triaje"): esa regla suponía que el
   * triaje lo hace OTRO y que el doctor tiene que esperarlo. Cuando está solo no
   * hay a quién esperar, y el candado lo dejaba mirando un cartel. Ahora el que
   * obliga a pasar por el triaje es el ATERRIZAJE: sin vitales la consulta abre
   * en el nodo 2, con el formulario adelante. Se pasa por el mismo lugar, pero
   * pudiendo resolverlo.
   *
   * Las dos llamadas van separadas y en este orden a propósito: `admit` rellena
   * `checkedInAt` solo, pero audita ADMIT_TO_ROOM, no CHECK_IN — y sin la fila
   * de CHECK_IN con su `source` se pierde la marca de que la llegada la registró
   * el provider, que es de donde sale el Checkout del Resumen. Las dos son
   * idempotentes, así que repetirlas no escribe dos veces.
   */
  const atender = async (appt: MyDayAppointment): Promise<void> => {
    setAttending(appt.id);
    try {
      if (!arrived(appt)) await marcarLlegada(appt);
      if (appt.status !== 'IN_PROGRESS') {
        await fetch(`/api/admin/admission/${appt.id}/admit`, { method: 'POST' });
      }
    } catch { /* la consulta mostrará el estado real */ }
    setAttending(null);
    router.push(consultHref(appt.id));
  };

  /**
   * Marcar la llegada, sin tomar al paciente.
   *
   * Mismo endpoint que aprieta el mostrador; lo único que agrega es `source`,
   * que deja asentado en el audit log que la llegada la marcó el provider. De
   * ahí sale después el Checkout del resumen (si no hubo nadie para recibir al
   * paciente, tampoco va a haber nadie para cerrarle la visita) y el número de
   * cuántas veces por semana un provider cubre un puesto vacío.
   *
   * Es la acción SECUNDARIA, y existe para el único caso en que los dos momentos
   * se separan de verdad: alguien llega mientras el doctor está con otro
   * paciente y quiere dejarlo anotado sin atenderlo todavía. Cuando los dos
   * momentos son el mismo —el doctor solo, que abre la puerta y atiende— el
   * botón es "Atender" y esto va adentro.
   *
   * Sobre el reloj de espera: cuando la MISMA persona registra la llegada y
   * empieza la consulta, la espera es cero de verdad, no un dato que se pierde
   * (nadie estaba en el mostrador anotando que el paciente llegó a las 9:00).
   * Las métricas que quieran medir espera real tienen cómo separarlas: los
   * check-in del portal quedan marcados con `source`.
   */
  const marcarLlegada = async (appt: MyDayAppointment): Promise<void> => {
    setCheckingIn(appt.id);
    try {
      await fetch(`/api/admin/admission/${appt.id}/check-in`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source: 'doctor-portal' }),
      });
      router.refresh();
    } finally {
      setCheckingIn(null);
    }
  };

  /**
   * Sellar el desenlace. Pega al MISMO `PATCH /api/admin/appointments/:id` que
   * usan la fila de Day Admission y el panel del calendario: un solo camino
   * escribe el estado.
   *
   * Si consumió el horario se abre enseguida el picker de servicios para elegir
   * el código de la penalidad — encadenarlo es la mitad del punto. Sellar el
   * desenlace sin el cargo es exactamente lo que llena la sección "Falta la
   * penalidad" del asistente, y acá no hay asistente que la vacíe después.
   */
  const confirmDesenlace = async (): Promise<void> => {
    const target = desenlaceTarget;
    if (!target) return;
    const { appt, tipo } = target;
    setSellando(true);
    try {
      const body = tipo === 'noShow'
        ? { status: 'NO_SHOW' }
        : { status: 'CANCELLED', cancelledSameDay: tipo === 'cancelSameDay' };
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) return;
      setDesenlaceTarget(null);
      router.refresh();
      if (!cobraPenalidad(tipo)) return;
      // Lo que la cita ya tenía cargado, para no escribir un duplicado encima.
      setCargosActuales(await leerCargos(appt.id));
      setCargoError(null);
      setCargoTarget(appt);
    } finally {
      setSellando(false);
    }
  };

  /** Agrega el código elegido y deja la deuda creada (ver lib/charges). */
  const onAgregarCargo = async (item: BillableItem): Promise<void> => {
    const appt = cargoTarget;
    if (!appt) return;
    const r = await agregarCargo({
      appointmentId: appt.id,
      caseId:        appt.caseId ?? undefined,
      item,
      actuales:      cargosActuales,
    });
    setCargosActuales(r.servicios);
    // Sin caso no hay dónde colgar la deuda: hay que decirlo, no dejar que el
    // clic parezca que funcionó (`sync-billing` responde `no_case`).
    setCargoError(r.ok ? null : r.error === 'NO_CASE' ? ta('penaltyNoCase') : ta('penaltyFailed'));
    if (r.ok) router.refresh();
  };


  const statusPill = (a: MyDayAppointment): React.ReactElement => {
    // El doctor ya terminó — falta que el asistente cobre y cierre la cita
    if (a.doctorDoneAt) return <TagPill label={t('statusDoctorDone')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />;
    if (a.status === 'IN_PROGRESS') return <TagPill label={t('statusInProgress')} colorClass="bg-violet/15 text-violet-text border-violet/30" />;
    if (arrived(a)) {
      if (a.hasTriage) return <TagPill label={t('triageDone')} colorClass="bg-cyan/15 text-cyan border-cyan/30" />;
      // Sin triaje pero online: no está "esperando triaje", está lista para
      // atender. Decir lo contrario manda al asistente a buscar un dato que no
      // se puede tomar por video.
      if (a.isOnline) return <TagPill label={t('statusReadyOnline')} colorClass="bg-cyan/15 text-cyan border-cyan/30" />;
      return <TagPill label={t('statusWaiting')} colorClass="bg-amber/15 text-amber border-amber/30" />;
    }
    return <TagPill label={t('statusPending')} colorClass="bg-amber/15 text-amber border-amber/30" />;
  };

  return (
    <div className="space-y-6">
      {/* Header + navegación de fecha en la misma línea (gana espacio vertical).
          Controles táctiles h-10 (iPad); en mobile hacen wrap bajo el título. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={t('greeting', { name: doctorName })}
          subtitle={t('myDaySubtitle', { count: active.length + completed.length })}
        />
        {/* Date navigator — mismo patrón que Day Admission, identidad violet */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Frescura: hace cuánto se sabe que está al día, y aviso ámbar si dejó
              de sincronizar. Solo hoy — en otros días no hay nada que sincronizar. */}
          {isToday && (
            <LiveStatus lastSyncedAt={lastSyncedAt} failing={failing} onRetry={syncNow} />
          )}
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            aria-label={t('refresh')}
            title={t('refresh')}
            className="w-9 h-9 rounded-md border border-border hover:bg-white/5 text-text-muted hover:text-text-1 flex items-center justify-center transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-1 rounded-md border border-border bg-bg-2/40 h-9 px-1">
            <Link
              href={`/doctor?date=${prevDate}`}
              aria-label={t('dayPrev')}
              className="flex items-center gap-1 px-2 h-7 rounded hover:bg-bg-2 text-text-muted hover:text-text-1 transition-colors text-xs font-medium"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('dayPrevShort')}</span>
            </Link>
            <DatePicker
              value={dateKey}
              onChange={(k) => router.push(k === todayKeyClient() ? '/doctor' : `/doctor?date=${k}`)}
              accent="violet"
              todayLabel={t('dayToday')}
              todayKey={todayKeyClient()}
              className="[&>button]:border-0 [&>button]:bg-transparent [&>button]:h-7 [&>button]:text-sm [&>button]:font-semibold"
            />
            <Link
              href={`/doctor?date=${nextDate}`}
              aria-label={t('dayNext')}
              className="flex items-center gap-1 px-2 h-7 rounded hover:bg-bg-2 text-text-muted hover:text-text-1 transition-colors text-xs font-medium"
            >
              <span className="hidden sm:inline">{t('dayNextShort')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {!isToday && (
            <Link
              href="/doctor"
              className="h-9 px-3 rounded-md border border-violet/40 text-violet-text text-xs font-semibold hover:bg-violet/10 transition-colors flex items-center"
            >
              {t('dayToday')}
            </Link>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard compact label={t(isToday ? 'kpiToday' : 'kpiDay')} value={active.length + completed.length} color="text-violet-text" icon={CalendarCheck2} iconBg="bg-violet/10" iconColor="text-violet-text" />
        <KpiCard compact label={t('kpiCompleted')} value={completed.length} color="text-emerald" icon={CheckCircle2} iconBg="bg-emerald/10" iconColor="text-emerald" />
        <KpiCard compact label={t('kpiWaiting')} value={waiting.length} color="text-cyan" icon={Hourglass} iconBg="bg-cyan/10" iconColor="text-cyan" />
        <KpiCard compact label={t('kpiUnsigned')} value={unsignedTotal} color={unsignedTotal > 0 ? 'text-amber' : 'text-text-1'} icon={Clock3} iconBg="bg-amber/10" iconColor="text-amber" />
      </div>

      {/* Hero — Siguiente paciente (gradiente emerald→cyan del mockup B.17) */}
      {hero ? (
        <div
          className="rounded-xl border p-4 sm:p-5 space-y-3"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.13), rgba(6,182,212,0.10))',
            borderColor: 'rgba(16,185,129,0.40)',
          }}
        >
         <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* La zona del paciente abre la consulta en lectura aunque no haya
              check-in — el guardrail aplica a ATENDER, no a ver los datos */}
          <Link
            href={consultHref(hero.id)}
            title={t('openConsultation')}
            className="flex items-center gap-3 flex-1 min-w-0 rounded-lg -m-1 p-1 hover:bg-white/[0.04] transition-colors"
          >
            <PersonAvatar firstName={hero.patientFirstName} lastName={hero.patientLastName} size={12} gradientClass="bg-gradient-to-br from-emerald to-cyan" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-emerald">
                {hero.status === 'IN_PROGRESS' ? t('statusInProgress') : t('heroNext')}
              </div>
              <div className="text-xl font-bold text-text-1 truncate">
                {hero.patientFirstName} {hero.patientLastName}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                {hero.caseCode && <span className="font-mono text-[11px] text-cyan">{hero.caseCode}</span>}
                <span className="text-text-2">{timeLabel(hero.scheduledFor)}</span>
                {minsTo > 0 && minsTo < 180 && (
                  <span className="text-emerald font-semibold text-[12px]">{t('inMinutes', { min: minsTo })}</span>
                )}
                {hero.isOnline && <OnlineBadge />}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                <span className={hero.hasTriage ? 'text-emerald' : hero.isOnline ? 'text-cyan' : ''}>
                  {hero.hasTriage ? t('triageDone') : hero.isOnline ? t('triageOnlineNA') : t('triagePendingShort')}
                </span>
                <span>·</span>
                <span>{hero.attendanceSignedAt ? t('attendanceSigned') : t('attendancePending')}</span>
                <span>·</span>
                <span>{hero.clinicName}</span>
              </div>
              {/* Mini-resumen del triaje — el doctor ve los vitales sin salir de Mi Día */}
              {hero.hasTriage && hero.triage && (
                <div className="flex items-center gap-3 mt-1.5 text-[11px] flex-wrap">
                  {hero.triage.systolic != null && hero.triage.diastolic != null && (
                    <span className="text-text-2"><b className="text-text-1">{t('vitBP')}</b> {hero.triage.systolic}/{hero.triage.diastolic}</span>
                  )}
                  {hero.triage.pulse != null && (
                    <span className="text-text-2"><b className="text-text-1">{t('vitPulse')}</b> {hero.triage.pulse} bpm</span>
                  )}
                  {hero.triage.pain != null && (
                    <span className={hero.triage.pain >= 7 ? 'text-amber font-semibold' : 'text-text-2'}>
                      <b className={hero.triage.pain >= 7 ? 'text-amber' : 'text-text-1'}>{t('vitPain')}</b> {hero.triage.pain}/10
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
          {/* Fuera del <Link> a propósito: un <button> dentro de un <a> es HTML
              inválido y el click quedaría peleado entre navegar y abrir el
              diálogo. Acá es editable porque es el paciente que el doctor tiene
              enfrente — en la cola de abajo va en modo lectura. */}
          <div className="shrink-0">
            <CoverageChip caseId={hero.caseId} coverage={hero.coverage} size="md" />
          </div>
          {/* UN verbo: Atender. Y solo mientras el paciente no llegó, las salidas
              de la cita que no va a ocurrir.

              Antes había tres estados con tres botones distintos —check-in,
              "tomar triaje", atender— y antes de eso, dos carteles muertos. Los
              tres pasos siguen existiendo, pero el doctor no tiene que elegir
              cuál le toca: "Atender" hace la contabilidad que falte y lo deja en
              el paso pendiente. Cuando está solo, marcar la llegada y tomar al
              paciente son el MISMO gesto (Erick, 31-ago-2026). */}
          <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void atender(hero)}
              disabled={attending === hero.id}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold disabled:opacity-70"
              style={{ background: 'linear-gradient(135deg, #10B981, #14b8a6)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}
            >
              {t('attendNow')} →
            </button>
            {/* El QR del hero va FUERA del `!heroArrived`: la firma hace falta
                igual después de marcarle la llegada — lo que la cierra es pasar a
                consulta, no haber llegado. */}
            {!hero.attendanceSignedAt && (
              <button
                type="button"
                onClick={() => setQrTarget(hero)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-white/25 bg-white/10 text-white text-xs font-semibold hover:bg-white/15 transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                {tc('actionSignQr')}
              </button>
            )}
            {!heroArrived && (
              <div className="flex items-center gap-1.5 flex-wrap sm:justify-end">
                {/* Secundario y sin color: es la excepción (llega alguien
                    mientras el doctor está con otro y lo quiere dejar anotado). */}
                <button
                  type="button"
                  onClick={() => void marcarLlegada(hero)}
                  disabled={checkingIn === hero.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 hover:text-text-1 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {t('markArrival')}
                </button>
                {/* Los desenlaces solo mientras el paciente no llegó: una vez
                    adentro, "no vino" es una contradicción. Igual que la fila del
                    mostrador, que tampoco los ofrece después del check-in. */}
                <OutcomeButtons appt={hero} compact onPick={(x, tipo) => setDesenlaceTarget({ appt: x, tipo })} />
              </div>
            )}
          </div>
         </div>

          {/* El enlace va FUERA del <Link> del paciente: tiene un botón y un
              <a>, y anidarlos dentro de otro <a> es HTML inválido — el clic
              quedaría peleado entre navegar a la consulta y copiar. */}
          {hero.isOnline && <OnlineMeetingBox meetingUrl={hero.meetingUrl} />}
        </div>
      ) : (active.length + completed.length === 0) ? (
        <EmptyState.Rich icon={Sun} title={t('emptyDayTitle')} subtitle={t('emptyDaySubtitle')} />
      ) : null}

      {/* Cola del día */}
      {queue.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
            {t(isToday ? 'upcomingTitle' : 'dayAppointmentsTitle')}
          </div>
          <div className="space-y-1.5">
            {queue.map(a => (
              /* La fila dejó de ser un <Link> entero para poder llevar acciones:
                 un <button> dentro de un <a> es HTML inválido y el clic quedaría
                 peleado entre navegar y sellar. Ahora el link cubre la zona de
                 datos y los botones viven afuera, en la misma caja. */
              <div
                key={a.id}
                className="rounded-lg border border-border bg-bg-1 px-3 py-2 flex items-center gap-3 flex-wrap hover:border-violet/40 hover:bg-violet/[0.04] transition-colors group"
              >
                <Link
                  href={consultHref(a.id)}
                  title={t('openConsultation')}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <span className="font-mono text-[11px] text-text-muted w-[64px] shrink-0">{timeLabel(a.scheduledFor)}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text-1 truncate">
                      {a.patientFirstName} {a.patientLastName}
                    </span>
                    <span className="ml-2 font-mono text-[10px] text-cyan hidden sm:inline">{a.caseCode ?? ''}</span>
                    {/* Solo la marca: esta zona es un <Link> y un botón de copiar
                        adentro sería HTML inválido. El enlace se copia en el hero
                        o entrando a la consulta. */}
                    {a.isOnline && <span className="ml-1.5 align-middle inline-flex"><OnlineBadge compact /></span>}
                  </div>
                  {/* Solo lectura: quien corrige la cobertura es recepción o el
                      asistente desde Day Admission. El doctor la resuelve en el
                      hero o entrando a la consulta. */}
                  <span className="hidden sm:inline">
                    <CoverageChip caseId={a.caseId} coverage={a.coverage} editable={false} />
                  </span>
                  {statusPill(a)}
                  {/* Solo cuando FALTA la firma. Al revés que la cola del
                      mostrador, que muestra los dos lados: acá el estado
                      accionable es "todavía no firmó", y un "Firmado" verde en
                      cada fila duplicaría las pastillas sin agregar una decisión.
                      El hero, arriba, sí dice las dos cosas. */}
                  {!a.doctorDoneAt && !a.attendanceSignedAt && (
                    <TagPill label={tc('unsignedBadge')} colorClass="bg-amber/15 text-amber border-amber/30" />
                  )}
                </Link>
                {/* Mismo juego que la fila del mostrador, y por el mismo motivo:
                    si no hay asistente, el provider tiene que poder resolver la
                    cita igual.

                    SIN condicionar por fecha, igual que Day Admission: ahí
                    `isToday` gobierna el pulso en vivo y la etiqueta del KPI, no
                    las acciones de la fila (salen con `isPending`, en cualquier
                    día). Nació con un `isToday &&` de más y el resultado fue que
                    en cualquier día que no fuera hoy no había un solo botón —
                    justo el caso del provider que al otro día cierra los
                    no-shows que quedaron sueltos. Una restricción que el
                    mostrador no tiene no es un reflejo. */}
                {!a.doctorDoneAt && (
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-end">
                    {/* Mismo verbo que el hero: el hero cubre a UNO, y un doctor
                        sin asistente puede tener cuatro esperando. Sin esto la
                        fila quedaba muerta apenas se marcaba la llegada — pasaba
                        de cuatro acciones a ninguna, justo cuando el paciente ya
                        está adentro y lo que sigue es tomarle los signos. */}
                    {/* El QR ANTES de "Atender": es lo que va primero en el
                        flujo — el paciente firma y después pasa. Puesto después
                        del botón verde nadie lo miraría. */}
                    {/* Con texto y en ámbar, igual que en la cola del mostrador:
                        solo el ícono se leía como un glifo roto al lado del botón
                        verde. Ámbar porque es lo que FALTA, no una acción neutra. */}
                    {!a.attendanceSignedAt && (
                      <button
                        type="button"
                        onClick={() => setQrTarget(a)}
                        title={tc('actionSignQr')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-amber/40 bg-amber/10 text-amber text-xs font-semibold hover:bg-amber/20 transition-colors"
                      >
                        <QrCode className="w-3 h-3" />
                        {tc('actionSignShort')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void atender(a)}
                      disabled={attending === a.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald text-white text-xs font-semibold hover:bg-emerald/90 transition-colors disabled:opacity-50"
                    >
                      {t('attendNow')} →
                    </button>
                    {!arrived(a) && (
                      <>
                        <button
                          type="button"
                          onClick={() => void marcarLlegada(a)}
                          disabled={checkingIn === a.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-text-2 text-xs hover:bg-white/5 hover:text-text-1 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {t('markArrival')}
                        </button>
                        <OutcomeButtons appt={a} compact onPick={(x, tipo) => setDesenlaceTarget({ appt: x, tipo })} />
                      </>
                    )}
                  </div>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-violet-text shrink-0 transition-colors" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Atendidas hoy */}
      {completed.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">
            {t('completedTitle')}
          </div>
          <div className="space-y-1.5">
            {completed.map(a => (
              <Link
                key={a.id}
                href={consultHref(a.id)}
                title={t('openConsultation')}
                className="rounded-lg border border-border bg-bg-1 px-3 py-2 flex items-center gap-3 opacity-60 hover:opacity-100 hover:border-violet/40 hover:bg-violet/[0.04] transition-all group"
              >
                <span className="font-mono text-[11px] text-text-muted w-[64px] shrink-0">{timeLabel(a.scheduledFor)}</span>
                <span className="flex-1 min-w-0 text-sm text-text-1 truncate">
                  {a.patientFirstName} {a.patientLastName}
                </span>
                <TagPill label={t('statusDone')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
                <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-violet-text shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Notas sin cerrar — cola completa, no un tope de 8.
          La nota puede quedar abierta MESES (solo el doctor la cierra), así que
          esto tiene que mostrar todo el pendiente y su antigüedad, no las últimas
          ocho. Incluye las visitas atendidas sin ninguna nota escrita, que antes
          no aparecían en ningún lado porque la fila ni se creaba. */}
      <PendingNotes
        scope="mine"
        canClose
        // `?desde=notas` en la ida es lo que hace que el "volver" de la consulta
        // traiga la cola abierta, para seguir cerrando la siguiente.
        hrefFor={(id) => `/doctor/consultation/${id}?desde=notas`}
        reopenParam="notas"
      />

      {/* Acceso rápido al calendario */}
      <div className="text-[12px] text-text-muted">
        <Link href="/doctor/calendar" className="text-violet-text hover:underline font-semibold">
          {t('goToCalendar')} →
        </Link>
      </div>

      {/* Confirm de por medio: los tres desenlaces pesan en las métricas del
          doctor y los botones quedan al lado de "Check-in". El texto NO es el
          mismo para los tres — la diferencia entre cobrar y no cobrar tiene que
          estar dicha en el momento de decidir, no después. Son las mismas frases
          que lee el mostrador. */}
      <ConfirmDialog
        open={!!desenlaceTarget}
        variant="warning"
        title={desenlaceTarget ? ta(`desenlaceTitle_${desenlaceTarget.tipo}` as 'desenlaceTitle_noShow') : ''}
        description={desenlaceTarget
          ? ta(`desenlaceBody_${desenlaceTarget.tipo}` as 'desenlaceBody_noShow',
              { name: `${desenlaceTarget.appt.patientFirstName} ${desenlaceTarget.appt.patientLastName}` })
          : ''}
        confirmLabel={sellando ? ta('desenlaceSealing') : ta('desenlaceConfirm')}
        cancelLabel={ta('desenlaceCancel')}
        onConfirm={() => { void confirmDesenlace(); }}
        onCancel={() => setDesenlaceTarget(null)}
      />

      {/* QR de firma. Al cerrar se refresca: si el paciente firmó con el modal
          abierto, el chip de su fila tiene que irse sin recargar la pantalla. */}
      {qrTarget && (
        <AppointmentSignQrDialog
          open
          onOpenChange={(v) => { if (!v) { setQrTarget(null); router.refresh(); } }}
          appointmentId={qrTarget.id}
          patientName={`${qrTarget.patientFirstName} ${qrTarget.patientLastName}`}
          apptLabel={timeLabel(qrTarget.scheduledFor)}
        />
      )}

      {/* El picker de servicios, ahí mismo. Es el MISMO que usa el tab de
          Servicios de la consulta y la fila del mostrador. La cobertura va la
          real de la cita —no `UNSET`— porque acá sí la tenemos: decide qué
          catálogo abre primero. */}
      {cargoTarget && (
        <ChargePickerDialog
          coverage={cargoTarget.coverage}
          /* El picker indexa por `item.key`, que para el circuito de seguro es
             `s<refId>`. Con la clave mal armada el ítem ya cargado no se marcaría
             y se agregaría dos veces. No se listan los de efectivo: a un no-show
             todavía no se le cobró nada. */
          added={new Map(cargosActuales.map(c => [`s${c.id}`, 1]))}
          onClose={() => { setCargoTarget(null); setCargoError(null); }}
          onAdd={onAgregarCargo}
        />
      )}
      {cargoError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] flex items-start gap-2 rounded-lg border border-rose/40 bg-bg-1/95 backdrop-blur px-4 py-2 shadow-xl max-w-[min(90vw,32rem)]">
          <AlertTriangle className="w-4 h-4 text-rose shrink-0 mt-0.5" />
          <span className="text-rose text-sm font-medium">{cargoError}</span>
        </div>
      )}
    </div>
  );
}
