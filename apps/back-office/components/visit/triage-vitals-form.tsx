'use client';

/**
 * Formulario de signos vitales del triaje — el MISMO en Day Admission y en la
 * consulta del doctor.
 *
 * Vivía suelto dentro de `admission-detail-client.tsx`, así que el portal médico
 * no lo tenía: cuando el asistente no había cargado nada, la consulta le mostraba
 * al doctor un "No hay triaje registrado" y ahí se terminaba el camino. El doctor
 * pidió poder verlo y cargarlo él (Erick, 2026-08-13) — en la clínica pasa que el
 * asistente no llegó y el médico ya tiene al paciente delante.
 *
 * Se movió tal cual, sin rediseñarlo: es un formulario clínico que recepción usa
 * todos los días y esta sesión no es el momento de cambiarle el comportamiento.
 *
 * Lo que el componente se queda para sí (y por qué):
 *  · **El estado y el guardado.** Si el doctor y el asistente tuvieran cada uno su
 *    copia, una de las dos divergiría. Acá hay una sola.
 *  · **Las conversiones bidireccionales** ft/in↔cm, lbs/oz↔kg, °F↔°C. Se escribe
 *    en cualquiera de los dos y el otro se acomoda.
 *  · **El aviso honesto de guardado.** `saveVitals` devuelve true SOLO si el
 *    servidor confirmó: antes marcaba "✓ Saved" sin mirar la respuesta, o sea le
 *    mentía a la MA diciendo que el dato clínico quedó guardado cuando no.
 *
 * Lo que deja al contenedor: el chrome de su pantalla. Day Admission le agrega
 * las confirmaciones y el botón de pasar a sala; la consulta del doctor no.
 *
 * i18n: usa el namespace `phoenix.admission` desde los dos portales. Las ~25
 * claves de vitales viven ahí y duplicarlas en `phoenix.doctor` sería pedir que
 * se desincronicen.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Activity, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { localeApp } from '@/lib/fechas';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** La fila `triage_records` como la sirve la API. */
export interface TriageRecord {
  heightFt: number | null; heightIn: number | null; heightCm: number | null;
  weightLbs: number | null; weightOz: number | null; weightKg: number | null;
  systolicMmhg: number | null; diastolicMmhg: number | null;
  pulseBpm: number | null; respiratoryRate: number | null;
  tempFahrenheit: number | null; tempCelsius: number | null;
  painScale: number | null;
  o2Saturation: number | null; o2Comment: string | null; onRoomAir: boolean;
  systolicMmhg2: number | null; diastolicMmhg2: number | null;
  pulseBpm2: number | null; respiratoryRate2: number | null;
  tempFahrenheit2: number | null; tempCelsius2: number | null;
  visualAcuityRight: string | null; visualAcuityLeft: string | null;
  visualAcuityBoth: string | null; visionCorrected: boolean;
  chiefComplaint: string | null;
}

/** Todo string: son valores de `<input>`, no números hasta que se guardan. */
export interface VitalsState {
  heightFt: string; heightIn: string; heightCm: string;
  weightLbs: string; weightOz: string; weightKg: string;
  systolicMmhg: string; diastolicMmhg: string;
  pulseBpm: string; respiratoryRate: string;
  tempFahrenheit: string; tempCelsius: string;
  painScale: string;
  o2Saturation: string; o2Comment: string; onRoomAir: boolean;
  systolicMmhg2: string; diastolicMmhg2: string;
  pulseBpm2: string; respiratoryRate2: string;
  tempFahrenheit2: string; tempCelsius2: string;
  visualAcuityRight: string; visualAcuityLeft: string; visualAcuityBoth: string;
  visionCorrected: boolean;
  chiefComplaint: string;
}

