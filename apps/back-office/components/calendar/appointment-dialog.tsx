'use client';

/**
 * AppointmentDialog — B.10 Unificado
 *
 * mode: 'case'  → abre desde front-office con caso pre-fijado (reemplaza ScheduleAppointmentDialog)
 * mode: 'free'  → abre desde calendario, selección libre de paciente + caso
 *
 * Filtra providers por especialidad del caso usando DoctorSpecialtyAssignment (specialtyCatalogIds).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck, AlertCircle, Check, Building2, Stethoscope, Clock,
  FileText, ChevronRight, Calendar as CalendarIcon, User, Search, X,
} from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, Label,
} from '@precision/ui';
import { TagPill } from '@/components/ui-phoenix';

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

type AppointmentDialogProps = (CaseModeProps | FreeModeProps) & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialDate?: string; // YYYY-MM-DD
  initialTime?: string; // HH:MM
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

type AppointmentType = 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'URGENT_CARE' | 'FOLLOW_UP';
const TYPE_OPTIONS: Array<{ value: AppointmentType; label: string }> = [
  { value: 'AUTO_ACCIDENT',   label: 'Auto Accident (MVA)' },
  { value: 'FOLLOW_UP',       label: 'Seguimiento' },
  { value: 'FAMILY_PRACTICE', label: 'Medicina general' },
  { value: 'URGENT_CARE',     label: 'Urgencias' },
];

const SPECIALTY_COLORS: Record<string, string> = {
  CHIROPRACTIC:     'bg-rose/15 text-rose border-rose/30',
  PHYSICAL_THERAPY: 'bg-cyan/15 text-cyan border-cyan/30',
  PAIN_MANAGEMENT:  'bg-violet/15 text-violet border-violet/30',
  ORTHOPEDICS:      'bg-amber/15 text-amber border-amber/30',
  NEUROLOGY:        'bg-pink/15 text-pink border-pink/30',
  RADIOLOGY:        'bg-emerald/15 text-emerald border-emerald/30',
  PSYCHOLOGY:       'bg-brand/15 text-brand border-brand/30',
  GENERAL:          'bg-bg-2 text-text-2 border-border',
  OTHER:            'bg-bg-2 text-text-2 border-border',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function AppointmentDialog(props: AppointmentDialogProps) {
  const { open, onOpenChange, onSuccess, initialDate, initialTime } = props;
  const router = useRouter();

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
  const [caseId,     setCaseId]     = useState('');
  const [clinicId,   setClinicId]   = useState('');
  const [providerId, setProviderId] = useState('');
  const [date,       setDate]       = useState('');
  const [time,       setTime]       = useState('');
  const [duration,   setDuration]   = useState(30);
  const [type,       setType]       = useState<AppointmentType>('AUTO_ACCIDENT');
  const [notes,      setNotes]      = useState('');
  const [showAll,    setShowAll]    = useState(false); // override specialty filter

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<{ clinicName: string; providerName: string; scheduledFor: string } | null>(null);

  // ─── Derived: effective specialty ──────────────────────────────────────────

  const effectiveSpecialty = useMemo((): Specialty | null => {
    if (props.mode === 'case') return props.caseInfo?.specialty ?? null;
    // Free mode: derive from selected case
    const found = patientCases.find((c) => c.id === caseId);
    return found?.specialty ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, (props as CaseModeProps).caseInfo, caseId, patientCases]);

  // ─── Derived: filtered providers ────────────────────────────────────────────

  const filteredProviders = useMemo(() => {
    if (showAll || !effectiveSpecialty?.id) return allProviders;
    const matched = allProviders.filter((p) => p.specialtyCatalogIds.includes(effectiveSpecialty.id!));
    return matched.length > 0 ? matched : allProviders;
  }, [allProviders, effectiveSpecialty, showAll]);

  const hasSpecialtyMismatch = useMemo(() => {
    if (!effectiveSpecialty?.id || !providerId) return false;
    const p = allProviders.find((p) => p.id === providerId);
    if (!p) return false;
    return !p.specialtyCatalogIds.includes(effectiveSpecialty.id);
  }, [allProviders, providerId, effectiveSpecialty]);

  const noProvidersForSpecialty = useMemo(() => {
    if (!effectiveSpecialty?.id) return false;
    return !showAll && allProviders.filter((p) => p.specialtyCatalogIds.includes(effectiveSpecialty.id!)).length === 0;
  }, [allProviders, effectiveSpecialty, showAll]);

  // ─── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setCaseId(props.mode === 'case' ? (props.caseInfo?.id ?? '') : '');
    setClinicId('');
    setProviderId('');
    setDate(initialDate ?? '');
    setTime(initialTime ?? '');
    setDuration(30);
    setType('AUTO_ACCIDENT');
    setNotes('');
    setShowAll(false);
    setPatientQuery('');
    setPatientResults([]);
    setSelectedPatient(null);
    setPatientCases([]);

    setLoadingRes(true);
    fetch('/api/admin/scheduling/resources')
      .then((r) => r.json())
      .then((d) => {
        setClinics(d.clinics ?? []);
        setAllProviders(d.providers ?? []);
        setSpecialties(d.specialties ?? []);
      })
      .catch(() => setError('No se pudieron cargar clínicas/doctores'))
      .finally(() => setLoadingRes(false));
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
    setProviderId('');
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

  // ─── Computed: scheduledFor ──────────────────────────────────────────────────

  const scheduledForIso = useMemo(() => {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [date, time]);

  const scheduledLabel = useMemo(() => {
    if (!scheduledForIso) return null;
    return new Date(scheduledForIso).toLocaleString('es-US', {
      weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }, [scheduledForIso]);

  const isFuture = scheduledForIso ? new Date(scheduledForIso).getTime() > Date.now() : false;

  const selectedClinic   = clinics.find((c) => c.id === clinicId);
  const selectedProvider = allProviders.find((p) => p.id === providerId);

  const canSubmit = useMemo(() => {
    const hasCase = props.mode === 'case' ? !!props.caseInfo?.id : !!caseId;
    return hasCase && !!clinicId && !!providerId && !!scheduledForIso && isFuture && !saving;
  }, [props.mode, caseId, clinicId, providerId, scheduledForIso, isFuture, saving]);

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSchedule = async () => {
    setError(null);
    if (!canSubmit) return setError('Completá todos los campos requeridos');

    const targetCaseId = props.mode === 'case' ? props.caseInfo!.id : caseId;
    setSaving(true);
    try {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agendar');
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
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald/20 border-2 border-emerald flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald" />
            </div>
            <h2 className="text-xl font-bold text-text-1 mb-2">Cita agendada</h2>
            <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-4 text-left text-xs space-y-1 mb-6">
              <div className="text-emerald font-semibold uppercase tracking-wider text-[10px] mb-2">Detalles</div>
              <div><strong className="text-text-1">Paciente:</strong> {patientName}</div>
              <div><strong className="text-text-1">Doctor:</strong> Dr. {success.providerName}</div>
              <div><strong className="text-text-1">Clínica:</strong> {success.clinicName}</div>
              <div><strong className="text-text-1">Cuándo:</strong> {new Date(success.scheduledFor).toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Form ────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald" />
            {props.mode === 'case' ? 'Agendar primera cita' : 'Nueva cita'}
          </DialogTitle>
          {props.mode === 'case' && props.caseInfo && (
            <DialogDescription>
              Paciente <strong className="text-text-1">{props.caseInfo.patient.firstName} {props.caseInfo.patient.lastName}</strong>
              {' '}· caso <code className="text-text-1 font-mono">{props.caseInfo.caseCode}</code>.
              Al agendar, el status pasa a <code className="text-brand">ACTIVE</code>.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[68vh] overflow-y-auto pr-1">

          {/* ── FREE MODE: Patient search ── */}
          {props.mode === 'free' && (
            <div className="space-y-3">
              <div>
                <Label>
                  <User className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                  Paciente <span className="text-rose">*</span>
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
                      placeholder="Buscar por nombre, teléfono o código..."
                      className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                    />
                    {(searchingPt || patientResults.length > 0) && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-bg-1 border border-border rounded-md shadow-lg z-50 overflow-hidden">
                        {searchingPt && <div className="px-3 py-2 text-text-muted text-xs">Buscando...</div>}
                        {patientResults.map((pt) => (
                          <button
                            key={pt.id}
                            onClick={() => selectPatient(pt)}
                            className="w-full text-left px-3 py-2 hover:bg-bg-2 transition-colors border-b border-border/50 last:border-0"
                          >
                            <div className="text-text-1 text-sm font-medium">{pt.firstName} {pt.lastName}</div>
                            <div className="text-text-muted text-[11px]">
                              {pt.patientCode && <span className="font-mono mr-2">{pt.patientCode}</span>}
                              {pt.phone && <span>{pt.phone}</span>}
                              {pt.casesCount > 0 && <span className="ml-2">{pt.casesCount} caso{pt.casesCount !== 1 ? 's' : ''} · último: {pt.lastCaseCode}</span>}
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
                <div>
                  <Label>Caso <span className="text-rose">*</span></Label>
                  {loadingCases ? (
                    <div className="text-text-muted text-xs py-2">Cargando casos...</div>
                  ) : patientCases.length === 0 ? (
                    <div className="text-amber text-xs py-2">Este paciente no tiene casos registrados</div>
                  ) : (
                    <select
                      value={caseId}
                      onChange={(e) => { setCaseId(e.target.value); setProviderId(''); }}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                    >
                      <option value="">Seleccionar caso...</option>
                      {patientCases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.caseCode} · {c.status}{c.specialty ? ` · ${c.specialty.name}` : ''}{c.accidentType ? ` (${c.accidentType})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {/* Specialty badge from selected case */}
                  {effectiveSpecialty && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-text-muted text-[10px] uppercase tracking-wider">Especialidad del caso:</span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium"
                        style={{ backgroundColor: `${effectiveSpecialty.color}20`, borderColor: `${effectiveSpecialty.color}50`, color: effectiveSpecialty.color }}
                      >
                        {effectiveSpecialty.name}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── CASE MODE: specialty badge ── */}
          {props.mode === 'case' && effectiveSpecialty && (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-bg-2/40 px-3 py-2">
              <span className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">Especialidad:</span>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium"
                style={{ backgroundColor: `${effectiveSpecialty.color}20`, borderColor: `${effectiveSpecialty.color}50`, color: effectiveSpecialty.color }}
              >
                {effectiveSpecialty.name}
              </span>
            </div>
          )}

          {/* ── Clínica ── */}
          <div>
            <Label htmlFor="appt-clinic">
              <Building2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Clínica <span className="text-rose">*</span>
            </Label>
            <select
              id="appt-clinic"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              disabled={loadingRes}
            >
              <option value="">{loadingRes ? 'Cargando...' : 'Seleccionar clínica...'}</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {selectedClinic?.address && (
              <div className="text-text-muted text-[11px] mt-1">📍 {selectedClinic.address}</div>
            )}
          </div>

          {/* ── Doctor ── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="appt-provider">
                <Stethoscope className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Doctor <span className="text-rose">*</span>
              </Label>
              {effectiveSpecialty && (
                <button
                  type="button"
                  onClick={() => { setShowAll((v) => !v); setProviderId(''); }}
                  className="text-[10px] text-brand hover:underline"
                >
                  {showAll ? `Filtrar por ${effectiveSpecialty.name}` : 'Ver todos los doctores'}
                </button>
              )}
            </div>

            {noProvidersForSpecialty && !showAll && (
              <div className="mb-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                No hay doctores asignados a <strong>{effectiveSpecialty?.name}</strong>.
                {' '}<button onClick={() => setShowAll(true)} className="underline">Ver todos.</button>
              </div>
            )}

            <select
              id="appt-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              disabled={loadingRes}
            >
              <option value="">{loadingRes ? 'Cargando...' : `Seleccionar doctor${effectiveSpecialty && !showAll ? ` (${effectiveSpecialty.name})` : ''}...`}</option>
              {filteredProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  Dr. {p.firstName} {p.lastName}{p.specialty ? ` — ${p.specialty}` : ''}
                </option>
              ))}
            </select>

            {hasSpecialtyMismatch && (
              <div className="mt-1.5 text-[11px] text-amber flex items-start gap-1">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>Doctor de especialidad distinta a <strong>{effectiveSpecialty?.name}</strong>. Confirmá antes de agendar.</span>
              </div>
            )}
          </div>

          {/* ── Fecha + Hora ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="appt-date">
                <CalendarIcon className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Fecha <span className="text-rose">*</span>
              </Label>
              <input
                id="appt-date"
                type="date"
                lang="en-US"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <Label htmlFor="appt-time">
                <Clock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Hora <span className="text-rose">*</span>
              </Label>
              <input
                id="appt-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {scheduledLabel && (
            <div className={`rounded-md border px-3 py-2 text-xs ${isFuture ? 'bg-emerald/5 border-emerald/20 text-emerald' : 'bg-rose/5 border-rose/20 text-rose'}`}>
              <strong className="capitalize">{scheduledLabel}</strong>
              {!isFuture && <span className="ml-2">⚠ La fecha/hora debe ser futura</span>}
            </div>
          )}

          {/* ── Duración ── */}
          <div>
            <Label>Duración (minutos)</Label>
            <div className="grid grid-cols-6 gap-1.5 mt-1.5">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`px-2 py-2 rounded-md border text-xs font-medium transition-colors ${
                    duration === d
                      ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                      : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>

          {/* ── Tipo de cita ── */}
          <div>
            <Label htmlFor="appt-type">Tipo de cita</Label>
            <select
              id="appt-type"
              value={type}
              onChange={(e) => setType(e.target.value as AppointmentType)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* ── Notas ── */}
          <div>
            <Label htmlFor="appt-notes">
              <FileText className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Notas para el doctor (opcional)
            </Label>
            <textarea
              id="appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder="Ej: paciente reporta dolor lumbar severo · primera evaluación..."
              maxLength={2000}
            />
          </div>

          {/* ── Resumen ── */}
          {selectedClinic && selectedProvider && scheduledForIso && isFuture && (
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs">
              <div className="text-brand font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" /> Resumen
              </div>
              <div className="space-y-0.5 text-text-2">
                <div>Dr. <strong className="text-text-1">{selectedProvider.firstName} {selectedProvider.lastName}</strong></div>
                <div>en <strong className="text-text-1">{selectedClinic.name}</strong></div>
                <div className="capitalize">📅 <strong className="text-text-1">{scheduledLabel}</strong></div>
                <div>Duración: <strong className="text-text-1">{duration} min</strong> · Tipo: <strong className="text-text-1">{TYPE_OPTIONS.find((o) => o.value === type)?.label}</strong></div>
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
            Cancelar
          </Button>
          <Button onClick={handleSchedule} disabled={!canSubmit} className="w-full sm:w-auto">
            {saving ? 'Agendando...' : <><CalendarCheck className="w-3.5 h-3.5 mr-1" /> Agendar cita</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
