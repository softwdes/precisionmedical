'use client';

/**
 * "Registrar logro" — reemplaza las pestañas "Log - …" del Excel de incentivos.
 *
 * El empleado elige QUÉ logró, el paciente y la fuente. La clínica y si el
 * paciente es NEW o EXISTING los decide el sistema (`/api/premios/paciente`),
 * con la misma función que usa el POST al guardar: lo que se ve acá es lo que
 * queda en la fila. Los puntos también los calcula el servidor; el número de
 * este diálogo es solo el anticipo.
 *
 * Queda PENDIENTE hasta que el Admin lo verifica.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@precision/ui';
import {
  FUENTES_QUE_NO_SUMAN, FUENTES_QUE_SUMAN, puntosDelRegistro, type RewardCategory, type RewardSource,
} from '@precision-medical/database/premios';
import { Autocomplete, FormField, useToast, type AutoResult } from '@/components/ui-phoenix';
import { cn } from '@precision/ui';
import { claveDia, fecha as fmtFecha } from '@/lib/fechas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: RewardCategory[];
  /** `YYYY-MM-01` del mes abierto: la fecha del logro tiene que caer ahí. */
  month: string;
  onSaved: () => void;
}

interface DatosPaciente {
  isNewPatient: boolean;
  firstVisit: string | null;
  clinicName: string | null;
}

function hoyEnMes(month: string): string {
  const hoy = claveDia(new Date());
  return hoy.slice(0, 7) === month.slice(0, 7) ? hoy : month;
}

