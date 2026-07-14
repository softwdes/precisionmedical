'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Heart, Pill, Loader2, Edit2, RefreshCw } from 'lucide-react';
import { Button } from '@precision/ui';
import { MedicalHistoryDialog } from '@/app/(admin)/patients/medical-history-dialog';
import type { PatientRow } from '@/app/(admin)/patients/patients-client';

interface Props {
  patientId: string;
}

interface MedHx {
  problems?: Array<{ id: string; condition: string; status?: string }>;
  history?: Array<{ id: string; condition: string }>;
  medications?: Array<{ id: string; name: string; status: 'IN_USE' | 'HISTORY' }>;
  allergies?: string;
  surgeries?: Array<{ id: string; procedure: string }>;
}

export function HistorialMedicoTab({ patientId }: Props) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/patients/${patientId}/medical-history`);
      if (r.ok) {
        const data = await r.json();
        setPatient(data.patient);
        setDialogOpen(true); // abre directamente al cargar
      }
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const hx: MedHx = (patient?.medicalHistory ?? {}) as MedHx;
  const activeMeds = (hx.medications ?? []).filter(m => m.status === 'IN_USE');
  const activeProblems = (hx.problems ?? []).filter(p => p.status !== 'INACTIVE');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando historial médico…</span>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-20 text-text-muted text-sm">
        No se pudo cargar el historial médico.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con acción */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-brand" />
          Historial médico · {patient.firstName} {patient.lastName}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors"
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Edit2 className="w-3.5 h-3.5 mr-1" />
            Ver / Editar historial completo
          </Button>
        </div>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Problemas activos',
            value: activeProblems.length,
            items: activeProblems.slice(0, 3).map(p => p.condition),
            icon: Heart,
            color: 'rose',
          },
          {
            label: 'Historial clínico',
            value: (hx.history ?? []).length,
            items: (hx.history ?? []).slice(0, 3).map(h => h.condition),
            icon: ClipboardList,
            color: 'violet',
          },
          {
            label: 'Medicamentos activos',
            value: activeMeds.length,
            items: activeMeds.slice(0, 3).map(m => m.name),
            icon: Pill,
            color: 'cyan',
          },
          {
            label: 'Cirugías',
            value: (hx.surgeries ?? []).length,
            items: (hx.surgeries ?? []).slice(0, 3).map(s => s.procedure),
            icon: ClipboardList,
            color: 'amber',
          },
        ].map(card => (
          <div key={card.label} className="rounded-lg border border-border bg-bg-1 p-4">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-4 h-4 text-${card.color}`} />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{card.label}</span>
            </div>
            <div className={`text-2xl font-bold text-${card.color} mb-2`}>{card.value}</div>
            {card.items.length > 0 ? (
              <ul className="space-y-0.5">
                {card.items.map((item, i) => (
                  <li key={i} className="text-[11px] text-text-2 truncate">· {item}</li>
                ))}
                {card.value > 3 && (
                  <li className="text-[10px] text-text-muted italic">+{card.value - 3} más…</li>
                )}
              </ul>
            ) : (
              <p className="text-[11px] text-text-muted italic">Sin registros</p>
            )}
          </div>
        ))}
      </div>

      {/* Alergias */}
      {hx.allergies && (
        <div className="rounded-md border border-rose/30 bg-rose/5 px-4 py-3 flex items-start gap-2">
          <span className="text-rose text-sm font-bold shrink-0">⚠</span>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-rose mb-0.5">Alergias conocidas</div>
            <div className="text-sm text-text-1">{hx.allergies}</div>
          </div>
        </div>
      )}

      {/* Prompt a abrir el historial completo si está vacío */}
      {!hx.problems?.length && !hx.medications?.length && !hx.history?.length && (
        <div className="rounded-lg border border-border bg-bg-1 p-8 text-center">
          <ClipboardList className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <div className="text-text-1 font-semibold text-sm mb-1">Sin historial médico registrado</div>
          <div className="text-text-muted text-xs mb-4">Haz clic en "Ver / Editar historial completo" para ingresar la información clínica del paciente.</div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Edit2 className="w-3.5 h-3.5 mr-1" />
            Abrir historial médico
          </Button>
        </div>
      )}

      {/* Dialog completo */}
      {dialogOpen && (
        <MedicalHistoryDialog
          patient={patient}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); load(); }}
        />
      )}
    </div>
  );
}
