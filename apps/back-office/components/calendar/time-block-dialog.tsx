'use client';

/**
 * Aviso en la agenda del doctor: "Lunch", "se fue temprano", "conferencia".
 *
 * Copia el comportamiento del v2: es TEXTO que la gente lee. No bloquea el
 * sugeridor de horarios ni impide agendar encima (decisión de Erick 2026-08-20).
 * Liberar la hora es borrarlo, y por eso el botón de borrar vive acá mismo, no
 * escondido en un menú.
 *
 * El DOCTOR es opcional y va al final. La primera versión lo exigía y estaba mal
 * (Erick, 2026-08-29): el aviso es del CALENDARIO, para que lo vea todo el mundo,
 * no un mensaje dirigido a alguien. Un "no hay luz" o el almuerzo general no son
 * de una persona. Elegir doctor solo acota el caso puntual: "el Dr. X se fue
 * temprano".
 *
 * Fecha y hora van con inputs nativos y no con el `WeeklySlotPicker`: ese
 * selector existe para encontrar un hueco LIBRE del doctor, y acá justamente se
 * quiere marcar una hora sin importar si está ocupada.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarOff, Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, Button } from '@precision/ui';
import { DoctorCombobox, type DoctorComboboxProvider } from '@/components/ui-phoenix/doctor-combobox';

export interface TimeBlock {
  id: string;
  startsAt: string;
  durationMinutes: number;
  label: string;
  providerId: string | null;
  clinicId: string | null;
  providerName?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  providers: DoctorComboboxProvider[];
  /** Si viene, el diálogo edita ese aviso en vez de crear uno. */
  editing?: TimeBlock | null;
  /** Prefill al crear desde una celda del calendario (YYYY-MM-DD y HH:mm). */
  defaultDate?: string;
  defaultTime?: string;
  defaultProviderId?: string;
}

const ZONA = 'America/Denver';

/**
 * ISO UTC a partir de la fecha y hora civiles de Denver.
 *
 * Se prueban los dos offsets posibles (MDT −6 / MST −7) y se queda el que al
 * volver a Denver reproduce la hora pedida. Mismo criterio que el resto del
 * calendario: no depender de la zona horaria del navegador.
 */
function denverToIso(fecha: string, hora: string): string {
  for (const off of ['-06:00', '-07:00']) {
    const d = new Date(`${fecha}T${hora}:00${off}`);
    const vuelta = d.toLocaleTimeString('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
    if (vuelta === hora) return d.toISOString();
  }
  return new Date(`${fecha}T${hora}:00-06:00`).toISOString();
}

function isoToDenverParts(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString('en-CA', { timeZone: ZONA }),
    hora:  d.toLocaleTimeString('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

export function TimeBlockDialog({
  open, onClose, onSaved, providers, editing, defaultDate, defaultTime, defaultProviderId,
}: Props) {
  const t = useTranslations('phoenix.calendar');

  const [providerId, setProviderId] = useState('');
  const [fecha,      setFecha]      = useState('');
  const [hora,       setHora]       = useState('');
  const [duracion,   setDuracion]   = useState(60);
  const [label,      setLabel]      = useState('');
  const [guardando,  setGuardando]  = useState(false);
  const [borrando,   setBorrando]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      const p = isoToDenverParts(editing.startsAt);
      setProviderId(editing.providerId ?? '');
      setFecha(p.fecha); setHora(p.hora);
      setDuracion(editing.durationMinutes);
      setLabel(editing.label);
    } else {
      setProviderId(defaultProviderId ?? '');
      setFecha(defaultDate ?? new Date().toLocaleDateString('en-CA', { timeZone: ZONA }));
      setHora(defaultTime ?? '12:00');
      setDuracion(60);
      setLabel('');
    }
  }, [open, editing, defaultDate, defaultTime, defaultProviderId]);

  // Sin doctor tambien se guarda: ese es el caso por defecto.
  const puedeGuardar = !!fecha && !!hora && label.trim().length > 0 && !guardando;

  const guardar = async (): Promise<void> => {
    setError(null); setGuardando(true);
    try {
      const cuerpo = {
        providerId: providerId || null,
        startsAt: denverToIso(fecha, hora),
        durationMinutes: duracion,
        label: label.trim(),
      };
      const res = editing
        ? await fetch(`/api/admin/time-blocks/${editing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: cuerpo.label, startsAt: cuerpo.startsAt, durationMinutes: cuerpo.durationMinutes }),
          })
        : await fetch('/api/admin/time-blocks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
          });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`); }
      onSaved(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('blockErrorSave'));
    } finally { setGuardando(false); }
  };

  const borrar = async (): Promise<void> => {
    if (!editing) return;
    setError(null); setBorrando(true);
    try {
      const res = await fetch(`/api/admin/time-blocks/${editing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('blockErrorDelete'));
    } finally { setBorrando(false); }
  };

  const campo = 'w-full bg-bg-2 rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-cyan/50';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogTitle className="sr-only">{editing ? t('blockEditTitle') : t('blockNewTitle')}</DialogTitle>

        <div className="px-5 py-4 border-b border-border flex items-center gap-2 shrink-0">
          <CalendarOff className="w-4 h-4 text-text-muted" />
          <h2 className="text-text-1 font-semibold text-base">{editing ? t('blockEditTitle') : t('blockNewTitle')}</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-[11px] text-text-muted">{t('blockHint')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-text-2 mb-1">
                {t('blockFieldDate')} <span className="text-rose">*</span>
              </label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-2 mb-1">
                {t('blockFieldFrom')} <span className="text-rose">*</span>
              </label>
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} step={900} className={campo} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-2 mb-1">{t('fieldDuration')}</label>
              <select value={duracion} onChange={(e) => setDuracion(parseInt(e.target.value, 10))} className={campo}>
                {[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => (
                  <option key={m} value={m}>{t('blockDurationMin', { m })}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-2 mb-1">
              {t('blockFieldLabel')} <span className="text-rose">*</span>
            </label>
            <input type="text" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)}
              placeholder={t('blockLabelPlaceholder')} className={campo} autoFocus />
          </div>

          {/* El doctor va ULTIMO y es opcional: por defecto el aviso es de todo
              el calendario, que es el caso comun (almuerzo general, corte de luz). */}
          <div>
            <label className="block text-[11px] font-semibold text-text-2 mb-1">
              {t('blockFieldProvider')}
            </label>
            <DoctorCombobox providers={providers} value={providerId} onChange={setProviderId} />
            <p className="text-[10px] text-text-muted mt-1">
              {providerId ? t('blockProviderOne') : t('blockProviderAll')}
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex flex-col sm:flex-row gap-2 shrink-0">
          {editing && (
            <button type="button" onClick={() => void borrar()} disabled={borrando || guardando}
              className="order-3 sm:order-none sm:mr-auto flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-0 rounded-md border border-rose/30 text-rose hover:bg-rose/10 text-xs font-medium transition-colors disabled:opacity-50">
              {borrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {t('blockDelete')}
            </button>
          )}
          <Button variant="outline" className="order-2 sm:order-none w-full sm:w-auto" onClick={onClose} disabled={guardando || borrando}>
            {t('actionCancel')}
          </Button>
          <Button className="order-1 sm:order-none w-full sm:w-auto gap-1.5" onClick={() => void guardar()} disabled={!puedeGuardar}>
            {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('blockSave')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
