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
import { Activity, AlertTriangle, Clock, RefreshCw, Save } from 'lucide-react';
import { Button } from '@precision/ui';
import { Section, SectionDivider } from '@/components/ui-phoenix';
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

/**
 * Cada casilla es la MISMA medida en su unidad, no una pareja.
 *
 * Regla de Erick (2026-08-13): «170.00 cm = 5.58 feet = 66.93 inches» y
 * «60.00 kg = 132.28 lbs = 2116.44 oz». Antes FEET+INCHES se leían como un par
 * —5 pies con 7 pulgadas, la forma de la ficha clínica gringa— y por eso al
 * escribir 170 cm salían 5 y 7.
 *
 * ⚠️ **Consecuencia para quien carga los datos**: escribir 5 en FEET y después 7
 * en INCHES ya NO significa 5'7". Son dos medidas distintas y la última gana:
 * quedaría 7 pulgadas = 17.78 cm. Para 5'7" hay que escribir 67 en INCHES (o
 * 170 en CM).
 *
 * `cm` y `kg` son el pivote: son los que la base guarda como número real
 * (`Float`), y las otras casillas se derivan de ellos. Los factores son los
 * exactos, no aproximados, para que los cuatro números cierren entre sí.
 */
const CM_POR_PIE      = 30.48;
const CM_POR_PULGADA  = 2.54;
const LBS_POR_KG      = 2.2046226218;
const OZ_POR_KG       = 35.27396195;

