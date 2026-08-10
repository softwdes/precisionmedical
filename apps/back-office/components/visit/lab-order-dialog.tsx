'use client';

/**
 * LabOrderDialog — nueva orden de laboratorio / imagen / cardiología (B.20 · L3).
 *
 * Mismos campos que el formulario del v2 (médico, fecha de muestra, tipo de
 * facturación, estudios, diagnósticos) más lo que faltaba para que sirva
 * clínicamente: urgencia, indicación clínica y dónde se toma la muestra.
 *
 * El médico NO se elige: es el doctor de la sesión.
 * Los diagnósticos vienen pre-cargados de la nota — el doctor ya los eligió ahí.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Button,
} from '@precision/ui';
import {
  Search, X, Plus, Loader2, FlaskConical, AlertTriangle,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { DatePicker } from '@/components/ui-phoenix/date-picker';
import { FloatingPanel } from '@/components/ui-phoenix/floating-panel';
import type { DiagnosisRow } from './diagnosis-picker';

export type LabCategory = 'LABORATORY' | 'IMAGING' | 'CARDIOLOGY';

export interface CatalogStudy {
  id: number;
  code: string;
  name: string;
  category: string;
  loinc?: string | null;
  /** Precio al paciente. null = sin precio cargado en el catálogo. */
  price?: number | null;
  priceNote?: string | null;
}

export interface SelectedStudy {
  code: string;
  name: string;
  category: LabCategory;
  loinc?: string | null;
  /** Precio al paciente — se muestra al armar la orden (la clínica lo cobra) */
  price?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  onCreate: (payload: {
    studies: SelectedStudy[];
    clinicalIndication: string;
    urgency: 'STAT' | 'URGENT' | 'ROUTINE';
    billingType: string | null;
    collectionSite: 'IN_HOUSE' | 'EXTERNAL';
    sampleDate: string | null;
    preferredCenter: string | null;
    icd10Codes: string[];
    /** Médico solicitante elegido (null = el de la cita) */
    providerId: string | null;
  }) => Promise<void>;
  /** Doctor de la cita — sale preseleccionado como solicitante */
  defaultProviderId?: string | null;
}

/**
 * LabCorp SIEMPRE le factura a la clínica (Erick 2026-08-08): la clínica compra
 * el estudio al costo y se lo revende al paciente al precio público. Por eso el
 * tipo de facturación es CONSTANTE y salió del formulario — no es una
 * preferencia, es la única opción correcta. Marcar "Patient" haría que LabCorp
 * le facture al paciente además de lo que ya le cobra la clínica: doble cobro.
 * Se sigue enviando para que la hoja impresa se lo diga al laboratorio.
 */
const BILLING_TYPE = 'CLIENT' as const;
const URGENCIES = ['ROUTINE', 'URGENT', 'STAT'] as const;

const todayKey = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

