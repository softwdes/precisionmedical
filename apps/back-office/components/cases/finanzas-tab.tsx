'use client';
import { localeApp } from '@/lib/fechas';

/**
 * FinanzasTab — Resumen financiero del caso.
 * KPIs · tabla expandible por cita · modal pago con distribución
 */

import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslations } from 'next-intl';
import {
  DollarSign, ChevronRight, ChevronDown, Loader2, RefreshCw,
  Trash2, CreditCard, FileText, X, ChevronUp, Shield,
} from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { EmptyState, FloatingPanel } from '@/components/ui-phoenix';
import { StatusPill, type StatusState } from '@/components/ui-phoenix/status-pill';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BillingPayment {
  id: string;
  amount: number;
  /** Lo PERDONADO en ese mismo cobro. Baja el saldo y no cuenta como cobrado. */
  discount: number;
  source: 'INSURANCE' | 'PATIENT' | 'LAWYER';
  paymentType: string | null;
  method: 'CHECK' | 'CARD' | 'CASH' | 'TRANSFER' | 'NONE';
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  insuranceCarrier: { id: string; name: string } | null;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface BillingRecord {
  id: string;
  /** PATIENT = se cobra en caja · INSURANCE = lo cobra Cobranzas después */
  payer: 'PATIENT' | 'INSURANCE';
  /** Qué es el cargo: laboratorio, efectivo, férula o CPT. */
  origin?: 'LAB' | 'CASH' | 'BRACE' | 'CPT';
  appointmentId: string | null;
  appointmentDate: string | null;
  appointmentStatus: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
  totalCost: number;
  discount: number;
  insuranceCovered: number;
  amountPaid: number;
  balanceDue: number;
  /**
   * Vino del v2 — **procedencia, no comportamiento**.
   *
   * Tuvo su propia sección de solo lectura al pie durante un día. Se eliminó el
   * 16-sep: "la clínica no sabe qué es ni para qué es un cargo migrado; quieren
   * ver todos esos pagos y cobranzas como si fueran propios de v3" (Erick). Así
   * que estos cargos entran en las listas y los totales como cualquier otro, y
   * quien decide dónde caen es `payer`, igual que para los nacidos en v3.
   *
   * El campo se queda porque es trazabilidad: sirve para auditar de dónde salió
   * una cifra. **No debe volver a usarse para decidir qué se muestra.**
   */
  migratedFromV2?: boolean;
  payments: BillingPayment[];
}

/** Un pago ya registrado, plano — el historial que ve el mostrador. */
interface PaymentRow {
  id: string;
  billingId: string;
  amount: number;
  /** Lo PERDONADO en ese mismo cobro. Baja el saldo y no cuenta como cobrado. */
  discount: number;
  source: 'INSURANCE' | 'PATIENT' | 'LAWYER';
  method: 'CHECK' | 'CARD' | 'CASH' | 'TRANSFER' | 'NONE';
  paymentType: string | null;
  insuranceCarrier: { id: string; name: string } | null;
  notes: string | null;
  paidAt: string;
  appointmentId: string | null;
  appointmentDate: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
}

interface CaseInsurance { id: string; name: string; label: string }
/**
 * `patientBalance` / `insuranceBalance` — el saldo NO es uno solo: lo del
 * paciente se cobra en el momento, lo del seguro/abogado lo gestiona el
 * encargado después y puede tardar meses (regla de Erick 2026-08-08).
 */
interface Kpis {
  totalCost: number; totalPaid: number; totalBalance: number;
  patientBalance: number; insuranceBalance: number;
  /** Lo cobrado, por quién lo puso — un copago es plata del paciente sobre una
   *  línea que se le factura al seguro, y sin esto no se distinguía. */
  paidByPatient: number; paidByInsurance: number;
  /** Lo perdonado. Va SEPARADO de lo cobrado: es plata que la clínica resignó. */
  totalDiscount: number;
}
const EMPTY_KPIS: Kpis = {
  totalCost: 0, totalPaid: 0, totalBalance: 0, patientBalance: 0, insuranceBalance: 0,
  paidByPatient: 0, paidByInsurance: 0, totalDiscount: 0,
};

// ─── Payment type options (igual a v2) ─────────────────────────────────────────

/**
 * Los rotulos salen de i18n, no de constantes de modulo.
 *
 * Estaban clavados en espanol: con la app en ingles, la pantalla donde se COBRA
 * mostraba "Copago (Cp)" y "Cheque". Los CODIGOS entre parentesis se mantienen
 * en las dos traducciones — son la nomenclatura de facturacion que usa el equipo
 * (Cp, CO, TF, Red AG) y no se traducen.
 */
type Traducir = (clave: string) => string;

/**
 * ⚠️ Los `value` son los que YA ESTÁN GUARDADOS en `billing_payments`, no
 * nombres nuevos. Medido el 2026-09-16 cruzando los tipos guardados contra esta
 * lista: **63 pagos mostraban "—"** porque su tipo no figuraba como opción, y
 * tampoco se podían elegir al registrar uno nuevo.
 *
 *   · `direct_patient`  — 53 pagos. Acá decía `patient_direct`: la misma
 *     palabra con las dos mitades al revés.
 *   · `no_show`         — 3 pagos. Existe en el v2 ("No Show (NS)") y faltaba.
 *   · `direct_lawyer`   — 3 pagos. Acá decía `attorney_payment`.
 *
 * Ninguno de los tres nombres viejos tenía un solo pago guardado, así que
 * corregirlos no deja huérfano a nadie: eran nombres inventados que nunca
 * coincidieron con el dato.
 *
 * **Antes de agregar o renombrar un valor, mirá qué hay en la base.** Esta
 * lista no define el vocabulario: lo refleja.
 */
const tiposDePago = (t: Traducir): Record<string, { label: string; value: string }[]> => ({
  /**
   * SIETE opciones, que son las del v2.
   *
   * Tenía tres y faltaban cuatro. No es una lista de deseos: el export del v2
   * (`payments_202609120145.csv`) trae SEIS valores distintos en su columna
   * `paymentTypeInsurance` —copay 186, direct_insurance 87,
   * contractual_obligation 12, deductible 3, no_show 3, coinsurance 1— y acá
   * solo se ofrecían dos de esos seis. La séptima, `late_filing_penalty`, no
   * tiene ni un pago: es la que el v2 ofrecía y nunca se usó.
   *
   * O sea que había 193 pagos migrados cuyo tipo NO se podía volver a elegir
   * con el origen en Seguro. Se veían bien —`rotuloDeTipo` busca en las tres
   * listas— pero no se podían reproducir (Erick, 16-sep, mirando el modal).
   *
   * El copago sigue estando también en la lista del PACIENTE: es plata del
   * paciente, y en el v2 aparece en las dos según quién entregue el dinero.
   * Un valor puede vivir en más de una lista; lo que no puede es faltar.
   */
  INSURANCE: [
    { label: t('ptDirectInsurance'), value: 'direct_insurance' },
    { label: t('ptContractual'),     value: 'contractual_obligation' },
    { label: t('ptLateFiling'),      value: 'late_filing_penalty' },
    { label: t('ptCopay'),           value: 'copay' },
    { label: t('ptDeductible'),      value: 'deductible' },
    { label: t('ptCoinsurance'),     value: 'coinsurance' },
    { label: t('ptNoShow'),          value: 'no_show' },
  ],
  LAWYER: [
    { label: t('ptAttorney'),  value: 'direct_lawyer' },
    { label: t('ptReduction'), value: 'reduction_agreement' },
  ],
  PATIENT: [
    { label: t('ptCopay'),       value: 'copay' },
    { label: t('ptNoShow'),      value: 'no_show' },
    { label: t('ptDeductible'),  value: 'deductible' },
    { label: t('ptCoinsurance'), value: 'coinsurance' },
    { label: t('ptSelfPay'),     value: 'direct_patient' },
    { label: t('ptCourtesy'),    value: 'professional_courtesy' },
    { label: t('ptCollections'), value: 'external_collections' },
  ],
});

/**
 * El rótulo de un tipo de pago, buscándolo en las TRES listas.
 *
 * No alcanza con mirar la del origen de la fila: hay 4 pagos guardados con el
 * tipo cruzado —un copago con origen SEGURO, un pago de seguro con origen
 * PACIENTE— y al buscarlos solo en su lista salían como "—". El dato existe y
 * es legible; el que estaba mal era el lugar donde se buscaba.
 */
function rotuloDeTipo(
  tipos: Record<string, { label: string; value: string }[]>,
  valor: string | null,
): string | null {
  if (!valor) return null;
  for (const lista of Object.values(tipos)) {
    const hit = lista.find(o => o.value === valor);
    if (hit) return hit.label;
  }
  return null;
}

const metodos = (t: Traducir): Record<string, string> => ({
  CHECK: t('mCheck'), CARD: t('mCard'), CASH: t('mCash'), TRANSFER: t('mTransfer'), NONE: '—',
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeApp(), { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/**
 * Estado de cobro de UNA línea.
 *
 * Hace falta por línea y no solo por visita porque el cobro parcial reparte el
 * monto entre las líneas en orden (ver `repartir`): después de pagar $200 de
 * $381.26, una línea queda pagada, otra a medias y otra sin tocar. Un solo
 * "saldo $181.26" no dice cuál es cuál.
 */
function billingStatus(b: BillingRecord): 'paid' | 'partial' | 'pending' {
  if (b.balanceDue <= 0) return 'paid';
  if (b.amountPaid > 0) return 'partial';
  return 'pending';
}

/** Cómo se ve cada estado. `pending` es neutro a propósito: un cargo sin pagar
 *  es lo normal al empezar la visita, no una alerta. */
const ESTADO_PILL: Record<'paid' | 'partial' | 'pending', { state: StatusState; clave: string }> = {
  paid:    { state: 'success', clave: 'stPaid'    },
  partial: { state: 'warning', clave: 'stPartial' },
  pending: { state: 'neutral', clave: 'stPending' },
};

// ─── Custom Select (abre hacia arriba) ─────────────────────────────────────────

interface SelectOption { label: string; value: string }

/**
 * El panel sale por PORTAL (`FloatingPanel`), no `absolute`.
 *
 * Abría siempre hacia arriba —`bottom-full` clavado— y lo recortaba el
 * `overflow-y-auto` del cuerpo del diálogo: con la lista de siete tipos del
 * seguro, las opciones de abajo quedaban fuera del modal y no había forma de
 * llegar a ellas, ni scrolleando (Erick, 16-sep, con la captura). Es el mismo
 * bug que ya apareció tres veces en el back-office y para el que existe el
 * primitivo: portalea a `body`, se voltea solo si abajo no entra, acota su
 * alto y sigue al ancla cuando el diálogo scrollea.
 *
 * El nombre `SelectUp` queda por lo que fue; ahora la dirección la decide el
 * espacio, no el nombre.
 */
function SelectUp({
  value, onChange, options, placeholder, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const n = e.target as Node;
      // El panel vive FUERA de `ref` (está portaleado), así que hay que
      // preguntarle a los dos: si no, elegir una opción cerraba el panel
      // antes de que el clic llegara a su botón.
      if (ref.current && !ref.current.contains(n) && !panelRef.current?.contains(n)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 outline-none hover:border-brand/60 transition-colors"
      >
        <span className={selected ? 'text-text-1' : 'text-text-muted'}>
          {selected?.label ?? placeholder}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" /> : <ChevronUp className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
      </button>

      <FloatingPanel
        anchorRef={ref}
        open={open}
        panelRef={panelRef}
        className="bg-bg-1 border border-border rounded-md shadow-xl"
      >
        <div>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                opt.value === value
                  ? 'bg-brand/10 text-brand-text'
                  : 'text-text-1 hover:bg-bg-2'
              }`}
            >
              {opt.label}
              {opt.value === value && <span className="text-brand-text text-xs">✓</span>}
            </button>
          ))}
        </div>
      </FloatingPanel>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, hint }: {
  label: string; value: number; color: string;
  /** Segunda línea — el desglose de la cifra grande, cuando la cifra sola no alcanza */
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4 flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{fmt$(value)}</div>
      {hint && <div className="text-[11px] text-text-muted mt-1 truncate">{hint}</div>}
    </div>
  );
}

/**
 * Los cargos agrupados por VISITA.
 *
 * El monto se escribe una vez por consulta y se reparte entre sus líneas: la
 * base guarda la verdad por servicio —es lo que después se concilia y lo que
 * permite anular un pago puntual— y el que cobra escribe una sola cifra
 * (decisión de Erick, 2026-08-10).
 *
 * Es función de módulo y no un `useMemo` suelto porque ahora la usan los DOS
 * circuitos: el del mostrador y el del seguro/abogado.
 */
function agruparPorVisita(lista: BillingRecord[]) {
  const m = new Map<string, { key: string; fecha: string | null; lineas: BillingRecord[]; saldo: number }>();
  for (const b of lista) {
    const key = b.appointmentId ?? `sin-cita-${b.id}`;
    const g = m.get(key) ?? { key, fecha: b.appointmentDate, lineas: [], saldo: 0 };
    g.lineas.push(b);
    g.saldo += b.balanceDue;
    m.set(key, g);
  }
  return [...m.values()].sort((a, z) =>
    new Date(z.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime());
}

// ─── Main component ─────────────────────────────────────────────────────────────

/**
 * Etiqueta de origen de cada línea de cobro.
 *
 * En el modal las líneas salían todas bajo "SERVICE": dos laboratorios y una
 * inyección se veían idénticas y el que cobra no sabía qué estaba cobrando
 * (Erick, 2026-08-13). También explica por qué el total del cobro es mayor que el
 * del tab de Servicios — ahí los labs no aparecen.
 *
 * Clases COMPLETAS y no interpoladas: Tailwind no genera `bg-${x}/15` y la
 * etiqueta se quedaría sin color sin ningún error.
 *
 * Los CPT no llevan etiqueta porque no llegan acá: los paga el seguro y el modal
 * solo lista lo que se cobra en el mostrador.
 */
const ORIGEN_CLASE: Record<string, string> = {
  LAB:   'bg-cyan/15 text-cyan',
  CASH:  'bg-emerald/15 text-emerald',
  BRACE: 'bg-violet/15 text-violet',
  CPT:   'bg-bg-2 text-text-muted',
};
const ORIGEN_CLAVE: Record<string, string> = {
  LAB: 'originLab', CASH: 'originCash', BRACE: 'originBrace', CPT: 'originCpt',
};

export interface FinanzasTabHandle {
  openPayModal: () => void;
  reload: () => void;
  reloadAndOpen: () => void;
  /**
   * Abre el modal recién cuando hay datos, sin el paso intermedio en $0.
   *
   * `reloadAndOpen` abre con lo que haya y vuelve a abrir al terminar de
   * cargar: sirve cuando el componente ya está montado y cargado (el panel del
   * calendario), porque el primer estado ya es el bueno. En un montaje NUEVO
   * —Cobranzas monta el tab del caso recién al pedir el cobro— ese primer
   * estado está vacío, y el que cobra ve "TOTAL PENDING $0.00 · 0 visitas"
   * medio segundo antes de que aparezca la deuda real. En una pantalla de
   * plata, eso se lee como "no debe nada".
   */
  openWhenLoaded: () => void;
}

/**
 * `readOnly` — vista del doctor: ve el summary completo (costos, pagado, saldo,
 * detalle por línea) pero SIN acciones de cobro. El cobro es del asistente —
 * misma regla que `hidePayments` en el panel de servicios.
 *
 * `onChanged` — avisa que la plata del caso cambió (se registró o se anuló un
 * pago). El componente ya se recarga solo; esto es para la pantalla que lo
 * monta: en Day Admission el saldo también vive en la píldora del tab de
 * Servicios y en el Resumen, y sin el aviso seguían mostrando el saldo de antes
 * de cobrar.
 */
export const FinanzasTab = forwardRef<FinanzasTabHandle, { caseId: string; filterAppointmentId?: string; readOnly?: boolean; onChanged?: () => void }>(function FinanzasTab({ caseId, filterAppointmentId, readOnly = false, onChanged }, ref) {
  const t  = useTranslations('phoenix.caseTabs.finanzas');
  const tc = useTranslations('phoenix.common');
  // Claves del CTA "Cobrar $X" — las mismas del Resumen (una sola voz)
  const tDoc = useTranslations('phoenix.doctor');
  const [billings, setBillings]     = useState<BillingRecord[]>([]);
  const [kpis, setKpis]             = useState<Kpis>(EMPTY_KPIS);
  const [payments, setPayments]     = useState<PaymentRow[]>([]);
  /** Rotulos traducidos — memo para no rearmar las listas en cada render. */
  const PAYMENT_TYPES  = React.useMemo(() => tiposDePago(t), [t]);
  const METHOD_LABELS  = React.useMemo(() => metodos(t), [t]);
  const [insurances, setInsurances] = useState<CaseInsurance[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  // Modal
  const [payOpen, setPayOpen]         = useState(false);
  const [payAmounts, setPayAmounts]   = useState<Record<string, string>>({});
  const [payNotes, setPayNotes]       = useState<Record<string, string>>({});
  const [paySource, setPaySource]     = useState<'INSURANCE' | 'PATIENT' | 'LAWYER'>('PATIENT');
  const [payMethod, setPayMethod]     = useState<string>('CHECK');
  const [payType, setPayType]         = useState<string>('');
  const [payInsuranceId, setPayInsuranceId] = useState<string>('');
  const [paying, setPaying]           = useState(false);
  const [deletingPay, setDeletingPay] = useState<string | null>(null);
  /** Visita con el detalle desplegado en el modal de cobro */
  const [detalleVisita, setDetalleVisita] = useState<string | null>(null);

  /**
   * ─── Pago de UNA línea ────────────────────────────────────────────────────
   *
   * El cobro por visita reparte un monto entre las líneas y **comparte un solo
   * quién-paga / método / tipo para todo el envío**. Eso no alcanza cuando
   * sobre la misma cuenta entran pagos de orígenes distintos: medido el
   * 2026-09-16, **38 cargos tienen pagos de más de un origen** —un copago del
   * paciente y un cheque del seguro sobre la misma línea— y con la pantalla de
   * antes eso eran dos rondas separadas.
   *
   * El v2 lo resuelve con un botón por línea, y ahí acertaron. Se suma como
   * ATAJO, no como reemplazo: el monto por visita se queda, porque tipear
   * línea por línea con seis cargos son seis campos para un solo cobro
   * (decisión de Erick, 2026-08-10).
   */
  const [lineaAPagar, setLineaAPagar] = useState<BillingRecord | null>(null);
  const [lpSource, setLpSource]   = useState<'INSURANCE' | 'PATIENT' | 'LAWYER'>('PATIENT');
  const [lpMethod, setLpMethod]   = useState<string>('CARD');
  const [lpType, setLpType]       = useState<string>('');
  const [lpMonto, setLpMonto]     = useState<string>('');
  /**
   * Lo que se PERDONA en este mismo cobro (Reduction agreement y similares).
   *
   * Vive solo acá y no en el modal grande: ahí el monto se reparte entre las
   * líneas de la visita y un descuento repartido no tendría a quién atribuirse.
   * Perdonar es una decisión sobre UN cargo, y este es el diálogo de un cargo.
   */
  const [lpDescuento, setLpDescuento] = useState<string>('');
  const [lpNotas, setLpNotas]     = useState<string>('');
  const [lpGuardando, setLpGuardando] = useState(false);
  const [noteDialogFor, setNoteDialogFor] = useState<string | null>(null); // billingId de la fila con "Nota de pago" abierta
  const [noteDraft, setNoteDraft]         = useState('');
  const openAfterLoad = useRef(false);

  /**
   * Lo que se puede cobrar en el mostrador.
   *
   * `payer === 'PATIENT'` NO es un detalle: sin ese filtro el modal listaba las
   * líneas de CPT —lo que se le factura al seguro o al abogado meses después—
   * junto a labs, férulas y efectivo, todas cobrables al paciente. En un caso de
   * prueba eran $744 del seguro ofrecidos para cobrar en caja.
   *
   * Y si viene de una cita puntual (calendario), solo esa visita.
   */
  /**
   * ─── Los DOS circuitos de cobro ──────────────────────────────────────────
   *
   * Hasta hoy esta pantalla cobraba uno solo —el del mostrador— y del otro
   * solo avisaba: "además $X en CPT se le facturan al seguro". Avisaba y nada
   * más, porque **en todo v3 no existía forma de registrar un pago del seguro
   * o del abogado**: la única ruta que escribe pagos es la de este modal, y su
   * filtro dejaba fuera todo lo que no fuera del mostrador.
   *
   * Eso dejó $1,37 millones sin manera de cobrarse —los 6.455 cargos que
   * vinieron del sistema anterior, que son CPT de consulta— y también los CPT
   * que v3 genera hoy, que se venían acumulando igual (Erick, 2026-09-16).
   *
   * Ahora los dos se cobran con el MISMO modal. Lo que decide qué cargos se
   * pueden elegir es la fuente del pago:
   *
   *   · paciente          → el circuito del mostrador (férulas, servicios, labs)
   *   · seguro / abogado  → el circuito de terceros (los CPT)
   *
   * Los dos NO se mezclan nunca en el mismo pago, y ésa es la protección que
   * reemplaza al viejo "no se puede cobrar": el mostrador sigue sin poder
   * pedirle al paciente la plata del abogado, porque para llegar a esos cargos
   * hay que declarar que el que paga es el abogado.
   */
  const circuitoDe = (fuente: 'INSURANCE' | 'PATIENT' | 'LAWYER') =>
    (fuente === 'PATIENT' ? 'PATIENT' : 'INSURANCE') as BillingRecord['payer'];

  const cobrablesDe = useCallback((list: BillingRecord[], circuito: BillingRecord['payer']) => (
    list.filter(b =>
      b.payer === circuito
      && b.balanceDue > 0
      && (!filterAppointmentId || b.appointmentId === filterAppointmentId))
  ), [filterAppointmentId]);

  /** Lo cobrable en el mostrador. Es lo que la pantalla muestra por defecto. */
  const pendingOf = useCallback((list: BillingRecord[]) => (
    cobrablesDe(list, 'PATIENT')
  ), [cobrablesDe]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const freshBillings: BillingRecord[] = data.billings ?? [];
      const freshInsurances: CaseInsurance[] = data.insurances ?? [];
      setBillings(freshBillings);
      setKpis({ ...EMPTY_KPIS, ...(data.kpis ?? {}) });
      setPayments(data.payments ?? []);
      setInsurances(freshInsurances);

      // Open pay modal with fresh data if flagged
      if (openAfterLoad.current) {
        openAfterLoad.current = false;
        // Mismo criterio que `openPayModal`: se arranca donde hay saldo.
        const fuente: 'PATIENT' | 'INSURANCE' =
          cobrablesDe(freshBillings, 'PATIENT').length === 0
            && cobrablesDe(freshBillings, 'INSURANCE').length > 0
            ? 'INSURANCE' : 'PATIENT';
        const pending = cobrablesDe(freshBillings, circuitoDe(fuente));
        const init: Record<string, string> = {};
        // Claves por visita: el monto se escribe una vez por consulta
        pending.forEach(b => { init[b.appointmentId ?? `sin-cita-${b.id}`] = ''; });
        setPayAmounts(init);
        setPayNotes({});
        setPaySource(fuente);
        setPayMethod('CHECK');
        setPayType(PAYMENT_TYPES[fuente][0].value);
        setPayInsuranceId(freshInsurances[0]?.id ?? '');
        setPayOpen(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [caseId, pendingOf]);

  useEffect(() => { load(); }, [load]);

  function openPayModal() {
    if (readOnly) return; // el doctor no cobra — gate también acá porque el handle es imperativo
    /**
     * Abre en el circuito que TIENE plata.
     *
     * Con "paciente" fijo, un caso cuyos cargos son todos CPT —los que vinieron
     * del sistema anterior lo son— abría el modal vacío: el que cobra veía
     * "nada que cobrar" con miles de dólares pendientes. Si el mostrador no
     * tiene saldo y el seguro sí, se arranca ahí; el selector deja cambiar.
     */
    const delMostrador = cobrablesDe(billings, 'PATIENT');
    const arrancaEnTerceros = delMostrador.length === 0
      && cobrablesDe(billings, 'INSURANCE').length > 0;
    const fuente = arrancaEnTerceros ? 'INSURANCE' : 'PATIENT';

    const pending = cobrablesDe(billings, circuitoDe(fuente));
    const init: Record<string, string> = {};
    pending.forEach(b => { init[b.appointmentId ?? `sin-cita-${b.id}`] = ''; });
    setPayAmounts(init);
    setPayNotes({});
    setPaySource(fuente);
    setPayMethod('CHECK');
    setPayType(PAYMENT_TYPES['PATIENT'][0].value);
    setPayInsuranceId(insurances[0]?.id ?? '');
    setPayOpen(true);
  }

  useImperativeHandle(ref, () => ({
    openPayModal,
    reload: load,
    reloadAndOpen: () => {
      // Abrir modal inmediatamente con datos existentes, recargar en background
      openPayModal();
      openAfterLoad.current = true;
      load();
    },
    // Sin el `openPayModal()` de arriba: el modal aparece una sola vez, ya con
    // la deuda cargada. Ver el docblock del handle.
    openWhenLoaded: () => {
      openAfterLoad.current = true;
      load();
    },
  }));

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function autoDistribute(totalStr: string) {
    const raw = parseFloat(totalStr);
    const claves = (lista: BillingRecord[]) =>
      [...new Set(lista.map(b => b.appointmentId ?? `sin-cita-${b.id}`))];

    if (isNaN(raw) || raw <= 0) {
      const pend = cobrablesDe(billings, circuitoDe(paySource));
      setPayAmounts(prev => { const n = { ...prev }; claves(pend).forEach(k => { n[k] = ''; }); return n; });
      return;
    }
    // Reparte el total entre las VISITAS, de la más reciente a la más vieja:
    // lo que se cobra hoy suele ser lo de hoy.
    // Del circuito que el modal está ofreciendo, no siempre el del mostrador.
    const total = Math.min(raw, visitasDelModal.reduce((s, v) => s + v.saldo, 0));
    const newAmounts: Record<string, string> = {};
    let remaining = total;
    for (const v of visitasDelModal) {
      if (remaining <= 0) { newAmounts[v.key] = ''; continue; }
      const apply = Math.min(remaining, v.saldo);
      newAmounts[v.key] = apply.toFixed(2);
      remaining -= apply;
    }
    setPayAmounts(prev => ({ ...prev, ...newAmounts }));
  }

  async function submitPayment() {
    /**
     * Se escribe un monto por VISITA y se guarda una fila por LÍNEA: la base
     * mantiene la verdad por servicio (es lo que después se concilia con el
     * seguro y lo que permite anular un pago puntual), y el mostrador escribe
     * una sola cifra. La nota va en todas las líneas de esa visita: es un mismo
     * cobro repartido, y cada parte tiene que poder explicarse sola.
     */
    const entries = visitasDelModal.flatMap(v => {
      const monto = parseFloat(payAmounts[v.key] ?? '0') || 0;
      if (monto <= 0) return [];
      return Object.entries(repartir(v.lineas, monto)).map(([billingId, amount]) => ({
        billingId, amount, notes: payNotes[v.key] || null,
      }));
    });

    if (!entries.length) { alert(t('alertMinAmount')); return; }

    setPaying(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: entries,
          source: paySource,
          method: payMethod,
          paymentType: payType || null,
          insuranceCarrierId: paySource === 'INSURANCE' ? (payInsuranceId || null) : null,
          paidAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? `HTTP ${res.status}`); }
      setPayOpen(false);
      load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertErrorRegister'));
    } finally {
      setPaying(false);
    }
  }

  /** Abre el diálogo de una línea con el pendiente ya puesto. */
  function abrirPagoDeLinea(l: BillingRecord) {
    // El origen propuesto es el del circuito de la línea, no el del modal: una
    // línea de CPT la paga el seguro aunque el modal esté cobrando al paciente.
    const src = l.payer === 'PATIENT' ? 'PATIENT' : 'INSURANCE';
    setLineaAPagar(l);
    setLpSource(src);
    setLpMethod('CARD');
    setLpType(PAYMENT_TYPES[src]?.[0]?.value ?? '');
    setLpMonto(l.balanceDue.toFixed(2));
    // Vacío, no "0.00": perdonar es la excepción y el campo tiene que verse sin
    // usar, no como un cero que alguien tenga que borrar para escribir encima.
    setLpDescuento('');
    setLpNotas('');
  }

  async function registrarPagoDeLinea() {
    const l = lineaAPagar;
    if (!l) return;
    const monto = parseFloat(lpMonto) || 0;
    const descuento = parseFloat(lpDescuento) || 0;
    // Perdonar SIN cobrar es válido: un Reduction agreement puede cerrar el
    // saldo entero sin que entre un peso. Lo que no vale es un pago vacío.
    if (monto + descuento <= 0) { alert(t('alertMinAmount')); return; }

    setLpGuardando(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Una sola entrada: es el punto de este diálogo. El monto NO se
          // reparte porque ya sabemos contra qué línea va.
          payments: [{
            billingId: l.id,
            amount: Math.min(monto, l.balanceDue),
            // Lo perdonado entra en el mismo pago: se revierte con él.
            discount: Math.min(descuento, Math.max(0, l.balanceDue - Math.min(monto, l.balanceDue))),
            notes: lpNotas || null,
          }],
          source: lpSource,
          method: lpMethod,
          paymentType: lpType || null,
          insuranceCarrierId: lpSource === 'INSURANCE' ? (insurances[0]?.id ?? null) : null,
          paidAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message ?? `HTTP ${res.status}`); }
      setLineaAPagar(null);
      load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertErrorRegister'));
    } finally {
      setLpGuardando(false);
    }
  }

  async function deletePayment(billingId: string, payId: string) {
    if (!confirm(t('payConfirmCancel'))) return;
    setDeletingPay(payId);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/billing/${billingId}/payments/${payId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load();
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertErrorCancel'));
    } finally {
      setDeletingPay(null);
    }
  }

  /**
   * Los KPIs y el historial se derivan acá, no se toman de la API.
   *
   * Dos razones. Los de la API son de TODO el caso: con el selector de visita
   * puesto, la tabla mostraba una cita y las cifras seguían siendo del caso
   * entero — números que no cuadran con lo que se está viendo. Y son del caso
   * completo incluyendo CPT, que en Finanzas no va: eso lo cobra Cobranzas al
   * seguro o al abogado meses después.
   */
  const deLaVista   = billings.filter(b =>
    b.payer === 'PATIENT' && (!filterAppointmentId || b.appointmentId === filterAppointmentId));

  /**
   * TODO lo del caso, los dos circuitos juntos.
   *
   * "Costo total" y "Pagado" pasan a contar el caso entero (Erick, 2026-09-16:
   * "todo lo que vino de v2 es como si fuera v3, no hay que separarlo"). Antes
   * contaban solo el mostrador, y en un caso cuyos cargos son todos CPT —los
   * 6.455 que vinieron del sistema anterior lo son— las tres tarjetas decían
   * $0.00 con miles de dólares cargados.
   *
   * La que NO cambia es "Paga el paciente": esa sigue siendo solo el mostrador,
   * porque es la cifra que recepción usa para pedir plata. Mezclarle los CPT
   * sería pedirle al paciente lo que le toca al seguro o al abogado.
   */
  const todoDeLaVista = billings.filter(b =>
    !filterAppointmentId || b.appointmentId === filterAppointmentId);
  const vistaCosto  = todoDeLaVista.reduce((s, b) => s + b.totalCost, 0);
  const vistaPagado = todoDeLaVista.reduce((s, b) => s + b.amountPaid, 0);
  const vistaSaldo  = deLaVista.reduce((s, b) => s + b.balanceDue, 0);

  /**
   * Lo que se le factura al SEGURO en esta visita — se nombra, no se cobra.
   *
   * No entra en ningún total de esta pantalla (regla de Erick: una línea que
   * paga el seguro nunca puede sumar al total del mostrador). Existe como una
   * sola frase al pie porque si no, el asistente ve "$381.26 a cobrar" acá y
   * "$70 a seguro" en Servicios y no sabe si son plata distinta o la misma
   * contada dos veces.
   */
  const seguroDeLaVista = filterAppointmentId
    ? billings.filter(b => b.payer === 'INSURANCE' && b.appointmentId === filterAppointmentId)
    : [];
  const seguroSaldo = seguroDeLaVista.reduce((s, b) => s + b.balanceDue, 0);

  /**
   * Historial: TODOS los pagos del período visible, venga de quien venga.
   *
   * Filtraba `source === 'PATIENT'`, así que un cheque del seguro o del abogado
   * entraba a la base y no se veía en ninguna parte de esta pantalla — la de
   * Catalina Moran tenía tres cheques del seguro y decía "No payments recorded
   * yet" (Erick, 2026-09-16). Ahora se listan los tres orígenes y cada fila dice
   * el suyo; sin eso, Finanzas registra un pago y no tiene cómo comprobar que
   * quedó.
   *
   * Sin anulados — los filtra la API, y la anulación queda en el AuditLog.
   */
  const historial = payments.filter(p =>
    !filterAppointmentId || p.appointmentId === filterAppointmentId);

  /**
   * Lo PERDONADO en la vista. Va aparte de lo cobrado y solo aparece cuando hay
   * algo: sumarlo al total haría que el mostrador lea ingresos que no entraron,
   * y esconderlo dejaría un saldo que bajó sin explicación visible.
   */
  const vistaPerdonado = historial.reduce((s, p) => s + p.discount, 0);

  const pending     = pendingOf(billings);

  /**
   * Lo pendiente agrupado POR VISITA. El paciente paga "lo del 5 de agosto":
   * servicios, férulas y labs de esa consulta van juntos y el monto se escribe
   * una sola vez (decisión de Erick 2026-08-10). Antes había un campo por línea
   * y en una visita con 6 cargos eran 6 campos para un solo cobro.
   */
  const visitasPendientes = React.useMemo(() => agruparPorVisita(pending), [pending]);

  /**
   * Lo mismo para el circuito de terceros — los CPT que le tocan al seguro o
   * al abogado. Es la lista que el modal ofrece cuando la fuente del pago no
   * es el paciente.
   */
  const pendientesTerceros = React.useMemo(
    () => cobrablesDe(billings, 'INSURANCE'), [billings, cobrablesDe]);
  const visitasTerceros = React.useMemo(
    () => agruparPorVisita(pendientesTerceros), [pendientesTerceros]);
  const saldoTerceros = pendientesTerceros.reduce((s, b) => s + b.balanceDue, 0);

  /**
   * Las visitas que el modal está ofreciendo AHORA, según quién paga.
   *
   * Es lo que hace que un mismo modal sirva para los dos circuitos sin poder
   * mezclarlos: al cambiar la fuente cambia la lista, y los montos tecleados se
   * descartan (ver el `onChange` del selector) porque pertenecían a otros
   * cargos.
   */
  const visitasDelModal = paySource === 'PATIENT' ? visitasPendientes : visitasTerceros;

  /**
   * El total del circuito que el modal está mostrando.
   *
   * ⚠️ NO es `totalPending`: ése es siempre el del mostrador. Con el modal
   * abierto en el circuito del seguro, la cabecera decía "TOTAL PENDING $0.00"
   * sobre una lista de 11 visitas por $7.666,19, y el campo de reparto decía
   * "distribuir hasta $0.00" — o sea que además de mentir, no dejaba repartir
   * nada. Visto en pantalla con MVA-1812 (16-sep); ni `tsc` ni leer el diff lo
   * mostraban, porque las dos variables son números válidos y la de al lado
   * parecía la correcta.
   */
  const totalDelModal = visitasDelModal.reduce((s, v) => s + v.saldo, 0);

  /**
   * Con UNA sola visita pendiente, el detalle se abre solo.
   *
   * La fila por visita existe para el caso, donde hay muchas fechas y se elige
   * cuál cobrar. Abierto desde una cita hay una sola, así que esa fila colapsada
   * no agrupa nada: solo esconde lo único que se vino a ver, y obliga a un clic
   * para llegar a los cargos (Erick, 2026-08-13: "aquí necesita mostrar de frente
   * la lista de pagos").
   */
  React.useEffect(() => {
    if (!payOpen) return;
    if (visitasDelModal.length === 1) setDetalleVisita(visitasDelModal[0]!.key);
  }, [payOpen, visitasDelModal]);

  /**
   * Cómo se reparte el monto de una visita entre sus líneas: en ORDEN, llenando
   * cada una hasta agotar la plata.
   *
   * Se descartó repartir en proporción porque nadie puede explicar en el
   * mostrador por qué el lab quedó en $37.42. Así se lee de corrido: "el lab
   * pagado, la férula a medias, el resto sin tocar". Y el reparto se muestra en
   * el detalle mientras se escribe, así que no es una regla oculta.
   */
  const repartir = useCallback((lineas: BillingRecord[], monto: number): Record<string, number> => {
    let resto = monto;
    const out: Record<string, number> = {};
    for (const l of lineas) {
      if (resto <= 0) break;
      const toma = Math.min(resto, l.balanceDue);
      out[l.id] = Math.round(toma * 100) / 100;
      resto -= toma;
    }
    return out;
  }, []);
  const payTotal    = Object.values(payAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const hasOverpay  = visitasDelModal.some(v => (parseFloat(payAmounts[v.key] ?? '0') || 0) > v.saldo);

  // Options for custom selects
  /**
   * ⚠️ El ORDEN es el del v2, no uno nuestro (Erick, 2026-09-16: "las demás
   * listas no debemos cambiar nada, ni los títulos").
   *
   * El equipo lleva años buscando estas opciones por su POSICIÓN, no leyéndolas:
   * reordenarlas hace que elijan la de al lado. Acá estaban en otro orden y el
   * método "None" se mostraba como "— Not specified", que en el v2 dice "None".
   *
   * Si alguna vez hay que reordenarlas, que sea por una razón mejor que
   * "alfabético queda más prolijo" — esa es justamente la del v2.
   */
  const sourceOptions: SelectOption[] = [
    { label: t('srcInsurance'), value: 'INSURANCE' },
    { label: t('srcLawyer'),    value: 'LAWYER' },
    { label: t('srcPatient'),   value: 'PATIENT' },
  ];
  const methodOptions: SelectOption[] = [
    { label: t('mCard'),     value: 'CARD' },
    { label: t('mCash'),     value: 'CASH' },
    { label: t('mCheck'),    value: 'CHECK' },
    { label: t('mNone'),     value: 'NONE' },
    { label: t('mTransfer'), value: 'TRANSFER' },
  ];
  const typeOptions: SelectOption[] = PAYMENT_TYPES[paySource] ?? [];
  const insuranceOptions: SelectOption[] = insurances.map(i => ({ label: i.label, value: i.id }));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber" />
          <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('sectionTitle')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('refresh')}</span>
          </Button>
          {/* Cobrar — acción principal del tab, en la esquina donde vive la
              acción principal de todos los demás (Add charge, Dispense brace,
              New order). Dice el monto antes del clic. Verde sólido: la plata
              del paciente ya es verde en todo el sistema y el ámbar acá se
              leería como alerta. Oculto en readOnly (doctor). */}
          {/*
            Aparece con saldo en CUALQUIERA de los dos circuitos.
            ───────────────────────────────────────────────────────────────
            Miraba solo el del mostrador (`vistaSaldo`), así que en un caso
            cuya deuda es toda del seguro o del abogado —los que vinieron del
            sistema anterior son todos así— el botón **no se dibujaba**: el
            modal existía y no había puerta para entrar. Verificado en pantalla
            con MVA-1812 el 16-sep, que muestra $7.666,19 a seguro y no tenía
            con qué cobrarlos.

            ── El rótulo ─────────────────────────────────────────────────
            En inglés dice "Pay debts" y no "Collect": es como se llama este
            botón en el v2 y como lo conoce el equipo desde hace años (Erick,
            2026-09-16). Migrar gente cuesta más que migrar datos.

            En español se queda "Cobrar", que NO es la traducción literal y es
            a propósito: "pagar deudas", leído por quien opera la pantalla,
            dice que paga la clínica — el sujeto del verbo se da vuelta. Además
            "cobrar" es el verbo de las otras doce cadenas de la app ("por
            cobrar del seguro", "falta cobrar", "visitas por cobrar"…), y ésta
            sería la única que dijera lo contrario.

            Sin el monto, también por decisión suya: el saldo ya está en las
            tarjetas, arriba del botón.
          */}
          {(vistaSaldo > 0 || saldoTerceros > 0) && !readOnly && (
            <Button size="sm" onClick={openPayModal} className="gap-1.5 bg-emerald hover:bg-emerald/90 text-bg-0 border-transparent">
              <CreditCard className="w-3.5 h-3.5" />
              {tDoc('sumCollect')}
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        {/* Cuatro tarjetas. Las dos primeras son del CASO entero; "Paga el
            paciente" es solo el mostrador y "A seguro / abogado" el otro
            circuito — separadas para que nadie le pida al paciente lo que
            paga el seguro, pero las dos cobrables desde el mismo modal. */}
        <KpiCard label={t('kpiTotalCost')} value={vistaCosto}  color="text-text-1" />
        <KpiCard label={t('kpiTotalPaid')} value={vistaPagado} color="text-emerald" />
        <KpiCard label={t('kpiPatientDebt')} value={vistaSaldo} color={vistaSaldo > 0 ? 'text-rose' : 'text-text-1'} />
        {/*
          La cuarta tarjeta, que antes se había sacado.
          ───────────────────────────────────────────────────────────────────
          Se quitó cuando esa plata NO se podía cobrar desde acá: mostrarla era
          ofrecerle al mostrador un número que no podía tocar. Ahora se cobra
          —con la fuente puesta en seguro o abogado— así que vuelve, porque es
          trabajo de Finanzas y sin la tarjeta no hay por dónde empezarlo.
          Sigue separada de "Paga el paciente" a propósito.
        */}
        <KpiCard
          label={t('kpiThirdPartyDebt')}
          value={saldoTerceros}
          color={saldoTerceros > 0 ? 'text-amber' : 'text-text-1'}
          hint={saldoTerceros > 0 ? t('kpiThirdPartyHint') : undefined}
        />
      </div>

      {/* ── QUÉ se está cobrando (solo con una cita puesta) ──────────────────
          Lo que el paciente debe HOY, línea por línea: efectivo, laboratorios y
          férulas juntos, que es como se paga.

          Existe porque el tab de cobro mostraba el total correcto ($381.26) y
          ninguna línea que lo explicara: el desglose vivía adentro del modal, o
          sea DESPUÉS de decidir cobrar. Y la lista del tab de Servicios no
          sirve para esto — ahí los laboratorios y las férulas no están, cada
          uno tiene su propio tab, así que sus totales se quedaban $181.26 cortos.

          Sin cita (el caso completo) NO se muestra: serían todas las líneas de
          todas las fechas, que es justo lo que el historial de pagos y el modal
          ya ordenan por visita. */}
      {filterAppointmentId && !loading && !error && (
        <div className="rounded-lg bg-bg-1 overflow-hidden">
          <div className="px-4 py-2 bg-bg-2/60 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {t('visitChargesTitle')}
            </span>
            <span className="ml-auto text-[11px] text-text-muted">
              {vistaSaldo > 0 ? (
                <>{t('visitToCollect')} <b className="text-rose text-[12.5px] ml-0.5 tabular-nums font-mono">{fmt$(vistaSaldo)}</b></>
              ) : vistaPagado > 0 ? (
                /* La confirmación que faltaba: cuando se cobraba, lo único que
                   pasaba en pantalla era que DESAPARECÍA el saldo. Una ausencia
                   no le dice a quien cobró que quedó registrado. */
                <StatusPill state="success" label={`${t('stPaid')} · ${fmt$(vistaPagado)}`} />
              ) : null}
            </span>
          </div>

          {deLaVista.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-text-muted">{t('visitChargesEmpty')}</div>
          ) : (
            <div className="divide-y divide-row-sep">
              {deLaVista.map(l => {
                const est = ESTADO_PILL[billingStatus(l)];
                return (
                  <div key={l.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                    {/* QUÉ es la línea. Sin esto dos labs y una inyección se ven
                        idénticos y el que cobra no sabe qué está cobrando. */}
                    {l.origin && (
                      <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-px rounded-full shrink-0 ${ORIGEN_CLASE[l.origin]}`}>
                        {t(ORIGEN_CLAVE[l.origin])}
                      </span>
                    )}
                    <span className="text-[12.5px] text-text-1 flex-1 min-w-[140px]">
                      {l.serviceCode && <span className="font-mono text-[11.5px] text-text-muted mr-1.5">{l.serviceCode}</span>}
                      {l.serviceDescription ?? '—'}
                    </span>
                    <div className="text-right shrink-0">
                      <div className={`font-mono tabular-nums text-[12.5px] font-semibold ${l.balanceDue > 0 ? 'text-text-1' : 'text-text-muted'}`}>
                        {fmt$(l.balanceDue > 0 ? l.balanceDue : l.totalCost)}
                      </div>
                      {/* Solo en el pago parcial: "queda $150 de $200" es la
                          frase que se le dice al paciente antes de que se vaya. */}
                      {l.balanceDue > 0 && l.amountPaid > 0 && (
                        <div className="text-[10px] text-emerald">
                          {t('linePaidOf', { paid: fmt$(l.amountPaid), total: fmt$(l.totalCost) })}
                        </div>
                      )}
                    </div>
                    <StatusPill state={est.state} label={t(est.clave)} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Lo del seguro: se nombra y queda FUERA del total. Mostrarlo como
              una línea cobrable más era ofrecerle al mostrador plata que no le
              toca pedir al paciente. */}
          {seguroSaldo > 0 && (
            <div className="px-4 py-2 bg-bg-2/40 flex items-center gap-1.5 text-[11px] text-text-muted">
              <Shield className="w-3 h-3 text-cyan shrink-0" />
              {t('visitInsuranceNote', { amount: fmt$(seguroSaldo) })}
            </div>
          )}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-3 text-sm text-rose">{error}</div>
      ) : historial.length === 0 ? (
        /* En una visita sin cargos el estado vacío grande sobra: arriba ya dice
           que no hay nada que cobrar, y dos carteles vacíos uno debajo del otro
           se leen como una pantalla rota. */
        filterAppointmentId && deLaVista.length === 0 ? null : (
          <EmptyState.Rich
            icon={DollarSign}
            title={t('historyEmptyTitle')}
            subtitle={t('historyEmptySubtitle')}
          />
        )
      ) : (
        /**
         * HISTORIAL DE PAGOS — una fila por pago, no por servicio.
         *
         * Antes esto era "Detalle por servicio": repetía lo que ya vive en
         * Servicios, Férulas y Labs, y el historial quedaba ESCONDIDO adentro de
         * cada fila. Para saber "cuándo pagó y cuánto" había que expandir doce
         * servicios y sumar a mano. Lo que se DEBE vive en el modal de cobro,
         * agrupado por visita: el tab es el registro, el modal es la acción.
         */
        <div className="rounded-lg bg-bg-1 overflow-hidden">
          <div className="px-4 py-2 bg-bg-2/60 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {t('historyTitle')}
            </span>
            <span className="text-[10px] text-text-muted">
              {t('historyCount', { count: historial.length })}
            </span>
            <span className="ml-auto text-[11px] text-text-muted">
              {t('historyTotal')} <b className="text-emerald text-[12.5px] ml-0.5 tabular-nums">{fmt$(vistaPagado)}</b>
            </span>
            {vistaPerdonado > 0 && (
              <span className="text-[11px] text-text-muted">
                {t('historyDiscountTotal')} <b className="text-amber text-[12.5px] ml-0.5 tabular-nums">{fmt$(vistaPerdonado)}</b>
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-row-sep bg-bg-2/40 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  <th className="text-left px-3 py-2.5">{t('colPaidAt')}</th>
                  <th className="text-right px-3 py-2.5">{t('colAmount')}</th>
                  <th className="text-left px-3 py-2.5">{t('colMethod')}</th>
                  <th className="text-left px-3 py-2.5 hidden md:table-cell">{t('colType')}</th>
                  <th className="text-left px-3 py-2.5">{t('colAppliedTo')}</th>
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {historial.map(p => (
                  <tr key={p.id} className="border-b border-row-sep hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs text-text-1">
                      {fmtDate(p.paidAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs font-semibold text-emerald">
                      {fmt$(p.amount)}
                      {/* Lo perdonado va DEBAJO del monto y no en una columna
                          propia: la tabla ya tiene seis y en el teléfono no
                          entra otra. Acá además queda pegado a la cifra que
                          explica — por qué el saldo bajó más que lo cobrado. */}
                      {p.discount > 0 && (
                        <div className="text-[10px] font-normal text-amber mt-0.5">
                          {t('historyDiscountRow', { amount: fmt$(p.discount) })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-text-2">
                      {METHOD_LABELS[p.method] ?? p.method}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-muted hidden md:table-cell">
                      {rotuloDeTipo(PAYMENT_TYPES, p.paymentType) ?? '—'}
                    </td>
                    {/* A qué se aplicó: el servicio Y la visita. Un monto suelto
                        con su fecha de cobro no dice qué se estaba pagando. */}
                    <td className="px-3 py-2.5 text-xs min-w-[200px]">
                      <div className="text-text-2 truncate">
                        {p.serviceDescription ?? p.serviceCode ?? '—'}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {t('historyVisitOf')} {fmtDate(p.appointmentDate)}
                      </div>
                      {p.notes && <div className="text-[10px] italic text-text-muted mt-0.5">{p.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {!readOnly && (
                        <button
                          onClick={() => deletePayment(p.billingId, p.id)}
                          disabled={deletingPay === p.id}
                          className="p-1 rounded text-text-muted hover:text-rose transition-colors disabled:opacity-50"
                          title={tc('cancelPayment')}
                        >
                          {deletingPay === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* ── Modal: Pagar deuda ───────────────────────────────────────────────────
          Usa el primitivo Dialog (Regla #0) en vez de un overlay `fixed` propio.
          Importa por dos razones concretas: (1) DialogContent portalea solo a
          body, asi que escapa del translate-x/y-[-50%] del dialogo de la cita
          -- un ancestro con `transform` se vuelve el bloque contenedor de sus
          descendientes `fixed` (spec CSS), y por eso antes quedaba encerrado en
          los 768px del padre; (2) Radix maneja dialogos anidados, incluyendo el
          pointer-events/focus trap -- un portal manual a body quedaba fuera de
          su subarbol y el modal se veia pero no se podia clickear. */}
      <Dialog open={payOpen && !readOnly} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal header — el título dice el ALCANCE real del cobro.
                Abierto desde una cita se cobra ESA visita y nada más, así que
                "Pago del caso" nombraba algo que no está pasando: el caso puede
                tener seis fechas más y ninguna entra en este cobro. */}
            <div className="px-5 py-4 border-b border-border shrink-0">
              <DialogTitle className="text-text-1 font-semibold text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber" />
                {filterAppointmentId ? t('payModalTitleVisit') : t('payModalTitle')}
              </DialogTitle>
              <p className="text-text-muted text-xs mt-0.5">
                {filterAppointmentId ? t('payModalSubtitleVisit') : t('payModalSubtitle')}
              </p>
            </div>

            {/* Zona scrolleable — si la ventana es baja, el contenido scrollea
                en vez de quedar recortado por el max-h del dialogo. El footer
                de "Registrar pago" queda siempre visible abajo. */}
            <div className="flex-1 min-h-0 overflow-y-auto">

            {/* Summary bar */}
            <div className="grid grid-cols-2 border-b border-border">
              <div className="px-5 py-3 border-r border-border">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payTotalPending')}</div>
                <div className="text-xl font-bold font-mono text-rose mt-0.5">{fmt$(totalDelModal)}</div>
              </div>
              <div className="px-5 py-3">
                {/* Visitas, no líneas: se cobra por visita, así que contar
                    cargos sueltos daba un número que no se corresponde con
                    cuántos montos hay que escribir.

                    Con una cita puesta ese número es siempre 1 y no informa
                    nada; ahí el dato útil es CUÁL visita se está cobrando. */}
                {filterAppointmentId ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payVisitDate')}</div>
                    <div className="text-xl font-bold font-mono text-text-1 mt-0.5">
                      {fmtDate(visitasDelModal[0]?.fecha ?? deLaVista[0]?.appointmentDate ?? null)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payVisitsPending')}</div>
                    <div className="text-xl font-bold font-mono text-text-1 mt-0.5">{visitasDelModal.length}</div>
                  </>
                )}
              </div>
            </div>

            {/* Lo pendiente, agrupado por visita */}
            {(() => {
              // Cada piso sale del ancho real de su header (10px uppercase +
              // tracking + px-3), con holgura. Ojo con la ultima columna: es la
              // unica de ancho FIJO, asi que es la unica que puede desbordar --
              // las demas son fr y se expanden por encima de su piso. Con 44px
              // el texto "NOTAS" (~62px con padding) se salia, y ese desborde
              // alimentaba el area scrolleable del overflow-x-auto: de ahi la
              // barra horizontal que no se iba. Suman ~828px contra los 896px
              // del max-w-4xl, ~68px de holgura.
              return (
                /**
                 * UNA FILA POR VISITA, no por servicio.
                 *
                 * El paciente paga "lo del 5 de agosto": servicios, férulas y
                 * labs de esa consulta se cobran juntos, así que el monto se
                 * escribe una sola vez. Antes había un campo por línea y una
                 * visita con seis cargos eran seis campos para un solo cobro.
                 *
                 * El detalle se despliega y muestra CUÁNTO toma cada línea con
                 * el monto que se está escribiendo: el reparto va en orden hasta
                 * agotar la plata, y verlo en vivo es lo que evita que sea una
                 * regla oculta.
                 */
                <>
                {/* ── Encabezados ─────────────────────────────────────────
                    La fila mostraba DOS montos pegados —lo que se debe y lo que
                    se va a cobrar— y nada decía cuál era cuál: el que cobra veía
                    "$224.00" y "0.00" al lado y tenía que adivinar en qué casilla
                    escribir (Erick, 16-sep, mirando la pantalla). El detalle
                    desplegado ya tenía encabezados; la lista de arriba, no. */}
                <div className="flex items-center gap-3 px-4 py-1.5 bg-bg-2/40 border-b border-row-sep text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  <span className="flex-1 min-w-0">{t('payColVisit')}</span>
                  <span className="w-[92px] text-right shrink-0">{t('payColPending')}</span>
                  <span className="w-[110px] text-right shrink-0">{t('payColPay')}</span>
                  <span className="w-[66px] shrink-0" aria-hidden="true" />
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-row-sep">
                  {visitasDelModal.map(v => {
                    const monto = parseFloat(payAmounts[v.key] ?? '0') || 0;
                    const reparto = repartir(v.lineas, monto);
                    const abierta = detalleVisita === v.key;
                    return (
                      <div key={v.key}>
                        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setDetalleVisita(abierta ? null : v.key)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            {abierta
                              ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                            <span className="text-[13px] font-semibold text-text-1 whitespace-nowrap">
                              {fmtDate(v.fecha)}
                            </span>
                            <span className="text-[11px] text-text-muted">
                              {t('payVisitLines', { count: v.lineas.length })}
                            </span>
                            {/* Pago parcial, a la vista sin desplegar: "a veces no
                                pagan todo" es el caso normal, y saber cuánto queda
                                es lo que se le dice al paciente antes de que se
                                vaya. El reparto por servicio está en el detalle. */}
                            {monto > 0 && monto < v.saldo && (
                              <span className="text-[11px] text-amber whitespace-nowrap">
                                {t('payLeftOver', { amount: fmt$(v.saldo - monto) })}
                              </span>
                            )}
                            {monto > 0 && monto >= v.saldo && (
                              <span className="text-[11px] text-emerald whitespace-nowrap">
                                {t('payFullVisit')}
                              </span>
                            )}
                          </button>

                          {/* Ancho fijo para que quede debajo de su encabezado:
                              una píldora que se encoge con el monto no forma
                              columna y vuelve a mezclarse con el campo de al lado. */}
                          <span className="w-[92px] flex justify-end shrink-0">
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose/10 text-rose text-xs font-mono font-bold whitespace-nowrap">
                              {fmt$(v.saldo)}
                            </span>
                          </span>

                          <input
                            type="number"
                            min="0"
                            max={v.saldo}
                            step="0.01"
                            value={payAmounts[v.key] ?? ''}
                            /**
                             * Tope al ESCRIBIR, no al salir del campo: si tecleás
                             * 500 sobre una visita de $125, el campo se queda en
                             * 125. Es como funcionaba el "Distribuir hasta $X" de
                             * siempre — dejarlo pasar y corregir al blur hacía
                             * dudar de si el monto había entrado o no.
                             */
                            onChange={e => {
                              const raw = parseFloat(e.target.value);
                              const val = !isNaN(raw) && raw > v.saldo ? v.saldo.toFixed(2) : e.target.value;
                              setPayAmounts(prev => ({ ...prev, [v.key]: val }));
                            }}
                            onBlur={e => {
                              const raw = parseFloat(e.target.value);
                              if (!isNaN(raw)) {
                                const clamped = Math.min(Math.max(0, raw), v.saldo);
                                setPayAmounts(prev => ({ ...prev, [v.key]: clamped.toFixed(2) }));
                              }
                            }}
                            placeholder="0.00"
                            aria-label={`${t('payColPay')} ${fmtDate(v.fecha)}`}
                            /* Con borde, como todos los demás campos del modal.
                               Sin él, sobre el fondo oscuro se leía como un texto
                               fijo más y no como la casilla donde hay que escribir. */
                            className="w-[110px] shrink-0 rounded-md bg-bg-2 border border-border px-2 py-1 text-xs font-mono text-right text-text-1 outline-none focus:border-brand transition-colors"
                          />

                          {/* Los dos atajos en un bloque de ancho fijo, para que
                              la columna de cobro de arriba no se corra de fila
                              en fila. */}
                          <span className="w-[66px] flex items-center justify-end gap-1 shrink-0">
                            {/* Cobrar toda la visita sin escribir el monto */}
                            <button
                              type="button"
                              onClick={() => setPayAmounts(prev => ({ ...prev, [v.key]: v.saldo.toFixed(2) }))}
                              className="text-[11px] font-semibold text-brand-text hover:underline"
                            >
                              {t('payAllVisit')}
                            </button>

                            <button
                              type="button"
                              disabled={monto <= 0}
                              onClick={() => { setNoteDraft(payNotes[v.key] ?? ''); setNoteDialogFor(v.key); }}
                              className={`p-1 rounded transition-colors hover:text-cyan disabled:opacity-30 ${
                                payNotes[v.key] ? 'text-cyan' : 'text-text-muted'
                              }`}
                              title={t('payNoteTooltip')}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        </div>

                        {abierta && (
                          <div className="px-4 pb-3 pt-0 bg-bg-2/30">
                            <table className="w-full text-[11.5px]">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                                  <th className="text-left py-1.5">{t('payColService')}</th>
                                  <th className="text-right py-1.5">{t('payColPending')}</th>
                                  <th className="text-right py-1.5">{t('payColTakes')}</th>
                                  <th className="w-8 py-1.5" />
                                </tr>
                              </thead>
                              <tbody>
                                {v.lineas.map(l => (
                                  <tr key={l.id} className="text-text-2">
                                    <td className="py-1 pr-2">
                                      {l.serviceCode && <span className="font-mono text-cyan mr-1.5">{l.serviceCode}</span>}
                                      {l.serviceDescription ?? '—'}
                                      {/* Qué es cada línea. Sin esto, dos labs y una
                                          inyección se veían idénticas bajo "SERVICE" y
                                          el que cobra no sabía qué estaba cobrando. */}
                                      {l.origin && l.origin !== 'CPT' && (
                                        <span className={`ml-2 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-px rounded-full ${ORIGEN_CLASE[l.origin]}`}>
                                          {t(ORIGEN_CLAVE[l.origin])}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1 text-right font-mono tabular-nums">{fmt$(l.balanceDue)}</td>
                                    <td className={`py-1 text-right font-mono tabular-nums ${reparto[l.id] ? 'text-emerald' : 'text-text-muted'}`}>
                                      {reparto[l.id] ? fmt$(reparto[l.id]) : '—'}
                                    </td>
                                    {/* Cobrar SOLO esta línea, con su propio
                                        origen y método — ver `lineaAPagar`. */}
                                    <td className="py-1 text-right">
                                      <button
                                        type="button"
                                        onClick={() => abrirPagoDeLinea(l)}
                                        title={t('lpTooltip')}
                                        aria-label={t('lpTooltip')}
                                        className="p-1 rounded text-text-muted hover:text-emerald transition-colors"
                                      >
                                        <CreditCard className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
              );
            })()}

            </div>{/* /zona scrolleable */}

            {/* Registrar pago — footer */}
            <div className="shrink-0 px-5 py-4 border-t border-border bg-bg-2/30 space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payRegister')}</div>

              {/* Fila selects: Source | Método | Tipo  (para Seguro: Source | Método | Carrier) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SelectUp
                  value={paySource}
                  onChange={v => {
                    const src = v as typeof paySource;
                    /**
                     * Cambiar de fuente puede cambiar de CIRCUITO, y entonces
                     * la lista de cargos de arriba es otra. Los montos que
                     * había tecleados pertenecían a cargos que ya no están en
                     * pantalla: si no se limpian, se registran contra líneas
                     * que el que cobra dejó de ver.
                     */
                    if (circuitoDe(src) !== circuitoDe(paySource)) {
                      setPayAmounts({});
                      setPayNotes({});
                      setDetalleVisita(null);
                    }
                    setPaySource(src);
                    setPayType(PAYMENT_TYPES[src]?.[0]?.value ?? '');
                    if (src === 'INSURANCE') setPayInsuranceId(insurances[0]?.id ?? '');
                  }}
                  options={sourceOptions}
                />
                <SelectUp
                  value={payMethod}
                  onChange={setPayMethod}
                  options={methodOptions}
                />
                {paySource === 'INSURANCE' ? (
                  <SelectUp
                    value={payInsuranceId}
                    onChange={setPayInsuranceId}
                    options={insuranceOptions.length ? insuranceOptions : [{ label: t('noInsurances'), value: '' }]}
                    placeholder={t('placeholderInsurance')}
                  />
                ) : (
                  <SelectUp
                    value={payType}
                    onChange={setPayType}
                    options={typeOptions}
                  />
                )}
              </div>

              {/* Segunda fila: tipo de pago del seguro (ancho completo) */}
              {paySource === 'INSURANCE' && (
                <SelectUp
                  value={payType}
                  onChange={setPayType}
                  options={typeOptions}
                />
              )}

              {/* Fila acción: input ancho completo + botón */}
              <div className="flex items-center gap-2">
                {/* El repartidor SOLO con más de una visita.
                    Con una sola no reparte nada: era una segunda casilla de
                    monto, idéntica a la de la fila y justo encima del botón de
                    cobrar, o sea el lugar más fácil para escribir en la
                    equivocada. Con varias visitas sí gana su lugar: llena todas
                    de una. */}
                {visitasDelModal.length > 1 && (
                <input
                  type="number"
                  min="0"
                  max={totalDelModal}
                  step="0.01"
                  placeholder={t('payDistributeUpTo', { amount: fmt$(totalDelModal) })}
                  onChange={e => {
                    const raw = parseFloat(e.target.value);
                    if (!isNaN(raw) && raw > totalDelModal) {
                      e.target.value = totalDelModal.toFixed(2);
                      autoDistribute(totalDelModal.toFixed(2));
                    } else {
                      autoDistribute(e.target.value);
                    }
                  }}
                  className="flex-1 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 font-mono outline-none focus:border-brand"
                  title={t('tipAutoDistribute')}
                />
                )}
                {/* Sin repartidor, el botón no puede quedar solo a la izquierda. */}
                {visitasDelModal.length <= 1 && <div className="flex-1" />}
                <Button
                  size="sm"
                  onClick={submitPayment}
                  disabled={paying || payTotal <= 0 || hasOverpay}
                  className="gap-1.5 bg-amber hover:bg-amber/90 text-black border-0 whitespace-nowrap"
                >
                  {paying
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('payProcessing')}</>
                    : <>{payTotal > 0 ? t('paySubmitAmount', { amount: fmt$(payTotal) }) : t('paySubmit')}</>
                  }
                </Button>
              </div>
            </div>

            {/* Nota de pago — overlay dentro del modal (no un segundo fixed
                encima, para no repetir el problema de dos fondos oscuros
                apilados que ya tuvimos con Servicios + Pagar deuda). */}
            {/* ── Pago de UNA línea ─────────────────────────────────────────
                Mismo patrón que el diálogo de notas: overlay dentro del modal,
                no un Dialog anidado más. Ver `lineaAPagar` para el porqué. */}
            {lineaAPagar && (() => {
              const l = lineaAPagar;
              const tiposLp = PAYMENT_TYPES[lpSource] ?? [];
              const lpMontoNum = parseFloat(lpMonto) || 0;
              const lpDescNum  = parseFloat(lpDescuento) || 0;
              const cobra = Math.min(lpMontoNum, l.balanceDue);
              // Lo cobrado manda: el descuento solo llega hasta lo que quede
              // después de él. Es el mismo orden que aplica el servidor.
              const topeDescuento = Math.max(0, l.balanceDue - cobra);
              const quedaPendiente = Math.max(0, topeDescuento - Math.min(lpDescNum, topeDescuento));
              return (
                <div
                  className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
                  onClick={() => setLineaAPagar(null)}
                >
                  {/* `max-h-full` + scroll: el diálogo tiene ocho campos y es
                      MÁS ALTO que el modal que lo contiene. Sin esto se corta
                      arriba el título y abajo los botones — o sea que no se
                      podía ni registrar ni cancelar (visto en pantalla,
                      16-sep). El encabezado y el pie quedan fijos y lo que
                      scrollea es el medio. */}
                  <div
                    /* `max-w-2xl` (672px) y no `max-w-md` (448px).
                       Vivía en la mitad del ancho de un modal de 896px, con
                       ocho campos en dos columnas de ~200px: "Insurance payment
                       (Ins)" se partía en dos líneas, y el diálogo terminaba
                       más ALTO que el modal que lo contiene, con scroll propio.
                       Ancho sobraba (Erick, 16-sep). */
                    className="bg-bg-1 border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-full flex flex-col"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
                      <div className="min-w-0">
                        <h3 className="text-text-1 font-semibold text-base">{t('lpTitle')}</h3>
                        {/* "Service: <código> - <descripción>", como en el v2. */}
                        <p className="text-text-muted text-xs mt-0.5 truncate">
                          <span className="mr-1">{t('lpServicePrefix')}</span>
                          {l.serviceCode && <span className="font-mono text-cyan">{l.serviceCode} - </span>}
                          {l.serviceDescription ?? '—'}
                        </p>
                      </div>
                      <button onClick={() => setLineaAPagar(null)} className="text-text-muted hover:text-text-1 transition-colors p-1 shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 space-y-3 overflow-y-auto">
                      {/* Costo y pendiente de ESA línea, como en el v2 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md bg-bg-2/40 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('lpCost')}</div>
                          <div className="font-mono text-text-1 text-sm mt-0.5">{fmt$(l.totalCost)}</div>
                        </div>
                        <div className="rounded-md bg-bg-2/40 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payColPending')}</div>
                          <div className="font-mono text-rose text-sm mt-0.5">{fmt$(l.balanceDue)}</div>
                        </div>
                      </div>

                      {/* Los TRES selectores en una fila: quién paga, cómo y de
                          qué tipo son la misma pregunta partida en tres, y con
                          672px entran juntos. Antes iban en dos filas de a dos
                          y el tipo quedaba separado del origen que lo determina. */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('lpWhoPays')}</label>
                          <SelectUp
                            value={lpSource}
                            onChange={v => {
                              const src = v as typeof lpSource;
                              setLpSource(src);
                              setLpType(PAYMENT_TYPES[src]?.[0]?.value ?? '');
                            }}
                            options={sourceOptions}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('lpMethod')}</label>
                          <SelectUp value={lpMethod} onChange={setLpMethod} options={methodOptions} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('lpType')}</label>
                          <SelectUp value={lpType} onChange={setLpType} options={tiposLp} className="mt-1" />
                        </div>
                      </div>

                      {/* Y los tres montos juntos, que es la cuenta que hay que
                          leer de un vistazo: cobro + descuento = lo que queda. */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('lpAmount')}</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={l.balanceDue}
                            value={lpMonto}
                            onChange={e => {
                              const raw = parseFloat(e.target.value);
                              // Mismo tope al escribir que el campo por visita.
                              setLpMonto(!isNaN(raw) && raw > l.balanceDue ? l.balanceDue.toFixed(2) : e.target.value);
                            }}
                            className="w-full mt-1 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm font-mono text-right text-text-1 outline-none focus:border-brand"
                          />
                        </div>

                        {/* ── Descuento ─────────────────────────────────────
                            Lo que la clínica PERDONA en este mismo cobro.
                            Existe porque "Reduction agreement (Red AG)" ya era
                            un tipo de pago elegible y no había dónde anotar
                            cuánto se condonó: el saldo quedaba colgado para
                            siempre aunque el caso estuviera cerrado.

                            Cuelga del PAGO, así que anularlo lo devuelve. Y no
                            suma a lo cobrado: es plata que se resigna. */}
                        <div>
                          <div className="flex items-baseline justify-between gap-2">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('lpDiscount')}</label>
                            {/* Atajo al caso real: el acuerdo dice cuánto paga el
                                abogado y lo demás se condona. Escribir esa resta
                                a mano es de donde salen los saldos de $0.01. */}
                            {topeDescuento > 0 && (
                              <button
                                type="button"
                                onClick={() => setLpDescuento(topeDescuento.toFixed(2))}
                                className="text-[11px] font-semibold text-brand-text hover:underline"
                              >
                                {t('lpDiscountRest')}
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={topeDescuento}
                            value={lpDescuento}
                            onChange={e => {
                              const raw = parseFloat(e.target.value);
                              setLpDescuento(!isNaN(raw) && raw > topeDescuento ? topeDescuento.toFixed(2) : e.target.value);
                            }}
                            placeholder="0.00"
                            className="w-full mt-1 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm font-mono text-right text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
                          />
                          {/* El monto arranca en el saldo entero, así que el tope
                              del descuento arranca en 0 y el campo se traga lo
                              que se teclee. En vez de dejarlo pasar por mudo,
                              dice por qué y qué hacer. */}
                          {topeDescuento <= 0 && l.balanceDue > 0 && (
                            <p className="mt-1 text-[10px] text-text-muted leading-snug">{t('lpDiscountNeedsRoom')}</p>
                          )}
                        </div>
                        {/* El saldo que queda DESPUÉS de cobrar y perdonar: es
                            la comprobación de que el descuento hizo lo que se
                            esperaba. Sin esto hay que registrar y después mirar. */}
                        <div className="rounded-md bg-bg-2/40 px-3 py-2 self-end">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('lpRemaining')}</div>
                          <div className={`font-mono text-sm mt-0.5 ${quedaPendiente > 0 ? 'text-rose' : 'text-emerald'}`}>
                            {fmt$(quedaPendiente)}
                          </div>
                        </div>
                      </div>

                      {lpDescNum > 0 && (
                        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                          {t('lpDiscountHint', { amount: fmt$(Math.min(lpDescNum, topeDescuento)) })}
                        </div>
                      )}

                      <div>
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('payNotesLabel')}</label>
                        <textarea
                          value={lpNotas}
                          onChange={e => setLpNotas(e.target.value)}
                          rows={2}
                          placeholder={t('lpNotesPlaceholder')}
                          className="w-full mt-1 rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand resize-none"
                        />
                      </div>
                    </div>

                    <div className="shrink-0 px-5 py-4 border-t border-border flex flex-col sm:flex-row justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setLineaAPagar(null)} className="w-full sm:w-auto">
                        {tc('cancel')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={lpGuardando || (lpMontoNum + lpDescNum) <= 0}
                        onClick={registrarPagoDeLinea}
                        className="w-full sm:w-auto gap-1.5"
                      >
                        {lpGuardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {t('lpRegister')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {noteDialogFor && (() => {
              // `noteDialogFor` es la clave de la VISITA (antes era un billingId):
              // la nota describe el cobro completo, que ahora se hace por visita.
              const v = visitasDelModal.find(x => x.key === noteDialogFor);
              if (!v) return null;
              return (
                <div
                  className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
                  onClick={() => setNoteDialogFor(null)}
                >
                  <div
                    className="bg-bg-1 border border-border rounded-xl w-full max-w-md shadow-2xl"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                      <div>
                        <h3 className="text-text-1 font-semibold text-base">{t('payNoteTitle')}</h3>
                        <p className="text-text-muted text-xs mt-0.5">{t('payNoteHint', { date: fmtDate(v.fecha) })}</p>
                      </div>
                      <button onClick={() => setNoteDialogFor(null)} className="text-text-muted hover:text-text-1 transition-colors p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-text-1">{t('payNotesLabel')}</label>
                        <span className="text-[10px] text-text-muted">{noteDraft.length} caracteres</span>
                      </div>
                      <textarea
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        rows={4}
                        placeholder="Agrega detalles del pago, número de cheque, referencia, etc..."
                        className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand resize-none"
                      />
                    </div>
                    <div className="px-5 py-4 border-t border-border flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => {
                          setPayNotes(prev => ({ ...prev, [noteDialogFor]: noteDraft }));
                          setNoteDialogFor(null);
                        }}
                      >
                        {t('payNoteSave')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

        </DialogContent>
      </Dialog>
    </div>
  );
});
