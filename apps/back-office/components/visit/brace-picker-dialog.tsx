'use client';

/**
 * BracePickerDialog — elegir la férula a entregar.
 *
 * Muestra solo lo que el doctor necesita para decidir: nombre, talla y precio
 * público (decisión de Erick 2026-08-03 — el costo real y los márgenes son del
 * catálogo, no de la consulta).
 *
 * Al elegir, pide lado y cantidad: una rodillera izquierda no es la misma que la
 * derecha, y a veces se entregan dos del mismo modelo.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@precision/ui';
import { Search, Loader2, Bandage, Plus } from 'lucide-react';

export interface CatalogBrace {
  id: number;
  code: string;
  name: string;
  sizeLabel: string | null;
  publicPrice: number | null;
  hcpcsCode: string | null;
}

type Side = 'NA' | 'LEFT' | 'RIGHT';

interface Props {
  onClose: () => void;
  onAdd: (item: CatalogBrace, side: Side, quantity: number) => Promise<void>;
}

export function BracePickerDialog({ onClose, onAdd }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [q, setQ] = React.useState('');
  const [items, setItems] = React.useState<CatalogBrace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<CatalogBrace | null>(null);
  const [side, setSide] = React.useState<Side>('NA');
  const [quantity, setQuantity] = React.useState(1);
  const [saving, setSaving] = React.useState(false);

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

  const confirm = async (): Promise<void> => {
    if (!selected) return;
    setSaving(true);
    try {
      await onAdd(selected, side, quantity);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <Bandage className="w-4 h-4 text-violet shrink-0" />
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
              className="w-full h-9 rounded-md bg-bg-0 border border-border pl-9 pr-3 text-sm text-text-1 outline-none focus:border-violet/60"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-[12.5px] text-text-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('braceLoading')}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-text-muted">{t('braceNoResults')}</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((i) => {
                const isSel = selected?.id === i.id;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setSelected(i)}
                    className={`w-full text-left rounded-md px-3 py-2.5 flex items-center gap-3 flex-wrap transition-colors border ${
                      isSel
                        ? 'border-violet/50 bg-violet/10'
                        : 'border-transparent bg-bg-2/40 hover:bg-bg-2'
                    }`}
                  >
                    <span className="text-[12.5px] text-text-1 font-medium flex-1 min-w-[160px]">
                      {i.name}
                      {i.sizeLabel && <span className="text-text-muted"> · {i.sizeLabel}</span>}
                    </span>
                    <span className="text-[13px] font-semibold text-text-1 tabular-nums shrink-0">
                      {i.publicPrice === null ? '—' : `$${i.publicPrice.toFixed(2)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Lado y cantidad — solo cuando ya eligió un item */}
        {selected && (
          <div className="px-5 py-3 border-t border-border shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1.5">
                {t('braceSide')}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {(['NA', 'LEFT', 'RIGHT'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={`h-9 px-3 rounded-md text-[12px] font-semibold border transition-colors ${
                      side === s
                        ? 'border-violet/50 bg-violet/10 text-violet'
                        : 'border-border text-text-muted hover:text-text-1'
                    }`}
                  >
                    {s === 'NA' ? t('braceSideNA') : s === 'LEFT' ? t('braceSideLeft') : t('braceSideRight')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1.5">
                {t('braceQuantity')}
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                className="w-full h-9 rounded-md bg-bg-0 border border-border px-3 text-sm text-text-1 outline-none focus:border-violet/60"
              />
            </div>
          </div>
        )}

        <DialogFooter className="px-5 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="h-9 w-full sm:w-auto">
            {t('braceCancel')}
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={!selected || saving}
            className="h-9 w-full sm:w-auto gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {t('braceConfirmAdd')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
