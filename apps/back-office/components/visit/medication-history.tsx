'use client';

/**
 * MedicationHistory — conciliación de medicamentos del paciente (B.19).
 *
 * Muestra lo que ya está en Patient.medicalHistory.medications (Activo /
 * Anterior) y permite anotar algo que el paciente refiere tomar pero que esta
 * clínica NO prescribió — una nota de conciliación, no una receta electrónica.
 * No toca ScriptSure ni la tabla Prescription.
 *
 * Vive en el tab Prescripción mientras D4 (ScriptSure) sigue bloqueado
 * esperando credenciales: es la parte del tab que sí se puede construir hoy.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import { Pill, Plus, Loader2, Flag, AlertTriangle } from 'lucide-react';
import { EmptyState, TagPill } from '@/components/ui-phoenix';

export interface MedicationEntry {
  id?: string;
  name: string;
  dose?: string;
  instructions?: string;
  status: string; // 'IN_USE' | 'HISTORY'
  prescribedBy?: string;
  /** true = el paciente refiere tomarlo, pero no lo prescribió esta clínica */
  externalPrescriber?: boolean;
}

interface Props {
  appointmentId: string;
  medications: MedicationEntry[];
}

export function MedicationHistory({ appointmentId, medications }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();

  const [items, setItems] = React.useState<MedicationEntry[]>(medications);
  const [formOpen, setFormOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState<'IN_USE' | 'HISTORY'>('IN_USE');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // El padre puede re-renderizar con datos frescos (router.refresh) — seguirlos
  React.useEffect(() => { setItems(medications); }, [medications]);

  const resetForm = (): void => {
    setFormOpen(false); setName(''); setNote(''); setStatus('IN_USE'); setError(null);
  };

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/patients/medications/${appointmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), status, prescribedBy: note.trim() || undefined }),
      });
      if (!res.ok) { setError(t('medHxErrSave')); return; }
      const d = await res.json() as { medications: MedicationEntry[] };
      setItems(d.medications);
      resetForm();
      router.refresh();
    } catch {
      setError(t('medHxErrSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg-1">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Pill className="w-4 h-4 text-violet shrink-0" />
        <span className="text-text-1 font-semibold text-[12px] uppercase tracking-wider flex-1">
          {t('medHxTitle')}
        </span>
        <span className="text-[10px] text-text-muted">{t('medHxCount', { count: items.length })}</span>
      </div>

      <div className="p-4 space-y-2">
        {items.length === 0 ? (
          <EmptyState.Rich icon={Pill} title={t('medHxEmptyTitle')} subtitle={t('medHxEmptySubtitle')} />
        ) : (
          items.map((m, i) => (
            <div
              key={m.id ?? i}
              className={`rounded-md px-3 py-2 ${m.externalPrescriber ? 'border border-dashed border-border' : 'bg-bg-2/40'}`}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12.5px] text-text-1 font-medium">{m.name}</span>
                <TagPill
                  label={m.status === 'IN_USE' ? t('medHxActive') : t('medHxPrevious')}
                  colorClass={m.status === 'IN_USE'
                    ? 'bg-emerald/15 text-emerald border-emerald/30'
                    : 'bg-white/5 text-text-muted border-border'}
                />
                {m.externalPrescriber && (
                  <TagPill
                    label={t('medHxExternal')}
                    colorClass="bg-transparent text-text-muted border-border border-dashed"
                  />
                )}
              </div>
              {(m.dose || m.instructions) && (
                <div className="text-[11px] text-text-muted mt-1">
                  {[m.dose, m.instructions].filter(Boolean).join(' · ')}
                </div>
              )}
              {m.externalPrescriber && m.prescribedBy && (
                <div className="text-[11px] text-text-muted mt-1">{m.prescribedBy}</div>
              )}
            </div>
          ))
        )}

        {!formOpen ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold text-violet border border-dashed border-border rounded-md px-3 py-2.5 hover:bg-violet/[0.05] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t('medHxAddBtn')}
          </button>
        ) : (
          <div className="rounded-md border border-border bg-bg-2/40 p-3.5 space-y-3">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-text-1">
              <Flag className="w-3.5 h-3.5 text-amber" /> {t('medHxFormTitle')}
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">{t('medHxFormHint')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldName')}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('medHxFieldNamePh')}
                  className="w-full h-9 rounded-md bg-bg-0 border border-border px-3 text-sm text-text-1 outline-none focus:border-violet/60"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldStatus')}
                </label>
                <div className="flex gap-1.5">
                  {(['IN_USE', 'HISTORY'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`h-9 px-3 rounded-md text-[12px] font-semibold border transition-colors ${
                        status === s ? 'border-violet/50 bg-violet/10 text-violet' : 'border-border text-text-muted hover:text-text-1'
                      }`}
                    >
                      {s === 'IN_USE' ? t('medHxActive') : t('medHxPrevious')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldNote')}
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('medHxFieldNotePh')}
                  className="w-full h-9 rounded-md bg-bg-0 border border-border px-3 text-sm text-text-1 outline-none focus:border-violet/60"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm} className="h-9">
                {t('medHxCancel')}
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving || !name.trim()} className="h-9 gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {t('medHxSave')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
