'use client';

/**
 * BracePickerDialog — elegir la férula a entregar.
 *
 * Muestra solo lo que el doctor necesita para decidir: nombre, talla y precio
 * público (decisión de Erick 2026-08-03 — el costo real y los márgenes son del
 * catálogo, no de la consulta).
 *
 * MISMO modelo que el picker de cargos (charge-picker-dialog): botón por
 * renglón, el modal NO se cierra al agregar y lo ya entregado queda marcado.
 * Antes era "seleccionar → panel abajo → Add to visit → se cierra", así que
 * entregar dos férulas en una visita —el caso normal: bota izquierda + muñequera—
 * obligaba a abrir el catálogo dos veces.
 *
 * Lado y cantidad se piden EN EL RENGLÓN, igual que el monto de un ítem sin
 * precio en el picker de cargos: es el mismo problema (falta un dato antes de
 * poder agregar) y ya tenía su forma en el sistema.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@precision/ui';
import { Search, Loader2, Bandage, Plus, Check, AlertTriangle } from 'lucide-react';

export interface CatalogBrace {
  id: number;
  code: string;
  name: string;
  sizeLabel: string | null;
  publicPrice: number | null;
  hcpcsCode: string | null;
}

/** Lado de la férula. Se exporta para que los consumidores no lo redeclaren. */
export type Side = 'NA' | 'LEFT' | 'RIGHT';

interface Props {
  onClose: () => void;
  onAdd: (item: CatalogBrace, side: Side, quantity: number) => Promise<void>;
  /**
   * Qué férulas ya se entregaron en esta visita y cuántas veces, por `code`.
   *
   * No bloquea: dos rodilleras, izquierda y derecha, son dos entregas legítimas
   * del mismo modelo. Solo tiene que VERSE que entró — sin eso el renglón queda
   * idéntico después de agregar.
   */
  added?: ReadonlyMap<string, number>;
}

/** Estado del renglón que se está configurando antes de agregar. */
interface Borrador {
  code: string;
  side: Side;
  quantity: number;
  /** Monto escrito a mano — solo para las férulas sin precio en el catálogo */
  precio: string;
}