export function LabOrderDialog({ open, onClose, userId, onCreate, defaultProviderId = null }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  // ── Médico solicitante ──────────────────────────────────────────────────
  // Arranca en el doctor de la cita y se puede cambiar: si el paciente vuelve
  // otro día por la muestra y ese doctor no está, la firma quien esté.
  const [providers, setProviders] = React.useState<Array<{ id: string; label: string }>>([]);
  const [providerId, setProviderId] = React.useState<string>('');
  React.useEffect(() => {
    if (!open) return;
    fetch('/api/admin/providers?status=ACTIVE&limit=100')
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d: { providers?: Array<{ id: string; firstName: string; lastName: string }> }) =>
        setProviders((d.providers ?? []).map((p) => ({ id: p.id, label: `Dr. ${p.firstName} ${p.lastName}` }))))
      .catch(() => undefined);
  }, [open]);

  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<CatalogStudy[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [studies, setStudies] = React.useState<SelectedStudy[]>([]);

  const [indication, setIndication] = React.useState('');
  const [urgency, setUrgency] = React.useState<'STAT' | 'URGENT' | 'ROUTINE'>('ROUTINE');
  /** Centro preferido e indicación clínica: útiles pero rara vez necesarios —
   *  se piden bajo "Más opciones" para que el formulario se lea de un vistazo. */
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [collectionSite, setCollectionSite] = React.useState<'IN_HOUSE' | 'EXTERNAL'>('EXTERNAL');
  const [sampleDate, setSampleDate] = React.useState(todayKey);
  const [center, setCenter] = React.useState('');
  const [dx, setDx] = React.useState<string[]>([]);

  // ── Diagnósticos: buscador INLINE, no un modal encima del modal ──────────
  // v2 lo resuelve con una lista desplegable dentro del mismo formulario y se
  // lee mucho más ordenado (Erick 2026-08-08). Mismo patrón que el buscador de
  // estudios: desplegable flotante que no empuja el formulario.
  const [dxOpen, setDxOpen] = React.useState(false);
  const [dxQ, setDxQ] = React.useState('');
  const [dxResults, setDxResults] = React.useState<DiagnosisRow[]>([]);
  const [dxSearching, setDxSearching] = React.useState(false);
  const dxInputRef = React.useRef<HTMLInputElement>(null);
  const dxWasFocusedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open || !dxOpen) return;
    const controller = new AbortController();
    const id = setTimeout(() => {
      setDxSearching(true);
      const params = new URLSearchParams({ limit: '20', page: '1' });
      if (dxQ.trim()) params.set('q', dxQ.trim());
      if (userId) params.set('userId', userId);
      fetch(`/api/admin/diagnoses?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d: { diagnoses?: DiagnosisRow[] }) => setDxResults(d.diagnoses ?? []))
        .catch(() => undefined)
        .finally(() => setDxSearching(false));
    }, 250);
    return () => { clearTimeout(id); controller.abort(); };
  }, [open, dxOpen, dxQ, userId]);

  const addDx = (row: DiagnosisRow): void => {
    const label = `${row.icd10Code} - ${row.icd10Description}`.trim();
    setDx((prev) => (prev.includes(label) ? prev : [...prev, label]));
    // Igual que los labs: elegir CIERRA la lista; otro clic la reabre para
    // seguir agregando.
    setDxQ('');
    setDxOpen(false);
  };

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // La lista del catálogo se muestra recién cuando el usuario hace clic en el
  // buscador — cerrada por defecto para que el formulario respire
  const [listOpen, setListOpen] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  /** Anclas de los dos desplegables (se dibujan en un portal, ver FloatingPanel) */
  const labAnchorRef = React.useRef<HTMLDivElement>(null);
  const dxAnchorRef = React.useRef<HTMLDivElement>(null);
  /** ¿El input ya estaba enfocado ANTES de este clic? (mousedown corre primero) */
  const wasFocusedRef = React.useRef(false);

  // Al abrir: estado limpio. SOLO depende de `open` — antes dependía también
  // de `seedDiagnoses`, y como los callers suelen construir ese array inline
  // (identidad nueva por render), CUALQUIER re-render del padre volvía a
  // ejecutar el reset y vaciaba los resultados del catálogo ya cargados (el
  // "No matches" fantasma que reportó Erick). Mismo patrón del bug del
  // Autocomplete: deps de objeto inestable.
  React.useEffect(() => {
    if (!open) return;
    setListOpen(false);
    setProviderId(defaultProviderId ?? '');
    setDxQ(''); setDxResults([]); setDxOpen(false);
    setQ(''); setResults([]); setStudies([]);
    setIndication(''); setUrgency('ROUTINE'); setMoreOpen(false);
    setCollectionSite('EXTERNAL'); setSampleDate(todayKey()); setCenter('');
    setError(null);
  }, [open]);

  /*
   * Los diagnósticos NO se precargan desde la nota (Erick 2026-08-08: "si es
   * una orden nueva solo debería aparecer lo que se selecciona").
   * Antes se sembraban con los dx de la nota para ahorrar tipeo, pero eran
   * diagnósticos que nadie eligió PARA ESTA orden y terminaban impresos en la
   * hoja del laboratorio sin que nadie los revisara.
   */

  // Búsqueda en el catálogo (96 estudios migrados del v2), debounced
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const id = setTimeout(() => {
      setSearching(true);
      // Sin filtro de categoría: se busca sobre TODO el catálogo (231 labs +
      // 12 de imagen/cardiología). Los no-laboratorio se marcan en su fila.
      const params = new URLSearchParams({ limit: '30' });
      if (q.trim()) params.set('q', q.trim());
      fetch(`/api/admin/lab-catalog/search?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d: { results?: CatalogStudy[] }) => setResults(d.results ?? []))
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(id); controller.abort(); };
  }, [open, q]);

  const addStudy = (s: CatalogStudy): void => {
    if (studies.some((x) => x.code === s.code)) return;
    setStudies((prev) => [...prev, {
      code: s.code, name: s.name, category: s.category as LabCategory,
      loinc: s.loinc ?? null, price: s.price ?? null,
    }]);
    // Como un <select>: elegir CIERRA la lista (pedido de Erick). Para agregar
    // otro estudio, un clic más en el buscador la vuelve a abrir.
    setListOpen(false);
  };

  const handleSave = async (): Promise<void> => {
    if (studies.length === 0) { setError(t('labErrNoStudies')); return; }
    setSaving(true); setError(null);
    try {
      await onCreate({
        studies,
        clinicalIndication: indication.trim(),
        urgency,
        billingType: BILLING_TYPE,
        collectionSite,
        sampleDate: sampleDate || null,
        preferredCenter: collectionSite === 'EXTERNAL' ? (center.trim() || null) : null,
        icd10Codes: dx,
        providerId: providerId || null,
      });
      onClose();
    } catch {
      setError(t('labErrSave'));
    } finally {
      setSaving(false);
    }
  };

  // Sin bordes en todo el formulario (regla de Erick 2026-08-08): los campos
  // se distinguen por FONDO (bg-bg-2) y el foco por ring suave, no por borde.
  const fieldBase = 'rounded-md bg-bg-2 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40';
  /**
   * Controles segmentados que LLENAN su columna. Antes eran píldoras sueltas de
   * ancho variable: las dos columnas nunca se alineaban y el formulario se veía
   * improvisado al lado del v2, donde todos los controles son la misma caja.
   * Un solo carril `h-9` (igual que los inputs) con los segmentos en flex-1.
   */
  const segTrack = 'flex h-9 rounded-md bg-bg-2 p-0.5 gap-0.5';
  const segItem = 'flex-1 rounded text-[12px] font-semibold transition-colors flex items-center justify-center gap-1.5';
  const labelCls = 'text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        {/* Más angosto que antes (era 3xl): con 2 columnas en menos ancho la
            rejilla se percibe más firme — es parte de por qué el v2 se veía
            más ordenado. */}
        <DialogContent className="max-w-2xl p-0 max-h-[92vh] flex flex-col">
          <DialogHeader className="px-4 sm:px-5 py-3 border-b border-border shrink-0">
            <DialogTitle className="text-sm font-semibold text-text-1 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet" /> {t('labNewTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="px-4 sm:px-5 py-4 space-y-4 overflow-y-auto">

            {/* Médico solicitante — primero, como en v2. Sale preseleccionado
                el doctor de la cita y se puede cambiar: si el paciente vuelve
                otro día por la muestra y ese doctor no está, firma quien esté.
                El nombre que se imprime lo resuelve el server por ID. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('labOrderingProvider')}</label>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className={`w-full h-9 px-3 ${fieldBase}`}
                >
                  <option value="">{t('labProviderFromVisit')}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('labSampleDate')}</label>
                <DatePicker
                  value={sampleDate}
                  onChange={setSampleDate}
                  accent="violet"
                  size="sm"
                  todayKey={todayKey()}
                  todayLabel={t('dayToday')}
                  /* La fecha en números y nunca la palabra "Hoy" (Erick
                     2026-08-08). El ORDEN lo decide el idioma de la app, que es
                     lo correcto: en inglés sale mes/día/año (EE.UU.) y en
                     español día/mes/año (Latinoamérica) — lo resuelve `Intl`
                     con el locale, no hay que elegirlo a mano. */
                  labelFormat="numeric"
                  alwaysShowDate
                  className="[&>button]:w-full [&>button]:h-9 [&>button]:justify-start [&>button]:bg-bg-2 [&>button]:border-0 [&>button]:rounded-md"
                />
              </div>
            </div>

            {/* SIN pestañas de categoría (Erick 2026-08-08): de los 243
                estudios, 231 son laboratorio y solo 12 imagen/cardiología —
                tres pestañas no se ganaban una fila entera. El buscador recorre
                todo el catálogo y los pocos que no son laboratorio se marcan
                con un badge en su fila. */}

            {/* Buscador del catálogo + resultados.
                La lista aparece recién al hacer CLIC en el buscador (feedback
                de Erick 2026-08-08): mostrarla siempre robaba media pantalla y
                el formulario se leía como una lista, no como un formulario.
                Sin caja con borde — regla general de Erick, nada de bordes. */}
            {/* Labs y Diagnósticos LADO A LADO, como el v2 (Erick 2026-08-08):
                cada columna con su buscador desplegable y debajo la lista de lo
                elegido. Los dos bloques leen igual, así que el formulario se ve
                como una sola rejilla. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">

            {/* ── Columna 1 · Laboratorios ── */}
            <div
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setListOpen(false);
              }}
            >
              <label className={labelCls}>{t('labStudies')}</label>
              {/* La lista sale en un PORTAL anclado a este div: dentro del
                  diálogo un desplegable `absolute` queda recortado por el
                  scroll del cuerpo (se veían dos filas y media). */}
              <div className="relative" ref={labAnchorRef}>
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  value={q}
                  // Escribir abre la lista (camino de teclado)
                  onChange={(e) => { setQ(e.target.value); setListOpen(true); }}
                  // NO se abre con `onFocus`: el diálogo de Radix autoenfoca el
                  // primer campo al montar, y el formulario aparecía con el
                  // catálogo ya desplegado tapando todo. Se abre solo con un
                  // clic deliberado — y un segundo clic la contrae.
                  onMouseDown={() => {
                    wasFocusedRef.current = document.activeElement === searchRef.current;
                  }}
                  onClick={() => setListOpen((o) => (wasFocusedRef.current ? !o : true))}
                  placeholder={t('labSearchPlaceholder')}
                  className={`w-full h-9 pl-9 pr-3 ${fieldBase}`}
                />

                <FloatingPanel anchorRef={labAnchorRef} open={listOpen}>
                  <div>
                  {searching && results.length === 0 && (
                    <div className="px-3 py-3 text-[12px] text-text-muted flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('labSearching')}
                    </div>
                  )}
                  {!searching && results.length === 0 && (
                    <div className="px-3 py-3 text-[12px] text-text-muted">{t('labNoResults')}</div>
                  )}
                  {results.map((r) => {
                    const picked = studies.some((s) => s.code === r.code);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        // preventDefault en mousedown: el foco se queda en el
                        // buscador, la lista no se cierra y se pueden agregar
                        // varios estudios seguidos (patrón combobox)
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addStudy(r)}
                        disabled={picked}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12.5px] transition-colors ${
                          picked ? 'opacity-40 cursor-default' : 'hover:bg-violet/[0.06]'
                        }`}
                      >
                        <span className="font-mono text-[11px] text-cyan shrink-0 w-[68px]">{r.code}</span>
                        <span className="text-text-1 flex-1 min-w-0 truncate">{r.name}</span>
                        {/* Los 12 que no son laboratorio se marcan acá — es lo
                            que reemplaza a las pestañas de categoría */}
                        {r.category !== 'LABORATORY' && (
                          <span className="shrink-0 text-[9.5px] uppercase tracking-wide font-semibold text-cyan/80">
                            {t(`labCat_${r.category as LabCategory}`)}
                          </span>
                        )}
                        {/* El precio, a la vista ANTES de agregarlo: la clínica
                            cobra el estudio y el paciente suele decidir por el
                            precio. Sin precio cargado se dice, no se finge $0. */}
                        <span className={`shrink-0 text-[11px] tabular-nums ${r.price != null ? 'text-emerald' : 'text-text-muted'}`}>
                          {r.price != null ? `$${r.price.toFixed(2)}` : (r.priceNote ?? t('labNoPrice'))}
                        </span>
                        {!picked && <Plus className="w-3.5 h-3.5 text-violet shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                </FloatingPanel>
              </div>

              {/* Seleccionados como LISTA, no como chips sueltos: una línea por
                  estudio con su precio y el total abajo. Se lee como una
                  cotización — que es exactamente lo que el paciente decide. */}
              {studies.length > 0 && (
                <div className="mt-2 rounded-md bg-bg-2/40 overflow-hidden">
                  {studies.map((s) => (
                    <div key={s.code} className="px-3 py-1.5 flex items-center gap-2 text-[12.5px]">
                      <span className="font-mono text-[11px] text-violet shrink-0 w-[68px]">{s.code}</span>
                      <span className="text-text-1 flex-1 min-w-0 truncate">{s.name}</span>
                      <span className={`shrink-0 text-[11.5px] tabular-nums ${s.price != null ? 'text-emerald' : 'text-text-muted'}`}>
                        {s.price != null ? `$${s.price.toFixed(2)}` : t('labNoPrice')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setStudies((prev) => prev.filter((x) => x.code !== s.code))}
                        className="text-text-muted hover:text-rose shrink-0"
                        aria-label={t('labRemoveStudy')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div className="px-3 py-1.5 flex items-center justify-end gap-2 text-[11px] text-text-muted bg-bg-2/60">
                    {studies.some((x) => x.price == null) && (
                      <span className="text-amber mr-auto">{t('labSomeNoPrice')}</span>
                    )}
                    {t('labOrderTotal')}
                    <b className="text-emerald text-[12.5px] tabular-nums">
                      ${studies.reduce((s, x) => s + (x.price ?? 0), 0).toFixed(2)}
                    </b>
                  </div>
                </div>
              )}
            </div>

            {/* ── Columna 2 · Diagnósticos (ICD-10) ──
                EXACTAMENTE el mismo control que Labs (Erick 2026-08-08: "la
                misma vista de v2"): un selector que despliega la lista, y
                debajo lo elegido en filas. Antes era chips + un botón chico
                y las dos columnas no se parecían — eso rompía la simetría. */}
            <div
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDxOpen(false);
              }}
            >
              <label className={labelCls}>{t('labDiagnoses')}</label>
              <div className="relative" ref={dxAnchorRef}>
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={dxInputRef}
                  value={dxQ}
                  onChange={(e) => { setDxQ(e.target.value); setDxOpen(true); }}
                  onMouseDown={() => {
                    dxWasFocusedRef.current = document.activeElement === dxInputRef.current;
                  }}
                  onClick={() => setDxOpen((o) => (dxWasFocusedRef.current ? !o : true))}
                  placeholder={t('dxSelectPlaceholder')}
                  className={`w-full h-9 pl-9 pr-3 ${fieldBase}`}
                />

                <FloatingPanel anchorRef={dxAnchorRef} open={dxOpen}>
                  <div>
                    {dxSearching && dxResults.length === 0 && (
                      <div className="px-3 py-3 text-[12px] text-text-muted flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('labSearching')}
                      </div>
                    )}
                    {!dxSearching && dxResults.length === 0 && (
                      <div className="px-3 py-3 text-[12px] text-text-muted">{t('labNoResults')}</div>
                    )}
                    {dxResults.map((row) => {
                      const picked = dx.some((d) => d.startsWith(`${row.icd10Code} `));
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addDx(row)}
                          disabled={picked}
                          className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12.5px] transition-colors ${
                            picked ? 'opacity-40 cursor-default' : 'hover:bg-cyan/[0.08]'
                          }`}
                        >
                          <span className="font-mono text-[11px] text-cyan shrink-0 w-[68px]">{row.icd10Code}</span>
                          <span className="text-text-1 flex-1 min-w-0 truncate">{row.icd10Description}</span>
                          {!picked && <Plus className="w-3.5 h-3.5 text-violet shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </FloatingPanel>
              </div>

              {/* Elegidos — mismas filas que la columna de labs */}
              {dx.length > 0 && (
                <div className="mt-2 rounded-md bg-bg-2/40 overflow-hidden">
                  {dx.map((d) => {
                    // Se guardan como "CÓDIGO - Descripción" (así viajan a la
                    // hoja impresa); se parten solo para mostrarlos en columnas.
                    const sep = d.indexOf(' - ');
                    const code = sep > 0 ? d.slice(0, sep) : d;
                    const desc = sep > 0 ? d.slice(sep + 3) : '';
                    return (
                      <div key={d} className="px-3 py-1.5 flex items-center gap-2 text-[12.5px]">
                        <span className="font-mono text-[11px] text-cyan shrink-0 w-[68px]">{code}</span>
                        <span className="text-text-1 flex-1 min-w-0 truncate">{desc}</span>
                        <button
                          type="button"
                          onClick={() => setDx((prev) => prev.filter((x) => x !== d))}
                          className="text-text-muted hover:text-rose shrink-0"
                          aria-label={t('dxRemove')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            </div>{/* ── fin de la rejilla Labs | Diagnósticos ── */}

            {/* Más opciones — todo lo que NO se toca en el caso normal.
                Urgencia y toma de muestra bajaron acá (Erick: "quita urgency,
                patient goes… no hacen falta"): el 95% de las órdenes son
                rutina y el valor por defecto es correcto. No se eliminaron
                porque los DOS se imprimen en la hoja y STAT es seguridad
                clínica — el laboratorio lo procesa primero.
                Al lado del título va el resumen de lo que va a salir impreso,
                para que un valor escondido nunca sea una sorpresa. */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-text-2 hover:text-violet transition-colors"
                >
                  {moreOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {t('labMoreOptions')}
                </button>
                {!moreOpen && (
                  <span className="text-[11px] text-text-muted">
                    · <span className={urgency === 'STAT' ? 'text-rose font-semibold' : urgency === 'URGENT' ? 'text-amber font-semibold' : ''}>
                      {t(`labUrgency_${urgency}`)}
                    </span>
                    {' · '}{t(`labCollection_${collectionSite}`)}
                  </span>
                )}
              </div>

              {moreOpen && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('labUrgency')}</label>
                      <div className={segTrack}>
                        {URGENCIES.map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setUrgency(u)}
                            className={`${segItem} ${
                              urgency === u
                                ? u === 'STAT'
                                  ? 'bg-rose/15 text-rose'
                                  : u === 'URGENT'
                                    ? 'bg-amber/15 text-amber'
                                    : 'bg-violet/15 text-violet'
                                : 'text-text-muted hover:text-text-1'
                            }`}
                          >
                            {t(`labUrgency_${u}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{t('labCollection')}</label>
                      <div className={segTrack}>
                        {(['IN_HOUSE', 'EXTERNAL'] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCollectionSite(c)}
                            className={`${segItem} ${
                              collectionSite === c
                                ? 'bg-violet/15 text-violet'
                                : 'text-text-muted hover:text-text-1'
                            }`}
                          >
                            {t(`labCollection_${c}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Centro preferido — solo si el paciente va afuera */}
                  {collectionSite === 'EXTERNAL' && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                        {t('labCenter')}
                      </label>
                      <input
                        value={center}
                        onChange={(e) => setCenter(e.target.value)}
                        placeholder={t('labCenterPlaceholder')}
                        className={`w-full h-9 px-3 ${fieldBase}`}
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                      {t('labIndication')}
                    </label>
                    <textarea
                      value={indication}
                      onChange={(e) => setIndication(e.target.value)}
                      rows={3}
                      placeholder={t('labIndicationPlaceholder')}
                      className={`w-full px-3 py-2 resize-y ${fieldBase}`}
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-4 sm:px-5 py-3 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t('tplCancel')}</Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="w-full sm:w-auto gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {t('labCreate', { count: studies.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* El DiagnosisPicker modal se retiró: los diagnósticos se buscan inline
          dentro del formulario (un modal encima de otro modal se veía y se
          sentía desordenado). El picker completo sigue vivo para la nota. */}
    </>
  );
}
