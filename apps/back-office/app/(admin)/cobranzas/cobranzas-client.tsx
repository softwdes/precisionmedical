'use client';

/**
 * Cobranzas — la cola del encargado de cobranza.
 *
 * ## Qué cuenta esta pantalla (y qué NO)
 *
 * Suma `appointment_billing`: los cargos del caso, con sus pagos. Es el mismo
 * dinero que muestra el tab **Finanzas** de cada caso, y por eso los números
 * tienen que coincidir al centavo.
 *
 * **No es lo mismo que Billing (Brunella)**, que arma su tablero desde
 * `visit_service_codes` —los CPT de la nota clínica— para generar HCFA. Son dos
 * mundos distintos y van a dar cifras distintas: si alguien los compara sin
 * saberlo, va a concluir que uno de los dos está roto.
 *
 * ## Por qué existe
 *
 * Hasta hoy la única forma de cobrarle a un caso era entrar al caso. El que
 * cobra trabaja al revés: tiene una pila de facturas y busca a la persona.
 * Además, recepción a veces no cobra o cobra sin cargarlo al sistema, y esos
 * pagos se registran desde acá contra la factura en mano (Erick, 16-sep-2026).
 *
 * ## El orden
 *
 * Los que deben arriba, alfabético dentro de cada grupo; los que no deben,
 * abajo, también alfabético. Es decisión de Erick y NO es por monto: se busca
 * por nombre, con la factura en la mano.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search, Loader2, ChevronRight, ChevronDown, DollarSign,
  Wallet, HandCoins, Scale, ChevronLeft, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { Button } from '@precision/ui';
import {
  PageHeader, KpiCard, DataTable, TableFooter, EmptyState, PersonAvatar, Skeleton,
  FotoGrandeDialog, type FotoGrande,
} from '@/components/ui-phoenix';
import { FinanzasTab, type FinanzasTabHandle } from '@/components/cases/finanzas-tab';
import { localeApp } from '@/lib/fechas';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Fila {
  patientId: string;
  patientCode: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  total: number;
  pagado: number;
  descontado: number;
  deuda: number;
  casosConDeuda: number;
  unicoCaseId: string | null;
  bufetes: string | null;
  /** Selfie del paciente, firmada. Solo el 17,3% tiene; el resto son iniciales. */
  photoUrl: string | null;
}

interface Resumen {
  pacientes: number; conDeuda: number;
  total: number; pagado: number; descontado: number; deuda: number;
}

interface CasoDetalle {
  caseId: string; caseCode: string; caseType: string; status: string;
  bufete: string | null; aseguradora: string | null;
  total: number; pagado: number; descontado: number; deuda: number; cargos: number;
}

interface PagoDetalle {
  id: string; billingId: string; caseId: string | null; caseCode: string | null;
  amount: number; discount: number;
  source: 'INSURANCE' | 'PATIENT' | 'LAWYER';
  method: string; paymentType: string | null;
  insuranceCarrier: { id: string; name: string } | null;
  notes: string | null; paidAt: string;
  serviceCode: string | null; serviceDescription: string | null;
  appointmentDate: string | null;
}

interface Detalle { casos: CasoDetalle[]; pagos: PagoDetalle[] }

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

