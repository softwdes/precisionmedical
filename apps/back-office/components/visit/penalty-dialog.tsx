'use client';

/**
 * PenaltyDialog — cobrar la penalidad de un no-show o una cancelación del mismo día.
 *
 * Reemplaza al catálogo entero en ESE momento. Antes, al sellar el desenlace se
 * abría el picker con el buscador ya escrito y había que: elegir el circuito
 * correcto, leer el precio que traía y —si no era el que tocaba— encontrar un
 * lápiz de 12 px para corregirlo. Medido el 2026-10-07 sobre 120 días, 41 de 78
 * desenlaces cobrables seguían SIN ningún cargo, y los pocos no-show de medicina
 * general que sí se cobraron salieron a $50, $0, $166 y $0: no había regla.
 *
 * Acá el monto viene PROPUESTO según el tipo de caso (MVA $100, general $50, ver
 * `precioDePenalidad`), a la vista y escrito en un campo que se puede cambiar.
 * Se propone, no se impone: perdonar o rebajar es decisión de quien está en el
 * mostrador. Y un cargo es plata, así que sigue siendo UN clic de una persona —
 * nada se agrega solo.
 *
 * El código se saca del catálogo de efectivo (`PM-2233` No Show, `PM-11` Cancel
 * Same Day), que es el único circuito que tiene los dos. Para cualquier otro
 * código sigue estando el picker completo ("Elegir otro código").
 *
 * No edita ni quita una penalidad YA puesta: eso vive en Servicios de la cita,
 * con la protección de que un cargo ya cobrado no se puede quitar. Duplicarlo
 * acá sería saltearla.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Loader2, Plus, AlertTriangle, Info } from 'lucide-react';
import type { BillableItem } from '@/components/visit/charge-picker-dialog';
import {
  itemDePenalidad, precioDePenalidad, montoValido, PENALIDAD_MVA, PENALIDAD_GENERAL,
} from '@/lib/penalidad';

const fmt$ = (n: number): string => `$${n.toFixed(2).replace(/\.00$/, '')}`;

export function PenaltyDialog({ cita, onAdd, onOtherCode, onClose }: {
  /** Lo mínimo para saber qué se cobra y cuánto. */
  cita: { status: string; cancelledSameDay?: boolean | null; case?: { caseType: string } | null };
  /** Agrega el cargo con el monto elegido. Devuelve `true` si quedó asentado. */
  onAdd: (item: BillableItem) => Promise<boolean>;
  /** Abre el catálogo completo, para cobrar con otro código. */
  onOtherCode: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('phoenix.admission');

  const desenlace = itemDePenalidad(cita);
  const caseType  = cita.case?.caseType ?? null;
  const sugerido  = precioDePenalidad(caseType);
  const esGeneral = caseType === 'GENERAL';

  const [item, setItem]       = React.useState<BillableItem | null>(null);
  const [cargando, setCarg]   = React.useState(true);
  const [texto, setTexto]     = React.useState(sugerido !== null ? sugerido.toFixed(2) : '');
  const [guardando, setGuard] = React.useState(false);

  // El ítem del catálogo, por su código. Se pide ENTERO el catálogo de efectivo
  // (son ~18) y se elige por código: la búsqueda por texto podría devolver otro
  // ítem con un nombre parecido.
  React.useEffect(() => {
    if (!desenlace) { setCarg(false); return; }
    let vivo = true;
    fetch(`/api/admin/billable-items?view=CASH&q=${encodeURIComponent(desenlace.busqueda)}`)
      .then((r) => r.json())
      .then((d: { cash?: BillableItem[]; pairs?: Array<{ cash: BillableItem }> }) => {
        if (!vivo) return;
        const todos = [...(d.cash ?? []), ...(d.pairs ?? []).map((p) => p.cash)];
        setItem(todos.find((i) => i.code === desenlace.code) ?? null);
      })
      .catch(() => { if (vivo) setItem(null); })
      .finally(() => { if (vivo) setCarg(false); });
    return () => { vivo = false; };
  }, [desenlace?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const monto = montoValido(texto);
  const tocado = sugerido !== null && monto !== null && Math.abs(monto - sugerido) > 0.004;

  const agregar = async (): Promise<void> => {
    if (!item || monto === null || guardando) return;
    setGuard(true);
    try {
      // El monto viaja como el precio del ítem y vale SOLO para este cargo: el
      // catálogo no se toca (ver `agregarCargo` y el picker).
      const ok = await onAdd({ ...item, price: monto });
      if (ok) onClose();
    } finally {
      setGuard(false);
    }
  };

  const titulo = cita.status === 'NO_SHOW' ? t('penaltyDlgTitle_noShow') : t('penaltyDlgTitle_cancelSameDay');
  const tipoCaso = esGeneral ? t('penaltyCaseGeneral') : caseType ? t('penaltyCaseMva') : null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <Plus className="w-4 h-4 text-violet-text shrink-0" />
            {titulo}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3">
          {cargando && (
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('penaltyLoading')}
            </div>
          )}

          {!cargando && !item && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11.5px] text-amber flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{t('penaltyCatalogMissing')}</span>
            </div>
          )}

          {!cargando && item && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                  {t('penaltyWhat')}
                </div>
                <div className="text-[13px] font-semibold text-text-1">
                  {item.name} <span className="text-text-muted font-normal">· {item.code}</span>
                </div>
              </div>

              {/* El monto — propuesto y editable, a la vista. */}
              <div>
                <label htmlFor="penalidad-monto" className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('penaltyAmount')}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[14px]">$</span>
                    <input
                      id="penalidad-monto"
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && monto !== null) void agregar(); }}
                      aria-invalid={texto !== '' && monto === null}
                      className={`w-[120px] pl-6 pr-2 py-1.5 text-right tabular-nums text-[15px] font-bold rounded-md bg-bg-2 border outline-none text-text-1 ${
                        texto !== '' && monto === null ? 'border-rose/60' : 'border-amber/40 focus:border-amber'
                      }`}
                    />
                  </div>
                  {/* Los dos montos de la regla, a un clic: así corregir es tocar,
                      no tipear. */}
                  {([['MVA', PENALIDAD_MVA], ['General', PENALIDAD_GENERAL]] as const).map(([etq, valor]) => (
                    <button
                      key={etq}
                      type="button"
                      onClick={() => setTexto(valor.toFixed(2))}
                      className={`px-2 py-1 rounded text-[11px] font-semibold tabular-nums border transition-colors ${
                        monto !== null && Math.abs(monto - valor) < 0.005
                          ? 'bg-violet/15 text-violet border-violet/40'
                          : 'bg-bg-2 text-text-muted border-border hover:text-text-1'
                      }`}
                    >
                      {etq} {fmt$(valor)}
                    </button>
                  ))}
                </div>

                <p className="mt-1.5 text-[11px] text-text-muted flex items-start gap-1">
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />
                  {sugerido !== null && tipoCaso
                    ? t('penaltySuggested', { caso: tipoCaso, monto: fmt$(sugerido) })
                    : t('penaltyNoDefault')}
                  {tocado && <span className="text-amber font-semibold"> · {t('penaltyChanged')}</span>}
                </p>
                {texto !== '' && monto === null && (
                  <p className="mt-1 text-[11px] text-rose">{t('penaltyAmountInvalid')}</p>
                )}
              </div>

              <p className="text-[10.5px] text-text-muted leading-relaxed">{t('penaltyFixHint')}</p>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={onOtherCode}
            className="text-[11.5px] font-semibold text-violet-text hover:underline"
          >
            {t('penaltyOtherCode')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-border text-text-2 text-[12px] hover:bg-white/5 transition-colors"
            >
              {t('penaltyCancel')}
            </button>
            <button
              type="button"
              disabled={!item || monto === null || guardando}
              onClick={() => void agregar()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald text-white text-[12px] font-bold hover:bg-emerald/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {t('penaltyAddBtn', { monto: monto !== null ? fmt$(monto) : '—' })}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
