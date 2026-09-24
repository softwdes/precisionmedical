'use client';
import { localeApp, fechaCalendario, instanteEnClinica, claveDia, minutosDelDiaEnClinica, weekdayEnClinica } from '@/lib/fechas';
import { useServerError, type ServerErrorBody } from '@/lib/server-error';

/**
 * AppointmentDialog — B.10 Unificado
 *
 * mode: 'case'  → abre desde front-office con caso pre-fijado (reemplaza ScheduleAppointmentDialog)
 * mode: 'free'  → abre desde calendario, selección libre de paciente + caso
 *
 * Filtra providers por especialidad del caso usando DoctorSpecialtyAssignment (specialtyCatalogIds).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { describirAvisoCita } from '@/lib/enviar-portal';
import { useToast } from '@/components/ui-phoenix';
import {
  CalendarCheck, AlertCircle, Check, Building2, Stethoscope,
  FileText, FilePlus, ChevronRight, Calendar as CalendarIcon, CalendarDays, User, Search, X, Link2, UserPlus, Video,
} from 'lucide-react';
import { PastillaMembresia } from '@/components/membresias/pastilla-membresia';
import { useMembresia } from '@/components/membresias/use-membresia';
import { WeeklySlotPicker } from './weekly-slot-picker';
import { QuickRegisterDialog } from '@/components/patients/quick-register-dialog';
import { NewCaseDialog, type NewCaseInitialState } from '@/components/cases/new-case-dialog';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, Label,
} from '@precision/ui';
import { PersonAvatar } from '@/components/ui-phoenix';
import { DoctorCombobox } from '@/components/ui-phoenix/doctor-combobox';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { DatePicker } from '@/components/ui-phoenix/date-picker';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Clinic    { id: string; name: string; address: string | null; phone: string | null }
interface Provider  { id: string; firstName: string; lastName: string; specialty: string; licenseNumber: string | null; specialtyCatalogIds: string[] }
interface Specialty { id?: string; name: string; color: string }

/**
 * Estados de caso a los que se les puede agendar una cita.
 *
 * Vive acá arriba y no dentro del render porque lo usan DOS lugares: la tarjeta
 * (que deshabilita las no agendables) y la auto-selección de más abajo. Con la
 * lista escrita dos veces, agregar un estado en una y olvidarlo en la otra deja
 * un caso que se auto-selecciona pero no se puede elegir a mano, o al revés.
 */
const ESTADOS_AGENDABLES = ['NEW_REFERRAL', 'INTAKE_PENDING', 'CONFIRMED', 'ACTIVE', 'INTAKE_COMPLETED'];
const esAgendable = (status: string): boolean => ESTADOS_AGENDABLES.includes(status);

interface CaseOption {
  id: string;
  /**
   * `null` cuando el código quedó cifrado en la migración y no se pudo descifrar
   * — la API manda null antes que el `e:…` crudo. Se muestra un texto legible.
   */
  caseCode: string | null;
  status: string;
  /**
   * `MVA` o `GENERAL`. Es el campo AUTORITATIVO del tipo de caso y nunca es
   * nulo — a diferencia de `accidentType`, que está vacío en el 96% de los
   * casos (2.938 de 3.053, medido 2026-09-15). La API ya lo devolvía; acá
   * faltaba tipar­lo.
   */
  caseType: string | null;
  accidentType: string | null;
  /**
   * La FECHA DEL ACCIDENTE — el *date of loss*, como lo llaman en el mostrador.
   *
   * Es lo único que distingue un caso de otro cuando el paciente tiene varios.
   * Sin esto, el selector mostraba `MVA-2453 ACTIVE`, `MVA-2426 ACTIVE` y
   * `MVA-623 ACTIVE`, tres tarjetas idénticas salvo el número, y el mostrador
   * tenía que elegir una a ciegas para poder agendar (Erick, 17-sep-2026). El
   * código del caso no ayuda: no se lo sabe nadie, ni el paciente ni el bufete,
   * que preguntan por "el del choque de marzo".
   *
   * La API ya lo devolvía; acá faltaba tiparlo, igual que había pasado con
   * `caseType`.
   */
  accidentDate: string | null;
  /**
   * La descripción del accidente. No se pinta en la tarjeta —es texto libre y
   * de largo impredecible—, pero va en el `title`: cuando dos casos del mismo
   * paciente comparten mes, esto es lo que los separa.
   */
  accidentNotes: string | null;
  /** Primera cita del caso. Ver el rótulo de la tarjeta: es el suplente del DOL. */
  firstAppointment: { scheduledFor: string } | null;
  specialty: Specialty | null;
}

interface PatientResult {
  id: string;
  patientCode: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  casesCount: number;
  lastCaseCode: string | null;
  lastCaseStatus: string | null;
  /** Paciente DADO DE BAJA (duplicado, data de prueba). No es lo mismo que tener
   *  el caso archivado: eso deja al paciente activo y agendable. */
  isArchived?: boolean;
}

// Props para modo case (caso pre-fijado)
interface CaseModeProps {
  mode: 'case';
  caseInfo: {
    id: string;
    caseCode: string;
    patient: { firstName: string; lastName: string };
    specialty?: Specialty | null;
  } | null;
}

// Props para modo free (selección libre desde calendario)
interface FreeModeProps {
  mode: 'free';
  caseInfo?: never;
}

// Datos de cita existente para modo edición
export interface EditAppointmentData {
  id: string;
  scheduledFor: string;
  /**
   * Estado de la cita — decide si la fecha/hora se puede tocar.
   *
   * OBLIGATORIO a propósito, no opcional: de esto depende que no se le cambie el
   * día a una visita que ya ocurrió o a un no-show que tiene penalidad. Si fuera
   * opcional, una pantalla que se olvidara de pasarlo dejaría editar todo sin
   * que nada avise; así el typecheck la obliga a decidir. Solo hay dos callers.
   */
  status: string;
  durationMinutes: number;
  type: string;
  notes: string | null;
  // Telemedicina: se leían con un cast inline, así que un caller que no los
  // pasara no fallaba el typecheck — y editar la cita apagaba la consulta en
  // línea y borraba el enlace en silencio. Ahora son parte del contrato.
  isOnline?: boolean;
  meetingUrl?: string | null;
  clinicId: string;
  clinicName: string;
  clinicAddress?: string | null;
  providerId: string | null;
  providerFirstName?: string;
  providerLastName?: string;
  providerSpecialty?: string;
  caseId: string;
  caseCode: string;
  patient: { id: string; firstName: string; lastName: string };
}

type AppointmentDialogProps = (CaseModeProps | FreeModeProps) & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialDate?: string; // YYYY-MM-DD
  initialTime?: string; // HH:MM
  /**
   * Sede preseleccionada. La manda la vista POR SEDES del calendario: ahí cada
   * columna ES una clínica, así que hacer clic en un hueco de la columna de
   * Murray y que el campo salga vacío rompe lo que la pantalla acaba de
   * prometer. Las otras vistas no la mandan y el campo arranca en blanco, que
   * es como venía.
   */
  initialClinicId?: string;
  editAppointment?: EditAppointmentData; // si viene, abre en modo edición
  /** Reagendar: pre-llena todo excepto el slot (usuario elige nueva hora) */
  isReschedule?: boolean;
  /**
   * Recita desde la consulta: doctor y tipo pre-seleccionados. El doctor queda
   * cambiable — la recita la puede agendar el mismo médico o el asistente, y no
   * siempre con el mismo profesional.
   */
  defaultProviderId?: string | null;
  defaultType?: 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'URGENT_CARE' | 'FOLLOW_UP';
};

// ─── Types (internal) ────────────────────────────────────────────────────────

/**
 * El pedido de guardado, ya armado y sin enviar. Se guarda para poder repetirlo
 * tal cual cuando el usuario elige "solapar igual" tras el aviso de cruce.
 */
interface PendingSubmit {
  mode: 'edit' | 'create';
  url:  string;
  body: Record<string, unknown>;
}

