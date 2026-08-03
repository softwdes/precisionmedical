'use client';

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
import {
  CalendarCheck, AlertCircle, Check, Building2, Stethoscope,
  FileText, ChevronRight, Calendar as CalendarIcon, User, Search, X, Link2,
} from 'lucide-react';
import { WeeklySlotPicker } from './weekly-slot-picker';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, Label,
} from '@precision/ui';
import { PersonAvatar } from '@/components/ui-phoenix';
import { DoctorCombobox } from '@/components/ui-phoenix/doctor-combobox';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Clinic    { id: string; name: string; address: string | null; phone: string | null }
interface Provider  { id: string; firstName: string; lastName: string; specialty: string; licenseNumber: string | null; specialtyCatalogIds: string[] }
interface Specialty { id?: string; name: string; color: string }

interface CaseOption {
  id: string;
  caseCode: string;
  status: string;
  accidentType: string | null;
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

interface DuplicateAppt {
  id: string;
  scheduledFor: string;
  status: string;
  clinic?: { name: string } | null;
  provider?: { firstName: string; lastName: string; specialty: string | null } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

type AppointmentType = 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'URGENT_CARE' | 'FOLLOW_UP';
// TYPE_OPTIONS is built inside the component to use translations

// ─── Main Component ───────────────────────────────────────────────────────────

export function AppointmentDialog(props: AppointmentDialogProps) {
  const { open, onOpenChange, onSuccess, initialDate, initialTime, editAppointment, isReschedule } = props;
  const isEditMode = !!editAppointment;
  const router = useRouter();
  const t = useTranslations('phoenix.calendar');

  // Editar (no reagendar) una cita cuya fecha ya pasó: el selector de
  // horarios solo genera candidatos hacia adelante desde "ahora", así que
  // mostraría la semana entera vacía y el horario original nunca aparecería
  // marcado — no es un bug, pero confunde. En ese caso se muestra el
  // horario original fijo (solo lectura); para cambiar la hora hay que usar
  // "Reagendar", no "Editar".
  const isPastAppointment = isEditMode && !isReschedule && !!editAppointment
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

  // Alert bloqueante: "esa duración no entra en el horario elegido, volvimos a la que sí"
  const [durationConflictAlert, setDurationConflictAlert] = useState(false);

  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [success,        setSuccess]        = useState<{ clinicName: string; providerName: string; scheduledFor: string } | null>(null);
  const [duplicateAppts, setDuplicateAppts] = useState<DuplicateAppt[]>([]);

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
  const userChangedType = useRef(false); // true cuando el usuario eligió el tipo manualmente

  // ─── Auto-inferir tipo de cita desde el caso seleccionado ─────────────────

  useEffect(() => {
    if (props.mode !== 'free' || !caseId) return;
    if (userChangedType.current) return; // respetar selección manual
    const found = patientCases.find((c) => c.id === caseId);
    if (!found) return;
    if (found.accidentType === 'AUTO' || found.accidentType === 'MVA') {
      setType('AUTO_ACCIDENT');
    } else if (found.accidentType === 'GENERAL' || found.accidentType === 'GP') {
      setType('FAMILY_PRACTICE');
    }
    // Si el caso tiene accidentType no reconocido, dejamos el tipo actual sin tocar
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
    userChangedType.current = false;
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
      // En reagendar, no pre-seleccionar el slot actual — el usuario debe elegir una nueva hora
      setSlotIso(isReschedule ? null : editAppointment.scheduledFor);
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
      setClinicId('');
      setProviderId(props.defaultProviderId ?? '');
      setSlotIso(null);
      setDuration(15);
      lastValidDuration.current = 15;
      setType(props.defaultType ?? 'AUTO_ACCIDENT');
      // Un tipo pre-elegido cuenta como decisión tomada: la auto-inferencia por
      // accidentType no debe pisarlo
      userChangedType.current = !!props.defaultType;
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

  const clearPatient = useCallback(() => {
    setSelectedPatient(null);
    setPatientCases([]);
    setCaseId('');
    setProviderId('');
  }, []);

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
    // Cita pasada: WeeklySlotPicker ni se monta (ver render), así que
    // nunca llegaría onSlotsFetched a resolver este flag.
    if (slotIsoRef.current && !isPastAppointment) {
      pendingDurationCheck.current = true;
      slotUnderCheck.current = slotIsoRef.current;
    }
  }, [duration, isPastAppointment]);

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
          ? { time: new Date(best).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: true }), tried: durationRef.current }
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
    if (isEditMode || isReschedule || !slotIso) return;
    const patientId = props.mode === 'free' ? selectedPatient?.id : null;
    if (!patientId) return;