export function BracePickerDialog({ onClose, onAdd, added }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [q, setQ] = React.useState('');
  const [items, setItems] = React.useState<CatalogBrace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [borrador, setBorrador] = React.useState<Borrador | null>(null);
  const [savingCode, setSavingCode] = React.useState<string | null>(null);

  // Son 8 items: se cargan todos y se filtra en el cliente. Sin debounce ni
  // búsqueda remota por tecla — sería complejidad sin beneficio.
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch('/api/admin/catalog/search?kind=DME&limit=50');
        if (!res.ok) return;
        const d = (await res.json()) as { items: CatalogBrace[] };
        if (alive) setItems(d.items);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(needle) || i.code.toLowerCase().includes(needle),
    );
  }, [items, q]);

  const abrirBorrador = (i: CatalogBrace): void => {
    setBorrador({ code: i.code, side: 'NA', quantity: 1, precio: '' });
  };

  const agregar = async (i: CatalogBrace, b: Borrador): Promise<void> => {
    const escrito = Number.parseFloat(b.precio);
    const precio = i.publicPrice ?? (Number.isFinite(escrito) ? escrito : 0);
    if (precio <= 0) return;
    setSavingCode(i.code);
    try {
      await onAdd({ ...i, publicPrice: precio }, b.side, b.quantity);
      setBorrador(null);
    } finally {
      setSavingCode(null);
    }
  };

  const fmt$ = (n: number | null): string => (n === null ? '—' : `$${n.toFixed(2)}`);

  /** Chips de lado + cantidad + confirmar, dentro del propio renglón. */
  const configurador = (i: CatalogBrace, b: Borrador): React.ReactElement => {
    const escrito = Number.parseFloat(b.precio);
    const faltaPrecio = i.publicPrice === null;
    const precioOk = !faltaPrecio || (Number.isFinite(escrito) && escrito > 0);
    const busy = savingCode === i.code;

    return (
      <div className="mt-2 flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
            {t('braceSide')}
          </label>
          <div className="flex gap-1.5">
            {(['NA', 'LEFT', 'RIGHT'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setBorrador({ ...b, side: s })}
                className={`h-8 px-2.5 rounded-md text-[11.5px] font-semibold transition-colors ${
                  b.side === s ? 'bg-violet/15 text-violet-text' : 'bg-bg-2 text-text-muted hover:text-text-1'
                }`}
              >
                {s === 'NA' ? t('braceSideNA') : s === 'LEFT' ? t('braceSideLeft') : t('braceSideRight')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
            {t('braceQuantity')}
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={b.quantity}
            onChange={(e) => setBorrador({ ...b, quantity: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)) })}
            className="w-[68px] h-8 rounded-md bg-bg-2 px-2 text-[12.5px] text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
          />
        </div>

        {/* Sin precio en el catálogo: se pide el monto acá. No se entrega en
            cero — la facturación saltea todo lo que vale 0, así que la férula
            salía de la clínica y NUNCA generaba cobro, en silencio. */}
        {faltaPrecio && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-amber block mb-1">
              {t('braceSetAmount')}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={b.precio}
              onChange={(e) => setBorrador({ ...b, precio: e.target.value })}
              placeholder="0.00"
              className="w-[86px] h-8 rounded-md bg-bg-2 px-2 text-right tabular-nums text-[12.5px] font-semibold text-text-1 outline-none focus:ring-1 focus:ring-amber/50"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => setBorrador(null)}
            className="h-8 px-2.5 rounded-md text-[11.5px] font-semibold text-text-muted hover:text-text-1 transition-colors"
          >
            {t('braceCancel')}
          </button>
          <button
            type="button"
            disabled={!precioOk || busy}
            onClick={() => void agregar(i, b)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11.5px] font-semibold bg-violet/15 text-violet-text hover:bg-violet/25 disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            {t('braceConfirmAdd')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <Bandage className="w-4 h-4 text-violet-text shrink-0" />
            {t('braceAddTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('braceSearchPlaceholder')}
              className="w-full h-9 rounded-md bg-bg-2 pl-9 pr-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-[12.5px] text-text-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('braceLoading')}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-text-muted">{t('braceNoResults')}</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((i) => {
                const veces = added?.get(i.code) ?? 0;
                const editando = borrador?.code === i.code;
                return (
                  <div key={i.id} className={`rounded-md px-3 py-2.5 ${editando ? 'bg-violet/[0.07]' : 'bg-bg-2/40'}`}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[12.5px] text-text-1 font-medium flex-1 min-w-[160px]">
                        {i.name}
                        {i.sizeLabel && <span className="text-text-muted"> · {i.sizeLabel}</span>}
                      </span>

                      {/* Misma marca que el picker de cargos: informa, no bloquea */}
                      {veces > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald shrink-0">
                          <Check className="w-3 h-3" />
                          {veces > 1 ? t('braceAddedTimes', { count: veces }) : t('braceAlreadyAdded')}
                        </span>
                      )}

                      <span className="text-[13px] font-semibold text-text-1 tabular-nums shrink-0">
                        {fmt$(i.publicPrice)}
                      </span>

                      {!editando && (
                        <button
                          type="button"
                          onClick={() => abrirBorrador(i)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold shrink-0 transition-colors ${
                            i.publicPrice === null
                              ? 'bg-amber/15 text-amber hover:bg-amber/25'
                              : 'bg-violet/15 text-violet-text hover:bg-violet/25'
                          }`}
                        >
                          {i.publicPrice === null
                            ? <><AlertTriangle className="w-3 h-3" /> {t('braceNoPrice')}</>
                            : <><Plus className="w-3 h-3" /> {t('braceDispense')}</>}
                        </button>
                      )}
                    </div>

                    {editando && borrador && configurador(i, borrador)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Solo cerrar: agregar es cosa de cada renglón */}
        <DialogFooter className="px-5 py-3 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose} className="h-9 w-full sm:w-auto">
            {t('braceDone')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