function fmt$(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeApp(), {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

// ─── Pantalla ──────────────────────────────────────────────────────────────────

export function CobranzasClient() {
  const t  = useTranslations('phoenix.cobranzas');
  const tc = useTranslations('phoenix.common');

  const [q, setQ]                 = useState('');
  const [page, setPage]           = useState(0);
  const [filas, setFilas]         = useState<Fila[]>([]);
  const [total, setTotal]         = useState(0);
  const [resumen, setResumen]     = useState<Resumen | null>(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState<string | null>(null);

  /** Fila desplegada y su detalle, cacheado por paciente. */
  const [abierta, setAbierta]     = useState<string | null>(null);
  const [detalles, setDetalles]   = useState<Record<string, Detalle>>({});
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null);

  /**
   * El caso que se está cobrando.
   *
   * El modal de cobro NO se reimplementa acá: se monta `FinanzasTab` escondido
   * con ese caso y se le pide que abra el suyo. Es el mismo componente del tab
   * Finanzas —con el reparto por visita, el pago por línea, el descuento y la
   * anulación—, y es el mismo patrón que ya usa el panel del calendario. Una
   * segunda implementación del cobro sería una segunda forma de equivocarse
   * con la plata.
   */
  const [cobrando, setCobrando] = useState<{ caseId: string; patientId: string } | null>(null);
  const finanzasRef = useRef<FinanzasTabHandle>(null);

  /** La cara que se está mirando en grande, o `null`. Ver `FotoGrandeDialog`. */
  const [fotoGrande, setFotoGrande] = useState<FotoGrande | null>(null);

  // ── Carga de la lista ──────────────────────────────────────────────────────

  /** El texto se manda con retardo: tipear no puede disparar una consulta por tecla. */
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => { setQDebounced(q); setPage(0); }, 350);
    return () => clearTimeout(id);
  }, [q]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (qDebounced.trim()) params.set('q', qDebounced.trim());
      const res = await fetch(`/api/admin/cobranzas?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFilas(data.filas ?? []);
      setTotal(data.total ?? 0);
      setResumen(data.resumen ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [page, qDebounced]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Detalle de una fila ────────────────────────────────────────────────────

  const traerDetalle = useCallback(async (patientId: string, forzar = false) => {
    if (!forzar && detalles[patientId]) return;
    setCargandoDetalle(patientId);
    try {
      const res = await fetch(`/api/admin/cobranzas/${patientId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetalles(prev => ({ ...prev, [patientId]: { casos: data.casos ?? [], pagos: data.pagos ?? [] } }));
    } catch {
      /* La fila desplegada muestra su propio vacío; no se rompe la lista entera. */
    } finally {
      setCargandoDetalle(null);
    }
  }, [detalles]);

  function alternar(patientId: string) {
    if (abierta === patientId) { setAbierta(null); return; }
    setAbierta(patientId);
    void traerDetalle(patientId);
  }

  /**
   * Agrandar la cara, con una URL RECIÉN firmada.
   *
   * No se reusa la que trajo la lista: vence a los 15 minutos y esta pantalla
   * es una cola que se deja abierta mientras se llama por teléfono. Media hora
   * después esa URL ya no sirve y se vería el ícono de imagen rota.
   *
   * Se abre primero con la de la lista —así el clic responde al instante y en
   * el caso normal ni se nota— y se reemplaza cuando llega la fresca. Si el
   * pedido falla, queda la vieja: peor sería no abrir nada.
   */
  const abrirFoto = useCallback(async (f: Fila) => {
    const nombre = `${f.firstName} ${f.lastName}`.trim();
    if (f.photoUrl) setFotoGrande({ url: f.photoUrl, nombre });
    try {
      const res = await fetch(`/api/admin/cobranzas/${f.patientId}/foto`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.photoUrl) setFotoGrande({ url: data.photoUrl, nombre: data.nombre || nombre });
    } catch {
      /* Queda la URL de la lista. */
    }
  }, []);

  // ── Cobro ──────────────────────────────────────────────────────────────────

  /**
   * Con un solo caso con saldo va derecho al modal. Con varios despliega la
   * fila para que se elija: un pago no puede repartirse entre dos casos, que
   * pueden tener pagadores distintos (el abogado del MVA y el seguro de salud
   * del GENERAL).
   */
  function cobrar(f: Fila) {
    if (f.casosConDeuda === 1 && f.unicoCaseId) {
      setCobrando({ caseId: f.unicoCaseId, patientId: f.patientId });
      return;
    }
    setAbierta(f.patientId);
    void traerDetalle(f.patientId);
  }

  /**
   * Abrir el modal apenas monta el componente del caso.
   *
   * `openWhenLoaded` y no `reloadAndOpen`: el segundo abre primero con lo que
   * haya, y acá el componente acaba de montarse, así que "lo que haya" es
   * nada — el modal mostraba "TOTAL PENDING $0.00 · 0 visitas" medio segundo
   * antes de llenarse (visto en navegador con MVA-2436, que debe $1.375,80).
   *
   * Llamada directa, sin `requestAnimationFrame`. El ref ya está enganchado:
   * `useImperativeHandle` del hijo corre como efecto de layout, o sea ANTES
   * que este efecto del padre. Y el rAF además rompía de verdad — **no dispara
   * en una pestaña que no se está pintando**, así que el botón no hacía nada si
   * la ventana estaba en segundo plano (visto en navegador con el panel
   * oculto). Un cobro no puede depender de que la pestaña esté a la vista.
   */
  useEffect(() => {
    if (!cobrando) return;
    finanzasRef.current?.openWhenLoaded();
  }, [cobrando]);

  /** Se cobró algo: la fila y los totales de arriba quedaron viejos. */
  const alCobrar = useCallback(() => {
    void cargar();
    if (cobrando) void traerDetalle(cobrando.patientId, true);
  }, [cargar, cobrando, traerDetalle]);

  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde   = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const hasta   = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={
          <Button variant="outline" size="sm" onClick={() => cargar()} disabled={cargando} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>
        }
      />

      {/* KPIs — de la BÚSQUEDA entera, no de las filas visibles. */}
      {/* Una sola columna en el telefono, no dos. Medido a 375px: "$1,487,377.89"
          necesita 164px y en media pantalla la tarjeta le da 80 — el numero se
          salia y la pagina agarraba 22px de scroll horizontal (Regla #4). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiBilled')} value={resumen ? fmt$(resumen.total) : '—'}
          icon={DollarSign} iconBg="bg-brand/10" iconColor="text-brand-text" compact
        />
        <KpiCard
          label={t('kpiCollected')} value={resumen ? fmt$(resumen.pagado) : '—'}
          color="text-emerald" icon={Wallet} iconBg="bg-emerald/10" iconColor="text-emerald" compact
        />
        <KpiCard
          label={t('kpiDiscounted')} value={resumen ? fmt$(resumen.descontado) : '—'}
          color="text-amber" icon={HandCoins} iconBg="bg-amber/10" iconColor="text-amber" compact
          sub={t('kpiDiscountedHint')}
        />
        <KpiCard
          label={t('kpiDebt')} value={resumen ? fmt$(resumen.deuda) : '—'}
          color="text-rose" icon={Scale} iconBg="bg-rose/10" iconColor="text-rose" compact
          sub={resumen ? t('kpiDebtHint', { count: resumen.conDeuda }) : undefined}
        />
      </div>

      <DataTable.Card>
        {/* Buscador */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-md bg-bg-2 border border-border pl-8 pr-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
            />
          </div>
          {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />}
        </div>

        {error ? (
          <EmptyState.Rich icon={AlertTriangle} title={t('errorTitle')} subtitle={error} />
        ) : cargando && filas.length === 0 ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.1 }} />
            ))}
          </div>
        ) : filas.length === 0 ? (
          <EmptyState.Rich icon={Search} title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
        ) : (
          <DataTable.Scroll>
            <DataTable.Table className="min-w-[900px]">
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('colPatient')}</DataTable.Th>
                <DataTable.Th className="hidden md:table-cell">{t('colContact')}</DataTable.Th>
                <DataTable.Th className="hidden lg:table-cell">{t('colWhoPays')}</DataTable.Th>
                <DataTable.Th align="right">{t('colTotal')}</DataTable.Th>
                <DataTable.Th align="right">{t('colPaid')}</DataTable.Th>
                {/* Descontado es la ultima en aparecer: EXPLICA la resta, no se
                    acciona. A 1280px la tabla pedia 1031px en un contenedor de
                    964 y la que se iba detras de la columna fija de acciones era
                    DEUDA, la razon de ser de la pantalla (medido en navegador).
                    Sin esta, entra entera. */}
                <DataTable.Th align="right" className="hidden 2xl:table-cell">{t('colDiscounted')}</DataTable.Th>
                <DataTable.Th align="right">{t('colDebt')}</DataTable.Th>
                <DataTable.Th align="right" sticky="right">{tc('actions')}</DataTable.Th>
              </DataTable.Head>
              <tbody>
                {filas.map(f => {
                  const detalle = detalles[f.patientId];
                  const estaAbierta = abierta === f.patientId;
                  return (
                    <FilaPaciente
                      key={f.patientId}
                      f={f}
                      abierta={estaAbierta}
                      detalle={detalle}
                      cargandoDetalle={cargandoDetalle === f.patientId}
                      onAlternar={() => alternar(f.patientId)}
                      onFoto={() => abrirFoto(f)}
                      onCobrar={() => cobrar(f)}
                      onCobrarCaso={(caseId) => setCobrando({ caseId, patientId: f.patientId })}
                      t={t}
                      tc={tc}
                    />
                  );
                })}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
        )}

        <TableFooter
          left={t('footerCount', { desde, hasta, total })}
          right={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-muted">{t('footerPage', { page: page + 1, pages: paginas })}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || cargando}
                className="p-1 rounded text-text-muted hover:text-text-1 disabled:opacity-30 transition-colors"
                aria-label={t('previous')}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(paginas - 1, p + 1))}
                disabled={page >= paginas - 1 || cargando}
                className="p-1 rounded text-text-muted hover:text-text-1 disabled:opacity-30 transition-colors"
                aria-label={t('next')}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          }
        />
      </DataTable.Card>

      <FotoGrandeDialog foto={fotoGrande} onClose={() => setFotoGrande(null)} cerrarLabel={tc('close')} />

      {/* FinanzasTab escondido — el dueño del modal de cobro. Ver `cobrando`. */}
      {cobrando && (
        <div className="h-0 overflow-hidden">
          <FinanzasTab
            key={cobrando.caseId}
            ref={finanzasRef}
            caseId={cobrando.caseId}
            onChanged={alCobrar}
          />
        </div>
      )}
    </div>
  );
}

