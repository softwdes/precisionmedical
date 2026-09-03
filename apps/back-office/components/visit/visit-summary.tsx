'use client';
import { localeApp } from '@/lib/fechas';

/**
 * VisitSummary — nodo 4 del flujo del doctor (B.18 · S1).
 *
 * Resumen de todo lo que pasó en la consulta + checklist de salida. El botón
 * "Terminé con el paciente" NO cierra la cita: sella `doctorDoneAt` y el
 * asistente sigue viendo al paciente en su cola para cobrar y cerrarla.
 *
 * NADA bloquea la salida (Erick 2026-07-29): la nota se puede firmar otro día.
 * Lo que falta se muestra en ámbar y la nota en borrador sigue en "Acción
 * requerida" de Mi Día hasta que el doctor la cierre.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import {
  CheckCircle2, AlertTriangle, Clock3, FileText, FlaskConical, Briefcase,
  HeartPulse, Stethoscope, Loader2, LogOut, RotateCcw, Printer, ChevronRight,
  CalendarPlus, CalendarCheck2, Bandage, DollarSign, Pill, MapPin, CreditCard,
} from 'lucide-react';
import { TagPill, Section } from '@/components/ui-phoenix';
import { AppointmentDialog } from '@/components/calendar/appointment-dialog';
import type { VisitNoteData } from './visit-note-editor';
import type { LabOrderRow } from './labs-tab';
import { useLiveSync } from '@/lib/use-live-sync';
import { STATUS_KEY as RX_STATUS_KEY, STATUS_CLASS as RX_STATUS_CLASS, soloEntregadas } from './rx-integration-status';
import { LabOrderPrintDialog } from './lab-order-print-dialog';
import { AlertaVitales } from './alerta-vitales';

/** Solo los vitales que el resumen muestra — el triaje completo vive en su nodo */
export interface SummaryTriage {
  systolicMmhg: number | null;
  diastolicMmhg: number | null;
  pulseBpm: number | null;
  respiratoryRate: number | null;
  tempFahrenheit: number | null;
  painScale: number | null;
  o2Saturation: number | null;
  chiefComplaint: string | null;
}

interface ServiceCode {
  id: string;
  code: string;
  description: string;
  category?: string;
  /** Fee que se le factura a la aseguradora. Hace falta para el desglose. */
  fee?: number;
}

/** Cargo del catálogo cash (`appointment_services`) — lo paga el paciente. */
interface CashChargeRow {
  id: string;
  code: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unitLabel: string | null;
}

/** Receta de la visita (`prescriptions` vía ScriptSure). */
interface RxRow {
  id: string;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  pharmacyName: string | null;
  status: string;
}

/** Férula entregada (`appointment_braces`) — se paga completa, sin lien ni seguro. */
interface BraceRow {
  id: string;
  code: string;
  name: string;
  sizeLabel: string | null;
  unitPrice: number | string;
  side: string;
  quantity: number;
  status: string;
}

interface Props {
  appointmentId: string;
  note: VisitNoteData | null;
  triage: SummaryTriage | null;
  /**
   * Años cumplidos del paciente — para evaluar los rangos de los vitales.
   * `null` o ausente = no se evalúa, y la alerta lo dice en pantalla.
   */
  edadPaciente?: number | null;
  /**
   * ¿Existe el registro de triaje? Por defecto se deduce de `triage`, que sirve
   * cuando el llamador manda null si no hay registro (la consulta del doctor).
   * Day Admission lo manda explícito porque ahí `triage` es el espejo en vivo del
   * formulario y puede venir todo en null con el triaje ya guardado.
   */
  hasTriage?: boolean;
  services: ServiceCode[];
  checkedInAt: string | null;
  doctorDoneAt: string | null;
  /** Hora en que el asistente cerró la visita — cierra el reloj de tiempo en clínica. */
  checkedOutAt?: string | null;
  /**
   * Saldo pendiente de facturación DEL CASO (`appointment_billing.balanceDue`,
   * sumado por caso — es el mismo alcance del modal "Pago del caso").
   * Es la ÚNICA autoridad sobre cuánto hay que cobrar: incluye los CPT sin pagar,
   * no solo lo de efectivo y férulas. El Resumen no lo recalcula.
   */
  balanceDue?: number;
  /** Abre el modal real de "Pago del caso" (variant assistant). */
  onCollect?: () => void;
  /**
   * La visita fue por videollamada.
   *
   * Cambia lo que el bloque de vitales SIGNIFICA: sin vitales no es un olvido
   * —nadie puede tomar la presión por video— y con vitales son auto-reportados
   * por el paciente. Dentro de seis meses, un bloque vacío sin esta explicación
   * se lee como negligencia.
   *
   * También habilita que el DOCTOR cierre la cita. En una presencial cierra el
   * asistente: el paciente camina hasta el mostrador y ese es el disparador. En
   * una online el paciente cuelga y del lado de la clínica no pasa nada — el
   * doctor es el único que sabe que la llamada terminó, y su tarjeta de "terminé"
   * decía "se lo entrego al asistente" sin que hubiera a quién entregárselo.
   * El camino del asistente NO cambia: sigue cerrándola desde Day Admission
   * cuando el doctor se olvida, como funcionó siempre (Erick, 25-ago-2026).
   */
  isOnline?: boolean;
  /**
   * La llegada de este paciente la marcó el PROPIO provider desde su portal, no
   * el mostrador.
   *
   * Es la mejor señal disponible de "hoy estoy solo": si no hubo nadie para
   * recibir al paciente, tampoco va a haber nadie para cerrarle la visita. Sin
   * esto la tarjeta de "terminé" le decía "se lo entrego al asistente" a alguien
   * que no tiene a quién entregárselo, y la cita quedaba abierta para siempre —
   * el mismo agujero que se cerró para las online (`d2824599`), en el otro
   * extremo del día.
   *
   * Sale del audit log del check-in, no de una columna nueva: ver
   * `llegadaMarcadaPorElProvider` en lib/appointment-scope.
   */
  llegadaMarcadaPorElProvider?: boolean;
  /** Salta al tab que resuelve lo que falta. `braces`/`rx` solo existen en las
   *  pantallas que los tienen; el caller ignora los que no aplican. */
  onFix: (tab: 'notes' | 'labs' | 'services' | 'braces' | 'rx') => void;
  /**
   * 'doctor'    — botón "Terminé con el paciente": sella doctorDoneAt, no cierra la cita.
   * 'assistant' — botón "Checkout": cierra la cita (COMPLETED) y ve el estado del doctor.
   * Ninguno de los dos se bloquea por lo que falte; solo avisa.
   */
  variant?: 'doctor' | 'assistant';
  /** variant assistant: estado actual de la cita */
  appointmentStatus?: string;
  /** variant assistant: nombre del doctor, para "el Dr. X terminó a las…" */
  providerName?: string | null;
  /** variant assistant: se llama al cerrar/reabrir para refrescar la pantalla */
  onStatusChange?: () => void;
  /**
   * Datos para agendar la recita bajo el MISMO caso. null si la visita no tiene
   * caso vinculado (sin caso no se puede crear una cita del caso).
   */
  followUp?: {
    caseId: string;
    caseCode: string;
    patient: { firstName: string; lastName: string };
    /** Doctor de esta visita — pre-seleccionado y cambiable */
    defaultProviderId: string | null;
  } | null;
}

