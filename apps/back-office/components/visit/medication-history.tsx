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
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@precision/ui';
import { Pill, Plus, Loader2, Flag, AlertTriangle } from 'lucide-react';
import { EmptyState, TagPill } from '@/components/ui-phoenix';

/**
 * Tope de los dos campos, IGUAL al de la ruta que escribe
 * (`/api/admin/patients/medications/[appointmentId]`: name y prescribedBy en
 * 300). El server ya validaba y el error ya se mostraba; lo que faltaba era no
 * dejar teclear 5000 caracteres para enterarse recién al guardar.
 */
const MAX_MED = 300;

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

  // Activos primero: es lo que el doctor necesita ver de un vistazo
  const sorted = React.useMemo(
    () => [...items].sort((a, b) => (a.status === 'IN_USE' ? 0 : 1) - (b.status === 'IN_USE' ? 0 : 1)),
    [items],
  );
  const activeCount = items.filter((m) => m.status === 'IN_USE').length;

  return (
    <div className="rounded-lg bg-bg-1">
      {/* El botón de agregar vive en el encabezado — abajo quedaba enterrado
          cuando la lista crecía (pedido de Erick 2026-08-03). */}
      <div className="px-4 py-3 border-b border-row-sep flex items-center gap-2 flex-wrap">
        <Pill className="w-4 h-4 text-violet-text shrink-0" />
        <span className="text-text-1 font-semibold text-[12px] uppercase tracking-wider">
          {t('medHxTitle')}
        </span>
        {activeCount > 0 && (
          <TagPill
            label={t('medHxActiveCount', { count: activeCount })}
            colorClass="bg-emerald/15 text-emerald border-emerald/30"
          />
        )}
        <span className="text-[10px] text-text-muted">{t('medHxCount', { count: items.length })}</span>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11.5px] font-semibold text-violet-text bg-violet/10 hover:bg-violet/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('medHxAddShort')}
        </button>
      </div>

      <div className="p-4 flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState.Rich icon={Pill} title={t('medHxEmptyTitle')} subtitle={t('medHxEmptySubtitle')} />
        ) : (
          sorted.map((m, i) => (
            <div
              key={m.id ?? i}
              className={`rounded-md px-3 py-2 ${m.externalPrescriber ? 'border border-dashed border-border' : 'bg-bg-2/40'}`}
            >
              <div className="flex items-start gap-1.5 flex-wrap">
                <span className="text-[12.5px] text-text-1 font-medium min-w-0 break-words">{m.name}</span>
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
                <div className="text-[11px] text-text-muted mt-1 break-words">
                  {[m.dose, m.instructions].filter(Boolean).join(' · ')}
                </div>
              )}
              {m.externalPrescriber && m.prescribedBy && (
                <div className="text-[11px] text-text-muted mt-1 break-words">{m.prescribedBy}</div>
              )}
            </div>
          ))
        )}

      </div>

      {/* Modal, no un bloque que empuja la lista: anotar un medicamento externo
          es una tarea aparte —el doctor no está leyendo el historial mientras lo
          escribe— y expandido tapaba lo que acababa de leer. */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[88vh]">
          <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
            <DialogTitle className="text-[14px] flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber shrink-0" />
              {t('medHxFormTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 overflow-y-auto space-y-3">
            <p className="text-[11.5px] text-text-muted leading-relaxed">{t('medHxFormHint')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldName')}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void handleSave(); }}
                  placeholder={t('medHxFieldNamePh')}
                  maxLength={MAX_MED}
                  autoFocus
                  className="w-full h-9 rounded-md bg-bg-2 px-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
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
                      className={`h-9 px-3 rounded-md text-[12px] font-semibold transition-colors ${
                        status === s ? 'bg-violet/15 text-violet-text' : 'bg-bg-2 text-text-muted hover:text-text-1'
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void handleSave(); }}
                  placeholder={t('medHxFieldNotePh')}
                  maxLength={MAX_MED}
                  className="w-full h-9 rounded-md bg-bg-2 px-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={resetForm} className="h-9 w-full sm:w-auto">
              {t('medHxCancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !name.trim()} className="h-9 w-full sm:w-auto gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {t('medHxSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
