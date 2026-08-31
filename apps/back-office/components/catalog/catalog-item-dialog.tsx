'use client';

/**
 * Diálogo de alta/edición de un ítem del catálogo de precios.
 *
 * Los campos se muestran según el `kind`: un lab necesita tubo y reflex, una
 * férula necesita talla, un inyectable necesita códigos de facturación.
 * Costo real y precio público son comunes a los cuatro — es el punto de la
 * pantalla.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Label,
} from '@precision/ui';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { FormField } from '@/components/ui-phoenix';
import {
  type CatalogItem, type CatalogKind,
  TUBE_COLORS, TUBE_SWATCH, LOW_MARGIN, money,
} from './catalog-shared';

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = alta nueva */
  item: CatalogItem | null;
  /** Tab activo — define el kind por defecto al crear. */
  defaultKind: CatalogKind;
  onSaved: () => void;
}

type Draft = Omit<CatalogItem, 'id' | 'priceVerifiedAt' | 'priceVerifiedBy' | 'priceStatus'>;

const emptyDraft = (kind: CatalogKind): Draft => ({
  kind,
  code: '',
  name: '',
  category: kind === 'LAB' ? 'LABORATORY' : null,
  section: null,
  vendor: kind === 'LAB' ? 'LABCORP' : 'IN_HOUSE',
  costPrice: null,
  publicPrice: null,
  memberPrice: null,
  priceNote: null,
  unitLabel: null,
  hasReflex: false,
  reflexCost: null,
  reflexPrice: null,
  reflexPolicy: null,
  tubeColors: [],
  containerType: null,
  specialHandling: null,
  sizeLabel: null,
  alwaysFullPayment: kind === 'DME',
  cptCode: null,
  hcpcsCode: null,
  ndcCode: null,
  isActive: true,
  isOrderable: true,
  replacedByCode: null,
  notes: null,
});