function ultimoDiaDelMes(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function RegistrarLogroDialog({ open, onOpenChange, categories, month, onSaved }: Props): React.ReactElement {
  const t = useTranslations('phoenix.rewards');
  const locale = useLocale();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [patient, setPatient] = useState<AutoResult | null>(null);
  const [datos, setDatos] = useState<DatosPaciente | null>(null);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [source, setSource] = useState<RewardSource | null>(null);
  const [dia, setDia] = useState(() => hoyEnMes(month));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada apertura arranca limpia: un logro no se mezcla con el anterior.
  useEffect(() => {
    if (!open) return;
    setCode(''); setPatient(null); setDatos(null); setSource(null);
    setDia(hoyEnMes(month)); setNotes(''); setError(null);
  }, [open, month]);

  const cat = categories.find((c) => c.code === code) ?? null;
  const nombreCat = (c: RewardCategory) => (locale === 'en' ? c.nameEn : c.nameEs);

  // Clínica y NEW/EXISTING, cada vez que cambia el paciente o el día.
  useEffect(() => {
    if (!patient) { setDatos(null); return; }
    let vivo = true;
    setCargandoDatos(true);
    fetch(`/api/premios/paciente?patientId=${encodeURIComponent(patient.id)}&dia=${dia}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DatosPaciente | null) => { if (vivo) setDatos(d); })
      .catch(() => { if (vivo) setDatos(null); })
      .finally(() => { if (vivo) setCargandoDatos(false); });
    return () => { vivo = false; };
  }, [patient, dia]);

  const puntos = useMemo(() => {
    if (!cat) return null;
    if (cat.requiresPatient && !datos) return null;
    if (cat.tracksSource && !source) return null;
    return puntosDelRegistro(cat, datos?.isNewPatient ?? null, cat.tracksSource ? source : null);
  }, [cat, datos, source]);

  const faltaPaciente = !!cat?.requiresPatient && !patient;
  const faltaFuente = !!cat?.tracksSource && !source;
  const puedeGuardar = !!cat && !faltaPaciente && !faltaFuente && !saving;

  async function guardar(): Promise<void> {
    if (!cat) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/premios/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryCode: cat.code,
          occurredOn: dia,
          patientId: cat.requiresPatient ? (patient?.id ?? null) : null,
          source: cat.tracksSource ? source : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const clave = `errors.${body.error ?? 'REWARDS_FAILED'}`;
        setError(t.has(clave) ? t(clave) : t('errors.REWARDS_FAILED'));
        return;
      }
      toast.success(t('saved'));
      onSaved();
      onOpenChange(false);
    } catch {
      setError(t('errors.REWARDS_FAILED'));
    } finally {
      setSaving(false);
    }
  }

  const chip = (s: RewardSource, suma: boolean) => {
    const on = source === s;
    return (
      <button
        key={s}
        type="button"
        onClick={() => setSource(s)}
        aria-pressed={on}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
          on
            ? (suma ? 'border-emerald bg-emerald text-white' : 'border-border-strong bg-bg-3 text-text-1')
            : (suma ? 'border-emerald/40 text-emerald-text hover:bg-emerald/10' : 'border-dashed border-border-strong text-text-muted hover:bg-bg-2'),
        )}
      >
        {suma ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {t(`source.${s}`)}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <FormField.Select
              label={t('fieldCategory')}
              required
              value={code}
              onChange={(v) => { setCode(v); setSource(null); }}
              options={[
                { value: '', label: t('pickCategory'), disabled: true },
                ...categories.map((c) => ({ value: c.code, label: `${nombreCat(c)} · ${c.code}` })),
              ]}
            />
            {cat && (
              <div className="mt-1 text-[11px] text-text-muted">
                {cat.pointsNew === cat.pointsExisting
                  ? t('pointsHintFlat', { points: cat.pointsNew })
                  : t('pointsHint', { new: cat.pointsNew, existing: cat.pointsExisting })}
              </div>
            )}
          </div>

          {cat?.requiresPatient && (
            <div className="flex flex-col gap-2">
              <FormField.Label required>{t('fieldPatient')}</FormField.Label>
              <Autocomplete
                endpoint="/api/admin/patients/autocomplete"
                placeholder={t('patientPlaceholder')}
                selected={patient}
                onSelect={setPatient}
              />
              {patient && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-md bg-emerald/10 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('fieldClinic')}</div>
                    <div className="text-sm text-text-1">
                      {cargandoDatos ? '…' : (datos?.clinicName ?? t('noClinic'))}
                    </div>
                    <div className="text-[10px] text-emerald-text">{t('autoTag')}</div>
                  </div>
                  <div className="rounded-md bg-emerald/10 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('fieldType')}</div>
                    <div className="text-sm text-text-1">
                      {cargandoDatos || !datos ? '…' : (
                        <>
                          <span className="font-semibold">{datos.isNewPatient ? t('typeNew') : t('typeExisting')}</span>
                          <span className="text-text-muted text-[11px]">
                            {' · '}{datos.firstVisit ? t('firstVisit', { date: fmtFecha(datos.firstVisit) }) : t('noVisits')}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-emerald-text">{t('autoTag')}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {cat?.tracksSource && (
            <div className="flex flex-col gap-2">
              <FormField.Label required>{t('fieldSource')}</FormField.Label>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-text">{t('sourceEarns')}</div>
              <div className="flex flex-wrap gap-1.5">{FUENTES_QUE_SUMAN.map((s) => chip(s, true))}</div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sourceNoEarn')}</div>
              <div className="flex flex-wrap gap-1.5">{FUENTES_QUE_NO_SUMAN.map((s) => chip(s, false))}</div>
            </div>
          )}

          {cat && (
            <>
              <FormField.Date
                label={t('fieldDate')}
                required
                value={dia}
                onChange={(v) => {
                  // Solo días del mes abierto: lo demás lo rechaza el servidor.
                  if (v && v >= month && v <= ultimoDiaDelMes(month)) setDia(v);
                }}
                hint={t('dateHint')}
              />
              <FormField.Textarea
                label={t('fieldNotes')}
                value={notes}
                onChange={setNotes}
                placeholder={t('notesPlaceholder')}
                rows={2}
                maxLength={500}
              />
            </>
          )}

          {puntos !== null && (
            <div className={cn(
              'rounded-md border px-3 py-2 text-[11px]',
              puntos > 0 ? 'border-emerald/30 bg-emerald/10 text-emerald-text' : 'border-amber/30 bg-amber/10 text-amber-text',
            )}>
              {puntos > 0 ? t('summary', { points: puntos }) : t('summaryZero')}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose-text">{error}</div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button className="w-full sm:w-auto" onClick={guardar} disabled={!puedeGuardar}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
        {cat && !puedeGuardar && !saving && (
          <p className="text-[11px] text-text-muted sm:text-right -mt-2">
            {faltaPaciente ? t('needPatient') : faltaFuente ? t('needSource') : null}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
