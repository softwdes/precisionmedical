'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { MedicalHistoryContent } from '@/app/(admin)/patients/medical-history-dialog';
import type { PatientRow } from '@/app/(admin)/patients/patients-client';

interface Props {
  patientId: string;
}

export function HistorialMedicoTab({ patientId }: Props) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/patients/${patientId}/medical-history`);
      if (r.ok) {
        const data = await r.json();
        setPatient(data.patient);
      }
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando historial médico...</span>
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

  return <MedicalHistoryContent patient={patient} />;
}
