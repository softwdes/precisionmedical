'use client';

/**
 * ChargePickerDialog — agregar un cargo a la visita.
 *
 * Una sola búsqueda sobre los DOS catálogos (seguro y efectivo) con los
 * resultados agrupados, más tres botones de vista. Las dos piezas hacen cosas
 * distintas y por eso conviven (diseño acordado con Erick 2026-08-04):
 *
 *  · La BÚSQUEDA siempre recorre los dos catálogos. Es lo que evita el "busqué y
 *    no aparece" cuando el ítem estaba en la otra lista — el error que cometen
 *    las dos pestañas, porque obligan a saber de antemano dónde está.
 *  · Los BOTONES sirven para navegar sin escribir (tocás "Efectivo" con la caja
 *    vacía y ves los 18 ítems, así se aprende qué hay en cada lista) y para bajar
 *    el ruido cuando ya sabés qué querés.
 *
 * Regla irrompible: un filtro activo NUNCA oculta en silencio. Si hay
 * coincidencias en la lista que el filtro dejó fuera, aparece el aviso al pie.
 * Sin eso, los botones reintroducen el problema que la búsqueda unificada
 * resuelve.
 *
 * La cobertura del paciente ORDENA (qué grupo va primero), no filtra: un
 * asegurado compra cosas de bolsillo y con la lista escondida nadie podría
 * cobrárselas.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Search, Loader2, X, Star, Shield, ShieldCheck, ShieldQuestion, Banknote, Scale, Plus } from 'lucide-react';
import type { CoverageDTO } from '@/lib/coverage';

export type BillableSource = 'INSURANCE' | 'CASH';

export interface BillableItem {
  key: string;
  source: BillableSource;
  refId: string;
  code: string;
  name: string;
  price: number;
  category: string | null;
  unitLabel: string | null;
  isFavorite: boolean;
  insuranceCode: string | null;
}

type View = 'ALL' | 'INSURANCE' | 'CASH';

interface Payload {
  pairs: Array<{ insurance: BillableItem; cash: BillableItem }>;
  insurance: BillableItem[];
  cash: BillableItem[];
  counts: { insurance: number; cash: number; pairs: number };
  hiddenByView: { insurance: number; cash: number };
  truncated: { insurance: number };
}

interface Props {
  /**
   * Decide qué grupo se muestra primero y se muestra como referencia arriba del
   * buscador. Nunca oculta el otro grupo.
   */
  coverage: CoverageDTO;
  /** Claves de los CPT ya agregados, para marcarlos "Agregado". */
  addedKeys: Set<string>;
  onClose: () => void;
  onAdd: (item: BillableItem) => Promise<void>;
}

const EMPTY: Payload = {
  pairs: [], insurance: [], cash: [],
  counts: { insurance: 0, cash: 0, pairs: 0 },
  hiddenByView: { insurance: 0, cash: 0 },
  truncated: { insurance: 0 },
};