interface UpcomingAppt {
  id: string;
  scheduledFor: string;
  status: string;
  provider: { firstName: string; lastName: string } | null;
}

/** YYYY-MM-DD (Denver) a N días de hoy — para los atajos de recita */
function dayKeyIn(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function fmtDayTime(iso: string): string {
  return new Date(iso).toLocaleString(localeApp(), {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(localeApp(), {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });
}

/** Día en Denver (YYYY-MM-DD) — la clínica opera en esa zona, no en la del navegador. */
function denverDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Minutos entre dos instantes, en texto corto (1 h 20 min) */
function elapsed(from: string | null, to: Date): string | null {
  if (!from) return null;
  const mins = Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Estado de receta desconocido → DRAFT, para no romper si ScriptSure agrega uno. */
type RxStatus = keyof typeof RX_STATUS_KEY;
const rxStatusOf = (s: string): RxStatus => (s in RX_STATUS_KEY ? (s as RxStatus) : 'DRAFT');

/** Mismo formato que el tab de férulas y el de cargos. */
const money = (n: number): string => `$${n.toFixed(2)}`;

/**
 * Tarjeta de sección del resumen — ahora es el primitivo `Section`.
 *
 * Este wrapper ya tenía la anatomía correcta (icono + título + acción), pero con
 * su propio cuerpo: `border border-border` sobre `bg-1`, título sin barra, y las
 * cajas de adentro con SU borde. Eran dos y tres líneas apiladas en 40 píxeles —
 * los 19 bordes que medí en este archivo al compararlo con v2. El primitivo pone
 * una sola frontera (la del encabezado) y separa lo de adentro por fondo.
 *
 * Se mantiene el wrapper local en vez de cambiar las ~8 llamadas: acá el tono es
 * violeta (módulo del doctor, Regla #5) y así no hay que repetirlo en cada una.
 */
function Card({
  icon: Icon, title, action, children,
}: {
  icon: React.ElementType;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Section icon={Icon} title={title} tone="violet" action={action}>
      {children}
    </Section>
  );
}

export function VisitSummary({
  appointmentId, note, triage, hasTriage, services, checkedInAt, doctorDoneAt, checkedOutAt = null, onFix,
  variant = 'doctor', appointmentStatus, providerName, onStatusChange, followUp = null,
  balanceDue, onCollect, isOnline = false, llegadaMarcadaPorElProvider = false, edadPaciente = null,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  /** Etiquetas de cargos, compartidas con el tab y el picker. */
  const tc = useTranslations('phoenix.charges');
  const router = useRouter();
  const isAssistant = variant === 'assistant';

  const [labs, setLabs] = React.useState<LabOrderRow[]>([]);
  const [loadingLabs, setLoadingLabs] = React.useState(true);
  // Los cargos de la visita salen de TRES fuentes y el Resumen solo mostraba una
  // (los CPT a seguro). Consecuencias reales: una inyección cobrada en efectivo
  // no aparecía en la salida, las férulas tampoco, y el checklist marcaba
  // "faltan servicios" cuando el doctor había cargado solo efectivo.
  // Se piden acá, igual que los labs, en vez de pasarlos por props desde los dos
  // padres (la consulta del doctor y Day Admission).
  const [cash, setCash] = React.useState<CashChargeRow[]>([]);
  const [braces, setBraces] = React.useState<BraceRow[]>([]);
  // Recetas de la visita: el asistente tiene que poder responder "¿se le mandó la
  // receta?" antes de dejar salir al paciente, y el doctor ver qué mandó.
  const [rx, setRx] = React.useState<RxRow[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [doneAt, setDoneAt] = React.useState<string | null>(doctorDoneAt);
  const [upcoming, setUpcoming] = React.useState<UpcomingAppt[]>([]);
  const [printGroup, setPrintGroup] = React.useState<string | null>(null);
  const [apptOpen, setApptOpen] = React.useState(false);
  const [apptDate, setApptDate] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    fetch(`/api/admin/lab-orders/${appointmentId}`)
      .then((r) => r.json())
      .then((d: { orders?: LabOrderRow[] }) => setLabs(d.orders ?? []))
      .catch(() => undefined)
      .finally(() => setLoadingLabs(false));
  }, [appointmentId]);

  /** Lo que el Resumen pide por su cuenta. Se reusa en el refresco en vivo. */
  const loadVisitExtras = React.useCallback(async (): Promise<void> => {
    const [c, b, p] = await Promise.all([
      fetch(`/api/admin/cash-services/${appointmentId}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/admin/braces/${appointmentId}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/admin/scriptsure/prescriptions/${appointmentId}`).then((r) => r.json()).catch(() => ({})),
    ]);
    // Solo las que llegaron a la farmacia: el checkout le dice al paciente
    // dónde retirar. Una anulada no se le entregó, y una con error nunca
    // llegó — mostrarla haría que el asistente lo mande a una farmacia que
    // no tiene nada (y encima suele estar duplicada por el reenvío bueno).
    setRx(soloEntregadas((p as { prescriptions?: RxRow[] }).prescriptions ?? []));
    setCash((c as { charges?: CashChargeRow[] }).charges ?? []);
    // Solo las entregadas: una devuelta o anulada no se cobra ni sale con el paciente.
    setBraces(((b as { braces?: BraceRow[] }).braces ?? []).filter((r) => r.status === 'DISPENSED'));
  }, [appointmentId]);

  React.useEffect(() => { void loadVisitExtras(); }, [loadVisitExtras]);

  // Refresco en vivo por pulso: los dos lados trabajan la MISMA visita a la vez
  // (el doctor pide labs y receta, el asistente cobra), así que la foto del momento
  // en que se abrió la pantalla envejece en minutos. Se detiene con la cita cerrada.
  useLiveSync({
    url: `/api/admin/pulse?appointmentId=${appointmentId}`,
    enabled: appointmentStatus !== 'COMPLETED' && appointmentStatus !== 'CANCELLED',
    onChange: () => {
      void loadVisitExtras();
      fetch(`/api/admin/lab-orders/${appointmentId}`)
        .then((r) => r.json())
        .then((d: { orders?: LabOrderRow[] }) => setLabs(d.orders ?? []))
        .catch(() => undefined);
    },
  });

  // Próximas citas del caso: si ya hay recita agendada hay que mostrarla, o el
  // doctor y el asistente la agendan dos veces sin saberlo.
  const loadUpcoming = React.useCallback(async (): Promise<void> => {
    if (!followUp) return;
    try {
      const res = await fetch(`/api/admin/cases/${followUp.caseId}/appointments`);
      const d = await res.json() as { appointments?: Array<UpcomingAppt & { scheduledFor: string }> };
      const now = Date.now();
      setUpcoming((d.appointments ?? []).filter((a) =>
        a.id !== appointmentId &&
        new Date(a.scheduledFor).getTime() > now &&
        a.status !== 'CANCELLED' && a.status !== 'NO_SHOW'));
    } catch { /* la sección solo deja de mostrar la próxima cita */ }
  }, [followUp, appointmentId]);

  React.useEffect(() => { void loadUpcoming(); }, [loadUpcoming]);

  const openAppt = (days: number | null): void => {
    setApptDate(days === null ? undefined : dayKeyIn(days));
    setApptOpen(true);
  };

  const isSigned = note?.status === 'SIGNED';
  const dxCount = note?.diagnoses.length ?? 0;

  // Órdenes imprimibles de la visita: una hoja por `groupId` (los estudios
  // pedidos juntos se imprimen juntos). Las anuladas no se entregan.
  const printGroups = React.useMemo(
    () => [...new Set(labs.filter((l) => l.status !== 'VOIDED' && l.groupId).map((l) => l.groupId as string))],
    [labs],
  );

  // Totales por quién paga — mismo desglose que el tab de cargos, para que la
  // salida y el cobro digan el mismo número.
  const insuranceTotal = services.reduce((s, c) => s + (Number(c.fee) || 0), 0);
  const cashTotal = cash.reduce((s, c) => s + Number(c.unitPrice) * c.quantity, 0);
  const bracesTotal = braces.reduce((s, r) => s + Number(r.unitPrice) * r.quantity, 0);
  /**
   * Los LABORATORIOS también los paga el paciente, y faltaban.
   *
   * Con dos labs de $50.76 y $130.50, el desglose decía "paga directo $200"
   * tres centímetros arriba de un botón que decía "Cobrar $381.26": dos números
   * que no cierran, en la pantalla que se lee antes de dejar salir al paciente.
   * Un estudio sin precio en el catálogo no genera cobro y por eso no suma.
   */
  const labsPagados = labs.filter((l) => l.status !== 'VOIDED' && l.price != null);
  const labsTotal = labsPagados.reduce((s, l) => s + Number(l.price), 0);
  // Composición de lo CARGADO en la visita, por quién paga. NO es lo que hay que
  // cobrar: los CPT también generan saldo (copago, o el total si el seguro no
  // paga). El monto a cobrar es `balanceDue`, que sale de la facturación.
  const chargedDirect = cashTotal + bracesTotal + labsTotal;
  const chargeCount = services.length + cash.length + braces.length + labsPagados.length;
  // Tiempo en clínica, con el reloj CERRADO.
  //
  // Antes era `elapsed(checkedInAt, doneAt ?? ahora)`: si nadie sellaba
  // `doctorDoneAt`, seguía contando para siempre y se veían visitas con "31 h" y
  // "53 h" en clínica. Un número que crece solo no es un dato, es ruido que
  // enseña a ignorar el campo.
  //
  // Cierra con el primer hecho real que exista: el doctor terminó, o el asistente
  // cerró la visita. Si no hay ninguno y el check-in NO es de hoy, la visita
  // quedó abierta de otro día: se dice eso en ámbar en vez de inventar un número.
  // Eso además delata las visitas colgadas, que hoy nadie ve.
  const closedAt = doneAt ?? checkedOutAt;
  const checkedInToday = !!checkedInAt && denverDayKey(new Date(checkedInAt)) === denverDayKey(new Date());
  const timeInRoom = closedAt
    ? elapsed(checkedInAt, new Date(closedAt))
    : checkedInToday ? elapsed(checkedInAt, new Date()) : null;
  const staleOpenVisit = !closedAt && !!checkedInAt && !checkedInToday;

  // Checklist de salida — NADA bloquea (decisión de Erick 2026-07-29). La nota
  // clínica se puede firmar otro día: la documentación tiene una ventana de
  // días, no de horas, y trabar la salida obliga a una nota apurada o a una
  // visita sin cerrar. Lo que falta queda en ámbar y, si es la firma, sigue
  // apareciendo en "Acción requerida" de Mi Día hasta que se resuelva.
  const checks: Array<{
    key: string; ok: boolean; label: string; fix?: 'notes' | 'labs' | 'services' | 'braces' | 'rx';
  }> = [
    { key: 'note', ok: isSigned, label: isSigned ? t('sumCheckNoteOk') : t('sumCheckNoteMissing'), fix: 'notes' },
    { key: 'dx', ok: dxCount > 0, label: dxCount > 0 ? t('sumCheckDxOk', { count: dxCount }) : t('sumCheckDxMissing'), fix: 'notes' },
    // Cuenta las TRES fuentes: antes marcaba "faltan servicios" cuando el doctor
    // había cargado solo una inyección en efectivo o una férula.
    { key: 'services', ok: chargeCount > 0, label: chargeCount > 0 ? t('sumCheckServicesOk', { count: chargeCount }) : t('sumCheckServicesMissing'), fix: 'services' },
  ];
  const warnings = checks.filter((c) => !c.ok);
  const isCompleted = appointmentStatus === 'COMPLETED';

  const handleDone = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/doctor-done`, { method: 'POST' });
      const d = await res.json() as { doctorDoneAt?: string };
      if (!res.ok) { setError(t('sumErrDone')); return; }
      setDoneAt(d.doctorDoneAt ?? new Date().toISOString());
      router.refresh();
    } catch {
      setError(t('sumErrDone'));
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/doctor-done`, { method: 'DELETE' });
      if (!res.ok) { setError(t('sumErrReopen')); return; }
      setDoneAt(null);
      router.refresh();
    } catch {
      setError(t('sumErrReopen'));
    } finally {
      setSaving(false);
    }
  };

  /** Asistente: cierra la cita (COMPLETED). Nunca bloquea. */
  const handleCheckout = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/checkout`, { method: 'POST' });
      if (!res.ok) { setError(t('sumErrCheckout')); return; }
      onStatusChange?.();
      router.refresh();
    } catch {
      setError(t('sumErrCheckout'));
    } finally {
      setSaving(false);
    }
  };

  /** Asistente: deshace el cierre (se cerró por error). */
  const handleUndoCheckout = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/checkout`, { method: 'DELETE' });
      if (!res.ok) { setError(t('sumErrReopenAppt')); return; }
      onStatusChange?.();
      router.refresh();
    } catch {
      setError(t('sumErrReopenAppt'));
    } finally {
      setSaving(false);
    }
  };

  // Por defecto se deduce de `triage`: alcanza para quien manda null cuando no hay
  // registro. Day Admission lo manda explícito (ver el comentario del prop).
  const existeTriaje = hasTriage ?? triage !== null;

  const vitalLine = triage
    ? [
        triage.systolicMmhg != null && triage.diastolicMmhg != null ? `${t('vitBP')} ${triage.systolicMmhg}/${triage.diastolicMmhg}` : null,
        triage.pulseBpm != null ? `${t('vitPulse')} ${triage.pulseBpm}` : null,
        triage.respiratoryRate != null ? `${t('vitResp')} ${triage.respiratoryRate}` : null,
        triage.tempFahrenheit != null ? `${t('vitTemp')} ${triage.tempFahrenheit}°F` : null,
        triage.painScale != null ? `${t('vitPain')} ${triage.painScale}/10` : null,
        triage.o2Saturation != null ? `${t('vitO2')} ${triage.o2Saturation}%` : null,
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <div className="space-y-4">

      {/* Asistente: qué hizo el doctor. Cierra el círculo — antes no tenía forma
          de saber si el doctor ya había terminado con el paciente. */}
      {isAssistant && (
        <div className={`rounded-md px-3 py-2 text-[12px] flex items-center gap-2 flex-wrap ${
          doneAt ? 'border border-emerald/25 bg-emerald/[0.06] text-emerald' : 'border border-violet/25 bg-violet/[0.06] text-violet-text'
        }`}>
          {doneAt ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Stethoscope className="w-3.5 h-3.5 shrink-0" />}
          {doneAt
            ? t('sumDoctorFinishedAt', { name: providerName ?? t('prDoctor'), time: fmtTime(doneAt) })
            : t('sumDoctorStillWorking', { name: providerName ?? t('prDoctor') })}
        </div>
      )}

      {/* Estado de salida */}
      {isAssistant ? (
        isCompleted ? (
          <div className="rounded-lg border border-emerald/30 bg-emerald/[0.07] p-4 flex items-start gap-3 flex-wrap">
            <CheckCircle2 className="w-5 h-5 text-emerald shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[200px]">
              <div className="text-emerald font-semibold text-sm">{t('sumApptClosedTitle')}</div>
              <div className="text-text-2 text-[12px] mt-0.5">{t('sumApptClosedHint')}</div>
            </div>
            <button
              type="button"
              onClick={() => void handleUndoCheckout()}
              disabled={saving}
              className="h-9 px-3 rounded text-[12px] font-semibold text-text-2 hover:bg-white/5 hover:text-text-1 transition-colors flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              {t('sumUndoCheckout')}
            </button>
          </div>
        ) : (
          <div className={`rounded-lg border p-4 ${warnings.length === 0 ? 'border-emerald/30 bg-emerald/[0.06]' : 'border-amber/30 bg-amber/[0.07]'}`}>
            <div className="flex items-center gap-2 mb-3">
              {warnings.length === 0
                ? <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-amber shrink-0" />}
              <div className={`font-semibold text-[12px] uppercase tracking-wider ${warnings.length === 0 ? 'text-emerald' : 'text-amber'}`}>
                {warnings.length === 0 ? t('sumApptReadyTitle') : t('sumApptPendingTitle')}
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              {checks.map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                  {c.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
                    : <Clock3 className="w-3.5 h-3.5 text-amber shrink-0" />}
                  <span className={c.ok ? 'text-text-2' : 'text-amber'}>{c.label}</span>
                  {!c.ok && c.fix && (
                    <button
                      type="button"
                      onClick={() => onFix(c.fix!)}
                      className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-emerald hover:underline"
                    >
                      {t('sumComplete')} <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Button onClick={() => void handleCheckout()} disabled={saving} className="h-10 gap-1.5 w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              {t('sumApptCheckout')}
            </Button>
            <div className="text-[11px] text-text-muted mt-2">
              {warnings.length > 0 ? t('sumApptWarnHint') : t('sumApptCloseHint')}
            </div>
          </div>
        )
      ) : doneAt ? (
        <div className="rounded-lg border border-emerald/30 bg-emerald/[0.07] p-4 flex items-start gap-3 flex-wrap">
          <CheckCircle2 className="w-5 h-5 text-emerald shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-emerald font-semibold text-sm">
              {isCompleted ? t('sumApptClosedTitle') : t('sumDoneTitle')}
            </div>
            <div className="text-text-2 text-[12px] mt-0.5">
              {/* En una online no hay a quién entregarle el paciente: en vez de
                  "se lo entrego al asistente", se le dice que cierre él. */}
              {t('sumDoneAt', { time: fmtTime(doneAt) })} · {
                isCompleted ? t('sumApptClosedHint')
                : isOnline  ? t('sumDoneOnlineHint')
                : llegadaMarcadaPorElProvider ? t('sumDoneSoloHint')
                : t('sumDoneHandoff')
              }
            </div>
          </div>
          {/* Cerrar la cita cuando no hay a quién entregársela: por video (el
              paciente colgó) o cuando el propio provider marcó la llegada porque
              hoy no hay mostrador. El asistente conserva su camino en Day
              Admission para cuando el doctor se olvida, y el endpoint es
              idempotente, así que si los dos la cierran no se audita dos veces. */}
          {(isOnline || llegadaMarcadaPorElProvider) && !isCompleted && (
            <Button onClick={() => void handleCheckout()} disabled={saving} className="h-9 gap-1.5 shrink-0">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              {t('sumApptCheckout')}
            </Button>
          )}
          {!isCompleted && (
            <button
              type="button"
              onClick={() => void handleReopen()}
              disabled={saving}
              className="h-9 px-3 rounded text-[12px] font-semibold text-text-2 hover:bg-white/5 hover:text-text-1 transition-colors flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              {t('sumReopen')}
            </button>
          )}
        </div>
      ) : (
        <div className={`rounded-lg border p-4 ${warnings.length === 0 ? 'border-violet/30 bg-violet/[0.06]' : 'border-amber/30 bg-amber/[0.07]'}`}>
          <div className="flex items-center gap-2 mb-3">
            {warnings.length === 0
              ? <CheckCircle2 className="w-4 h-4 text-violet-text shrink-0" />
              : <AlertTriangle className="w-4 h-4 text-amber shrink-0" />}
            <div className={`font-semibold text-[12px] uppercase tracking-wider ${warnings.length === 0 ? 'text-violet-text' : 'text-amber'}`}>
              {warnings.length === 0 ? t('sumReadyTitle') : t('sumNotReadyTitle')}
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-1.5 mb-3">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                {c.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
                  : <Clock3 className="w-3.5 h-3.5 text-amber shrink-0" />}
                <span className={c.ok ? 'text-text-2' : 'text-amber'}>{c.label}</span>
                {!c.ok && c.fix && (
                  <button
                    type="button"
                    onClick={() => onFix(c.fix!)}
                    className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-violet-text hover:underline"
                  >
                    {t('sumFix')} <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <Button onClick={() => void handleDone()} disabled={saving} className="h-10 gap-1.5 w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {t('sumCheckout')}
          </Button>
          <div className="text-[11px] text-text-muted mt-2">
            {warnings.length > 0 ? t('sumWarningsHint') : t('sumDoneHint')}
          </div>
        </div>
      )}

      {/* ── Recita ── Bajo el botón de salida: la próxima cita se agenda con el
          paciente delante, no después. Aparece igual para el doctor y para el
          asistente porque cualquiera de los dos la puede agendar. */}
      {/* Este bloque repetía la anatomía de `Card` a mano solo para poner el
          código de caso a la derecha. Es justo lo que hace el hueco de acción. */}
      {followUp && (
        <Card
          icon={CalendarPlus}
          title={t('fuTitle')}
          action={<span className="font-mono text-[10.5px] text-cyan">{followUp.caseCode}</span>}
        >

          {/* Ya hay recita agendada */}
          {upcoming.length > 0 && (
            <div className="rounded-md border border-emerald/25 bg-emerald/[0.06] px-3 py-2 mb-3 space-y-1">
              {upcoming.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[12px] text-emerald flex-wrap">
                  <CalendarCheck2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold">{fmtDayTime(a.scheduledFor)}</span>
                  {a.provider && (
                    <span className="text-text-2">
                      · {a.provider.firstName} {a.provider.lastName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="text-[11.5px] text-text-muted mb-2">
            {upcoming.length > 0 ? t('fuHasNext') : t('fuNoNext')}
          </div>

          {/* Atajos: en seguimiento la recita casi siempre cae en 1 sem / 2 sem / 1 mes */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => openAppt(7)}
              className="h-9 px-3 rounded text-[12px] font-semibold text-text-2 hover:bg-white/5 hover:text-text-1 transition-colors"
            >
              {t('fuIn1Week')}
            </button>
            <button
              type="button"
              onClick={() => openAppt(14)}
              className="h-9 px-3 rounded text-[12px] font-semibold text-text-2 hover:bg-white/5 hover:text-text-1 transition-colors"
            >
              {t('fuIn2Weeks')}
            </button>
            <button
              type="button"
              onClick={() => openAppt(30)}
              className="h-9 px-3 rounded text-[12px] font-semibold text-text-2 hover:bg-white/5 hover:text-text-1 transition-colors"
            >
              {t('fuIn1Month')}
            </button>
            <Button onClick={() => openAppt(null)} className="h-9 gap-1.5">
              <CalendarPlus className="w-3.5 h-3.5" />
              {upcoming.length > 0 ? t('fuScheduleAnother') : t('fuSchedule')}
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Tiempos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-bg-1 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sumArrived')}</div>
          <div className="text-text-1 font-semibold text-sm mt-0.5">{fmtTime(checkedInAt)}</div>
        </div>
        <div className="rounded-lg bg-bg-1 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sumTimeInClinic')}</div>
          {staleOpenVisit ? (
            <div className="text-amber font-semibold text-[12.5px] mt-0.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {t('sumVisitLeftOpen', {
                date: new Date(checkedInAt!).toLocaleDateString(undefined, {
                  day: 'numeric', month: 'short', timeZone: 'America/Denver',
                }),
              })}
            </div>
          ) : (
            <div className="text-text-1 font-semibold text-sm mt-0.5">{timeInRoom ?? '—'}</div>
          )}
        </div>
        <div className="rounded-lg bg-bg-1 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sumNoteState')}</div>
          <div className="mt-1">
            {isSigned
              ? <TagPill label={t('noteSigned')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
              : <TagPill label={t('noteDraft')} colorClass="bg-amber/15 text-amber border-amber/30" />}
          </div>
        </div>
      </div>

      {/* Triaje */}
      <Card icon={HeartPulse} title={t('tabTriage')}>
        {/* "No hay triaje" es que NO EXISTA EL REGISTRO, no que la línea saliera
            vacía: `[...].filter(Boolean).join()` sobre puros nulls da `''`, que es
            falsy e indistinguible de "nadie tomó nada". Y la línea mira seis
            campos de los que se pueden guardar, así que un triaje con solo talla
            y peso, o solo la 2ª toma, también decía "no hay". Con el registro
            existente pero sin ninguno de los seis se muestra `triageNoVitals`,
            que es la verdad: hay triaje, no hay signos vitales cargados. */}
        {vitalLine
          ? (
            <>
              {/* Lo que está fuera de rango, ARRIBA de la línea completa.
                  La línea se queda como está —es la lectura de todos los
                  valores— y la alerta va antes porque es lo que decide si hay
                  que hacer algo. Con todo normal no se dibuja nada. */}
              {/* `vitalLine` con contenido implica que `triage` existe, pero TS
                  no lo deduce de un string: el guard es para el compilador. */}
              {triage && <AlertaVitales
                className="mb-2"
                edad={edadPaciente ?? null}
                vitales={{
                  systolicMmhg:    triage.systolicMmhg,
                  diastolicMmhg:   triage.diastolicMmhg,
                  pulseBpm:        triage.pulseBpm,
                  respiratoryRate: triage.respiratoryRate,
                  tempFahrenheit:  triage.tempFahrenheit,
                  o2Saturation:    triage.o2Saturation,
                  painScale:       triage.painScale,
                }}
              />}
              <div className="text-[12.5px] text-text-2 tabular-nums">{vitalLine}</div>
              {/* Con visita online, los vitales solo pueden venir del propio
                  paciente: decirlo es parte del dato, no una nota al pie. */}
              {isOnline && (
                <div className="text-[11px] text-cyan mt-1">{t('vitalsSelfReported')}</div>
              )}
            </>
          )
          : <div className={`text-[12px] ${isOnline ? 'text-cyan' : 'text-text-muted'}`}>
              {isOnline
                ? t('vitalsOnlineNone')
                : existeTriaje ? t('triageNoVitals') : t('triageEmptyTitle')}
            </div>}
        {triage?.chiefComplaint && (
          <div className="text-[12px] text-text-2 mt-2">
            <span className="text-text-muted">{t('chiefComplaint')}: </span>{triage.chiefComplaint}
          </div>
        )}
      </Card>

      {/* Diagnósticos */}
      <Card
        icon={Stethoscope}
        title={t('sec_DIAGNOSTICOS')}
        action={
          <button type="button" onClick={() => onFix('notes')} className="text-[11px] font-semibold text-violet-text hover:underline">
            {t('sumOpenNote')}
          </button>
        }
      >
        {dxCount === 0 ? (
          <div className="text-[12px] text-text-muted">{t('dxEmpty')}</div>
        ) : (
          <div className="space-y-1">
            {note?.diagnoses.map((d, i) => (
              <div key={`${d.icd10Code}-${i}`} className="flex items-start gap-2 text-[12.5px]">
                <span className="font-mono text-[11px] text-violet-text shrink-0 w-[70px]">{d.icd10Code ?? '—'}</span>
                <span className="text-text-2 flex-1 min-w-0">{d.icd10Label ?? d.snomedLabel ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Laboratorios */}
      <Card
        icon={FlaskConical}
        title={t('tabLabs')}
        action={
          <div className="flex items-center gap-3">
            {/* Imprimir la orden ACÁ: el flujo real es cobrar y recién ahí
                entregarle la hoja al paciente (Erick 2026-08-08). Sin esto el
                asistente tenía que salir del Resumen a buscarla al tab Labs.
                Solo del lado del asistente: el doctor no imprime. */}
            {isAssistant && printGroups.map((g, i) => (
              <button
                key={g}
                type="button"
                onClick={() => setPrintGroup(g)}
                className="text-[11px] font-semibold text-violet-text hover:underline inline-flex items-center gap-1"
              >
                <Printer className="w-3 h-3" />
                {printGroups.length > 1 ? `${t('labPrintOrder')} ${i + 1}` : t('labPrintOrder')}
              </button>
            ))}
            <button type="button" onClick={() => onFix('labs')} className="text-[11px] font-semibold text-violet-text hover:underline">
              {t('sumOpenLabs')}
            </button>
          </div>
        }
      >
        {loadingLabs ? (
          <div className="text-[12px] text-text-muted flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> {t('labLoading')}
          </div>
        ) : labs.length === 0 ? (
          <div className="text-[12px] text-text-muted">{t('labNoneThisVisit')}</div>
        ) : (
          <div className="space-y-1">
            {labs.filter((l) => l.status !== 'VOIDED').map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                {l.studyCode && <span className="font-mono text-[11px] text-cyan shrink-0">{l.studyCode}</span>}
                <span className="text-text-2 flex-1 min-w-[120px]">{l.studyName}</span>
                {l.urgency !== 'ROUTINE' && (
                  <TagPill
                    label={t(`labUrgency_${l.urgency}`)}
                    colorClass={l.urgency === 'STAT' ? 'bg-rose/15 text-rose border-rose/30' : 'bg-amber/15 text-amber border-amber/30'}
                  />
                )}
                <span className="text-[11px] text-text-muted">{t(`labCollection_${l.collectionSite}`)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recetas — lo que el paciente se lleva. Iba antes de los cargos: primero
          lo clínico, después la plata. */}
      <Card
        icon={Pill}
        title={t('tabRx')}
        action={
          <button type="button" onClick={() => onFix('rx')} className="text-[11px] font-semibold text-violet-text hover:underline">
            {t('sumOpenRx')}
          </button>
        }
      >
        {rx.length === 0 ? (
          <div className="text-[12px] text-text-muted">{t('sumNoRx')}</div>
        ) : (
          <div className="space-y-1">
            {rx.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                <span className="text-text-2 flex-1 min-w-[140px]">
                  {r.drugName}
                  {r.dose && <span className="text-text-muted"> · {r.dose}</span>}
                  {r.frequency && <span className="text-text-muted"> · {r.frequency}</span>}
                </span>
                {/* La farmacia es el dato que cierra la pregunta del checkout:
                    "¿a dónde se mandó?" */}
                {r.pharmacyName && (
                  <span className="text-[11px] text-text-muted inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {r.pharmacyName}
                  </span>
                )}
                <TagPill
                  label={t(`rxStatus_${RX_STATUS_KEY[rxStatusOf(r.status)]}`)}
                  colorClass={RX_STATUS_CLASS[rxStatusOf(r.status)]}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Férulas — tarjeta propia, igual que Labs y Recetas. Estaban metidas
          dentro de "Servicios", debajo de los CPT: se renderizaban, pero quien
          busca férulas escanea los TÍTULOS de las tarjetas y no había ninguno.
          Se pagan completas, sin lien ni seguro. */}
      {braces.length > 0 && (
        <Card
          icon={Bandage}
          title={t('braceTitle')}
          action={
            <button type="button" onClick={() => onFix('braces')} className="text-[11px] font-semibold text-violet-text hover:underline">
              {t('sumOpenBraces')}
            </button>
          }
        >
          <div className="space-y-1">
            {braces.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="text-text-2 flex-1 min-w-0">
                  {r.name}
                  {r.sizeLabel && <span className="text-text-muted"> · {r.sizeLabel}</span>}
                  {r.quantity > 1 && <span className="text-text-muted"> ×{r.quantity}</span>}
                </span>
                <span className="text-text-2 shrink-0 tabular-nums">{money(Number(r.unitPrice) * r.quantity)}</span>
              </div>
            ))}
            <div className="flex items-center justify-end border-t border-border/60 pt-2 mt-1">
              <span className="text-[11px] text-text-muted">{t('braceTotal', { amount: money(bracesTotal) })}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Servicios */}
      <Card
        icon={Briefcase}
        title={t('tabServices')}
        action={
          <button type="button" onClick={() => onFix('services')} className="text-[11px] font-semibold text-violet-text hover:underline">
            {t('sumOpenServices')}
          </button>
        }
      >
        {chargeCount === 0 ? (
          <div className="text-[12px] text-text-muted">{t('sumNoServices')}</div>
        ) : (
          <div className="space-y-2.5">
            {/* A seguro */}
            {services.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  {tc('badgeInsurance')}
                </div>
                {services.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-mono text-[11px] text-cyan shrink-0 w-[70px]">{s.code}</span>
                    <span className="text-text-2 flex-1 min-w-0">{s.description}</span>
                    {s.fee !== undefined && (
                      <span className="text-text-2 shrink-0 tabular-nums">{money(s.fee)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Paga directo — lo que hay que cobrar en el mostrador */}
            {cash.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  {tc('badgeCash')}
                </div>
                {cash.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-mono text-[11px] text-emerald shrink-0 w-[70px] truncate" title={c.code}>{c.code}</span>
                    <span className="text-text-2 flex-1 min-w-0">
                      {c.name}
                      {c.quantity > 1 && <span className="text-text-muted"> ×{c.quantity}</span>}
                    </span>
                    <span className="text-text-2 shrink-0 tabular-nums">{money(c.unitPrice * c.quantity)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Desglose: el mismo par de números del tab de cargos, para que la
                salida y el cobro no se contradigan. */}
            <div className="flex items-center justify-end gap-3 flex-wrap border-t border-border/60 pt-2">
              {insuranceTotal > 0 && (
                <span className="text-[11px] text-text-muted">
                  {tc('totalToInsurance')} <b className="text-cyan text-[12.5px] ml-0.5 tabular-nums">{money(insuranceTotal)}</b>
                </span>
              )}
              {chargedDirect > 0 && (
                <span className="text-[11px] text-text-muted">
                  {tc('badgeCash')} <b className="text-emerald text-[12.5px] ml-0.5 tabular-nums">{money(chargedDirect)}</b>
                  {/* Las férulas y los laboratorios se listan en su propia
                      tarjeta pero suman acá: sin la nota, este total incluiría
                      plata que no está itemizada en esta tarjeta. */}
                  {bracesTotal > 0 && (
                    <span className="text-text-muted"> · {t('sumIncludesBraces', { count: braces.length })}</span>
                  )}
                  {labsTotal > 0 && (
                    <span className="text-text-muted"> · {t('sumIncludesLabs', { count: labsPagados.length })}</span>
                  )}
                </span>
              )}
            </div>

            {/* Cobrar — del asistente, y del provider que recibió él al
                paciente: si no hubo nadie en el mostrador para recibirlo,
                tampoco lo va a haber para cobrarle al salir (Erick, 1-sep-2026).
                Es el mismo motivo por el que ese caso tiene Checkout. Con
                asistente el reparto normal no se toca: la consulta no le pasa
                `balanceDue` al doctor y el CTA ni se dibuja.
                El monto es el SALDO de facturación, no una cuenta propia: antes
                decía "efectivo + férulas" y mostraba $125 cuando había $367
                pendientes, porque los CPT sin pagar también se le cobran al
                paciente.
                Abre el modal REAL de "Pago del caso" — ahí se distribuye por
                línea, se aplican descuentos y se pueden dejar líneas sin pagar.
                El Resumen no es una segunda pantalla de cobro: es la puerta. */}
            {(isAssistant || llegadaMarcadaPorElProvider) && balanceDue !== undefined && balanceDue > 0 && (
              <button
                type="button"
                onClick={() => (onCollect ? onCollect() : onFix('services'))}
                className="w-full rounded-lg border border-emerald/40 bg-emerald/10 hover:bg-emerald/20 hover:border-emerald/60 transition-colors px-4 py-3 flex items-center gap-3 text-left group"
              >
                <span className="w-9 h-9 rounded-lg bg-emerald/20 border border-emerald/30 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4 text-emerald" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-emerald">
                    {t('sumCollect', { amount: money(balanceDue) })}
                  </span>
                  {/* Dice qué va a pasar al tocarlo — el botón viejo no explicaba
                      que abría una pantalla con el detalle línea por línea. */}
                  <span className="block text-[11px] text-text-muted mt-0.5">{t('sumCollectHint')}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-emerald/70 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Nota imprimible */}
      {isSigned && (
        <div className="flex justify-end">
          <a
            href={`/doctor-print/visit-note/${appointmentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3 rounded text-[12px] font-semibold text-text-2 hover:bg-white/5 hover:text-text-1 transition-colors inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> {t('sumPrintNote')}
          </a>
        </div>
      )}

      {/* Modal de cita en modo case: paciente y caso fijos, doctor pre-elegido
          pero cambiable, tipo Follow-up por defecto */}
      {followUp && (
        <AppointmentDialog
          mode="case"
          open={apptOpen}
          onOpenChange={setApptOpen}
          caseInfo={{
            id: followUp.caseId,
            caseCode: followUp.caseCode,
            patient: followUp.patient,
          }}
          defaultProviderId={followUp.defaultProviderId}
          defaultType="FOLLOW_UP"
          initialDate={apptDate}
          onSuccess={() => { void loadUpcoming(); router.refresh(); }}
        />
      )}

      {/* Visor de impresión de la orden — compartido con el detalle de caso */}
      <LabOrderPrintDialog groupId={printGroup} onClose={() => setPrintGroup(null)} />

      {/* Recordatorio de quién cierra la cita — solo al doctor */}
      {!isAssistant && (
        <div className="rounded-md border border-cyan/25 bg-cyan/[0.06] px-3 py-2 text-[11.5px] text-cyan flex items-start gap-1.5">
          <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {t('sumAssistantCloses')}
        </div>
      )}
    </div>
  );
}
