'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PhoneCall, Check, AlertCircle, FileCheck, Calendar, Info, ClipboardList } from 'lucide-react';
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

// B.4 — Confirmación 24h antes de la primera cita

interface ConfirmAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseInfo: {
    id: string;
    caseCode: string;
    patient: {
      firstName: string;
      lastName: string;
      phone: string | null;
    };
    accidentDate: Date | null;
    accidentLocation: string | null;
    primaryInsurance?: { name: string } | null;
    lawFirm?: { firmName: string } | null;
  } | null;
}

export function ConfirmAppointmentDialog({ open, onOpenChange, caseInfo }: ConfirmAppointmentDialogProps) {
  const router = useRouter();

  const [dolConfirmed, setDolConfirmed]    = useState(false);
  const [docsBringing, setDocsBringing]    = useState(false);
  const [timeConfirmed, setTimeConfirmed]  = useState(false);
  const [infoUpToDate, setInfoUpToDate]    = useState(false);
  const [notes, setNotes]                   = useState('');
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [success, setSuccess]               = useState(false);

  useEffect(() => {
    if (open) {
      setDolConfirmed(false);
      setDocsBringing(false);
      setTimeConfirmed(false);
      setInfoUpToDate(false);
      setNotes('');
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  if (!caseInfo) return null;

  const allChecked = dolConfirmed && docsBringing && timeConfirmed && infoUpToDate;

  const handleConfirm = async () => {
    setError(null);
    if (!allChecked) {
      return setError('Marca todos los items del checklist antes de confirmar');
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseInfo.id}/confirm-appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: { dolConfirmed, docsBringing, timeConfirmed, infoUpToDate },
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      setSuccess(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar');
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
            <h2 className="text-xl font-bold text-text-1 mb-2">Cita confirmada</h2>
            <p className="text-text-2 text-sm mb-4">
              <code className="text-emerald font-mono font-bold">{caseInfo.caseCode}</code>
            </p>
            <div className="text-xs text-text-muted mb-6">
              <strong className="text-text-2">{caseInfo.patient.firstName} {caseInfo.patient.lastName}</strong> · status <code className="text-emerald">CONFIRMED</code><br />
              El paciente está listo para venir a su primera cita.
            </div>
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Confirmation form ────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-cyan" />
            Confirmar cita · llamada 24h antes
          </DialogTitle>
          <DialogDescription>
            Llamá a <strong className="text-text-1">{caseInfo.patient.firstName} {caseInfo.patient.lastName}</strong> y completá el checklist abajo. Solo se confirma cuando los 4 items están marcados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto pr-2 scroll-thin">
          {/* Patient phone — quick dial */}
          <a
            href={caseInfo.patient.phone ? `tel:${caseInfo.patient.phone}` : undefined}
            className="block rounded-lg border border-emerald/30 bg-emerald/5 px-4 py-3 hover:bg-emerald/10 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">Llamar a paciente</div>
                <div className="text-text-1 font-mono text-base mt-1">{caseInfo.patient.phone ?? '— sin teléfono —'}</div>
              </div>
              {caseInfo.patient.phone && (
                <div className="w-10 h-10 rounded-full bg-emerald flex items-center justify-center text-white">
                  <PhoneCall className="w-4 h-4" />
                </div>
              )}
            </div>
          </a>

          {/* Script de llamada — context para Recepción */}
          <div className="rounded-lg border border-brand/20 bg-brand/5 p-4">
            <div className="flex items-center gap-2 text-brand text-xs font-semibold uppercase tracking-wider mb-2">
              <Info className="w-3.5 h-3.5" /> Datos del caso (para referencia durante la llamada)
            </div>
            <div className="space-y-1 text-xs text-text-2">
              <div><strong className="text-text-1">Caso:</strong> <code className="font-mono">{caseInfo.caseCode}</code></div>
              {caseInfo.accidentDate && (
                <div><strong className="text-text-1">DOL (Date of Loss):</strong> {new Date(caseInfo.accidentDate).toLocaleDateString('es-US')}</div>
              )}
              {caseInfo.accidentLocation && (
                <div><strong className="text-text-1">Lugar:</strong> {caseInfo.accidentLocation}</div>
              )}
              {caseInfo.lawFirm && (
                <div><strong className="text-text-1">Bufete:</strong> {caseInfo.lawFirm.firmName}</div>
              )}
              {caseInfo.primaryInsurance && (
                <div><strong className="text-text-1">Aseguradora:</strong> {caseInfo.primaryInsurance.name}</div>
              )}
            </div>
          </div>

          {/* Checklist */}
          <div className="rounded-lg border border-border bg-bg-2/30 p-4">
            <div className="flex items-center gap-2 text-text-1 font-semibold text-sm mb-3">
              <ClipboardList className="w-4 h-4 text-brand" />
              Checklist de confirmación
              <span className="text-text-muted text-xs font-normal ml-auto">
                {[dolConfirmed, docsBringing, timeConfirmed, infoUpToDate].filter(Boolean).length}/4
              </span>
            </div>
            <div className="space-y-2.5">
              <ChecklistItem
                checked={dolConfirmed}
                onChange={setDolConfirmed}
                label="DOL (fecha del accidente) confirmada con el paciente"
                hint="Confirma que la fecha en el sistema coincide con lo que reporta el paciente"
              />
              <ChecklistItem
                checked={docsBringing}
                onChange={setDocsBringing}
                label="Trae documentos (ID + reporte ER si lo tiene)"
                hint="Pídele al paciente que traiga identificación y cualquier reporte médico previo"
              />
              <ChecklistItem
                checked={timeConfirmed}
                onChange={setTimeConfirmed}
                label="Horario de la cita confirmado"
                hint="Verifica que el horario sigue siendo conveniente · si no, ofrece reagendar"
              />
              <ChecklistItem
                checked={infoUpToDate}
                onChange={setInfoUpToDate}
                label="Información personal sin cambios"
                hint="¿Cambió de teléfono, dirección, aseguradora? Actualizar antes de la cita"
              />
            </div>
          </div>

          {/* Notes optional */}
          <div>
            <Label htmlFor="notes">Notas adicionales (opcional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder="Ej: paciente pidió llegar 15 min antes · viene con familiar · prefiere ES..."
            />
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <div className="text-xs text-text-muted mr-auto flex items-center gap-1">
            {allChecked ? (
              <><Check className="w-3.5 h-3.5 text-emerald" /> <span className="text-emerald">Listo para confirmar</span></>
            ) : (
              <><Calendar className="w-3.5 h-3.5" /> Status → <code className="text-emerald">CONFIRMED</code></>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving || !allChecked}>
            {saving ? 'Confirmando...' : <><FileCheck className="w-3.5 h-3.5 mr-1" /> Confirmar cita</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Checklist item ─────────────────────────────────────────────────────────

function ChecklistItem({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-all ${
        checked
          ? 'bg-emerald/5 border-emerald/30 hover:bg-emerald/10'
          : 'bg-bg-1 border-border hover:border-border-strong'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 rounded accent-emerald shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${checked ? 'text-emerald' : 'text-text-1'}`}>{label}</div>
        <div className="text-text-muted text-[11px] mt-0.5">{hint}</div>
      </div>
    </label>
  );
}