// ─── Una fila, con su desplegable ──────────────────────────────────────────────

type Traducir = ReturnType<typeof useTranslations>;

function FilaPaciente({
  f, abierta, detalle, cargandoDetalle, onAlternar, onFoto, onCobrar, onCobrarCaso, t, tc,
}: {
  f: Fila;
  abierta: boolean;
  detalle: Detalle | undefined;
  cargandoDetalle: boolean;
  onAlternar: () => void;
  onFoto: () => void;
  onCobrar: () => void;
  onCobrarCaso: (caseId: string) => void;
  t: Traducir;
  tc: Traducir;
}) {
  const nombre = `${f.firstName} ${f.lastName}`.trim();
  const sinDeuda = f.deuda <= 0;

  return (
    <>
      <DataTable.Row muted={sinDeuda}>
        <DataTable.Td sticky="left">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onAlternar}
              className="shrink-0 text-text-muted hover:text-text-1 transition-colors"
              aria-expanded={abierta}
              aria-label={abierta ? t('collapseRow') : t('expandRow')}
            >
              {abierta
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {/* La carita se agranda al hacerle clic, pero SOLO cuando hay foto:
                sin ella son las iniciales y no hay nada que abrir. Un botón que
                existe siempre y no hace nada el 83% de las veces enseña a no
                hacerle clic. Mismo criterio que la lista de pacientes. */}
            {f.photoUrl ? (
              <button
                type="button"
                onClick={onFoto}
                title={t('viewPhoto')}
                aria-label={t('viewPhoto')}
                className="shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                <PersonAvatar firstName={f.firstName} lastName={f.lastName} size={6} photoUrl={f.photoUrl} />
              </button>
            ) : (
              <PersonAvatar firstName={f.firstName} lastName={f.lastName} size={6} />
            )}
            <button type="button" onClick={onAlternar} className="min-w-0 text-left">
              <span className="block text-text-1 truncate">{nombre || '—'}</span>
              {f.patientCode && (
                <span className="block text-[10px] font-mono text-text-muted">{f.patientCode}</span>
              )}
            </button>
          </div>
        </DataTable.Td>

        {/* Teléfono y email en UNA columna: solo el 45% de los que deben tiene
            teléfono cargado, y dos columnas dejarían una medio vacía robándole
            ancho a las cifras. */}
        <DataTable.Td className="hidden md:table-cell">
          <span className="block text-[12.5px] text-text-2">{f.phone || '—'}</span>
          {f.email && <span className="block text-[10px] text-text-muted truncate max-w-[200px]">{f.email}</span>}
        </DataTable.Td>

        {/* Quién paga. Importa más que el nombre: casi toda la deuda es de
            terceros, así que esta columna dice a quién hay que llamar. */}
        <DataTable.Td className="hidden lg:table-cell">
          <span className="text-[12.5px] text-text-2">{f.bufetes || t('noFirm')}</span>
        </DataTable.Td>

        <DataTable.Td align="right"><span className="font-mono text-xs tabular-nums text-text-2">{fmt$(f.total)}</span></DataTable.Td>
        <DataTable.Td align="right"><span className="font-mono text-xs tabular-nums text-emerald">{fmt$(f.pagado)}</span></DataTable.Td>
        <DataTable.Td align="right" className="hidden 2xl:table-cell">
          <span className={`font-mono text-xs tabular-nums ${f.descontado > 0 ? 'text-amber' : 'text-text-muted'}`}>
            {fmt$(f.descontado)}
          </span>
        </DataTable.Td>
        <DataTable.Td align="right">
          <span className={`font-mono text-xs tabular-nums font-semibold ${f.deuda > 0 ? 'text-rose' : 'text-text-muted'}`}>
            {fmt$(f.deuda)}
          </span>
        </DataTable.Td>

        <DataTable.Td align="right" sticky="right">
          {/* El botón se MUESTRA siempre y se bloquea explicando por qué: un
              botón que desaparece deja al que cobra preguntándose si la fila
              está mal o si le falta un permiso. */}
          <Button
            size="sm"
            variant={sinDeuda ? 'outline' : 'default'}
            disabled={sinDeuda}
            onClick={onCobrar}
            title={sinDeuda ? t('payDisabled') : undefined}
            className="whitespace-nowrap"
          >
            {t('payDebts')}
          </Button>
        </DataTable.Td>
      </DataTable.Row>

      {abierta && (
        <tr>
          <td colSpan={8} className="bg-bg-2/30 px-4 py-3">
            {cargandoDetalle && !detalle ? (
              <div className="flex items-center gap-2 text-text-muted text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {tc('loading')}
              </div>
            ) : !detalle ? (
              <p className="text-text-muted text-xs py-2">{t('detailError')}</p>
            ) : (
              <div className="space-y-4">
                {/* Los casos. Con más de uno con saldo, el cobro se elige acá:
                    un pago no puede repartirse entre dos casos. */}
                {detalle.casos.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">
                      {t('casesTitle')}
                    </div>
                    <div className="space-y-1">
                      {detalle.casos.map(c => (
                        <div key={c.caseId} className="flex items-center gap-3 flex-wrap rounded-md bg-bg-1 px-3 py-2">
                          <span className="font-mono text-xs text-cyan shrink-0">{c.caseCode}</span>
                          <span className="text-[11px] text-text-muted shrink-0">{c.caseType}</span>
                          <span className="text-[11px] text-text-2 min-w-0 truncate">
                            {c.bufete ?? c.aseguradora ?? t('noFirm')}
                          </span>
                          <span className="ml-auto font-mono text-xs tabular-nums text-text-muted shrink-0">
                            {t('caseOf', { paid: fmt$(c.pagado), total: fmt$(c.total) })}
                          </span>
                          <span className={`font-mono text-xs tabular-nums font-semibold shrink-0 ${c.deuda > 0 ? 'text-rose' : 'text-text-muted'}`}>
                            {fmt$(c.deuda)}
                          </span>
                          <Button
                            size="sm"
                            variant={c.deuda > 0 ? 'default' : 'outline'}
                            disabled={c.deuda <= 0}
                            onClick={() => onCobrarCaso(c.caseId)}
                            title={c.deuda <= 0 ? t('payDisabled') : undefined}
                            className="shrink-0 whitespace-nowrap"
                          >
                            {t('payDebts')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Los pagos ya hechos. */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">
                    {t('paymentsTitle')} <span className="font-normal normal-case">({detalle.pagos.length})</span>
                  </div>
                  {/* ⚠️ `table-fixed` con anchos explícitos, y no es cosmético.
                      Una tabla auto dentro de un `<td colSpan>` le EXIGE su
                      ancho a la tabla de afuera: con una descripción larga de
                      CPT esta medía 1.724px, empujaba la tabla de pacientes de
                      900 a 1.757px y las cuatro columnas de plata se iban de
                      pantalla al desplegar una fila (visto en navegador). Con
                      `table-fixed` los anchos mandan y el texto largo se corta
                      en vez de estirar. */}
                  {detalle.pagos.length === 0 ? (
                    <p className="text-text-muted text-[11px]">{t('noPayments')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full table-fixed text-[11.5px] min-w-[620px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-text-muted border-b border-row-sep">
                            <th className="text-left py-1.5 pr-3 w-[92px]">{t('pColDate')}</th>
                            <th className="text-right py-1.5 pr-3 w-[110px]">{t('pColAmount')}</th>
                            <th className="text-left py-1.5 pr-3 w-[110px]">{t('pColSource')}</th>
                            <th className="text-left py-1.5 pr-3 w-[80px]">{t('pColMethod')}</th>
                            <th className="text-left py-1.5 pr-3 w-[120px]">{t('pColType')}</th>
                            <th className="text-left py-1.5">{t('pColAppliedTo')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalle.pagos.map(p => (
                            <tr key={p.id} className="border-b border-row-sep last:border-0">
                              <td className="py-1.5 pr-3 whitespace-nowrap font-mono text-text-1">{fmtFecha(p.paidAt)}</td>
                              <td className="py-1.5 pr-3 text-right whitespace-nowrap font-mono tabular-nums text-emerald font-semibold">
                                {fmt$(p.amount)}
                                {/* Lo perdonado, pegado al monto que explica:
                                    es por qué el saldo bajó más que lo cobrado. */}
                                {p.discount > 0 && (
                                  <div className="text-[10px] font-normal text-amber">
                                    {t('pDiscountRow', { amount: fmt$(p.discount) })}
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 pr-3 whitespace-nowrap text-text-2">
                                {t(`source_${p.source}`)}
                                {p.insuranceCarrier && (
                                  <span className="block text-[10px] text-text-muted truncate max-w-[140px]">
                                    {p.insuranceCarrier.name}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 pr-3 whitespace-nowrap text-text-2">{p.method}</td>
                              <td className="py-1.5 pr-3 text-text-muted truncate">{p.paymentType ?? '—'}</td>
                              <td className="py-1.5">
                                <span className="block text-text-2 truncate">
                                  {p.serviceCode && <span className="font-mono text-cyan mr-1.5">{p.serviceCode}</span>}
                                  {p.serviceDescription ?? '—'}
                                </span>
                                <span className="block text-[10px] text-text-muted truncate">
                                  {p.caseCode && <span className="font-mono mr-1.5">{p.caseCode}</span>}
                                  {t('pVisitOf')} {fmtFecha(p.appointmentDate)}
                                </span>
                                {p.notes && <span className="block text-[10px] italic text-text-muted truncate">{p.notes}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