export const EMPTY_VITALS: VitalsState = {
  heightFt: '', heightIn: '', heightCm: '',
  weightLbs: '', weightOz: '', weightKg: '',
  systolicMmhg: '', diastolicMmhg: '',
  pulseBpm: '', respiratoryRate: '',
  tempFahrenheit: '', tempCelsius: '',
  painScale: '',
  o2Saturation: '', o2Comment: '', onRoomAir: true,
  systolicMmhg2: '', diastolicMmhg2: '',
  pulseBpm2: '', respiratoryRate2: '',
  tempFahrenheit2: '', tempCelsius2: '',
  visualAcuityRight: '', visualAcuityLeft: '', visualAcuityBoth: '',
  visionCorrected: false,
  chiefComplaint: '',
};

// ─── Conversión de unidades ───────────────────────────────────────────────────

function ftInToCm(ft: string, inches: string): string {
  const f = parseFloat(ft) || 0, i = parseFloat(inches) || 0;
  if (!f && !i) return '';
  return String(Math.round((f * 12 + i) * 2.54 * 10) / 10);
}
function cmToFtIn(cm: string): { ft: string; inches: string } {
  const c = parseFloat(cm);
  if (!c || c <= 0) return { ft: '', inches: '' };
  const totalIn = c / 2.54;
  return { ft: String(Math.floor(totalIn / 12)), inches: String(Math.round(totalIn % 12)) };
}
function lbsOzToKg(lbs: string, oz: string): string {
  const l = parseFloat(lbs) || 0, o = parseFloat(oz) || 0;
  if (!l && !o) return '';
  return String(Math.round((l * 16 + o) * 28.3495 / 1000 * 10) / 10);
}
function kgToLbs(kg: string): { lbs: string; oz: string } {
  const k = parseFloat(kg);
  if (!k || k <= 0) return { lbs: '', oz: '0' };
  const totalOz = k * 1000 / 28.3495;
  return { lbs: String(Math.floor(totalOz / 16)), oz: '0' };
}
function fToC(f: string): string {
  const v = parseFloat(f);
  if (isNaN(v)) return '';
  return String(Math.round(((v - 32) * 5 / 9) * 10) / 10);
}
function cToF(c: string): string {
  const v = parseFloat(c);
  if (isNaN(v)) return '';
  return String(Math.round((v * 9 / 5 + 32) * 10) / 10);
}

export function triageToState(tr: TriageRecord | null): VitalsState {
  if (!tr) return EMPTY_VITALS;
  const heightCm = ftInToCm(tr.heightFt?.toString() ?? '', tr.heightIn?.toString() ?? '');
  const weightKg = lbsOzToKg(tr.weightLbs?.toString() ?? '', tr.weightOz?.toString() ?? '');
  const tempC    = fToC(tr.tempFahrenheit?.toString() ?? '');
  const tempC2   = fToC(tr.tempFahrenheit2?.toString() ?? '');
  return {
    heightFt:         tr.heightFt?.toString()         ?? '',
    heightIn:         tr.heightIn?.toString()         ?? '',
    heightCm:         tr.heightCm?.toString()         ?? heightCm,
    weightLbs:        tr.weightLbs?.toString()        ?? '',
    weightOz:         tr.weightOz?.toString()         ?? '',
    weightKg:         tr.weightKg?.toString()         ?? weightKg,
    systolicMmhg:     tr.systolicMmhg?.toString()     ?? '',
    diastolicMmhg:    tr.diastolicMmhg?.toString()    ?? '',
    pulseBpm:         tr.pulseBpm?.toString()         ?? '',
    respiratoryRate:  tr.respiratoryRate?.toString()  ?? '',
    tempFahrenheit:   tr.tempFahrenheit?.toString()   ?? '',
    tempCelsius:      tr.tempCelsius?.toString()      ?? tempC,
    painScale:        tr.painScale?.toString()        ?? '',
    o2Saturation:     tr.o2Saturation?.toString()     ?? '',
    o2Comment:        tr.o2Comment                    ?? '',
    onRoomAir:        tr.onRoomAir,
    systolicMmhg2:    tr.systolicMmhg2?.toString()    ?? '',
    diastolicMmhg2:   tr.diastolicMmhg2?.toString()   ?? '',
    pulseBpm2:        tr.pulseBpm2?.toString()        ?? '',
    respiratoryRate2: tr.respiratoryRate2?.toString() ?? '',
    tempFahrenheit2:  tr.tempFahrenheit2?.toString()  ?? '',
    tempCelsius2:     tr.tempCelsius2?.toString()     ?? tempC2,
    visualAcuityRight:tr.visualAcuityRight            ?? '',
    visualAcuityLeft: tr.visualAcuityLeft             ?? '',
    visualAcuityBoth: tr.visualAcuityBoth             ?? '',
    visionCorrected:  tr.visionCorrected,
    chiefComplaint:   tr.chiefComplaint               ?? '',
  };
}