    const targetDate = new Date(slotIso).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const controller = new AbortController();
    fetch(
      `/api/admin/appointments?patientId=${patientId}&from=${targetDate}T00:00:00.000Z&to=${targetDate}T23:59:59.999Z`,
      { signal: controller.signal },
    )
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const conflicts = ((data.appointments ?? []) as DuplicateAppt[])
          .filter((a: DuplicateAppt) => a.status !== 'CANCELLED');
        setDuplicateAppts(conflicts);
      })
      .catch(() => {});
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotIso, selectedPatient?.id]);

  // ─── Computed: scheduledFor ──────────────────────────────────────────────────

  const scheduledForIso = slotIso;

  const scheduledLabel = useMemo(() => {
    if (!scheduledForIso) return null;
    return new Date(scheduledForIso).toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
    });
  }, [scheduledForIso]);

  // Desired time label (from calendar click) — formatted for display
  const desiredDateLabel = useMemo(() => {
    if (!initialDate) return '';
    return new Date(initialDate + 'T12:00:00Z').toLocaleDateString('en-US', {
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

  const selectedClinic   = clinics.find((c) => c.id === clinicId);
  const selectedProvider = allProviders.find((p) => p.id === providerId);

  const canSubmit = useMemo(() => {
    const hasCase = isEditMode ? true : (props.mode === 'case' ? !!props.caseInfo?.id : !!caseId);
    const slotOk = isEditMode ? !!scheduledForIso : (!!scheduledForIso && isFuture);
    return hasCase && !!clinicId && !!providerId && slotOk && !saving;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, props.mode, caseId, clinicId, providerId, scheduledForIso, isFuture, saving]);

  // Refs for scrolling to missing fields
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
      if (!scheduledForIso || !isFuture) {
        setError(t('validationSelectSlot'));
        slotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      return;
    }

    // Duplicate warning is shown inline — no blocking confirm needed here.

    setSaving(true);
    try {
      if (isEditMode) {
        // PATCH — editar cita existente.
        //
        // Se manda SOLO lo que el usuario cambió respecto de lo que el diálogo
        // le mostró al abrirse. Antes se enviaban todos los campos siempre, y
        // eso convertía cualquier prellenado desactualizado en pérdida de
        // datos: los campos que nadie tocó se re-escribían con el valor viejo,
        // revirtiendo un guardado anterior sin decir nada.
        const base           = editAppointment!;
        const nextNotes      = notes.trim() || null;
        // Si se apaga "consulta en línea", el link se limpia también — evita
        // que quede un meetingUrl viejo colgado tras desactivar.
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
          return;
        }

        const res = await fetch(`/api/admin/appointments/${base.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
        onSuccess?.();
        onOpenChange(false);
      } else {
        // POST — crear nueva cita
        const targetCaseId = props.mode === 'case' ? props.caseInfo!.id : caseId;
        const res = await fetch('/api/admin/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId: targetCaseId,
            clinicId,
            providerId,
            scheduledFor: scheduledForIso,
            durationMinutes: duration,
            type,
            notes: notes.trim() || undefined,
            isOnline,
            meetingUrl: isOnline ? (meetingUrl.trim() || undefined) : undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        setSuccess({
          scheduledFor: data.appointment.scheduledFor,
          clinicName:   data.appointment.clinic.name,
          providerName: `${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`,
        });
        router.refresh();
        onSuccess?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : isEditMode ? t('errorSaveAppointment') : t('errorScheduleAppointment'));
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
              <div><strong className="text-text-1">{t('successDoctor')}</strong> {t('drPrefix')} {success.providerName}</div>
              <div><strong className="text-text-1">{t('successClinic')}</strong> {success.clinicName}</div>
              {/* timeZone obligatorio: sin fijarlo se formatea en la zona del
                  navegador y cada persona ve una hora distinta para la misma
                  cita (un tester en Eastern veía 10:00 AM donde se agendaron
                  las 8:00 AM). El resto del archivo ya fija Denver. */}
              <div><strong className="text-text-1">{t('successWhen')}</strong> {new Date(success.scheduledFor).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver' })}</div>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              {t('dialogDescStatusChange')} <code className="text-brand">ACTIVE</code>.
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
                    {(searchingPt || patientResults.length > 0) && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-bg-1 border border-border rounded-md shadow-lg z-50 overflow-hidden">
                        {searchingPt && <div className="px-3 py-2 text-text-muted text-xs">Buscando...</div>}
                        {patientResults.map((pt) => (
                          <button
                            key={pt.id}
                            onClick={() => selectPatient(pt)}
                            className="w-full text-left px-3 py-2 hover:bg-bg-2 transition-colors border-b border-row-sep last:border-0"
                          >
                            <div className="text-text-1 text-sm font-medium">{pt.firstName} {pt.lastName}</div>
                            <div className="text-text-muted text-[11px]">
                              {pt.patientCode && <span className="font-mono mr-2">{pt.patientCode}</span>}
                              {pt.phone && <span>{pt.phone}</span>}
                              {pt.casesCount > 0 && <span className="ml-2">{t('patientCasesCount', { n: pt.casesCount, code: pt.lastCaseCode })}</span>}
                            </div>
                          </button>
                        ))}
                        {!searchingPt && patientResults.length === 0 && patientQuery.length >= 2 && (
                          <div className="px-3 py-2 text-text-muted text-xs">Sin resultados</div>
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
                    <div className="rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-amber text-xs">{t('patientNoCases')}</div>
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
                        const schedulable = ['NEW_REFERRAL', 'INTAKE_PENDING', 'CONFIRMED', 'ACTIVE', 'INTAKE_COMPLETED'].includes(c.status);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!schedulable}
                            title={!schedulable ? `Estado "${c.status}" no permite agendar citas` : undefined}
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
                              <span className="font-mono text-xs font-bold text-text-1">{c.caseCode}</span>
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
                              {isSelected && <Check className="w-3.5 h-3.5 text-brand ml-auto shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
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
              {selectedClinic?.address && (
                <div className="text-text-muted text-[11px] mt-1">📍 {selectedClinic.address}</div>
              )}
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
                <div className="text-[10px] text-brand mt-1">{t('specialtyOverrideHint')}</div>
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
                drPrefix={t('drPrefix')}
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

            {isPastAppointment ? (
              <div className="mt-1.5 rounded-md border border-border bg-bg-2/40 px-3 py-2.5">
                <div className="flex items-center gap-2 text-text-1 text-sm font-semibold capitalize">
                  <Check className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  {scheduledLabel} <span className="text-text-muted font-normal">({duration} min)</span>
                </div>
                <p className="text-[11px] text-text-muted mt-1">{t('pastAppointmentHint')}</p>
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
                  initialDate={isEditMode && editAppointment && !isReschedule
                    ? new Date(editAppointment.scheduledFor).toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
                    : initialDate}
                  initialTime={isEditMode && editAppointment && !isReschedule
                    ? new Date(editAppointment.scheduledFor).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver' })
                    : initialTime}
                />
              </div>
            )}
          </div>

          {/* ── Duplicate appointment warning ── */}
          {duplicateAppts.length > 0 && (
            <div className="rounded-lg border border-amber/40 bg-amber/8 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-amber text-base leading-none mt-0.5">⚠</span>
                <div>
                  <p className="text-amber font-semibold text-[12.5px]">{t('dupWarningTitle')}</p>
                  <p className="text-amber/70 text-[11px] mt-0.5">{t('dupWarningHint')}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {duplicateAppts.map(a => {
                  const time = new Date(a.scheduledFor).toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
                  });
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-md border border-amber/20 bg-bg-1/60 px-3 py-2 text-[11px]">
                      <span className="font-bold text-amber text-xs w-16 shrink-0">{time}</span>
                      {a.clinic && (
                        <div className="flex flex-col min-w-0">
                          <span className="text-text-muted uppercase tracking-wider text-[9px] font-semibold">Clinic</span>
                          <span className="text-text-2 truncate">{a.clinic.name}</span>
                        </div>
                      )}
                      {a.provider && (
                        <div className="flex flex-col min-w-0">
                          <span className="text-text-muted uppercase tracking-wider text-[9px] font-semibold">Provider</span>
                          <span className="text-text-2 truncate">{a.provider.firstName} {a.provider.lastName}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Tipo de cita · Consulta en línea — misma fila ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="appt-type">{t('fieldAppointmentType')}</Label>
              <select
                id="appt-type"
                value={type}
                onChange={(e) => { userChangedType.current = true; setType(e.target.value as AppointmentType); }}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

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

          {/* ── Notas ── */}
          <div>
            <Label htmlFor="appt-notes">
              <FileText className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              {t('fieldNotes')}
            </Label>
            <textarea
              id="appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder={t('notesPlaceholder')}
              maxLength={2000}
            />
          </div>

          {/* ── Resumen ── */}
          {selectedClinic && selectedProvider && scheduledForIso && isFuture && (
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs">
              <div className="text-brand font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" /> {t('summaryTitle')}
              </div>
              <div className="space-y-0.5 text-text-2">
                <div>{t('drPrefix')} <strong className="text-text-1">{selectedProvider.firstName} {selectedProvider.lastName}</strong></div>
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
    </>
  );
}