interface DuplicateAppt {
  id: string;
  scheduledFor: string;
  status: string;
  clinic?: { name: string } | null;
  provider?: { firstName: string; lastName: string; specialty: string | null } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Las horas que se pueden elegir a mano: 08:00 a 18:00 cada 15 minutos.
 *
 * Una LISTA y no un `input[type=time]` (Erick, 18-sep-2026). El campo nativo
 * obliga a tipear hora y minuto por separado, cambia de forma en cada
 * navegador y acepta las 03:47 de la madrugada — que no es un horario en el
 * que la clínica atienda a nadie.
 *
 * El rango es el horario de atención, que en un SELECTOR es un techo duro (a
 * diferencia de la grilla del calendario, donde es un default que se estira).
 * El paso de 15 min es el mismo de la vista de día.
 */
const OPEN_MIN_MANUAL  = 8 * 60;   // 08:00
const CLOSE_MIN_MANUAL = 18 * 60;  // 18:00
const PASO_MIN_MANUAL  = 15;

const HORAS_MANUALES: string[] = (() => {
  const out: string[] = [];
  for (let m = OPEN_MIN_MANUAL; m <= CLOSE_MIN_MANUAL; m += PASO_MIN_MANUAL) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
})();

/** "14:45" → "2:45 PM". El equipo lee las horas en 12 h, como el resto de la app. */
function rotuloHora(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

type AppointmentType = 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'URGENT_CARE' | 'FOLLOW_UP';
// TYPE_OPTIONS is built inside the component to use translations

// ─── Main Component ───────────────────────────────────────────────────────────

export function AppointmentDialog(props: AppointmentDialogProps) {
  const serverError = useServerError();
  const { open, onOpenChange, onSuccess, initialDate, initialTime, initialClinicId, editAppointment, isReschedule } = props;
  const isEditMode = !!editAppointment;
  const router = useRouter();
  const t   = useTranslations('phoenix.calendar');
  const tac = useTranslations('phoenix.avisoCita');
  const toast = useToast();

  /**
   * Estados en los que la cita YA TIENE UN DESENLACE y su fecha no se toca más.
   *
   * Los tres primeros son "el paciente llegó": mover la fecha contradiría un
   * hecho registrado. `NO_SHOW` y `CANCELLED` no ocurrieron, pero tienen
   * consecuencia de plata —consumieron el horario y admiten penalidad, ver la
   * regla de estados— y moverlos le cambiaría el día al cobro.
   *
   * Todo lo demás (SCHEDULED, CONFIRMED, PENDING) se edita normal.
   */
  const CON_DESENLACE = ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

  /**
   * Antes esto se decidía con el RELOJ: `scheduledFor < now` bloqueaba la fecha.
   * El resultado era que una cita de hoy a las 9:00 quedaba de solo lectura a las
   * 9:01 aunque nadie la hubiera atendido — justo el caso más común del
   * mostrador ("el de las 9 no vino, muévelo a las 2"). Pamela se topó con eso el
   * 14-sep y no pudo hacer nada: el aviso la mandaba a un botón "Reagendar" que
   * no existe en ninguna pantalla.
   *
   * Ahora manda el ESTADO (decisión de Erick, 14-sep-2026): si no hizo check-in
   * ni tiene desenlace, se reprograma como cualquier otra, haya pasado o no.
   */
  const citaConDesenlace = isEditMode && !isReschedule && !!editAppointment
    && CON_DESENLACE.includes(editAppointment.status);

  /**
   * Pasó de hora pero sigue editable. Importa para el selector: si se le pasa la
   * fecha vieja como semana inicial abre una semana sin un solo hueco (los
   * candidatos se generan desde "ahora"), y se lee como que el doctor no atiende.
   * Sin fecha inicial abre en la semana actual, que es lo que se quiere elegir.
   */
  const citaVencidaSinAtender = isEditMode && !isReschedule && !!editAppointment
    && !citaConDesenlace
    && new Date(editAppointment.scheduledFor).getTime() < Date.now();

  const TYPE_OPTIONS: Array<{ value: AppointmentType; label: string }> = [
    { value: 'AUTO_ACCIDENT',   label: 'Auto Accident (MVA)' },
    { value: 'FOLLOW_UP',       label: t('typeFollowUp') },
    { value: 'FAMILY_PRACTICE', label: t('typeFamilyPractice') },
    { value: 'URGENT_CARE',     label: t('typeUrgentCare') },
  ];

  // Resources
  const [clinics,     setClinics]     = useState<Clinic[]>([]);
  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingRes,  setLoadingRes]  = useState(false);

  // Free mode: patient search
  const [patientQuery,   setPatientQuery]   = useState('');
  const [patientResults, setPatientResults] = useState<PatientResult[]>([]);
  const [searchingPt,    setSearchingPt]    = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
  /** Alta rápida abierta desde el buscador, con lo tecleado ya partido. */
  const [altaOpen,     setAltaOpen]     = useState(false);
  const [altaNombre,   setAltaNombre]   = useState('');
  const [altaApellido, setAltaApellido] = useState('');

  /**
   * ¿Es socio de la clínica? Se pregunta al elegir el paciente, que es justo
   * el momento en el que recepción necesita saberlo — hoy eso se contesta
   * abriendo otro sistema (Erick, 13-sep-2026).
   */
  const membresiaDelElegido = useMembresia(selectedPatient?.id);
  const [patientCases,   setPatientCases]   = useState<CaseOption[]>([]);
  const [loadingCases,   setLoadingCases]   = useState(false);

  // Appointment fields
  const [caseId,        setCaseId]        = useState('');
  const [clinicId,      setClinicId]      = useState('');
  const [providerId,    setProviderId]    = useState('');
  const [slotIso,       setSlotIso]       = useState<string | null>(null);
  const [duration,      setDuration]      = useState(15);
  const [type,          setType]          = useState<AppointmentType>('AUTO_ACCIDENT');
  const [notes,         setNotes]         = useState('');
  const [isOnline,      setIsOnline]      = useState(false);
  const [meetingUrl,    setMeetingUrl]    = useState('');

  /**
   * Registrar una visita que YA OCURRIÓ (Erick, 2026-09-18).
   *
   * Casos excepcionales: el paciente vino, se atendió y no se alcanzó a cargar.
   * Sin esto la visita no existe en el sistema y no se puede facturar.
   *
   * Es una casilla y no un modo aparte porque todo lo demás —paciente, caso,
   * sede, provider, duración, motivo— es idéntico. Lo único que cambia es CÓMO
   * se elige el horario: el selector semanal busca un hueco LIBRE del provider,
   * y para una visita que ya pasó la disponibilidad no es una pregunta; lo que
   * importa es la hora real. Mismo criterio que el diálogo de avisos de agenda.
   *
   * La casilla es obligatoria a propósito: sin ella una fecha vieja sigue siendo
   * un error, porque el caso abrumadoramente más común de una fecha vieja es un
   * dedazo en el año.
   */
  const [visitaPasada,  setVisitaPasada]  = useState(false);
  const [fechaPasada,   setFechaPasada]   = useState('');
  const [horaPasada,    setHoraPasada]    = useState('');

  // Alert bloqueante: "esa duración no entra en el horario elegido, volvimos a la que sí"
  const [durationConflictAlert, setDurationConflictAlert] = useState(false);

  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [success,        setSuccess]        = useState<{ clinicName: string; providerName: string; scheduledFor: string } | null>(null);
  const [duplicateAppts, setDuplicateAppts] = useState<DuplicateAppt[]>([]);
  // Aviso de cruce con otra cita del doctor — no bloquea, deja decidir.
  /**
   * El aviso que el servidor devolvió con 409, esperando que la persona decida.
   *
   * Guarda el CÓDIGO además del texto porque ahora hay dos motivos —el cruce con
   * otra cita y un aviso de agenda (almuerzo, reunión)— y cada uno se acepta con
   * su propia bandera. Sin el código, aceptar el almuerzo reenviaba
   * `allowOverlap` y el servidor volvía a avisar lo mismo: el diálogo quedaba en
   * bucle y parecía que el botón no hacía nada.
   */
  const [overlapPrompt,  setOverlapPrompt]  = useState<{
    pending: PendingSubmit;
    message: string;
    codigo: 'SLOT_CONFLICT' | 'BLOCKED_SLOT';
  } | null>(null);

  // Prevents the clinic/provider change effect from clearing the pre-populated slot
  const skipSlotReset  = useRef(false);
  const skipDurationReset = useRef(false); // idem, pero para el efecto de duración (ver más abajo)
  const slotIsoRef = useRef(slotIso);
  slotIsoRef.current = slotIso; // "última foto" de slotIso, legible desde el efecto de duración sin agregarlo como dependencia
  // Última duración confirmada como válida para el slotIso actual — si el
  // usuario prueba una duración que ya no entra, volvemos acá en vez de
  // dejar el horario roto.
  const lastValidDuration = useRef(duration);
  // true entre "cambié la duración" y "ya llegó la respuesta del servidor
  // confirmando si el horario elegido sigue entrando o no"
  const pendingDurationCheck = useRef(false);
  // Slot que se estaba validando cuando cambio la duracion. Hay que guardarlo
  // aparte: para cuando llegan los slots nuevos, la seleccion pudo haber
  // cambiado (el picker auto-selecciona el mas cercano), y comparar contra
  // slotIsoRef.current validaria el slot NUEVO en vez del que el usuario eligio.
  const slotUnderCheck = useRef<string | null>(null);
  // Duracion que el usuario INTENTO poner (la revertimos, pero el mensaje
  // tiene que nombrarla) + horario sugerido para esa duracion.
  const durationRef = useRef(duration);
  const [conflictSuggestion, setConflictSuggestion] = useState<{ time: string; tried: number } | null>(null);

  /**
   * ─── El tipo de cita sale del CASO ────────────────────────────────────────
   *
   * Ya no se elige a mano: el selector se sacó de la pantalla porque no decidía
   * nada. Medido sobre las 8.423 citas con caso, el tipo coincide con el tipo
   * del caso en el **99,9%** — 11 divergen, y son de la migración. `URGENT_CARE`
   * se usó UNA vez en toda la historia y `FOLLOW_UP` tres. Un campo obligatorio
   * que en la práctica tiene una sola respuesta correcta no es una decisión, es
   * un trámite.
   *
   * ⚠️ Se infiere por `caseType` y NO por `accidentType`, que es como estaba y
   * es lo que hacía que esto casi nunca funcionara: `accidentType` está vacío en
   * el 96% de los casos (2.938 de 3.053), así que la rama no entraba y el tipo
   * se quedaba en el default —`AUTO_ACCIDENT`—. Con el selector a la vista eso
   * se disimulaba porque alguien lo corregía a mano; escondiéndolo, toda cita
   * nueva de un caso GM habría quedado marcada como accidente, y pintada de
   * rosa en el calendario en vez de verde.
   *
   * `caseType` es el campo autoritativo y sólo tiene dos valores, MVA y GENERAL.
   */
  useEffect(() => {
    if (props.mode !== 'free' || !caseId) return;
    const found = patientCases.find((c) => c.id === caseId);
    if (!found) return;

    if (found.caseType === 'MVA') { setType('AUTO_ACCIDENT'); return; }
    if (found.caseType === 'GENERAL') { setType('FAMILY_PRACTICE'); return; }

    // Respaldo para un caso sin `caseType` (no debería existir: la columna no es
    // nula). Se mira `accidentType`, y si tampoco dice nada, no se toca: es
    // preferible dejar el default a afirmar un tipo sin fundamento.
    if (found.accidentType === 'AUTO' || found.accidentType === 'MVA') {
      setType('AUTO_ACCIDENT');
    } else if (found.accidentType === 'GENERAL' || found.accidentType === 'GP') {
      setType('FAMILY_PRACTICE');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, patientCases]);

  // ─── Derived: specialty (campo propio, siempre visible) ────────────────────

  // Especialidad real del caso — no cambia por elegir un override para la cita.
  const caseSpecialty = useMemo((): Specialty | null => {
    if (props.mode === 'case') return props.caseInfo?.specialty ?? null;
    const found = patientCases.find((c) => c.id === caseId);
    return found?.specialty ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, (props as CaseModeProps).caseInfo, caseId, patientCases]);

  // Especialidad activa para ESTA cita — precargada de caseSpecialty, pero
  // editable sin tocar el caso (a menos que el caso no tuviera ninguna, ver
  // handleSpecialtyChange).
  const [apptSpecialtyId, setApptSpecialtyId] = useState('');
  useEffect(() => { setApptSpecialtyId(caseSpecialty?.id ?? ''); }, [caseSpecialty?.id, caseId]);

  const [savingSpecialty, setSavingSpecialty] = useState(false);

  // Solo persiste al caso cuando el caso no tenía especialidad — si ya tenía
  // una y el usuario elige otra acá, es un override puntual para esta cita.
  const saveCaseSpecialty = useCallback(async (specialtyId: string) => {
    if (!caseId) return;
    setSavingSpecialty(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialtyId }),
      });
      if (!res.ok) setApptSpecialtyId('');
    } catch {
      setApptSpecialtyId('');
    } finally {
      setSavingSpecialty(false);
    }
  }, [caseId]);

  const handleSpecialtyChange = useCallback((newId: string) => {
    setApptSpecialtyId(newId);
    // No filtra/limpia el doctor: cualquier doctor atiende cualquier
    // especialidad (decisión explícita de Erick, no hay restricción real).
    if (!caseSpecialty && newId) saveCaseSpecialty(newId);
  }, [caseSpecialty, saveCaseSpecialty]);

  // Código de caso a mostrar en el badge persistente — cubre los 3 caminos:
  // mode='case' (viene fijo), free-mode tras elegir un caso, y editar (el
  // dato ya viene en editAppointment, sin depender del fetch de patientCases).
  const badgeCaseCode = props.mode === 'case'
    ? props.caseInfo?.caseCode
    : isEditMode
      ? editAppointment?.caseCode
      : patientCases.find((c) => c.id === caseId)?.caseCode;

  // ─── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setDurationConflictAlert(false);
    pendingDurationCheck.current = false;
    setPatientQuery('');
    setPatientResults([]);
    setPatientCases([]);
    setDuplicateAppts([]);

    if (editAppointment) {
      // Modo edición / reagendar: pre-llenar con datos existentes.
      // skipSlotReset prevents the clinic/provider change effect from wiping the slot.
      skipSlotReset.current = true;
      skipDurationReset.current = true;
      lastValidDuration.current = editAppointment.durationMinutes;
      setCaseId(editAppointment.caseId);
      setClinicId(editAppointment.clinicId);
      setProviderId(editAppointment.providerId ?? '');
      /* Ni en reagendar ni en una cita ya vencida se pre-selecciona el horario
         actual: en las dos hay que elegir uno nuevo, y dejar marcado en verde un
         horario que ya pasó —mientras el selector muestra la semana de hoy sin
         nada marcado— se lee como que el formulario está en dos estados a la vez. */
      /* En una cita CON desenlace el horario se conserva igual: ahí el selector
         ni se monta, el guardado sigue necesitando el valor (se editan las notas
         o el tipo, no la fecha) y vaciarlo rompería el submit sin decir por qué. */
      const horarioYaNoSirve = isReschedule
        || (!citaConDesenlace && new Date(editAppointment.scheduledFor).getTime() < Date.now());
      setSlotIso(horarioYaNoSirve ? null : editAppointment.scheduledFor);

      /**
       * Una cita que YA PASÓ se edita por fecha y hora A MANO, no con el
       * selector semanal.
       *
       * El selector solo ofrece días de hoy en adelante —y la API de horarios
       * recorta a `now`—, así que la propia fecha de la cita no aparece en la
       * lista y NO HAY FORMA de corregirle la hora desde la pantalla. El PATCH
       * sí lo permite desde el 2026-08-05; lo que faltaba era la puerta.
       *
       * El caso que lo destapó (Erick, 18-sep-2026): David Johnson con dos
       * visitas el 17, la del segundo accidente cargada a las 12:00 en vez de
       * las 11:45. Sin esto había que borrarla y crearla de nuevo, que es de
       * donde salen las citas duplicadas.
       *
       * Se enciende SOLA y con los valores puestos: quien abre una cita vieja
       * viene a corregirla, no a descubrir una casilla.
       */
      const yaPaso = !isReschedule && !citaConDesenlace
        && new Date(editAppointment.scheduledFor).getTime() < Date.now();
      setVisitaPasada(yaPaso);
      if (yaPaso) {
        const cuando = new Date(editAppointment.scheduledFor);
        const min = minutosDelDiaEnClinica(cuando);
        setFechaPasada(claveDia(cuando));
        setHoraPasada(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
      }
      setDuration(editAppointment.durationMinutes);
      setType(editAppointment.type as AppointmentType);
      setNotes(editAppointment.notes ?? '');
      setIsOnline(editAppointment.isOnline ?? false);
      setMeetingUrl(editAppointment.meetingUrl ?? '');
      setSelectedPatient({
        id: editAppointment.patient.id,
        firstName: editAppointment.patient.firstName,
        lastName: editAppointment.patient.lastName,
        patientCode: null,
        phone: null,
        casesCount: 0,
        lastCaseCode: null,
        lastCaseStatus: null,
      });
      // Pre-load known clinic/provider so the UI shows immediately (full list arrives via fetch below)
      setClinics([{
        id: editAppointment.clinicId,
        name: editAppointment.clinicName,
        address: editAppointment.clinicAddress ?? null,
        phone: null,
      }]);
      if (editAppointment.providerId && editAppointment.providerFirstName) {
        setAllProviders([{
          id: editAppointment.providerId,
          firstName: editAppointment.providerFirstName,
          lastName: editAppointment.providerLastName ?? '',
          specialty: editAppointment.providerSpecialty ?? '',
          licenseNumber: null,
          specialtyCatalogIds: [],
        }]);
      }
      // Cargar los casos del paciente para poder mostrar la especialidad real
      // del caso (caseSpecialty la deriva de patientCases en modo free,
      // y editar siempre usa mode="free" — ver AppointmentDialog usages).
      setLoadingCases(true);
      fetch(`/api/admin/patients/${editAppointment.patient.id}/cases`)
        .then((r) => r.json())
        .then((d) => setPatientCases(d.cases ?? []))
        .catch(() => {})
        .finally(() => setLoadingCases(false));
    } else {
      // Modo crear: limpiar todo (respetando los defaults de una recita)
      setCaseId(props.mode === 'case' ? (props.caseInfo?.id ?? '') : '');
      setClinicId(initialClinicId ?? '');
      setProviderId(props.defaultProviderId ?? '');
      setSlotIso(null);
      setVisitaPasada(false);
      setFechaPasada('');
      setHoraPasada('');
      setDuration(15);
      lastValidDuration.current = 15;
      setType(props.defaultType ?? 'AUTO_ACCIDENT');
      setNotes('');
      setIsOnline(false);
      setMeetingUrl('');
      setSelectedPatient(null);
    }

    setLoadingRes(true);
    fetch('/api/admin/scheduling/resources')
      .then((r) => r.json())
      .then((d) => {
        setClinics(d.clinics ?? []);
        const fetchedProviders: Provider[] = d.providers ?? [];
        // /scheduling/resources solo trae doctores ACTIVOS — si el doctor de
        // esta cita quedó inactivo después de agendarla, desaparecía de la
        // lista al editar (se veía como si no hubiera doctor seleccionado,
        // aunque la cita sí lo tenía). Se agrega igual para que siga viéndose.
        if (
          editAppointment?.providerId &&
          editAppointment.providerFirstName &&
          !fetchedProviders.some((p) => p.id === editAppointment.providerId)
        ) {
          fetchedProviders.push({
            id: editAppointment.providerId,
            firstName: editAppointment.providerFirstName,
            lastName: editAppointment.providerLastName ?? '',
            specialty: editAppointment.providerSpecialty ?? '',
            licenseNumber: null,
            specialtyCatalogIds: [],
          });
        }
        setAllProviders(fetchedProviders);
        setSpecialties(d.specialties ?? []);
      })
      .catch(() => setError(t('errorLoadResources')))
      .finally(() => setLoadingRes(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Patient search (free mode) ─────────────────────────────────────────────

  useEffect(() => {
    if (props.mode !== 'free') return;
    if (patientQuery.length < 2) { setPatientResults([]); return; }
    const timer = setTimeout(() => {
      setSearchingPt(true);
      fetch(`/api/admin/patients/search?q=${encodeURIComponent(patientQuery)}`)
        .then((r) => r.json())
        .then((d) => setPatientResults(d.results ?? []))
        .catch(() => {})
        .finally(() => setSearchingPt(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [patientQuery, props.mode]);

  const selectPatient = useCallback((pt: PatientResult) => {
    setSelectedPatient(pt);
    setPatientQuery('');
    setPatientResults([]);
    setCaseId('');
    // No resetear providerId/clinicId — el doctor y clínica ya seleccionados se mantienen
    setLoadingCases(true);
    fetch(`/api/admin/patients/${pt.id}/cases`)
      .then((r) => r.json())
      .then((d) => setPatientCases(d.cases ?? []))
      .catch(() => {})
      .finally(() => setLoadingCases(false));
  }, []);

  /**
   * Alta rápida desde el buscador: parte lo tecleado en nombre y apellido por el
   * primer espacio. "Juan" solo deja el apellido vacío, que es correcto — el alta
   * lo pide igual y lo valida.
   */
  const abrirAltaRapida = useCallback(() => {
    const partes = patientQuery.trim().split(/\s+/);
    setAltaNombre(partes[0] ?? '');
    setAltaApellido(partes.slice(1).join(' '));
    setAltaOpen(true);
  }, [patientQuery]);

  /**
   * Vuelve del alta rápida: el paciente y su caso quedan elegidos solos.
   *
   * `selectPatient` dispara el fetch de casos que ya existía, y el caso se fija
   * con el id que devuelve el alta — NO con un "si hay uno solo, tomalo": el alta
   * crea paciente y caso juntos, así que sabemos exactamente cuál es, y si mañana
   * el paciente tuviera dos la regla genérica elegiría mal. `setCaseId` va después
   * de `selectPatient`, que lo limpia.
   *
   * Queda seleccionado antes de que llegue la lista; cuando llega, la tarjeta de
   * ese caso aparece marcada.
   */
  const onPacienteCreado = useCallback((creado: {
    patientId: string; patientCode: string | null;
    firstName: string; lastName: string; phone: string | null;
    caseId: string | null; caseCode: string | null;
  }) => {
    setAltaOpen(false);
    setPatientQuery('');
    setPatientResults([]);
    selectPatient({
      id:             creado.patientId,
      patientCode:    creado.patientCode,
      firstName:      creado.firstName,
      lastName:       creado.lastName,
      phone:          creado.phone,
      // Desde que el alta rápida puede guardar SIN caso, esto no es siempre 1:
      // con `caseId` nulo el paciente queda con cero casos, y de ese cero sale
      // el aviso ámbar con "Crear caso acá", que es donde ahora se elige MVA o
      // GM. Con el 1 fijo la pantalla decía "1 caso" y no ofrecía abrir ninguno.
      casesCount:     creado.caseId ? 1 : 0,
      lastCaseCode:   creado.caseCode,
      lastCaseStatus: null,
      isArchived:     false,
    });
    if (creado.caseId) setCaseId(creado.caseId);
  }, [selectPatient]);

  const clearPatient = useCallback(() => {
    setSelectedPatient(null);
    setPatientCases([]);
    setCaseId('');
    setProviderId('');
  }, []);

  /**
   * ─── Abrir un caso sin salir del calendario ───────────────────────────────
   *
   * La MITAD del padrón no tiene ningún caso —2.862 de 5.729, medido
   * 2026-09-14—, así que este diálogo los dejaba buscar, elegir, y recién
   * después los frenaba con "el paciente no tiene casos". La salida era cerrar,
   * ir a Pacientes, abrir el caso y volver a agendar desde cero.
   *
   * Ahora el wizard de caso se abre acá encima, con el paciente y el horario ya
   * puestos. No es un formulario nuevo: es el MISMO `NewCaseDialog` de Front
   * Office, que ya crea paciente + caso + cita en una transacción, emite el
   * token del portal, arma el QR y manda el SMS. Una copia recortada tendría
   * que reimplementar todo eso y se desincronizaría al primer cambio.
   */
  const [casoOpen,      setCasoOpen]      = useState(false);
  const [casoInitial,   setCasoInitial]   = useState<NewCaseInitialState | null>(null);
  const [casoPidiendo,  setCasoPidiendo]  = useState(false);
  const [casoConfirmar, setCasoConfirmar] = useState(false);
  const [casoError,     setCasoError]     = useState<string | null>(null);

  /**
   * Trae lo que ya sabemos del paciente y abre el wizard con todo puesto.
   *
   * El horario viaja como `cita`: quien llegó hasta acá ya lo eligió en la
   * grilla, y volver a pedírselo adentro del wizard sería preguntar dos veces
   * lo mismo. Va precargado pero EDITABLE — al abrir el caso puede cambiar la
   * clínica o el doctor, y entonces ese slot deja de servir.
   *
   * Si la precarga falla NO se cancela nada: el wizard se abre igual con lo
   * mínimo. Perder el camino entero porque no se pudo copiar el bufete del caso
   * anterior sería cambiar una comodidad por un bloqueo.
   */
  const abrirCrearCaso = useCallback(async () => {
    if (!selectedPatient) return;
    setCasoConfirmar(false);
    setCasoPidiendo(true);
    setCasoError(null);

    const base: NewCaseInitialState = {
      // `search` y no `outgoing`: el paciente ya existe y no hay llamada que
      // cronometrar. Es el mismo modo con el que entra "Search existing
      // patient", que arranca directo en la captura y saltea el selector.
      mode:       'search',
      firstName:  selectedPatient.firstName,
      lastName:   selectedPatient.lastName,
      phone:      selectedPatient.phone ?? '',
      existingPatientId: selectedPatient.id,
      cita: slotIso ? {
        scheduledFor:    slotIso,
        clinicId:        clinicId   || undefined,
        providerId:      providerId || undefined,
        durationMinutes: duration,
      } : null,
    };

    try {
      const res = await fetch(`/api/admin/patients/${selectedPatient.id}/precarga-caso`);
      if (res.ok) {
        const d = await res.json();
        setCasoInitial({
          ...base,
          email:       d.paciente?.email || undefined,
          dateOfBirth: d.paciente?.dateOfBirth || undefined,
          language:    d.paciente?.preferredLanguage ?? undefined,
          referralSource: d.paciente?.referralSource ?? undefined,
          referrerFirm:   d.paciente?.referrerFirm ?? undefined,
          // Del caso anterior: bufete, abogado y aseguradora se repiten entre
          // casos del mismo paciente. La póliza NO viene — es del siniestro.
          lawFirm:   d.ultimoCaso?.lawFirm   ?? undefined,
          attorney:  d.ultimoCaso?.attorney  ?? undefined,
          insurance: d.ultimoCaso?.insurance ?? undefined,
        });
      } else {
        setCasoInitial(base);
      }
    } catch {
      setCasoInitial(base);
    } finally {
      setCasoPidiendo(false);
      setCasoOpen(true);
    }
  }, [selectedPatient, slotIso, clinicId, providerId, duration]);

  /**
   * El caso quedó creado — y con él la cita, porque el wizard las crea juntas.
   *
   * Por eso este diálogo se cierra: ya no hay nada que agendar, y dejarlo
   * abierto invitaría a crear una SEGUNDA cita para el mismo horario. El
   * `refresh` repinta la grilla, donde la cita nueva aparece sola.
   *
   * No se cierra el wizard: su panel de éxito tiene el QR y el enlace del
   * portal, y cerrarlo acá se los sacaría de la pantalla a recepción justo
   * cuando los va a copiar. Cierra cuando la persona lo cierre.
   */
  const onCasoCreado = useCallback(() => {
    router.refresh();
    onOpenChange(false);
  }, [router, onOpenChange]);

  /**
   * Con UN solo caso agendable, se selecciona solo.
   *
   * Si no hay nada que elegir, preguntarlo es puro trámite: el staff llegaba
   * hasta el final del formulario y recién ahí se enteraba de que faltaba tocar
   * una tarjeta que —al ser la única— se leía como un dato ya cargado, igual que
   * el campo Paciente de arriba. Con dos o más sí hay decisión y se pregunta.
   *
   * Solo cuando `caseId` está vacío: nunca pisa una elección hecha a mano.
   */
  useEffect(() => {
    if (caseId || loadingCases) return;
    const agendables = patientCases.filter((c) => esAgendable(c.status));
    if (agendables.length === 1) setCaseId(agendables[0]!.id);
  }, [patientCases, caseId, loadingCases]);

  // Reset slot cuando cambia provider/clinic para forzar nueva selección.
  // Skip the reset when triggered by the initial pre-population (skipSlotReset ref).
  useEffect(() => {
    if (skipSlotReset.current) {
      skipSlotReset.current = false;
      return;
    }
    setSlotIso(null);
  }, [providerId, clinicId]);

  // Cambiar duración NO limpia el horario a ciegas — si había uno elegido,
  // esperamos a que WeeklySlotPicker confirme (vía onSlotsFetched) si sigue
  // entrando a la nueva duración. handleSlotsFetched resuelve el resto.
  useEffect(() => {
    if (skipDurationReset.current) {
      skipDurationReset.current = false;
      return;
    }
    // Cita con desenlace: WeeklySlotPicker ni se monta (ver render), así que
    // nunca llegaría onSlotsFetched a resolver este flag.
    if (slotIsoRef.current && !citaConDesenlace) {
      pendingDurationCheck.current = true;
      slotUnderCheck.current = slotIsoRef.current;
    }
  }, [duration, citaConDesenlace]);

  // El horario elegido sigue siendo válido para la duración actual — la
  // "última duración válida" queda anotada por si una futura duración
  // resulta no entrar y hay que volver acá.
  useEffect(() => {
    if (slotIso) lastValidDuration.current = duration;
  }, [slotIso]);

  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Se llama cada vez que WeeklySlotPicker trae una lista nueva de horarios
  // (cambió duración, doctor, clínica o semana). Solo actuamos cuando el
  // cambio pendiente de revisar fue el de duración (pendingDurationCheck):
  // si el horario elegido ya no está en la lista, esa duración no entra —
  // volvemos a la última que sí funcionaba y avisamos con un alert, en vez
  // de dejar el horario roto en silencio.
  const handleSlotsFetched = useCallback((fetchedSlots: Array<{ iso: string }>) => {
    if (!pendingDurationCheck.current) return;
    pendingDurationCheck.current = false;
    // Validamos el slot que el usuario TENIA elegido, no el que haya quedado
    // seleccionado despues del refetch.
    const current = slotUnderCheck.current;
    slotUnderCheck.current = null;
    if (!current) return;
    const stillValid = fetchedSlots.some((s) => s.iso === current);
    if (!stillValid) {
      // Sugerir el horario valido MAS CERCANO al que queria, para la duracion
      // que pidio: revertir a secas lo deja sin saber cuando si puede.
      const target = new Date(current).getTime();
      let best: string | null = null;
      let bestDiff = Infinity;
      for (const s of fetchedSlots) {
        const diff = Math.abs(new Date(s.iso).getTime() - target);
        if (diff < bestDiff) { bestDiff = diff; best = s.iso; }
      }
      setConflictSuggestion(
        best
          ? { time: new Date(best).toLocaleTimeString(localeApp(), { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true }), tried: durationRef.current }
          : null,
      );
      // Volvemos a la duracion que si entraba Y restauramos el horario elegido:
      // revertir solo la duracion dejaba al usuario con un horario que el nunca
      // eligio (el picker ya habia saltado al mas cercano) sin avisar nada.
      skipDurationReset.current = true;
      setDuration(lastValidDuration.current);
      setSlotIso(current);
      setDurationConflictAlert(true);
    }
  }, []);

  // ─── Duplicate check: reactive, inline ─────────────────────────────────────
  // Fires when the user picks a slot. Shows a warning banner — does NOT block submit.
  // Only applies to new appointments (not edit/reschedule).

  useEffect(() => {
    setDuplicateAppts([]);
    if (isEditMode || isReschedule) return;
    const patientId = props.mode === 'free' ? selectedPatient?.id : null;
    if (!patientId) return;

    /*
     * Todo lo que VIENE, no solo el día elegido.
     *
     * Hasta el 2026-09-20 esto pedía únicamente las citas de la fecha del
     * horario elegido, así que agendarle el martes a alguien que ya tenía el
     * jueves no avisaba nada — y esa es justo la que se agenda dos veces,
     * porque nadie se acuerda de lo que pidió el paciente la semana pasada
     * (pedido de la clínica, 2026-09-20). Y ahora dispara al elegir al
     * PACIENTE, sin esperar a que se toque el horario: con el aviso atado al
     * slot, quien elegía la persona y miraba la agenda no veía nada todavía.
     */
    const desde = new Date().toISOString();
    const hasta = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const controller = new AbortController();
    fetch(
      `/api/admin/appointments?patientId=${patientId}&from=${desde}&to=${hasta}`,
      { signal: controller.signal },
    )
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const proximas = ((data.appointments ?? []) as DuplicateAppt[])
          .filter((a: DuplicateAppt) => a.status !== 'CANCELLED')
          .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
        setDuplicateAppts(proximas);
      })
      .catch(() => {});
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient?.id]);

  // ─── Computed: scheduledFor ──────────────────────────────────────────────────

  /**
   * La hora tecleada se arma en la zona de la CLÍNICA, no en la del navegador.
   *
   * `new Date('2026-09-14T10:00')` se lee en la zona de quien mira, así que la
   * misma visita cargada desde otra zona quedaría guardada a otra hora. Con
   * `instanteEnClinica` las 10:00 son las 10:00 en Utah siempre, y el cambio de
   * horario de verano sale bien sin casos especiales.
   */
  const isoPasado = useMemo(() => {
    if (!visitaPasada || !fechaPasada || !horaPasada) return null;
    const [hh, mm] = horaPasada.split(':').map(Number);
    if (hh === undefined || mm === undefined || Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return instanteEnClinica(fechaPasada, hh * 60 + mm).toISOString();
  }, [visitaPasada, fechaPasada, horaPasada]);

  const scheduledForIso = visitaPasada ? isoPasado : slotIso;

  const scheduledLabel = useMemo(() => {
    if (!scheduledForIso) return null;
    return new Date(scheduledForIso).toLocaleString(localeApp(), {
      weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
    });
  }, [scheduledForIso]);

  // Desired time label (from calendar click) — formatted for display
  const desiredDateLabel = useMemo(() => {
    if (!initialDate) return '';
    return new Date(initialDate + 'T12:00:00Z').toLocaleDateString(localeApp(), {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
  }, [initialDate]);

  const desiredTimeLabel = useMemo(() => {
    if (!initialTime) return '';
    const [h, m] = initialTime.split(':').map(Number) as [number, number];
    const period = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }, [initialTime]);

  const isFuture = scheduledForIso ? new Date(scheduledForIso).getTime() > Date.now() : false;

  /**
   * Con la casilla marcada, el horario tiene que estar en el PASADO: si no, no
   * es una visita que ya ocurrió y corresponde el selector de siempre, que
   * además chequea la disponibilidad del provider.
   */
  const retroOk = !visitaPasada || (!!scheduledForIso && !isFuture);

  const selectedClinic   = clinics.find((c) => c.id === clinicId);
  const selectedProvider = allProviders.find((p) => p.id === providerId);

  /**
   * El MOTIVO es obligatorio al crear — no al editar.
   *
   * Devin, 2026-09-23, sobre elegir de qué visita traer texto: *"none of the
   * visits in this particular chart have a 'reason for visit' listed… this is
   * something we could simply incorporate on our end and make it required"*.
   * Sin motivo, elegir entre diecisiete fechas es adivinar.
   *
   * Los datos respaldan obligarlo: de 3.358 motivos escritos solo 21 son ruido
   * de una o dos letras (0,6%). Cuando lo llenan, escriben cosas reales — "MVA
   * FU 3 WEEKS", "LAB REVIEW". No es un campo que la gente sabotee.
   *
   * **Al EDITAR no se exige.** El 60% de las citas que ya existen no tiene
   * motivo, y pedirlo para corregir una hora bloquearía editar la mayoría del
   * historial. Obligatorio arregla lo que viene; lo viejo se queda como está.
   */
  const motivoOk = isEditMode || notes.trim().length > 0;

  const canSubmit = useMemo(() => {
    const hasCase = isEditMode ? true : (props.mode === 'case' ? !!props.caseInfo?.id : !!caseId);
    const slotOk = isEditMode ? !!scheduledForIso : (!!scheduledForIso && (visitaPasada ? retroOk : isFuture));
    return hasCase && !!clinicId && !!providerId && slotOk && motivoOk && !saving;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, props.mode, caseId, clinicId, providerId, scheduledForIso, isFuture, visitaPasada, retroOk, motivoOk, saving]);

  // Refs for scrolling to missing fields
  const motivoRef  = useRef<HTMLDivElement>(null);
  const caseRef    = useRef<HTMLDivElement>(null);
  const clinicRef  = useRef<HTMLDivElement>(null);
  const doctorRef  = useRef<HTMLDivElement>(null);
  const slotRef    = useRef<HTMLDivElement>(null);

  // El error de validación se limpiaba solo al abrir el dialog y al reintentar
  // el submit, no al corregir el campo que faltaba. Resultado: si alguien
  // apretaba "Agendar" sin caso, elegía el caso después y el cartel rojo
  // "Selecciona un caso para continuar" quedaba visible aunque ya estuviera
  // todo completo — y el guardado funcionaba igual, así que el mensaje mentía.
  useEffect(() => {
    setError(null);
  }, [caseId, clinicId, providerId, scheduledForIso]);

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSchedule = async () => {
    setError(null);
    if (!canSubmit) {
      // Identify first missing field and scroll to it
      if (props.mode === 'free' && !caseId) {
        setError(t('validationSelectCase'));
        caseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!clinicId) {
        setError(t('validationSelectClinic'));
        clinicRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!providerId) {
        setError(t('validationSelectDoctor'));
        doctorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      // Último de la cadena: es el único que se resuelve escribiendo, así que
      // primero se resuelven los que se eligen de una lista.
      if (!motivoOk) {
        setError(t('validationReason'));
        motivoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (visitaPasada ? !retroOk : (!scheduledForIso || !isFuture)) {
        setError(visitaPasada ? t('retroValidation') : t('validationSelectSlot'));
        slotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      return;
    }

    // Duplicate warning is shown inline — no blocking confirm needed here.

    const pending = buildSubmit();
    if (!pending) return; // nada cambió — buildSubmit ya cerró el diálogo
    await submitAppointment(pending);
  };

  /**
   * Arma el pedido sin enviarlo, para que el reintento "solapar igual" pueda
   * repetir exactamente el mismo body. Devuelve null cuando no hay nada que
   * guardar (y en ese caso ya cerró el diálogo).
   */
  const buildSubmit = (): PendingSubmit | null => {
    if (isEditMode) {
      // PATCH — editar cita existente.
      //
      // Se manda SOLO lo que el usuario cambió respecto de lo que el diálogo le
      // mostró al abrirse. Antes se enviaban todos los campos siempre, y eso
      // convertía cualquier prellenado desactualizado en pérdida de datos: los
      // campos que nadie tocó se re-escribían con el valor viejo, revirtiendo un
      // guardado anterior sin decir nada.
      const base           = editAppointment!;
      const nextNotes      = notes.trim() || null;
      // Si se apaga "consulta en línea", el link se limpia también — evita que
      // quede un meetingUrl viejo colgado tras desactivar.
      const nextMeetingUrl = isOnline ? (meetingUrl.trim() || null) : null;
      // Comparado por timestamp y no por string: el ISO del picker y el de la
      // cita pueden estar formateados distinto y ser el mismo instante.
      const slotChanged    = !!scheduledForIso
        && new Date(scheduledForIso).getTime() !== new Date(base.scheduledFor).getTime();

      const changes = {
        ...(clinicId   && clinicId   !== base.clinicId   && { clinicId }),
        ...(providerId && providerId !== base.providerId && { providerId }),
        ...(slotChanged && { scheduledFor: scheduledForIso }),
        ...(duration !== base.durationMinutes && { durationMinutes: duration }),
        ...(type     !== base.type            && { type }),
        ...(nextNotes      !== (base.notes ?? null)      && { notes: nextNotes }),
        ...(isOnline       !== (base.isOnline ?? false)  && { isOnline }),
        ...(nextMeetingUrl !== (base.meetingUrl ?? null) && { meetingUrl: nextMeetingUrl }),
      };

      // Nada que guardar: el PATCH rechaza un body vacío ("Al menos un campo
      // requerido"), y mostrar ese error por no haber cambiado nada sería
      // absurdo — se cierra igual que si hubiera guardado.
      if (Object.keys(changes).length === 0) {
        onOpenChange(false);
        return null;
      }
      return { mode: 'edit', url: `/api/admin/appointments/${base.id}`, body: changes };
    }

    // POST — crear nueva cita
    const targetCaseId = props.mode === 'case' ? props.caseInfo!.id : caseId;
    return {
      mode: 'create',
      url:  '/api/admin/appointments',
      body: {
        caseId: targetCaseId,
        clinicId,
        providerId,
        scheduledFor: scheduledForIso,
        durationMinutes: duration,
        type,
        notes: notes.trim() || undefined,
        isOnline,
        meetingUrl: isOnline ? (meetingUrl.trim() || undefined) : undefined,
        // Sin esta bandera el servidor rechaza cualquier fecha vieja, que es lo
        // que tiene que seguir haciendo cuando nadie la marcó a propósito.
        ...(visitaPasada && { allowPast: true }),
      },
    };
  };

  const submitAppointment = async (
    pending: PendingSubmit,
    /** Qué avisos ya aceptó la persona. Cada uno viaja con su propia bandera. */
    permitir: { overlap?: boolean; blocked?: boolean } = {},
  ) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(pending.url, {
        method:  pending.mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...pending.body,
          ...(permitir.overlap && { allowOverlap: true }),
          ...(permitir.blocked && { allowBlocked: true }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Cruce con otra cita del doctor: avisa y deja decidir en vez de
        // rechazar el guardado (misma regla que el arrastre del calendario,
        // confirmada por Erick 2026-08-05).
        if (res.status === 409 && data.canOverride) {
          /**
           * La frase se arma acá y no viene del servidor: el título y los
           * botones del cartel salen de next-intl, y con el cuerpo escrito en
           * el backend quedaba mitad en inglés y mitad en castellano (Erick,
           * 21-sep-2026). El aviso de agenda sigue mostrando `message`, que ahí
           * son las etiquetas que escribió la clínica y no se traducen.
           */
          const esCruce = data.error !== 'BLOCKED_SLOT';
          let cuerpo: string = (data.message as string | undefined) ?? '';
          if (esCruce && typeof data.conflictAt === 'string') {
            const hora = new Date(data.conflictAt).toLocaleTimeString(localeApp(), {
              hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
            });
            const cuantas = (data.overlapCount as number | undefined) ?? 1;
            cuerpo = data.conflictPatient
              ? t('overlapBody', { time: hora, patient: data.conflictPatient as string })
              : t('overlapBodyAnon', { time: hora });
            if (cuantas > 1) cuerpo += ' ' + t('overlapMore', { count: cuantas - 1 });
          }
          setOverlapPrompt({
            pending,
            message: cuerpo,
            codigo:  data.error === 'BLOCKED_SLOT' ? 'BLOCKED_SLOT' : 'SLOT_CONFLICT',
          });
          return;
        }
        throw new Error(serverError(data as ServerErrorBody));
      }
      if (pending.mode === 'edit') {
        /**
         * Qué pasó con el aviso al paciente.
         *
         * El PATCH devuelve `avisoReprogramacion` y `avisoCancelacion` desde el
         * 2026-09-18, y este diálogo los tiraba junto con el resto de la
         * respuesta: movías una cita, el correo al paciente se rechazaba, y la
         * pantalla se cerraba en verde igual que si hubiera salido.
         *
         * Va por toast y no bloqueando: el cambio de la cita YA se guardó, así
         * que no hay nada que decidir acá — solo algo que saber.
         */
        const dataEdit = await res.json().catch(() => ({}));
        for (const [r, tipo] of [
          [dataEdit.avisoReprogramacion, 'reprogramacion'],
          [dataEdit.avisoCancelacion,    'cancelacion'],
        ] as const) {
          const msg = describirAvisoCita(r, tipo, tac);
          if (msg) toast.info(msg, { durationMs: 9000 });
        }
        router.refresh();
        onSuccess?.();
        onOpenChange(false);
        return;
      }
      const data = await res.json();
      setSuccess({
        scheduledFor: data.appointment.scheduledFor,
        clinicName:   data.appointment.clinic.name,
        providerName: `${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`,
      });
      // El recordatorio al paciente. El server lo espera con `await` —en vez de
      // dispararlo y seguir— justamente para que recepción pueda verlo acá.
      const avisoAlAgendar = describirAvisoCita(data.recordatorio, 'recordatorio', tac);
      if (avisoAlAgendar) toast.info(avisoAlAgendar, { durationMs: 9000 });

      router.refresh();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : pending.mode === 'edit' ? t('errorSaveAppointment') : t('errorScheduleAppointment'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Success state ───────────────────────────────────────────────────────────

  if (success) {
    const patientName = props.mode === 'case'
      ? `${props.caseInfo!.patient.firstName} ${props.caseInfo!.patient.lastName}`
      : `${selectedPatient?.firstName ?? ''} ${selectedPatient?.lastName ?? ''}`;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('successTitle')}</DialogTitle>
          </DialogHeader>
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald/20 border-2 border-emerald flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald" />
            </div>
            <h2 className="text-xl font-bold text-text-1 mb-2">{t('successTitle')}</h2>
            <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-4 text-left text-xs space-y-1 mb-6">
              <div className="text-emerald font-semibold uppercase tracking-wider text-[10px] mb-2">{t('successDetailsLabel')}</div>
              <div><strong className="text-text-1">{t('successPatient')}</strong> {patientName}</div>
              <div><strong className="text-text-1">{t('successDoctor')}</strong> {success.providerName}</div>
              <div><strong className="text-text-1">{t('successClinic')}</strong> {success.clinicName}</div>
              {/* timeZone obligatorio: sin fijarlo se formatea en la zona del
                  navegador y cada persona ve una hora distinta para la misma
                  cita (un tester en Eastern veía 10:00 AM donde se agendaron
                  las 8:00 AM). El resto del archivo ya fija Denver. */}
              <div><strong className="text-text-1">{t('successWhen')}</strong> {new Date(success.scheduledFor).toLocaleString(localeApp(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver' })}</div>
            </div>
            <Button onClick={() => onOpenChange(false)}>{t('actionClose')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Form ────────────────────────────────────────────────────────────────────

  return (
    <>
    {/* `open && !altaOpen`: mientras el alta rápida está encima, este diálogo se
        REPLIEGA sin desmontarse. Apilar dos Dialog de Radix pelea por el foco y
        por los `pointer-events` del body — ya nos pasó con el detalle del caso
        sobre el panel de la cita. Y al volver, la fecha, la hora y la clínica que
        ya se habían elegido siguen ahí: si se perdieran, el atajo costaría más de
        lo que ahorra. */}
    <Dialog open={open && !altaOpen && !casoOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald" />
            {isReschedule ? t('dialogTitleReschedule') : isEditMode ? t('dialogTitleEdit') : props.mode === 'case' ? t('dialogTitleScheduleFirst') : t('dialogTitleNew')}
          </DialogTitle>
          {isEditMode && editAppointment && (
            <DialogDescription>
              {t('dialogDescPatient')} <strong className="text-text-1">{editAppointment.patient.firstName} {editAppointment.patient.lastName}</strong>
              {' '}· {t('dialogDescCase')} <code className="text-text-1 font-mono">{editAppointment.caseCode}</code>.
            </DialogDescription>
          )}
          {!isEditMode && props.mode === 'case' && props.caseInfo && (
            <DialogDescription>
              {t('dialogDescPatient')} <strong className="text-text-1">{props.caseInfo.patient.firstName} {props.caseInfo.patient.lastName}</strong>
              {' '}· {t('dialogDescCase')} <code className="text-text-1 font-mono">{props.caseInfo.caseCode}</code>.
              {t('dialogDescStatusChange')} <code className="text-brand-text">ACTIVE</code>.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[68vh] overflow-y-auto pr-1">

          {/* ── Desired time banner (from calendar slot click) ── */}
          {!isEditMode && !isReschedule && initialDate && initialTime && (
            <div className={`rounded-lg border p-3 flex items-center gap-3 transition-colors ${
              slotIso
                ? 'border-emerald/40 bg-emerald/8'
                : 'border-cyan/40 bg-cyan/8'
            }`}>
              <CalendarIcon className={`w-4 h-4 shrink-0 ${slotIso ? 'text-emerald' : 'text-cyan'}`} />
              <div className="flex-1 min-w-0">
                {slotIso ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald mb-0.5">{t('slotConfirmed')}</div>
                    <div className="text-text-1 text-sm font-semibold">{scheduledLabel}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-cyan mb-0.5">{t('desiredTime')}</div>
                    <div className="text-text-1 text-sm font-semibold">{desiredDateLabel} · {desiredTimeLabel}</div>
                    {(!clinicId || !providerId) && (
                      <div className="text-cyan/60 text-[11px] mt-0.5">{t('selectClinicDoctorHint')}</div>
                    )}
                  </>
                )}
              </div>
              {slotIso && <Check className="w-4 h-4 text-emerald shrink-0" />}
            </div>
          )}

          {/* ── FREE MODE: Patient search ── */}
          {!isEditMode && props.mode === 'free' && (
            <div className="space-y-3">
              <div>
                <Label>
                  <User className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                  {t('fieldPatient')} <span className="text-rose">*</span>
                </Label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between rounded-md border border-emerald/40 bg-emerald/5 px-3 py-2 text-sm">
                    <div>
                      <span className="text-text-1 font-medium">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                      {selectedPatient.patientCode && (
                        <span className="ml-2 text-text-muted font-mono text-[11px]">{selectedPatient.patientCode}</span>
                      )}
                      {selectedPatient.phone && <span className="ml-2 text-text-muted text-[11px]">{selectedPatient.phone}</span>}
                      {membresiaDelElegido && (
                        <div className="mt-1.5"><PastillaMembresia membresia={membresiaDelElegido} /></div>
                      )}
                    </div>
                    <button onClick={clearPatient} className="text-text-muted hover:text-rose transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-text-muted" />
                    <input
                      type="text"
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                      placeholder={t('searchPatientPlaceholder2')}
                      className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                    />
                    {/* La condición incluye `patientQuery.length >= 2`: sin eso, al
                        terminar una búsqueda SIN resultados el desplegable entero
                        desaparecía —`searchingPt` en false y cero resultados— y el
                        "sin resultados" de abajo era código muerto que no se podía
                        mostrar nunca. Justo el momento en que hay que ofrecer crear
                        al paciente, la pantalla no decía nada. */}
                    {(searchingPt || patientResults.length > 0 || patientQuery.length >= 2) && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-bg-1 border border-border rounded-md shadow-lg z-50 overflow-hidden">
                        {searchingPt && <div className="px-3 py-2 text-text-muted text-xs">{t('searchingPatients')}</div>}
                        {/*
                          * Un paciente dado de baja se MUESTRA pero no se puede
                          * elegir. Mostrarlo importa: si desaparece, quien busca
                          * cree que no existe y lo crea de nuevo — y duplicar un
                          * paciente parte su historial en dos.
                          *
                          * Y bloquearlo importa porque dar de baja al paciente
                          * CANCELA sus citas futuras para liberar la agenda:
                          * dejarlo agendar deshace a mano lo que esa acción hizo
                          * a propósito.
                          */}
                        {patientResults.map((pt) => (
                          <button
                            key={pt.id}
                            onClick={() => { if (!pt.isArchived) selectPatient(pt); }}
                            disabled={pt.isArchived}
                            className="w-full text-left px-3 py-2 hover:bg-bg-2 transition-colors border-b border-row-sep last:border-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          >
                            <div className="text-text-1 text-sm font-medium flex items-center gap-2">
                              <span>{pt.firstName} {pt.lastName}</span>
                              {pt.isArchived && (
                                <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border border-amber/30 bg-amber/10 text-amber">
                                  {t('patientArchivedBadge')}
                                </span>
                              )}
                            </div>
                            <div className="text-text-muted text-[11px]">
                              {pt.patientCode && <span className="font-mono mr-2">{pt.patientCode}</span>}
                              {pt.phone && <span>{pt.phone}</span>}
                              {/* Sin código legible se muestra solo el conteo: "2 caso(s) · último: null"
                                  no le dice nada a nadie, y next-intl no acepta null como parámetro. */}
                              {pt.casesCount > 0 && (
                                <span className="ml-2">
                                  {pt.lastCaseCode
                                    ? t('patientCasesCount', { n: pt.casesCount, code: pt.lastCaseCode })
                                    : t('patientCasesCountNoCode', { n: pt.casesCount })}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                        {!searchingPt && patientResults.length === 0 && patientQuery.length >= 2 && (
                          <div className="px-3 py-2 text-text-muted text-xs">{t('noPatientResults')}</div>
                        )}

                        {/* Crear al paciente sin salir de la cita.
                            Va al PIE y no arriba, aunque haya resultados: la acción
                            común es elegir a alguien que ya existe, y poner "crear"
                            primero invita a duplicar — el mismo riesgo por el que
                            los archivados se muestran deshabilitados en vez de
                            esconderse. Cuando no hay resultados queda solo él, que
                            es cuando de verdad hace falta.
                            Arrastra lo tecleado: si escribió "Juan Perez", el alta
                            abre con nombre y apellido puestos. */}
                        {!searchingPt && patientQuery.trim().length >= 2 && (
                          <button
                            type="button"
                            onClick={abrirAltaRapida}
                            className="w-full text-left px-3 py-2.5 flex items-center gap-2 border-t border-row-sep bg-brand/[0.06] hover:bg-brand/[0.12] text-brand transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs font-semibold">
                              {t('createPatientNamed', { name: patientQuery.trim() })}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Case selector (after patient selected) */}
              {selectedPatient && (
                <div ref={caseRef}>
                  <Label>
                    <FileText className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                    {t('fieldCase')} <span className="text-rose">*</span>
                  </Label>
                  {loadingCases ? (
                    <div className="text-text-muted text-xs py-2">{t('loadingCases')}</div>
                  ) : patientCases.length === 0 ? (
                    /* Antes esto era sólo el aviso ámbar, y ahí se terminaba el
                       camino para la mitad del padrón. El aviso se queda —dice
                       lo que pasa— pero ahora trae la salida al lado. */
                    <div className="rounded-md border border-amber/30 bg-amber/5 px-3 py-2 space-y-2">
                      <div className="text-amber text-xs">{t('patientNoCases')}</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={casoPidiendo}
                        onClick={() => setCasoConfirmar(true)}
                      >
                        <FilePlus className="w-3.5 h-3.5 mr-1.5" />
                        {casoPidiendo ? t('creatingCaseLoading') : t('createCaseHere')}
                      </Button>
                      {casoError && <div className="text-rose text-[11px]">{casoError}</div>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {patientCases.map((c) => {
                        const isSelected = caseId === c.id;
                        const statusColor = c.status === 'ACTIVE' ? 'cyan' : c.status === 'CONFIRMED' ? 'emerald' : c.status === 'INTAKE_COMPLETED' ? 'brand' : c.status === 'CLOSED' || c.status === 'SETTLED' ? 'text-muted' : 'amber';
                        const statusColorMap: Record<string, string> = {
                          cyan: 'rgba(6,182,212,0.15)', emerald: 'rgba(16,185,129,0.15)',
                          brand: 'rgba(99,102,241,0.15)', amber: 'rgba(245,158,11,0.15)',
                          'text-muted': 'rgba(100,116,139,0.15)',
                        };
                        const statusTextMap: Record<string, string> = {
                          cyan: '#22d3ee', emerald: '#34d399', brand: '#818cf8',
                          amber: '#fbbf24', 'text-muted': '#94a3b8',
                        };
                        const accidentLabel = c.accidentType === 'AUTO' || c.accidentType === 'MVA' ? 'MVA' : c.accidentType === 'GENERAL' || c.accidentType === 'GP' ? 'Gen.' : c.accidentType ?? '';
                        const schedulable = esAgendable(c.status);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!schedulable}
                            /* Con el caso agendable, el cartel lleva la
                               descripción del accidente: dos casos del mismo
                               paciente pueden caer en el mismo mes y ahí la
                               fecha sola ya no alcanza. */
                            title={!schedulable
                              ? `Estado "${c.status}" no permite agendar citas`
                              : c.accidentNotes?.trim() || undefined}
                            onClick={() => { if (schedulable) { setCaseId(c.id); setProviderId(''); } }}
                            className={`w-full text-left rounded-md border px-3 py-2 transition-all ${
                              !schedulable
                                ? 'border-border bg-bg-2/20 opacity-50 cursor-not-allowed'
                                : isSelected
                                  ? 'border-brand/60 bg-brand/8 ring-1 ring-brand/30'
                                  : 'border-border bg-bg-2/40 hover:bg-bg-2/80'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-mono text-xs font-bold ${c.caseCode ? 'text-text-1' : 'text-text-muted italic'}`}>
                                {c.caseCode ?? t('caseCodeUnreadable')}
                              </span>
                              {accidentLabel && (
                                <span className="text-[10px] px-1.5 py-px rounded border border-border text-text-muted font-medium">{accidentLabel}</span>
                              )}
                              <span
                                className="text-[10px] px-1.5 py-px rounded font-semibold uppercase tracking-wide"
                                style={{ background: statusColorMap[statusColor], color: statusTextMap[statusColor] }}
                              >{c.status}</span>
                              {c.specialty && (
                                <span
                                  className="text-[10px] px-1.5 py-px rounded border font-medium"
                                  style={{ backgroundColor: `${c.specialty.color}20`, borderColor: `${c.specialty.color}50`, color: c.specialty.color }}
                                >{c.specialty.name}</span>
                              )}
                              {isSelected && <Check className="w-3.5 h-3.5 text-brand-text ml-auto shrink-0" />}
                            </div>

                            {/* La fecha del accidente, en su propia línea.
                                ─────────────────────────────────────────────
                                Es el dato por el que se elige, así que no
                                puede ir apretado entre las pastillas: va
                                debajo, alineado, y se lee de un golpe al
                                comparar dos tarjetas una al lado de la otra.

                                `fechaCalendario` y NO `fecha()`: la fecha del
                                accidente es una fecha del CALENDARIO, no un
                                instante, y formatearla con la zona de la
                                clínica muestra el día anterior (ver la memoria
                                del proyecto y el comentario de `lib/fechas`).

                                Sin DOL cae a la primera visita, con rótulo
                                PROPIO. Nunca se pinta la primera visita como
                                si fuera la fecha del accidente: sirve igual
                                para distinguir dos casos, y decir la fecha
                                equivocada en una demanda es peor que no decir
                                ninguna. */}
                            <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                              <CalendarDays className="w-3 h-3 shrink-0 text-text-muted" />
                              {c.accidentDate ? (
                                <span className="text-text-2">
                                  <span className="text-text-muted">{t('caseDol')}</span>{' '}
                                  <span className="font-medium tabular-nums">{fechaCalendario(c.accidentDate)}</span>
                                </span>
                              ) : c.firstAppointment ? (
                                <span className="text-text-muted">
                                  {t('caseFirstVisit')}{' '}
                                  <span className="tabular-nums">{fechaCalendario(c.firstAppointment.scheduledFor)}</span>
                                </span>
                              ) : (
                                <span className="text-text-muted italic">{t('caseNoDol')}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {/* Abrir OTRO caso — una celda más de la MISMA grilla.
                          Un paciente puede tener varios accidentes y cada uno es
                          su propio caso MVA, así que la opción no se esconde
                          cuando ya hay casos: esconderla obligaría a irse a
                          Pacientes por exactamente lo mismo.

                          Vive adentro de la grilla y no debajo porque debajo se
                          leía como un pie de página y nadie la veía. Con un solo
                          caso queda al costado, al mismo golpe de vista.

                          Pero el BORDE ES PUNTEADO y el texto queda apagado a
                          propósito: no puede competir con las tarjetas de caso.
                          Lo correcto casi siempre es elegir el caso que ya está;
                          si esto gritara igual de fuerte, el atajo para el caso
                          raro se convertiría en una fábrica de casos duplicados
                          que después hay que borrar a mano.

                          El servidor tiene la última palabra: si el caso nuevo
                          fuera GM y el paciente ya tiene uno abierto, responde
                          con el existente en vez de duplicarlo. */}
                      <button
                        type="button"
                        disabled={casoPidiendo}
                        onClick={() => setCasoConfirmar(true)}
                        className="w-full text-left rounded-md border border-dashed border-border px-3 py-2 text-text-muted transition-all hover:border-brand/50 hover:text-brand-text hover:bg-brand/[0.04] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2">
                          <FilePlus className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-xs font-medium">
                            {casoPidiendo ? t('creatingCaseLoading') : t('createAnotherCase')}
                          </span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Badge persistente: caso ──
               Solo hace falta en mode='case' (nunca se ve la lista de casos)
               y al editar (tampoco se ve). En free-mode creando, el caso ya
               se ve clarísimo en la tarjeta seleccionada de arriba — repetirlo
               acá era puro relleno apretando el modal sin agregar info. ── */}
          {!!badgeCaseCode && !(props.mode === 'free' && !isEditMode) && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-bg-2/40 px-3 py-2 flex-wrap">
              <span className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">{t('caseLabel')}</span>
              <span className="text-text-1 font-mono text-xs font-semibold">{badgeCaseCode}</span>
              {isEditMode && editAppointment && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-text-muted text-[10px]">
                    {editAppointment.patient.firstName} {editAppointment.patient.lastName}
                  </span>
                </>
              )}
            </div>
          )}

          {/* ── Clínica · Especialidad · Doctor · Duración — una sola fila,
               aprovechando el ancho del modal (antes 9 secciones apiladas).
               Columnas desiguales: Doctor necesita más espacio (combobox +
               nombre completo) que Duración (un número corto). ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_1.5fr_0.9fr] gap-3">
            <div ref={clinicRef}>
              <Label htmlFor="appt-clinic">
                <Building2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                {t('fieldClinic')} <span className="text-rose">*</span>
              </Label>
              <select
                id="appt-clinic"
                value={clinicId}
                onChange={(e) => setClinicId(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                disabled={loadingRes}
              >
                <option value="">{loadingRes ? 'Cargando...' : t('selectClinicPlaceholder')}</option>
                {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* ── Telemedicina: la sede se sigue eligiendo, pero deja de ser
                     "el lugar adonde ir" ──

                  La clínica NO se puede quitar: `clinicId` es obligatorio en la
                  base y decide de qué sede se cuenta la cita y quién atiende.
                  Lo que cambia es lo que se afirma, no lo que se guarda.

                  Y lo que se esconde es la DIRECCIÓN, que es la parte que
                  confunde de verdad: darle una calle y un número a alguien que
                  no se mueve de su casa. Lo pidió la clínica: "when they are
                  selected as a telemedicine appointment the clinic should say
                  telemedicine because it's not in person". */}
              {isOnline ? (
                <div className="text-cyan text-[11px] mt-1 flex items-center gap-1">
                  <Video className="w-3 h-3 shrink-0" />
                  {t('clinicIsTelemedicine')}
                </div>
              ) : selectedClinic?.address ? (
                <div className="text-text-muted text-[11px] mt-1">📍 {selectedClinic.address}</div>
              ) : null}
            </div>

            <div>
              <Label htmlFor="appt-specialty">
                <Stethoscope className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                {t('fieldSpecialty')}
              </Label>
              <select
                id="appt-specialty"
                value={apptSpecialtyId}
                onChange={(e) => handleSpecialtyChange(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                disabled={loadingRes || savingSpecialty}
              >
                <option value="">{loadingRes ? 'Cargando...' : t('selectSpecialtyPlaceholder')}</option>
                {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {caseSpecialty && apptSpecialtyId && apptSpecialtyId !== caseSpecialty.id && (
                <div className="text-[10px] text-brand-text mt-1">{t('specialtyOverrideHint')}</div>
              )}
              {!caseSpecialty && apptSpecialtyId && (
                <div className="text-[10px] text-emerald mt-1">{t('specialtySavedToCase')}</div>
              )}
            </div>

            <div ref={doctorRef}>
              <Label htmlFor="appt-provider">
                <Stethoscope className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                {t('fieldDoctor')} <span className="text-rose">*</span>
              </Label>

              <DoctorCombobox
                providers={allProviders}
                value={providerId}
                onChange={setProviderId}
                loading={loadingRes}
              />
            </div>

            <div>
              <Label htmlFor="appt-duration">{t('fieldDuration')}</Label>
              <select
                id="appt-duration"
                value={String(duration)}
                onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={String(d)}>{d} min</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Horarios disponibles ── */}
          <div ref={slotRef}>
            <Label>
              <CalendarIcon className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              {t('fieldAvailableSchedule')} <span className="text-rose">*</span>
            </Label>

            {/* ── Fecha y hora a mano ──
                Al CREAR: registrar una visita que ya ocurrió y no se alcanzó a
                cargar. Al EDITAR: corregirle la fecha o la hora a una cita vieja
                —el selector semanal no muestra días pasados, así que sin esto la
                cita quedaba imposible de arreglar y había que borrarla y
                rehacerla (Erick, 18-sep-2026).

                En una cita con desenlace no va: ahí la fecha ya no se discute. */}
            {!citaConDesenlace && (
              <label
                className={`mt-1.5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  visitaPasada
                    ? 'bg-amber/5 border-amber/30 hover:bg-amber/10'
                    : 'bg-bg-1 border-border hover:border-border-strong'
                }`}
              >
                <input
                  type="checkbox"
                  checked={visitaPasada}
                  onChange={(e) => {
                    setVisitaPasada(e.target.checked);
                    /* La visita sin cargar es casi siempre la de HOY a la
                       mañana, así que el día viene puesto y solo queda elegir
                       la hora. Solo si no hay fecha todavía: al editar, la que
                       ya tiene la cita manda.

                       En fin de semana no se propone nada: la clínica no abre,
                       el servidor rechaza esa fecha y el propio calendario la
                       muestra apagada — ponerla de arranque sería entregar un
                       formulario que ya nace inválido (visto un sábado). */
                    if (e.target.checked && !fechaPasada) {
                      const dow = weekdayEnClinica(new Date());
                      if (dow !== 'Sat' && dow !== 'Sun') setFechaPasada(claveDia(new Date()));
                    }
                  }}
                  className="w-4 h-4 mt-0.5 rounded accent-amber shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${visitaPasada ? 'text-amber' : 'text-text-1'}`}>
                    {isEditMode ? t('retroToggleEdit') : t('retroToggle')}
                  </div>
                  <div className="text-text-muted text-[11px] mt-0.5">
                    {isEditMode ? t('retroToggleEditHint') : t('retroToggleHint')}
                  </div>
                </div>
              </label>
            )}

            {citaConDesenlace ? (
              <div className="mt-1.5 rounded-md border border-border bg-bg-2/40 px-3 py-2.5">
                <div className="flex items-center gap-2 text-text-1 text-sm font-semibold capitalize">
                  <Check className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  {scheduledLabel} <span className="text-text-muted font-normal">({duration} min)</span>
                </div>
                <p className="text-[11px] text-text-muted mt-1">{t('resolvedAppointmentHint')}</p>
              </div>
            ) : visitaPasada ? (
              /* Fecha y hora a mano, sin el selector semanal: ese existe para
                 encontrar un hueco LIBRE del provider, y en una visita que ya
                 ocurrió la disponibilidad no es la pregunta — la hora real sí.
                 Mismo criterio que el diálogo de avisos de agenda. */
              <div className="mt-2 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="appt-retro-date" className="block text-[11px] font-semibold text-text-2 mb-1">
                      {t('retroFieldDate')} <span className="text-rose">*</span>
                    </label>
                    {/* El mismo calendario del selector de horarios, no el campo
                        nativo del navegador: es el control que el equipo ya usa
                        para elegir una fecha, y acá además apaga solo los días
                        que la regla no acepta —el futuro y el fin de semana— en
                        vez de dejar que el servidor los rechace después. */}
                    <DatePicker
                      value={fechaPasada}
                      onChange={setFechaPasada}
                      accent="amber"
                      size="lg"
                      labelFormat="numeric"
                      alwaysShowDate
                      placeholder={t('retroFieldDate')}
                      /* El futuro se agenda con el selector de siempre, que además
                         chequea la agenda del provider. */
                      maxKey={claveDia(new Date())}
                      disableWeekends
                      todayKey={claveDia(new Date())}
                      todayLabel={t('today')}
                      className="[&>button]:w-full [&>button]:h-9 [&>button]:justify-start [&>button]:bg-bg-2 [&>button]:rounded-md [&>button]:px-3 [&>button]:font-normal [&>button]:normal-case"
                    />
                  </div>
                  <div>
                    <label htmlFor="appt-retro-time" className="block text-[11px] font-semibold text-text-2 mb-1">
                      {t('retroFieldTime')} <span className="text-rose">*</span>
                    </label>
                    <select
                      id="appt-retro-time"
                      value={horaPasada}
                      onChange={(e) => setHoraPasada(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                    >
                      {/* Sin valor todavía: una opción vacía, o el navegador
                          muestra la primera de la lista y parece elegida. */}
                      {!horaPasada && <option value="">—</option>}
                      {/* La hora que YA tiene la cita, si cae fuera de la grilla
                          de 15 min o del horario de atención. Sin esto, abrir una
                          cita de las 11:37 —o de las 19:00— dejaría el campo en
                          blanco y el primer guardado le movería la hora sin que
                          nadie lo pidiera. */}
                      {horaPasada && !HORAS_MANUALES.includes(horaPasada) && (
                        <option value={horaPasada}>{rotuloHora(horaPasada)}</option>
                      )}
                      {HORAS_MANUALES.map((h) => (
                        <option key={h} value={h}>{rotuloHora(h)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {scheduledForIso && !retroOk && (
                  <p className="text-[11px] text-rose">{t('retroValidation')}</p>
                )}

                <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                  {t('retroNotice')}
                </div>

                {scheduledLabel && retroOk && (
                  <div className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2 text-[11px] text-cyan flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      <strong className="capitalize">{scheduledLabel}</strong>
                      <span className="opacity-70 font-normal"> ({duration} min)</span>
                    </span>
                  </div>
                )}
              </div>
            ) : !providerId || !clinicId ? (
              <p className="mt-1.5 text-[11px] text-text-muted italic">
                {t('selectClinicAndDoctorHint')}
              </p>
            ) : (
              <div className="mt-1.5">
                <WeeklySlotPicker
                  clinicId={clinicId}
                  providerId={providerId}
                  duration={duration}
                  value={slotIso}
                  onChange={setSlotIso}
                  onSlotsFetched={handleSlotsFetched}
                  excludeAppointmentId={isEditMode ? editAppointment?.id : undefined}
                  maxWeeks={8}
                  /* Elegir un día pasado en el calendario del mes no lleva a una
                     semana vacía: prende "visita que ya ocurrió" con ese día
                     puesto. Es donde la clínica iba a buscar la fecha. */
                  onDiaPasado={(clave) => { setVisitaPasada(true); setFechaPasada(clave); }}
                  /* Una cita que ya venció pero sigue editable NO lleva su fecha
                     vieja como semana inicial: el selector abriría una semana sin
                     un solo hueco (los candidatos salen desde "ahora") y se leería
                     como que el doctor no atiende. Sin fecha arranca en la semana
                     actual, que es justo donde hay que elegir el horario nuevo. */
                  initialDate={isEditMode && editAppointment && !isReschedule && !citaVencidaSinAtender
                    ? new Date(editAppointment.scheduledFor).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                    : initialDate}
                  initialTime={isEditMode && editAppointment && !isReschedule && !citaVencidaSinAtender
                    ? new Date(editAppointment.scheduledFor).toLocaleTimeString(localeApp(), { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver' })
                    : initialTime}
                />
              </div>
            )}
          </div>

          {/* ── Ya tiene cita ──
               Dos niveles en un solo aviso, y ninguno bloquea:

               · MISMO DÍA que el horario elegido → rojo. Es la que casi siempre
                 es un error de verdad: dos citas el mismo día.
               · Más adelante → ámbar. No es un error —un paciente en tratamiento
                 tiene varias— pero es lo que hay que saber ANTES de agendar
                 otra. Se muestran las 3 más próximas y se cuenta el resto: con
                 un tratamiento semanal, listarlas todas tapa la pantalla. */}
          {duplicateAppts.length > 0 && (() => {
            const diaElegido = slotIso
              ? new Date(slotIso).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
              : null;
            const esDelDia = (a: DuplicateAppt) => !!diaElegido
              && new Date(a.scheduledFor).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) === diaElegido;

            const mismoDia = duplicateAppts.filter(esDelDia);
            const masAdelante = duplicateAppts.filter(a => !esDelDia(a));
            const hayChoque = mismoDia.length > 0;
            /* Clases LITERALES y no `text-${tono}`: Tailwind lee el código
               fuente, así que una clase armada por interpolación no se emite y
               el texto sale del color por defecto, sin ningún error. */
            const claseTexto = hayChoque ? 'text-rose' : 'text-amber';
            const claseTenue = hayChoque ? 'text-rose/70' : 'text-amber/70';
            const visibles = [...mismoDia, ...masAdelante.slice(0, 3)];
            const ocultas = masAdelante.length - Math.min(masAdelante.length, 3);

            return (
              <div className={`rounded-lg border p-3 space-y-2 ${hayChoque ? 'border-rose/40 bg-rose/8' : 'border-amber/40 bg-amber/8'}`}>
                <div className="flex items-start gap-2">
                  <span className={`text-base leading-none mt-0.5 ${claseTexto}`}>⚠</span>
                  <div>
                    <p className={`font-semibold text-[12.5px] ${claseTexto}`}>
                      {hayChoque ? t('dupWarningTitle') : t('dupUpcomingTitle', { count: duplicateAppts.length })}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${claseTenue}`}>{t('dupWarningHint')}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {visibles.map(a => {
                    const cuando = new Date(a.scheduledFor);
                    const dia  = cuando.toLocaleDateString(localeApp(), {
                      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Denver',
                    });
                    const hora = cuando.toLocaleTimeString(localeApp(), {
                      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
                    });
                    const propia = esDelDia(a);
                    return (
                      <div
                        key={a.id}
                        className={`flex items-center gap-3 rounded-md border bg-bg-1/60 px-3 py-2 text-[11px] ${propia ? 'border-rose/20' : 'border-amber/20'}`}
                      >
                        <span className={`font-bold text-xs shrink-0 ${propia ? 'text-rose' : 'text-amber'}`}>
                          {dia} · {hora}
                        </span>
                        {a.clinic && <span className="text-text-2 truncate">{a.clinic.name}</span>}
                        {a.provider && (
                          <span className="text-text-muted truncate">
                            {a.provider.firstName} {a.provider.lastName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {ocultas > 0 && (
                    <p className="text-text-muted text-[11px] pl-1">{t('dupMore', { count: ocultas })}</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Telemedicina ──
               Acá vivía también el selector de "Tipo de cita", y se sacó el
               2026-09-15 a pedido de la clínica: "If the case is selected and
               the specialty it's already being specified there is no purpose in
               that field". Tenían razón, y los datos la respaldan: de 8.423
               citas con caso, el tipo coincide con el del caso en el 99,9%, y
               URGENT_CARE se usó UNA vez en toda la historia (FOLLOW_UP, tres).
               Un campo obligatorio con una sola respuesta correcta no es una
               decisión, es un trámite.

               El valor NO desaparece: se sigue guardando, lo decide el caso
               (ver la inferencia más arriba) y el calendario lo usa para pintar
               MVA contra GM. Lo que se fue es la pregunta, no el dato. */}
          <div className="grid grid-cols-1">
            <div className={`rounded-lg border p-3 transition-colors ${isOnline ? 'border-cyan/40 bg-cyan/5' : 'border-border bg-bg-2/30'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📹</span>
                  <div>
                    <div className="text-sm font-medium text-text-1">{t('fieldOnlineConsultation')}</div>
                    <div className="text-[11px] text-text-muted">{t('fieldOnlineConsultationHint')}</div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOnline}
                  onClick={() => setIsOnline(v => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors focus:outline-none ${
                    isOnline ? 'bg-cyan border-cyan/80' : 'bg-bg-2 border-border'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-px ${isOnline ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Enlace de la reunión — fila propia a todo el ancho, no
               metida adentro de la tarjeta de Consulta en línea ── */}
          {isOnline && (
            <div>
              <label htmlFor="appt-meeting-url" className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5 block">
                📹 {t('meetingUrlLabel')}
              </label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                <input
                  id="appt-meeting-url"
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder={t('meetingUrlPlaceholder')}
                  className="w-full bg-bg-2 border border-cyan/30 rounded-md pl-8 pr-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-cyan"
                />
              </div>
            </div>
          )}

          {/* ── Motivo de la visita ──
              Se llamaba "Notas", y ese nombre es media explicación de por qué
              venía vacío: "notas" se lee como comentario opcional. Es el campo
              que el provider va a leer meses después para elegir de qué visita
              traer texto — y el que la vista de día del calendario ya muestra. */}
          <div ref={motivoRef}>
            <Label htmlFor="appt-notes">
              <FileText className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              {t('fieldReason')}
              {!isEditMode && <span className="text-rose ml-0.5">*</span>}
            </Label>
            <textarea
              id="appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`w-full bg-bg-2 border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px] ${
                motivoOk ? 'border-border' : 'border-amber/50'
              }`}
              placeholder={t('reasonPlaceholder')}
              maxLength={2000}
            />
            {!isEditMode && (
              <p className="text-[11px] text-text-muted mt-1">{t('reasonHint')}</p>
            )}
          </div>

          {/* ── Resumen ── */}
          {selectedClinic && selectedProvider && scheduledForIso && isFuture && (
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs">
              <div className="text-brand-text font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" /> {t('summaryTitle')}
              </div>
              <div className="space-y-0.5 text-text-2">
                <div><strong className="text-text-1">{selectedProvider.firstName} {selectedProvider.lastName}</strong></div>
                <div>{t('summaryAtClinic')} <strong className="text-text-1">{selectedClinic.name}</strong></div>
                <div className="capitalize">📅 <strong className="text-text-1">{scheduledLabel}</strong></div>
                <div>{t('summaryDuration')} <strong className="text-text-1">{duration} min</strong> · {t('summaryType')} <strong className="text-text-1">{TYPE_OPTIONS.find((o) => o.value === type)?.label}</strong></div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            {t('actionCancel')}
          </Button>
          <Button onClick={handleSchedule} disabled={saving} className="w-full sm:w-auto">
            {saving
              ? (isEditMode ? t('savingInProgress') : t('schedulingInProgress'))
              : isEditMode
                ? <><Check className="w-3.5 h-3.5 mr-1" /> {t('actionSaveChanges')}</>
                : <><CalendarCheck className="w-3.5 h-3.5 mr-1" /> {t('actionScheduleAppointment')}</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Cruce con otra cita del doctor: avisa con el motivo concreto y deja
        decidir. Va fuera del Dialog para que el ConfirmDialog quede por encima. */}
    <ConfirmDialog
      open={!!overlapPrompt}
      variant="warning"
      title={overlapPrompt?.codigo === 'BLOCKED_SLOT' ? t('blockedSlotTitle') : t('overlapTitle')}
      description={overlapPrompt?.message ?? ''}
      confirmLabel={t('overlapConfirm')}
      cancelLabel={t('overlapCancel')}
      onConfirm={() => {
        const p = overlapPrompt;
        setOverlapPrompt(null);
        // La bandera que corresponde al aviso que se aceptó, no las dos: aceptar
        // el almuerzo no debería hacer pasar en silencio un cruce de citas que
        // nadie miró.
        if (p) void submitAppointment(p.pending,
          p.codigo === 'BLOCKED_SLOT' ? { blocked: true } : { overlap: true });
      }}
      onCancel={() => setOverlapPrompt(null)}
    />

    <ConfirmDialog
      open={durationConflictAlert}
      onConfirm={() => setDurationConflictAlert(false)}
      showCancel={false}
      confirmLabel={t('durationConflictAccept')}
      variant="warning"
      title={t('durationConflictTitle')}
      description={
        t('durationConflictDescription', { duration: lastValidDuration.current })
        + (conflictSuggestion
            ? ' ' + t('durationConflictSuggestion', { duration: conflictSuggestion.tried, time: conflictSuggestion.time })
            : '')
      }
    />

    {/* Alta rápida del paciente, el MISMO diálogo que usa la página de Pacientes
        —crea paciente y caso en una transacción y ya tiene el desvío MVA/GM—, no
        una copia recortada. Se monta solo cuando se abre para que arranque limpio
        con el nombre tecleado. */}
    {altaOpen && (
      <QuickRegisterDialog
        open
        onOpenChange={(v) => { if (!v) setAltaOpen(false); }}
        initialFirstName={altaNombre}
        initialLastName={altaApellido}
        onCreated={onPacienteCreado}
      />
    )}

    {/* "¿Le abrimos un caso?" — se pregunta porque abrir un caso NO es un paso
        del agendado: es un expediente nuevo con su código, su intake y su
        formulario al paciente. Un clic de más es barato; un caso de más hay que
        borrarlo a mano. */}
    <ConfirmDialog
      open={casoConfirmar}
      title={t('createCaseConfirmTitle')}
      description={t('createCaseConfirmBody', {
        name: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '',
      })}
      confirmLabel={t('createCaseConfirmYes')}
      cancelLabel={t('createCaseConfirmNo')}
      onConfirm={() => { void abrirCrearCaso(); }}
      onCancel={() => setCasoConfirmar(false)}
    />

    {/* El wizard de caso de Front Office, el MISMO — crea paciente + caso + cita
        en una transacción, emite el token, arma el QR y manda el SMS. Se monta
        sólo al abrirse para que arranque con la precarga ya resuelta: su estado
        inicial se aplica en un efecto que depende de `open`, así que montarlo
        antes de tener `casoInitial` lo dejaría vacío.

        Los catálogos salen del estado que este diálogo YA cargó de
        /scheduling/resources: pedirlos de nuevo mostraría una lista distinta de
        la que se está mirando si alguien desactiva una clínica en el medio. */}
    {casoOpen && casoInitial && (
      <NewCaseDialog
        open
        onOpenChange={(v) => { if (!v) { setCasoOpen(false); setCasoInitial(null); } }}
        initialState={casoInitial}
        clinics={clinics.map((c) => ({ id: c.id, name: c.name, address: c.address }))}
        providers={allProviders}
        // `Specialty.id` es opcional en este diálogo porque la cita puede
        // mostrar la del caso sin tenerla en el catálogo. El wizard sí necesita
        // el id, así que las que no lo traen se descartan en vez de colarse con
        // un id vacío que no resolvería contra nada.
        specialties={specialties.flatMap((s) => (s.id ? [{ id: s.id, name: s.name, color: s.color }] : []))}
        onCasoCreado={onCasoCreado}
      />
    )}
    </>
  );
}