function stateToPayload(v: VitalsState): Record<string, unknown> {
  const num = (s: string) => s.trim() ? parseFloat(s) : undefined;
  const int = (s: string) => s.trim() ? parseInt(s, 10) : undefined;
  return {
    heightFt:         int(v.heightFt),
    heightIn:         int(v.heightIn),
    weightLbs:        int(v.weightLbs),
    weightOz:         int(v.weightOz),
    systolicMmhg:     int(v.systolicMmhg),
    diastolicMmhg:    int(v.diastolicMmhg),
    pulseBpm:         int(v.pulseBpm),
    respiratoryRate:  int(v.respiratoryRate),
    tempFahrenheit:   num(v.tempFahrenheit),
    painScale:        int(v.painScale),
    o2Saturation:     int(v.o2Saturation),
    o2Comment:        v.o2Comment.trim() || undefined,
    onRoomAir:        v.onRoomAir,
    systolicMmhg2:    int(v.systolicMmhg2),
    diastolicMmhg2:   int(v.diastolicMmhg2),
    pulseBpm2:        int(v.pulseBpm2),
    respiratoryRate2: int(v.respiratoryRate2),
    tempFahrenheit2:  num(v.tempFahrenheit2),
    visualAcuityRight:v.visualAcuityRight.trim() || undefined,
    visualAcuityLeft: v.visualAcuityLeft.trim()  || undefined,
    visualAcuityBoth: v.visualAcuityBoth.trim()  || undefined,
    visionCorrected:  v.visionCorrected,
    // Se reenvía aunque no haya campo que lo edite: viene del wizard de intake y
    // omitirlo lo borraría en cada guardado.
    chiefComplaint:   v.chiefComplaint.trim() || undefined,
  };
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
}

// ─── Átomos del formulario ────────────────────────────────────────────────────

function VitalGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-bg-2/40 p-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-cyan">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">{title}</span>
      </div>
      {children}
    </div>
  );
}