export function ChargePickerDialog({
  coverage, addedKeys, onClose, onAdd,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.charges');

  const [q, setQ] = React.useState('');
  const [view, setView] = React.useState<View>('ALL');
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const [data, setData] = React.useState<Payload>(EMPTY);
  const [loading, setLoading] = React.useState(true);
  const [addingKey, setAddingKey] = React.useState<string | null>(null);
  const [togglingFav, setTogglingFav] = React.useState<string | null>(null);

  // Con la caja vacía no hay debounce: el listado inicial tiene que aparecer
  // solo, sin escribir nada.
  React.useEffect(() => {
    let alive = true;
    const delay = q ? 300 : 0;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ view });
      if (q) params.set('q', q);
      if (favoritesOnly) params.set('favoritesOnly', 'true');
      fetch(`/api/admin/billable-items?${params}`)
        .then((r) => r.json())
        .then((d: Payload & { ok?: boolean }) => { if (alive && d.ok !== false) setData(d); })
        .catch(() => { if (alive) setData(EMPTY); })
        .finally(() => { if (alive) setLoading(false); });
    }, delay);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, view, favoritesOnly]);

  const toggleFavorite = async (item: BillableItem): Promise<void> => {
    setTogglingFav(item.key);
    const next = !item.isFavorite;
    // Optimista, se revierte si falla.
    setData((prev) => ({
      ...prev,
      insurance: prev.insurance.map((i) => i.key === item.key ? { ...i, isFavorite: next } : i),
    }));
    try {
      const res = await fetch(`/api/admin/services/${item.refId}/favorite`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setData((prev) => ({
        ...prev,
        insurance: prev.insurance.map((i) => i.key === item.key ? { ...i, isFavorite: !next } : i),
      }));
    } finally {
      setTogglingFav(null);
    }
  };

  const add = async (item: BillableItem): Promise<void> => {
    setAddingKey(item.key);
    try { await onAdd(item); }
    finally { setAddingKey(null); }
  };

  const fmt$ = (n: number): string => `$${n.toFixed(2)}`;

  const addBtn = (item: BillableItem, label: string): React.ReactElement => {
    // El bloqueo de "ya agregado" es SOLO para los CPT: el JSON de la cita los
    // indexa por código y un duplicado se perdería igual. En efectivo, dos
    // aplicaciones del mismo inyectable son dos cobros legítimos — por eso cada
    // cargo es su propia fila (ver lib/cash-service-billing.ts).
    const already = item.source === 'INSURANCE' && addedKeys.has(item.key);
    const cash = item.source === 'CASH';
    return (
      <button
        type="button"
        disabled={already || addingKey === item.key}
        onClick={() => void add(item)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors shrink-0 ${
          already
            ? 'bg-emerald/15 text-emerald cursor-not-allowed'
            : cash
              ? 'bg-emerald/15 text-emerald border border-emerald/30 hover:bg-emerald/25'
              : 'bg-cyan/15 text-cyan border border-cyan/30 hover:bg-cyan/25'
        }`}
      >
        {addingKey === item.key
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Plus className="w-3 h-3" />}
        {already ? t('added') : `${label} · ${fmt$(item.price)}`}
      </button>
    );
  };

  const groupLabel = (text: string, count?: number): React.ReactElement => (
    <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5 mt-3 first:mt-0">
      {text}{count !== undefined && <span className="normal-case tracking-normal font-normal"> · {count}</span>}
    </div>
  );

  const insuranceGroup = (
    <div>
      {groupLabel(t('groupInsurance'), data.counts.insurance)}
      {data.insurance.length === 0 ? (
        <div className="text-[11px] text-text-muted italic px-1 py-2">{t('emptyInsurance')}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.insurance.map((i) => (
            <div key={i.key} className="flex items-center gap-2 px-3 py-2 border-b border-row-sep last:border-0 hover:bg-bg-2/30 transition-colors">
              <button
                type="button"
                onClick={() => void toggleFavorite(i)}
                disabled={togglingFav === i.key}
                title={i.isFavorite ? t('removeFavorite') : t('addFavorite')}
                className="text-text-muted hover:text-amber transition-colors disabled:opacity-40 shrink-0"
              >
                <Star className={`w-3.5 h-3.5 ${i.isFavorite ? 'fill-amber text-amber' : ''}`} />
              </button>
              <span className="font-mono text-[11px] text-cyan w-[58px] shrink-0">{i.code}</span>
              <span className="text-xs text-text-1 flex-1 min-w-0 truncate">{i.name}</span>
              {addBtn(i, t('addInsurance'))}
            </div>
          ))}
          {data.truncated.insurance > 0 && (
            <div className="px-3 py-2 text-[11px] text-text-muted bg-bg-2/40">
              {t('truncated', { count: data.truncated.insurance })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const cashGroup = (
    <div>
      {groupLabel(t('groupCash'), data.counts.cash)}
      {data.cash.length === 0 ? (
        <div className="text-[11px] text-text-muted italic px-1 py-2">{t('emptyCash')}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.cash.map((i) => (
            <div key={i.key} className="flex items-center gap-2 px-3 py-2 border-b border-row-sep last:border-0 hover:bg-bg-2/30 transition-colors">
              <span className="font-mono text-[11px] text-emerald w-[58px] shrink-0 truncate" title={i.code}>{i.code}</span>
              <span className="text-xs text-text-1 flex-1 min-w-0 truncate">
                {i.name}
                {i.unitLabel && <span className="text-text-muted"> · {i.unitLabel}</span>}
              </span>
              {/* Aviso, no bloqueo: que nadie cobre en efectivo algo facturable
                  sin saberlo. La decisión sigue siendo del staff. */}
              {i.insuranceCode && (
                <span className="text-[10px] text-cyan hidden sm:inline" title={t('alsoBillable')}>
                  {i.insuranceCode}
                </span>
              )}
              {addBtn(i, t('addCash'))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const pairGroup = data.pairs.length > 0 && (
    <div>
      {groupLabel(t('groupBoth'), data.pairs.length)}
      <div className="space-y-1.5">
        {data.pairs.map((p) => (
          <div key={p.cash.key} className="rounded-lg border border-border p-3">
            <div className="text-[12.5px] text-text-1 mb-2">
              {p.cash.name}
              <span className="font-mono text-[10.5px] text-text-muted ml-2">
                {p.insurance.code} · {p.cash.code}
              </span>
            </div>
            {/* El mismo servicio con sus dos precios: el asegurado que quiere
                pagar de su bolsillo se resuelve acá, sin explicación. */}
            <div className="flex items-center gap-2 flex-wrap">
              {addBtn(p.insurance, t('addInsurance'))}
              {addBtn(p.cash, t('addCash'))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Orden por cobertura: al asegurado se le muestra primero lo de seguro. Los dos
  // grupos están siempre — es orden, no filtro.
  const insuranceFirst = coverage.type === 'INSURANCE';

  // La cobertura, a la vista en el momento de elegir el precio. Sin esto el dato
  // vivía solo en el encabezado de la pantalla y había que acordarse de lo que se
  // leyó dos clicks antes. Es REFERENCIA: no filtra ni bloquea nada.
  const carrier = coverage.carrierName ?? t('covFallbackCarrier');
  const covBanner: { text: string; cls: string; icon: React.ElementType } =
    coverage.type === 'INSURANCE'
      ? coverage.verifyMethod === 'VERIFIED'
        ? { text: t('covInsuranceVerified', { carrier }), cls: 'border-emerald/30 bg-emerald/10 text-emerald', icon: ShieldCheck }
        : { text: t('covInsuranceDeclared', { carrier }), cls: 'border-amber/30 bg-amber/10 text-amber', icon: Shield }
      : coverage.type === 'SELF_PAY'
        ? { text: t('covSelfPay'), cls: 'border-emerald/30 bg-emerald/10 text-emerald', icon: Banknote }
        : coverage.type === 'LIEN'
          ? { text: t('covLien'), cls: 'border-violet/30 bg-violet/10 text-violet', icon: Scale }
          : { text: t('covUnknown'), cls: 'border-amber/30 bg-amber/10 text-amber', icon: ShieldQuestion };
  const CovIcon = covBanner.icon;

  const VIEWS: Array<{ v: View; label: string; count: number; cls: string }> = [
    { v: 'ALL', label: t('viewAll'), count: data.counts.insurance + data.counts.cash + data.counts.pairs,
      cls: 'border-border-strong text-text-1 bg-white/5' },
    { v: 'INSURANCE', label: t('viewInsurance'), count: data.counts.insurance + data.counts.pairs,
      cls: 'border-cyan/40 text-cyan bg-cyan/10' },
    { v: 'CASH', label: t('viewCash'), count: data.counts.cash + data.counts.pairs,
      cls: 'border-emerald/40 text-emerald bg-emerald/10' },
  ];

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <Plus className="w-4 h-4 text-violet shrink-0" />
            {t('pickerTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 shrink-0 space-y-2.5 border-b border-border">
          {/* Quién paga, en el momento de elegir el precio */}
          <div className={`rounded-md border px-3 py-2 text-[11.5px] flex items-start gap-1.5 ${covBanner.cls}`}>
            <CovIcon className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{covBanner.text}</span>
          </div>

          {/* 3 botones de vista con sus conteos. Los conteos enseñan solos que la
              lista de efectivo es chica — cuando falte algo ahí, se va a pedir en
              vez de asumir que no se puede cobrar. */}
          <div className="flex items-center gap-2 flex-wrap">
            {VIEWS.map((b) => (
              <button
                key={b.v}
                type="button"
                onClick={() => setView(b.v)}
                className={`flex-1 min-w-[92px] text-center text-[11.5px] font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                  view === b.v ? b.cls : 'border-border text-text-muted hover:text-text-2 hover:border-border-strong'
                }`}
              >
                {b.label} <span className="font-normal opacity-70">· {b.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full bg-bg-2 border border-border rounded-lg pl-9 pr-9 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-violet transition-colors"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} className="absolute right-3 top-2.5 text-text-muted hover:text-text-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFavoritesOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors shrink-0 ${
                favoritesOnly ? 'bg-amber/15 border-amber/40 text-amber' : 'border-border text-text-2 hover:bg-white/5'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-amber' : ''}`} />
              <span className="hidden sm:inline">{t('favoritesOnly')}</span>
            </button>
          </div>
          <p className="text-[10.5px] text-text-muted">{t('searchesBoth')}</p>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-muted text-xs gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('searching')}
            </div>
          ) : (
            <>
              {pairGroup}
              {/* El grupo que el filtro excluyó no se dibuja vacío: diría "nada
                  con ese nombre" mientras el aviso de abajo dice que sí hay.
                  Filtrado y vacío son cosas distintas. */}
              {insuranceFirst
                ? <>{view !== 'CASH' && insuranceGroup}{view !== 'INSURANCE' && cashGroup}</>
                : <>{view !== 'INSURANCE' && cashGroup}{view !== 'CASH' && insuranceGroup}</>}

              {/* El filtro nunca oculta en silencio. */}
              {data.hiddenByView.cash > 0 && (
                <button
                  type="button"
                  onClick={() => setView('ALL')}
                  className="mt-3 w-full text-left rounded-md border border-emerald/30 bg-emerald/10 px-3 py-2 text-[11.5px] text-emerald hover:bg-emerald/15 transition-colors flex items-center gap-1.5"
                >
                  <Banknote className="w-3.5 h-3.5 shrink-0" />
                  {t('hiddenCash', { count: data.hiddenByView.cash })} — {t('showThem')}
                </button>
              )}
              {data.hiddenByView.insurance > 0 && (
                <button
                  type="button"
                  onClick={() => setView('ALL')}
                  className="mt-3 w-full text-left rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11.5px] text-cyan hover:bg-cyan/15 transition-colors flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  {t('hiddenInsurance', { count: data.hiddenByView.insurance })} — {t('showThem')}
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