/** "" → null · "12.5" → 12.5 */
const toNum = (s: string): number | null => {
  // La coma se acepta como separador decimal: media clinica tipea "12,50".
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const limpio = t.replace(/[^\d.]/g, '');
  // Sin un solo digito no es cero, es vacio: tipear "abc" no debe dejar 0.00.
  if (!/\d/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};
const fromNum = (n: number | null): string => (n == null ? '' : String(n));

/**
 * Campo de precio.
 *
 * Existe porque el input controlado NO dejaba escribir decimales: el valor daba
 * la vuelta por el número en cada tecla, así que al tipear `12.` se parseaba a
 * `12`, se volvía a pintar como `"12"` y **el punto desaparecía mientras lo
 * escribías**. Nunca se llegaba a los centavos.
 *
 * La solución es que el texto que se ve sea el que la persona tipeó, y que el
 * número salga de ahí — no al revés. Al salir del campo se normaliza a dos
 * decimales, que es lo que guarda la columna (`Decimal(10,2)`).
 */
function CampoPrecio({
  label, value, onChange, placeholder, hint,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  hint?: string;
}): React.ReactElement {
  const [texto, setTexto] = React.useState(() => fromNum(value));

  // Solo se resincroniza cuando el valor cambia DE AFUERA (abrir el diálogo con
  // otro ítem). Mientras se tipea, `toNum(texto)` y `value` coinciden y no se
  // pisa lo escrito — que es justamente lo que rompía el campo antes.
  React.useEffect(() => {
    if (toNum(texto) !== value) setTexto(fromNum(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <FormField.Input
      label={label}
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={(v) => { setTexto(v); onChange(toNum(v)); }}
      onBlur={() => {
        const n = toNum(texto);
        setTexto(n == null ? '' : n.toFixed(2));
        onChange(n);
      }}
      placeholder={placeholder}
      hint={hint}
    />
  );
}

export function CatalogItemDialog({ open, onClose, item, defaultKind, onSaved }: Props): React.ReactElement {
  const t = useTranslations('phoenix.catalog');

  const [d, setD] = React.useState<Draft>(() => emptyDraft(defaultKind));
  const [markVerified, setMarkVerified] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setD(item ? { ...item } : emptyDraft(defaultKind));
    setMarkVerified(false);
    setReason('');
    setError(null);
  }, [open, item, defaultKind]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setD((p) => ({ ...p, [k]: v }));

  const isLab = d.kind === 'LAB';
  const isDme = d.kind === 'DME';

  const priceMoved =
    item != null &&
    (item.costPrice !== d.costPrice ||
      item.publicPrice !== d.publicPrice ||
      item.memberPrice !== d.memberPrice);

  const mk = d.costPrice && d.publicPrice != null ? d.publicPrice / d.costPrice : null;

  async function save(): Promise<void> {
    if (!d.name.trim()) { setError(t('err.nameRequired')); return; }
    if (!d.code.trim()) { setError(t('err.codeRequired')); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/catalog', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...d,
          id: item?.id,
          markVerified,
          priceChangeReason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? t('dialog.edit') : t('dialog.new')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ─── Identificación ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <FormField.Input
                label={t('field.name')} required autoFocus
                value={d.name} onChange={(v) => set('name', v)}
              />
            </div>
            <FormField.Input
              label={t('field.code')} required
              value={d.code} onChange={(v) => set('code', v)}
              hint={isLab ? t('hint.labCode') : t('hint.internalCode')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField.Select
              label={t('field.kind')} value={d.kind}
              onChange={(v) => set('kind', v as CatalogKind)}
              options={[
                { value: 'LAB', label: t('kind.LAB') },
                { value: 'INJECTION', label: t('kind.INJECTION') },
                { value: 'SERVICE', label: t('kind.SERVICE') },
                { value: 'DME', label: t('kind.DME') },
              ]}
            />
            {isLab && (
              <FormField.Select
                label={t('field.category')} value={d.category ?? 'LABORATORY'}
                onChange={(v) => set('category', v)}
                options={[
                  { value: 'LABORATORY', label: t('cat.LABORATORY') },
                  { value: 'IMAGING', label: t('cat.IMAGING') },
                  { value: 'CARDIOLOGY', label: t('cat.CARDIOLOGY') },
                ]}
              />
            )}
            {isDme && (
              <FormField.Input
                label={t('field.size')} value={d.sizeLabel ?? ''}
                onChange={(v) => set('sizeLabel', v || null)}
                placeholder="any size"
              />
            )}
            <FormField.Input
              label={t('field.unitLabel')} value={d.unitLabel ?? ''}
              onChange={(v) => set('unitLabel', v || null)}
              hint={t('hint.unitLabel')}
            />
          </div>

          {/* ─── Precios ─── */}
          <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-3">
            <div className="text-text-1 font-semibold text-sm uppercase tracking-wider">
              {t('section.pricing')}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CampoPrecio
                label={t('field.costPrice')}
                value={d.costPrice} onChange={(n) => set('costPrice', n)}
                placeholder="0.00" hint={t('hint.costPrice')}
              />
              <CampoPrecio
                label={t('field.publicPrice')}
                value={d.publicPrice} onChange={(n) => set('publicPrice', n)}
                placeholder="0.00" hint={t('hint.publicPrice')}
              />
              <CampoPrecio
                label={t('field.memberPrice')}
                value={d.memberPrice} onChange={(n) => set('memberPrice', n)}
                placeholder="—" hint={t('hint.memberPrice')}
              />
            </div>

            {/* Margen en vivo mientras se escribe */}
            <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 flex items-center gap-4 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('field.margin')}
              </span>
              {mk == null ? (
                <span className="text-[11px] text-amber flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {t('margin.needBoth')}
                </span>
              ) : (
                <>
                  <span className={`text-lg font-bold ${mk < LOW_MARGIN ? 'text-amber' : 'text-text-1'}`}>
                    {mk.toFixed(2)}x
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {money((d.publicPrice ?? 0) - (d.costPrice ?? 0))} {t('margin.perUnit')}
                  </span>
                  {mk < LOW_MARGIN && (
                    <span className="text-[11px] text-amber">{t('margin.low', { min: LOW_MARGIN })}</span>
                  )}
                </>
              )}
            </div>

            <FormField.Input
              label={t('field.priceNote')} value={d.priceNote ?? ''}
              onChange={(v) => set('priceNote', v || null)}
              hint={t('hint.priceNote')}
            />

            {priceMoved && (
              <FormField.Input
                label={t('field.priceChangeReason')} value={reason} onChange={setReason}
                hint={t('hint.priceChangeReason')}
              />
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={markVerified}
                onChange={(e) => setMarkVerified(e.target.checked)}
                className="accent-emerald w-4 h-4"
              />
              <span className="text-sm text-text-1">{t('field.markVerified')}</span>
              {item?.priceVerifiedAt && (
                <span className="text-[11px] text-text-muted">
                  {t('field.lastVerified', {
                    date: new Date(item.priceVerifiedAt).toLocaleDateString(),
                  })}
                </span>
              )}
            </label>
          </div>

          {/* ─── Reflex (labs) ─── */}
          {isLab && (
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={d.hasReflex}
                  onChange={(e) => set('hasReflex', e.target.checked)}
                  className="accent-brand w-4 h-4"
                />
                <span className="text-text-1 font-semibold text-sm uppercase tracking-wider">
                  {t('section.reflex')}
                </span>
              </label>
              <p className="text-[11px] text-text-muted">{t('hint.reflex')}</p>

              {d.hasReflex && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CampoPrecio
                      label={t('field.reflexCost')} value={d.reflexCost}
                      onChange={(n) => set('reflexCost', n)} placeholder="0.00"
                    />
                    <CampoPrecio
                      label={t('field.reflexPrice')} value={d.reflexPrice}
                      onChange={(n) => set('reflexPrice', n)} placeholder="0.00"
                    />
                  </div>
                  <FormField.Textarea
                    label={t('field.reflexPolicy')} rows={2}
                    value={d.reflexPolicy ?? ''} onChange={(v) => set('reflexPolicy', v || null)}
                    hint={t('hint.reflexPolicy')}
                  />
                </>
              )}
            </div>
          )}

          {/* ─── Muestra (labs) ─── */}
          {isLab && (
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-3">
              <div className="text-text-1 font-semibold text-sm uppercase tracking-wider">
                {t('section.sample')}
              </div>

              <div>
                <Label>{t('field.tubeColors')}</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {TUBE_COLORS.map((c) => {
                    const on = d.tubeColors.includes(c);
                    return (
                      <button
                        key={c} type="button"
                        onClick={() => set('tubeColors', on
                          ? d.tubeColors.filter((x) => x !== c)
                          : [...d.tubeColors, c])}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                          on ? 'border-brand bg-brand/10 text-text-1' : 'border-border text-text-muted hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${TUBE_SWATCH[c]}`} />
                        {t(`tube.${c}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField.Select
                  label={t('field.container')} value={d.containerType ?? ''}
                  onChange={(v) => set('containerType', v || null)}
                  options={[
                    { value: '', label: '—' },
                    { value: 'PARAPAK', label: 'Para-Pak' },
                    { value: 'URINE_BOTTLE', label: t('container.URINE_BOTTLE') },
                    { value: 'STOOL', label: t('container.STOOL') },
                    { value: 'SPECIMEN', label: t('container.SPECIMEN') },
                  ]}
                />
                <FormField.Input
                  label={t('field.specialHandling')} value={d.specialHandling ?? ''}
                  onChange={(v) => set('specialHandling', v || null)}
                  hint={t('hint.specialHandling')}
                />
              </div>
            </div>
          )}

          {/* ─── Facturación (inyectables / servicios / férulas) ─── */}
          {!isLab && (
            <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-3">
              <div className="text-text-1 font-semibold text-sm uppercase tracking-wider">
                {t('section.billing')}
              </div>
              <p className="text-[11px] text-text-muted">{t('hint.billing')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField.Input
                  label="CPT" value={d.cptCode ?? ''}
                  onChange={(v) => set('cptCode', v || null)} placeholder="96372"
                />
                <FormField.Input
                  label="HCPCS" value={d.hcpcsCode ?? ''}
                  onChange={(v) => set('hcpcsCode', v || null)} placeholder="L3908"
                />
                <FormField.Input
                  label="NDC / J-code" value={d.ndcCode ?? ''}
                  onChange={(v) => set('ndcCode', v || null)} placeholder="J1885"
                />
              </div>
              {isDme && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" checked={d.alwaysFullPayment}
                    onChange={(e) => set('alwaysFullPayment', e.target.checked)}
                    className="accent-amber w-4 h-4"
                  />
                  <span className="text-sm text-text-1">{t('field.alwaysFullPayment')}</span>
                </label>
              )}
            </div>
          )}

          {/* ─── Estado ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={d.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                className="accent-emerald w-4 h-4"
              />
              <span className="text-sm text-text-1">{t('field.isActive')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={d.isOrderable}
                onChange={(e) => set('isOrderable', e.target.checked)}
                className="accent-emerald w-4 h-4"
              />
              <span className="text-sm text-text-1">{t('field.isOrderable')}</span>
            </label>
          </div>

          {!d.isActive && (
            <FormField.Input
              label={t('field.replacedByCode')} value={d.replacedByCode ?? ''}
              onChange={(v) => set('replacedByCode', v || null)}
              hint={t('hint.replacedByCode')}
            />
          )}

          <FormField.Textarea
            label={t('field.notes')} rows={2}
            value={d.notes ?? ''} onChange={(v) => set('notes', v || null)}
          />

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            {t('action.cancel')}
          </Button>
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {t('action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