/** Redondeo a 2 decimales, sin arrastrar el `.00` cuando es redondo. */
function dec2(n: number): string {
  if (!isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

/** Valor numérico de un campo, o null si está vacío / no es número. */
function val(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) || n <= 0 ? null : n;
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

/**
 * El par `pies + pulgadas` que se sigue guardando además de los cm.
 *
 * No es redundancia por las dudas: esas dos columnas las leen la **nota impresa**,
 * el triaje de **apps/clinical** (el v2, que sigue en uso) y el SQL de métricas de
 * doctores, y las tres esperan la lectura de par (5 ft 7 in). Cambiarles el
 * significado habría sido una migración de tres consumidores para un cambio de
 * pantalla. Los cm son el valor real, así que el par sale derivado de ellos y
 * ninguno de los dos miente.
 */
function cmToPar(cm: number): { ft: number; inches: number } {
  const totalIn = cm / CM_POR_PULGADA;
  return { ft: Math.floor(totalIn / 12), inches: Math.round(totalIn % 12) };
}
function kgToPar(kg: number): { lbs: number; oz: number } {
  const totalOz = kg * OZ_POR_KG;
  return { lbs: Math.floor(totalOz / 16), oz: Math.round(totalOz % 16) };
}

export function triageToState(tr: TriageRecord | null): VitalsState {
  if (!tr) return EMPTY_VITALS;

  /**
   * Los cm y los kg son el valor real; el resto se deriva de ellos al mostrar.
   *
   * Si una fila vieja no los tiene (se guardó solo el par), se reconstruyen
   * leyendo ese par como lo que era: 5 ft 7 in = 5·12+7 pulgadas.
   */
  const cm = tr.heightCm
    ?? (((tr.heightFt ?? 0) * 12 + (tr.heightIn ?? 0)) * CM_POR_PULGADA || null);
  const kg = tr.weightKg
    ?? ((((tr.weightLbs ?? 0) * 16 + (tr.weightOz ?? 0)) / OZ_POR_KG) || null);

  const tempC  = fToC(tr.tempFahrenheit?.toString() ?? '');
  const tempC2 = fToC(tr.tempFahrenheit2?.toString() ?? '');
  return {
    heightFt:         cm ? dec2(cm / CM_POR_PIE)     : '',
    heightIn:         cm ? dec2(cm / CM_POR_PULGADA) : '',
    heightCm:         cm ? dec2(cm)                  : '',
    weightLbs:        kg ? dec2(kg * LBS_POR_KG)     : '',
    weightOz:         kg ? dec2(kg * OZ_POR_KG)      : '',
    weightKg:         kg ? dec2(kg)                  : '',
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

  /**
   * Se manda el valor real (cm/kg) Y el par entero que esperan los otros
   * consumidores. El par se calcula del pivote, no de lo que muestra la casilla:
   * `heightFt` en pantalla es "5.58 pies en total", que como columna `Int` se
   * truncaría a 5 y perdería 7 pulgadas.
   */
  const cm = val(v.heightCm);
  const kg = val(v.weightKg);
  const parAltura = cm ? cmToPar(cm) : null;
  const parPeso   = kg ? kgToPar(kg) : null;

  return {
    heightCm:         cm ?? undefined,
    heightFt:         parAltura?.ft,
    heightIn:         parAltura?.inches,
    weightKg:         kg ?? undefined,
    weightLbs:        parPeso?.lbs,
    weightOz:         parPeso?.oz,
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

/**
 * Tarjeta de un grupo de vitales.
 *
 * El título va en una BARRA con su línea, no flotando sobre los campos: era una
 * de las tres cosas que hacían ver más ordenado a v2 (comparación con Erick,
 * 2026-08-13). `h-full` para que las dos columnas queden del mismo alto y la
 * grilla tenga un ritmo parejo — la otra.
 */
function VitalGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-bg-2/40 p-3 h-full flex flex-col gap-2.5">
      <div className="flex items-center gap-2 pb-2 border-b border-row-sep">
        <span className="text-cyan text-[12px] leading-none">{icon}</span>
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

    /**
     * Un setter por casilla: se conserva EXACTO lo que se tipeó y se recalculan
     * las otras dos desde el pivote (cm / kg).
     *
     * Nunca se reescribe la casilla que el usuario está usando: redondearle el
     * texto mientras escribe hace saltar el cursor y pelea con el teclado.
     */
    function setAltura(campo: 'heightFt' | 'heightIn' | 'heightCm', texto: string): void {
      const n = val(texto);
      const cm = n === null ? null
        : campo === 'heightCm' ? n
        : campo === 'heightFt' ? n * CM_POR_PIE
        : n * CM_POR_PULGADA;
      setVitals(prev => ({
        ...prev,
        heightFt: campo === 'heightFt' ? texto : cm ? dec2(cm / CM_POR_PIE)     : '',
        heightIn: campo === 'heightIn' ? texto : cm ? dec2(cm / CM_POR_PULGADA) : '',
        heightCm: campo === 'heightCm' ? texto : cm ? dec2(cm)                  : '',
      }));
      dirty();
    }

    function setPeso(campo: 'weightLbs' | 'weightOz' | 'weightKg', texto: string): void {
      const n = val(texto);
      const kg = n === null ? null
        : campo === 'weightKg'  ? n
        : campo === 'weightLbs' ? n / LBS_POR_KG
        : n / OZ_POR_KG;
      setVitals(prev => ({
        ...prev,
        weightLbs: campo === 'weightLbs' ? texto : kg ? dec2(kg * LBS_POR_KG) : '',
        weightOz:  campo === 'weightOz'  ? texto : kg ? dec2(kg * OZ_POR_KG)  : '',
        weightKg:  campo === 'weightKg'  ? texto : kg ? dec2(kg)              : '',
      }));
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

    /**
     * Lo que va a la derecha del encabezado: el estado de guardado y el botón.
     *
     * Antes el aviso "Sin guardar" colgaba de un `ml-auto` en la misma fila del
     * título y el botón vivía en una barra propia al pie. Ahora el bloque tiene
     * UN solo lugar de acción, que es la regla de la barra de Férulas y Labs.
     */
    const accion = (
      <>
        {correction && (
          <span className="hidden sm:flex text-[9px] text-amber bg-amber/10 border border-amber/30 px-2 py-0.5 rounded-full items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {correction.by
              ? t('vitalsCorrectedByAt', { name: correction.by, time: fmtTime(correction.at) })
              : t('vitalsCorrectedAt', { time: fmtTime(correction.at) })}
          </span>
        )}
        {dirtyFlag && !savedOk && (
          <span className="text-[9px] text-amber bg-amber/10 border border-amber/20 px-2 py-0.5 rounded-full">{t('vitalsUnsaved')}</span>
        )}
        {savedOk && (
          <span className="text-[9px] text-emerald bg-emerald/10 border border-emerald/20 px-2 py-0.5 rounded-full">{t('vitalsSavedFlag')}</span>
        )}
        <Button
          variant="outline"
          onClick={() => void saveVitals()}
          disabled={saving || !dirtyFlag}
          className="h-7 px-2.5 text-[11px] gap-1.5"
        >
          {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saving ? t('processing') : t('vitalsSaveBtn')}
        </Button>
      </>
    );

    return (
      <Section
        icon={Activity}
        title={t('sectionVitals')}
        tone="cyan"
        action={accion}
        collapsible
        storageKey="triage-vitals"
      >
        {/* fieldset disabled propaga a TODOS los controles internos, así
            no hay que pasarle un prop a cada uno de los ~30 VInput. Los
            inputs matchean :disabled y toman los estilos disabled: */}
        <fieldset className="contents">

        {/* La 1ª toma no lleva rótulo: es lo que se ve al abrir el bloque, y un
            título ahí competía con el de la sección. El corte aparece solo cuando
            empieza la segunda tanda. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch">
          <VitalGroup icon={<span>📏</span>} title={t('vitHeight')}>
            <div className="grid grid-cols-3 gap-2">
              <VField label={t('vitFeet')}><VInput value={vitals.heightFt} onChange={v => setAltura('heightFt', v)} step="0.01" /></VField>
              <VField label={t('vitInches')}><VInput value={vitals.heightIn} onChange={v => setAltura('heightIn', v)} step="0.01" /></VField>
              <VField label={t('vitCms')}><VInput value={vitals.heightCm} onChange={v => setAltura('heightCm', v)} placeholder="—" step="0.01" /></VField>
            </div>
          </VitalGroup>
          <VitalGroup icon={<span>⚖️</span>} title={t('vitWeight')}>
            <div className="grid grid-cols-3 gap-2">
              <VField label={t('vitLbs')}><VInput value={vitals.weightLbs} onChange={v => setPeso('weightLbs', v)} step="0.01" /></VField>
              <VField label={t('vitOz')}><VInput value={vitals.weightOz} onChange={v => setPeso('weightOz', v)} step="0.01" /></VField>
              <VField label="kg"><VInput value={vitals.weightKg} onChange={v => setPeso('weightKg', v)} placeholder="—" step="0.01" /></VField>
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

        <SectionDivider label={t('secondReading')} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch">
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

        {/* La nota de las conversiones se queda al pie, sin la barra que la
            acompañaba: el botón de guardar subió al encabezado de la sección y
            dejar una línea horizontal para una sola frase era una frontera de
            más. Sigue visible porque explica por qué se mueven tres casillas
            cuando se escribe en una. */}
        <p className="text-[10px] text-text-muted mt-3.5 mb-0">{t('vitalsNote')}</p>
      </Section>
    );
  },
);
