'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck, AlertCircle, Check, Building2, Stethoscope, Clock, FileText,
  ChevronRight, Calendar as CalendarIcon,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';
import { TagPill } from '@/components/ui-phoenix';

// B.10 — Agendar primera cita (post-CONFIRMED)

interface ScheduleAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseInfo: {
    id: string;
    caseCode: string;
    patient: { firstName: string; lastName: string };
    specialty?: { name: string; color: string } | null;
  } | null;
}

interface Clinic {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
}

interface Provider {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  licenseNumber: string | null;
}

type AppointmentType = 'AUTO_ACCIDENT' | 'FAMILY_PRACTICE' | 'URGENT_CARE' | 'FOLLOW_UP';

const TYPE_OPTIONS: Array<{ value: AppointmentType; label: string }> = [
  { value: 'AUTO_ACCIDENT',  label: 'Auto Accident (MVA)' },
  { value: 'FOLLOW_UP',      label: 'Follow-up' },
  { value: 'FAMILY_PRACTICE', label: 'Family Practice' },
  { value: 'URGENT_CARE',    label: 'Urgent Care' },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

const SPECIALTY_LABELS: Record<string, string> = {
  CHIROPRACTIC: 'Chiropractic',
  PHYSICAL_THERAPY: 'Physical Therapy',
  PAIN_MANAGEMENT: 'Pain Management',
  ORTHOPEDICS: 'Orthopedics',
  NEUROLOGY: 'Neurology',
  RADIOLOGY: 'Radiology',
  PSYCHOLOGY: 'Psychology',
  GENERAL: 'General',
  OTHER: 'Other',
};

const SPECIALTY_COLORS: Record<string, string> = {
  CHIROPRACTIC: 'bg-rose/15 text-rose border-rose/30',
  PHYSICAL_THERAPY: 'bg-cyan/15 text-cyan border-cyan/30',
  PAIN_MANAGEMENT: 'bg-violet/15 text-violet border-violet/30',
  ORTHOPEDICS: 'bg-amber/15 text-amber border-amber/30',
  NEUROLOGY: 'bg-pink/15 text-pink border-pink/30',
  RADIOLOGY: 'bg-emerald/15 text-emerald border-emerald/30',
  PSYCHOLOGY: 'bg-brand/15 text-brand border-brand/30',
  GENERAL: 'bg-bg-2 text-text-2 border-border',
  OTHER: 'bg-bg-2 text-text-2 border-border',
};

export function ScheduleAppointmentDialog({ open, onOpenChange, caseInfo }: ScheduleAppointmentDialogProps) {
  const router = useRouter();

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  const [clinicId, setClinicId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [date, setDate] = useState('');         // YYYY-MM-DD
  const [time, setTime] = useState('');         // HH:MM
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState<AppointmentType>('AUTO_ACCIDENT');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    appointmentId: string;
    scheduledFor: string;
    clinicName: string;
    providerName: string;
  } | null>(null);

  // Cargar clínicas + providers al abrir
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setClinicId('');
    setProviderId('');
    setDate('');
    setTime('');
    setDuration(30);
    setType('AUTO_ACCIDENT');
    setNotes('');

    setLoadingResources(true);
    fetch('/api/admin/scheduling/resources')
      .then((r) => r.json())
      .then((data) => {
        setClinics(data.clinics ?? []);
        setProviders(data.providers ?? []);
      })
      .catch(() => setError('No se pudieron cargar clínicas/doctores'))
      .finally(() => setLoadingResources(false));
  }, [open]);

  const selectedClinic = clinics.find((c) => c.id === clinicId);
  const selectedProvider = providers.find((p) => p.id === providerId);

  // Computed: scheduledFor ISO
  const scheduledForIso = useMemo(() => {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }, [date, time]);

  const scheduledForLocalLabel = useMemo(() => {
    if (!scheduledForIso) return null;
    return new Date(scheduledForIso).toLocaleString('es-US', {
      weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }, [scheduledForIso]);

  const isFuture = scheduledForIso ? new Date(scheduledForIso).getTime() > Date.now() : false;

  const canSubmit = clinicId && providerId && scheduledForIso && isFuture && !saving;

  if (!caseInfo) return null;

  const handleSchedule = async () => {
    setError(null);
    if (!canSubmit) {
      return setError('Completá todos los campos requeridos');
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseInfo.id}/schedule-appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        appointmentId: data.appointment.id,
        scheduledFor: data.appointment.scheduledFor,
        clinicName: data.appointment.clinic.name,
        providerName: `${data.appointment.provider.firstName} ${data.appointment.provider.lastName}`,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agendar');
    } finally {
      setSaving(false);
    }
  };

  // ─── Success state ────────────────────────────────────────────────────────
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald/20 border-2 border-emerald flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald" />
            </div>
            <h2 className="text-xl font-bold text-text-1 mb-2">Cita agendada</h2>
            <p className="text-text-2 text-sm mb-4">
              <code className="text-emerald font-mono font-bold">{caseInfo.caseCode}</code>
            </p>
            <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-4 text-left text-xs space-y-1 mb-4">
              <div className="text-emerald font-semibold uppercase tracking-wider text-[10px] mb-2">Detalles</div>
              <div><strong className="text-text-1">Paciente:</strong> {caseInfo.patient.firstName} {caseInfo.patient.lastName}</div>
              <div><strong className="text-text-1">Doctor:</strong> Dr. {success.providerName}</div>
              <div><strong className="text-text-1">Clínica:</strong> {success.clinicName}</div>
              <div><strong className="text-text-1">Cuándo:</strong> {new Date(success.scheduledFor).toLocaleString('es-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
            <div className="text-xs text-text-muted mb-6">
              Status del caso → <code className="text-brand">ACTIVE</code> · El paciente entra al flujo clínico.
            </div>
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Schedule form ────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald" />
            Agendar primera cita
          </DialogTitle>
          <DialogDescription>
            Paciente <strong className="text-text-1">{caseInfo.patient.firstName} {caseInfo.patient.lastName}</strong> · caso <code className="text-text-1 font-mono">{caseInfo.caseCode}</code>.
            Al agendar, el status pasa a <code className="text-brand">ACTIVE</code> y el caso entra al flujo clínico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto pr-2 scroll-thin">
          {/* Clínica */}
          <div>
            <Label htmlFor="clinic">
              <Building2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Clínica <span className="text-rose">*</span>
            </Label>
            <select
              id="clinic"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              disabled={loadingResources}
            >
              <option value="">{loadingResources ? 'Cargando...' : 'Seleccionar clínica...'}</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selectedClinic?.address && (
              <div className="text-text-muted text-[11px] mt-1">📍 {selectedClinic.address}</div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <Label htmlFor="provider">
              <Stethoscope className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Doctor <span className="text-rose">*</span>
            </Label>
            <select
              id="provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              disabled={loadingResources}
            >
              <option value="">{loadingResources ? 'Cargando...' : 'Seleccionar doctor...'}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  Dr. {p.firstName} {p.lastName} — {SPECIALTY_LABELS[p.specialty] ?? p.specialty}
                </option>
              ))}
            </select>
            {selectedProvider && (
              <div className="mt-1.5 flex items-center gap-2">
                <TagPill
                  label={SPECIALTY_LABELS[selectedProvider.specialty] ?? selectedProvider.specialty}
                  colorClass={SPECIALTY_COLORS[selectedProvider.specialty] ?? SPECIALTY_COLORS.OTHER}
                />
                {selectedProvider.licenseNumber && (
                  <span className="text-text-muted text-[11px] font-mono">License: {selectedProvider.licenseNumber}</span>
                )}
              </div>
            )}
            {caseInfo.specialty && selectedProvider && SPECIALTY_LABELS[selectedProvider.specialty] !== caseInfo.specialty.name && (
              <div className="mt-1.5 text-[11px] text-amber flex items-start gap-1">
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>El caso es de <strong>{caseInfo.specialty.name}</strong> pero el doctor seleccionado es de otra especialidad. Confirmá antes de agendar.</span>
              </div>
            )}
          </div>

          {/* Fecha + hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">
                <CalendarIcon className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Fecha <span className="text-rose">*</span>
              </Label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <Label htmlFor="time">
                <Clock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Hora <span className="text-rose">*</span>
              </Label>
              <input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {scheduledForLocalLabel && (
            <div className={`rounded-md border px-3 py-2 text-xs ${isFuture ? 'bg-emerald/5 border-emerald/20 text-emerald' : 'bg-rose/5 border-rose/20 text-rose'}`}>
              <strong className="capitalize">{scheduledForLocalLabel}</strong>
              {!isFuture && <span className="ml-2">⚠ La fecha/hora debe ser futura</span>}
            </div>
          )}

          {/* Duración */}
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

          {/* Tipo */}
          <div>
            <Label htmlFor="type">Tipo de cita</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as AppointmentType)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <div>
            <Label htmlFor="notes">
              <FileText className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Notas para el doctor (opcional)
            </Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder="Ej: paciente reporta dolor lumbar severo · primera evaluación..."
              maxLength={2000}
            />
          </div>

          {/* Summary */}
          {selectedClinic && selectedProvider && scheduledForIso && isFuture && (
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs">
              <div className="text-brand font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" /> Resumen
              </div>
              <div className="space-y-0.5 text-text-2">
                <div>Dr. <strong className="text-text-1">{selectedProvider.firstName} {selectedProvider.lastName}</strong> ({SPECIALTY_LABELS[selectedProvider.specialty]})</div>
                <div>en <strong className="text-text-1">{selectedClinic.name}</strong></div>
                <div className="capitalize">📅 <strong className="text-text-1">{scheduledForLocalLabel}</strong></div>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSchedule} disabled={!canSubmit}>
            {saving ? 'Agendando...' : <><CalendarCheck className="w-3.5 h-3.5 mr-1" /> Agendar cita</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