function VField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function VInput({ value, onChange, placeholder, type = 'number', step }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; step?: string;
}) {
  return (
    <input
      type={type}
      step={step}
      value={value}
      onChange={e => onChange(e.target.value)}
      /* Default '—' y no un número de ejemplo: los placeholders eran "5", "150",
         "120", "98.6"… indistinguibles de datos reales de un vistazo. En una
         pantalla clínica eso hace creer que ya se tomaron los signos vitales
         cuando el formulario está vacío. */
      placeholder={placeholder ?? '—'}
      /* disabled: aplica cuando el <fieldset> padre está disabled — borde
         punteado para que se lea como "dato cerrado", no como campo roto */
      className="w-full bg-bg-2 border border-border rounded-md px-2.5 py-1.5 text-center text-[13px] font-semibold text-text-1 placeholder:text-text-muted placeholder:font-normal outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/20 transition-all disabled:border-dashed disabled:text-text-2 disabled:bg-white/[0.02] disabled:cursor-not-allowed"
    />
  );
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between mt-2">
      <span className="text-[11px] text-text-2">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${on ? 'bg-cyan' : 'bg-bg-3 border border-border'}`}
        style={{ height: '18px' }}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm ${on ? 'left-[14px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────

export interface TriageVitalsFormHandle {
  /**
   * Guarda si hay cambios pendientes. Devuelve false SOLO si intentó guardar y
   * el servidor no confirmó — así el caller puede abortar lo que venía después
   * (Day Admission no pasa al paciente a sala si los vitales no se guardaron).
   */
  saveIfDirty: () => Promise<boolean>;
}

export interface TriageVitalsFormProps {
  appointmentId: string;
  /** Triaje ya cargado, o null si nadie lo tomó todavía. */
  initial: TriageRecord | null;
  /** Última corrección, para el chip ámbar de trazabilidad. */
  correction?: { by: string | null; at: string } | null;
  /** El estado en vivo, para quien necesite reflejarlo (el resumen del step 3). */
  onChange?: (v: VitalsState) => void;
  /** Tras un guardado confirmado. */
  onSaved?: () => void;
}

export const TriageVitalsForm = React.forwardRef<TriageVitalsFormHandle, TriageVitalsFormProps>(
  function TriageVitalsForm({ appointmentId, initial, correction = null, onChange, onSaved }, ref) {
    const t = useTranslations('phoenix.admission');

    /**
     * El estado arranca del `initial` y NO se re-sincroniza cuando cambia la prop:
     * el formulario es de quien lo está llenando. Para cambiar de paciente, el
     * contenedor lo remonta con `key={appointmentId}` — si en vez de eso
     * escuchara la prop, un refresco de fondo le borraría lo tipeado, que es
     * exactamente el bug que ya nos pasó con el polling.
     */
    const [vitals, setVitals] = React.useState<VitalsState>(() => triageToState(initial));
    const [dirtyFlag, setDirtyFlag] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [savedOk, setSavedOk] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
    React.useEffect(() => { onChange?.(vitals); }, [vitals, onChange]);

    function dirty(): void { setDirtyFlag(true); setSavedOk(false); }

    function setV<K extends keyof VitalsState>(key: K, val: VitalsState[K]): void {
      setVitals(prev => ({ ...prev, [key]: val }));
      dirty();
    }

    // ── Setters bidireccionales ────────────────────────────────────────────────
    function setHeightFt(val: string): void {
      setVitals(prev => ({ ...prev, heightFt: val, heightCm: ftInToCm(val, prev.heightIn) }));
      dirty();
    }
    function setHeightIn(val: string): void {
      setVitals(prev => ({ ...prev, heightIn: val, heightCm: ftInToCm(prev.heightFt, val) }));
      dirty();
    }
    function setHeightCm(val: string): void {
      const { ft, inches } = cmToFtIn(val);
      setVitals(prev => ({ ...prev, heightCm: val, heightFt: ft, heightIn: inches }));
      dirty();
    }
    function setWeightLbs(val: string): void {
      setVitals(prev => ({ ...prev, weightLbs: val, weightKg: lbsOzToKg(val, prev.weightOz) }));
      dirty();
    }
    function setWeightOz(val: string): void {
      setVitals(prev => ({ ...prev, weightOz: val, weightKg: lbsOzToKg(prev.weightLbs, val) }));
      dirty();
    }
    function setWeightKg(val: string): void {
      const { lbs, oz } = kgToLbs(val);
      setVitals(prev => ({ ...prev, weightKg: val, weightLbs: lbs, weightOz: oz }));
      dirty();
    }
    function setTempF(val: string): void {
      setVitals(prev => ({ ...prev, tempFahrenheit: val, tempCelsius: fToC(val) }));
      dirty();
    }
    function setTempC(val: string): void {
      setVitals(prev => ({ ...prev, tempCelsius: val, tempFahrenheit: cToF(val) }));
      dirty();
    }
    function setTempF2(val: string): void {
      setVitals(prev => ({ ...prev, tempFahrenheit2: val, tempCelsius2: fToC(val) }));
      dirty();
    }
    function setTempC2(val: string): void {
      setVitals(prev => ({ ...prev, tempCelsius2: val, tempFahrenheit2: cToF(val) }));
      dirty();
    }

    /**
     * Guarda los vitales. Devuelve true solo si el servidor confirmó.
     *
     * Antes no se chequeaba `res.ok`: un 500 o la red caída igual marcaban
     * "✓ Saved" y limpiaban el flag de cambios, o sea le mentía a la MA diciendo
     * que el dato clínico quedó guardado cuando no.
     */
    const saveVitals = React.useCallback(async (): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/admission/${appointmentId}/triage`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(stateToPayload(vitals)),
        });
        if (!res.ok) {
          setError(t('vitalsSaveError'));
          return false;
        }
        setDirtyFlag(false);
        setSavedOk(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSavedOk(false), 3000);
        onSaved?.();
        return true;
      } catch {
        setError(t('vitalsSaveError'));
        return false;
      } finally {
        setSaving(false);
      }
    }, [appointmentId, vitals, t, onSaved]);

    React.useImperativeHandle(ref, () => ({
      saveIfDirty: async () => (dirtyFlag ? saveVitals() : true),
    }), [dirtyFlag, saveVitals]);

    return (
      <div className="rounded-lg bg-bg-2/30 p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Activity className="w-4 h-4 text-cyan" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sectionVitals')}</span>
          {correction && (
            <span className="text-[9px] text-amber bg-amber/10 border border-amber/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {correction.by
                ? t('vitalsCorrectedByAt', { name: correction.by, time: fmtTime(correction.at) })
                : t('vitalsCorrectedAt', { time: fmtTime(correction.at) })}
            </span>
          )}
          {dirtyFlag && !savedOk && (
            <span className="ml-auto text-[9px] text-amber bg-amber/10 border border-amber/20 px-2 py-0.5 rounded-full">{t('vitalsUnsaved')}</span>
          )}
          {savedOk && (
            <span className="ml-auto text-[9px] text-emerald bg-emerald/10 border border-emerald/20 px-2 py-0.5 rounded-full">{t('vitalsSavedFlag')}</span>
          )}
        </div>

        {/* fieldset disabled propaga a TODOS los controles internos, así
            no hay que pasarle un prop a cada uno de los ~30 VInput. Los
            inputs matchean :disabled y toman los estilos disabled: */}
        <fieldset className="contents">

        {/* 1ª toma */}
        <div className="text-[9px] uppercase tracking-wider font-bold text-cyan mb-2 flex items-center gap-2 after:flex-1 after:h-px after:bg-cyan/20">
          {t('firstReading')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <VitalGroup icon={<span>📏</span>} title={t('vitHeight')}>
            <div className="grid grid-cols-3 gap-2">
              <VField label={t('vitFeet')}><VInput value={vitals.heightFt} onChange={setHeightFt} /></VField>
              <VField label={t('vitInches')}><VInput value={vitals.heightIn} onChange={setHeightIn} /></VField>
              <VField label={t('vitCms')}><VInput value={vitals.heightCm} onChange={setHeightCm} placeholder="—" /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>⚖️</span>} title={t('vitWeight')}>
            <div className="grid grid-cols-3 gap-2">
              <VField label={t('vitLbs')}><VInput value={vitals.weightLbs} onChange={setWeightLbs} /></VField>
              <VField label={t('vitOz')}><VInput value={vitals.weightOz} onChange={setWeightOz} /></VField>
              <VField label="kg"><VInput value={vitals.weightKg} onChange={setWeightKg} placeholder="—" step="0.1" /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>💓</span>} title={t('vitBloodPressure')}>
            <div className="grid grid-cols-2 gap-2">
              <VField label={t('vitSystolic')}><VInput value={vitals.systolicMmhg} onChange={v => setV('systolicMmhg', v)} /></VField>
              <VField label={t('vitDiastolic')}><VInput value={vitals.diastolicMmhg} onChange={v => setV('diastolicMmhg', v)} /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>🫀</span>} title={t('vitHeartLungs')}>
            <div className="grid grid-cols-2 gap-2">
              <VField label={t('vitPulse')}><VInput value={vitals.pulseBpm} onChange={v => setV('pulseBpm', v)} /></VField>
              <VField label={t('vitRespRate')}><VInput value={vitals.respiratoryRate} onChange={v => setV('respiratoryRate', v)} /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>🌡️</span>} title={t('vitTempPain')}>
            <div className="grid grid-cols-3 gap-2">
              <VField label={t('vitTempF')}><VInput value={vitals.tempFahrenheit} onChange={setTempF} step="0.1" /></VField>
              <VField label={t('vitTempC')}><VInput value={vitals.tempCelsius} onChange={setTempC} step="0.1" /></VField>
              <VField label={t('vitPain')}><VInput value={vitals.painScale} onChange={v => setV('painScale', v)} /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>💨</span>} title={t('vitOxygen')}>
            <div className="grid grid-cols-2 gap-2">
              <VField label={t('vitO2')}><VInput value={vitals.o2Saturation} onChange={v => setV('o2Saturation', v)} /></VField>
              <VField label={t('vitO2Comment')}><VInput value={vitals.o2Comment} onChange={v => setV('o2Comment', v)} placeholder="..." type="text" /></VField>
            </div>
            <Toggle on={!vitals.onRoomAir} onToggle={() => setV('onRoomAir', !vitals.onRoomAir)} label={t('vitOnOxygen')} />
          </VitalGroup>
        </div>

        {/* 2ª toma */}
        <div className="text-[9px] uppercase tracking-wider font-bold text-cyan mb-2 mt-4 flex items-center gap-2 after:flex-1 after:h-px after:bg-cyan/20">
          {t('secondReading')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <VitalGroup icon={<span>💓</span>} title={`${t('vitBloodPressure')} (2)`}>
            <div className="grid grid-cols-2 gap-2">
              <VField label={t('vitSystolic')}><VInput value={vitals.systolicMmhg2} onChange={v => setV('systolicMmhg2', v)} /></VField>
              <VField label={t('vitDiastolic')}><VInput value={vitals.diastolicMmhg2} onChange={v => setV('diastolicMmhg2', v)} /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>🫀</span>} title={`${t('vitHeartLungs')} (2)`}>
            <div className="grid grid-cols-2 gap-2">
              <VField label={t('vitPulse')}><VInput value={vitals.pulseBpm2} onChange={v => setV('pulseBpm2', v)} /></VField>
              <VField label={t('vitRespRate')}><VInput value={vitals.respiratoryRate2} onChange={v => setV('respiratoryRate2', v)} /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>🌡️</span>} title={`${t('vitTempPain')} (2)`}>
            <div className="grid grid-cols-2 gap-2">
              <VField label={t('vitTempF')}><VInput value={vitals.tempFahrenheit2} onChange={setTempF2} step="0.1" /></VField>
              <VField label={t('vitTempC')}><VInput value={vitals.tempCelsius2} onChange={setTempC2} step="0.1" /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>👁️</span>} title={t('vitVision')}>
            <div className="grid grid-cols-3 gap-2">
              <VField label={t('vitVisionRight')}><VInput value={vitals.visualAcuityRight} onChange={v => setV('visualAcuityRight', v)} /></VField>
              <VField label={t('vitVisionLeft')}><VInput value={vitals.visualAcuityLeft} onChange={v => setV('visualAcuityLeft', v)} /></VField>
              <VField label={t('vitVisionBoth')}><VInput value={vitals.visualAcuityBoth} onChange={v => setV('visualAcuityBoth', v)} /></VField>
            </div>
            <Toggle on={vitals.visionCorrected} onToggle={() => setV('visionCorrected', !vitals.visionCorrected)} label={t('vitVisionCorrected')} />
          </VitalGroup>
        </div>

        </fieldset>

        {error && (
          <div className="mt-3 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Barra de guardado — siempre visible: el triaje se puede corregir en
            cualquier momento y el cambio queda auditado */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border gap-2 flex-wrap">
          <span className="text-[10px] text-text-muted">{t('vitalsNote')}</span>
          <button
            type="button"
            onClick={() => void saveVitals()}
            disabled={saving || !dirtyFlag}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan/10 border border-cyan/25 text-cyan text-[11px] font-semibold hover:bg-cyan/18 disabled:opacity-40 transition-colors"
          >
            {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : '💾'}
            {saving ? t('processing') : t('vitalsSaveBtn')}
          </button>
        </div>
      </div>
    );
  },
);
