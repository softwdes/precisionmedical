'use client';

/**
 * Chip de cobertura — ¿quién paga esta visita?
 *
 * Vive donde el staff clínico ya mira: Mi Día (hero y cola), la cabecera de la
 * consulta y Day Admission. Cuando la cobertura está sin definir, el chip ES el
 * botón: quien lo vea la resuelve en 2 clicks, sin ir a otra pantalla. Eso es lo
 * que hace que el dato se llene, en vez de quedar vacío como estuvo hasta hoy.
 *
 * Dos niveles de confianza, a la vista (regla de Erick 2026-08-04): la clínica a
 * veces llama a la aseguradora y a veces no, así que el chip distingue
 * "declarado" (amber) de "activo verificado" (verde, con quién y cuándo). Nunca
 * bloquea: nadie queda trabado por no haber llamado.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@precision/ui';
import { Shield, ShieldCheck, ShieldQuestion, Banknote, Scale, Loader2 } from 'lucide-react';
import type { CoverageDTO, CoverageType } from '@/lib/coverage';

interface Props {
  /** Sin caso no hay dónde guardar: el chip queda informativo y sin click. */
  caseId: string | null;
  coverage: CoverageDTO;
  /** `sm` para filas de lista · `md` para cabeceras. */
  size?: 'sm' | 'md';
  /** Con `false` el chip no abre el diálogo (vistas de solo lectura). */
  editable?: boolean;
  onChanged?: (next: CoverageDTO) => void;
}

const TONE: Record<CoverageType, { cls: string; icon: React.ElementType }> = {
  UNKNOWN:   { cls: 'bg-amber/10 text-amber border-amber/30',       icon: ShieldQuestion },
  INSURANCE: { cls: 'bg-cyan/10 text-cyan border-cyan/30',          icon: Shield },
  SELF_PAY:  { cls: 'bg-emerald/10 text-emerald border-emerald/30', icon: Banknote },
  LIEN:      { cls: 'bg-violet/10 text-violet border-violet/30',    icon: Scale },
};

/** Un seguro verificado por llamada es el único caso que se pinta en verde. */
function toneOf(c: CoverageDTO): { cls: string; icon: React.ElementType } {
  if (c.type === 'INSURANCE' && c.verifyMethod === 'VERIFIED') {
    return { cls: 'bg-emerald/10 text-emerald border-emerald/30', icon: ShieldCheck };
  }
  if (c.type === 'INSURANCE' && c.verifyMethod !== 'VERIFIED') {
    return { cls: 'bg-amber/10 text-amber border-amber/30', icon: Shield };
  }
  return TONE[c.type];
}

export function CoverageChip({
  caseId, coverage, size = 'sm', editable = true, onChanged,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.coverage');
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState(coverage);

  // El server component puede refrescar (polling de Mi Día cada 30 s) con un
  // valor más nuevo que el del state local.
  React.useEffect(() => { setState(coverage); }, [coverage]);

  const { cls, icon: Icon } = toneOf(state);
  const label = state.type === 'UNKNOWN'
    ? t('askShort')
    : state.type === 'INSURANCE'
      ? (state.carrierName ?? t('labelInsurance'))
      : state.type === 'SELF_PAY' ? t('labelSelfPay') : t('labelLien');

  const suffix = state.type === 'INSURANCE'
    ? (state.verifyMethod === 'VERIFIED' ? t('verified') : t('declared'))
    : null;

  const pad = size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const clickable = editable && !!caseId;

  const chip = (
    <span className={`inline-flex items-center gap-1.5 rounded-md border font-semibold ${cls} ${pad} ${clickable ? 'hover:brightness-125 transition-all cursor-pointer' : ''}`}>
      <Icon className={`${iconSize} shrink-0`} />
      <span className="truncate max-w-[160px]">{label}</span>
      {suffix && <span className="opacity-70 font-normal hidden sm:inline">· {suffix}</span>}
    </span>
  );

  if (!clickable) return chip;

  return (
    <>
      {/* `stopPropagation` porque el chip vive dentro de filas y heroes que son
          links a la consulta — tocarlo debe abrir el diálogo, no navegar. */}
      <button
        type="button"
        aria-label={t('changeAria')}
        title={t('changeAria')}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      >
        {chip}
      </button>
      {open && (
        <CoverageDialog
          caseId={caseId}
          coverage={state}
          onClose={() => setOpen(false)}
          onSaved={(next) => { setState(next); onChanged?.(next); setOpen(false); }}
        />
      )}
    </>
  );
}

// ─── Diálogo ────────────────────────────────────────────────────────────────

// Las clases van escritas completas: `border-${tone}/50` no lo ve el JIT de
// Tailwind y la tarjeta se quedaría sin borde al seleccionarla.
const OPTIONS: Array<{
  type: CoverageType; labelKey: string; hintKey: string;
  icon: React.ElementType; activeCls: string; activeIcon: string;
}> = [
  { type: 'INSURANCE', labelKey: 'optInsurance', hintKey: 'optInsuranceHint', icon: Shield,
    activeCls: 'border-cyan/50 bg-cyan/10',       activeIcon: 'text-cyan' },
  { type: 'SELF_PAY',  labelKey: 'optSelfPay',   hintKey: 'optSelfPayHint',   icon: Banknote,
    activeCls: 'border-emerald/50 bg-emerald/10', activeIcon: 'text-emerald' },
  { type: 'LIEN',      labelKey: 'optLien',      hintKey: 'optLienHint',      icon: Scale,
    activeCls: 'border-violet/50 bg-violet/10',   activeIcon: 'text-violet' },
];

const SUGGESTION_KEY: Record<NonNullable<CoverageDTO['suggestionSource']>, string> = {
  INTAKE_MEDICAL: 'suggestionIntakeMedical',
  INTAKE_LIEN: 'suggestionIntakeLien',
  CASE_TYPE_MVA: 'suggestionCaseTypeMva',
};

function CoverageDialog({ caseId, coverage, onClose, onSaved }: {
  caseId: string;
  coverage: CoverageDTO;
  onClose: () => void;
  onSaved: (next: CoverageDTO) => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.coverage');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();

  // Sin responder, arranca en la sugerencia (intake / tipo de caso). Es un
  // atajo, no una respuesta: igual hay que tocar Guardar.
  const [type, setType] = React.useState<CoverageType>(
    coverage.answered ? coverage.type : (coverage.suggestion ?? 'INSURANCE'),
  );
  const [carrier, setCarrier] = React.useState(coverage.carrierName ?? '');
  const [verified, setVerified] = React.useState(coverage.verifyMethod === 'VERIFIED');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const save = async (target: CoverageType | 'CLEAR'): Promise<void> => {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/coverage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: target === 'CLEAR' ? 'UNKNOWN' : target,
          ...(target === 'INSURANCE' && {
            verifyMethod: verified ? 'VERIFIED' : 'DECLARED',
            carrierName: carrier.trim() || null,
          }),
          note: note.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.message ?? t('error')); return; }
      onSaved(json.coverage as CoverageDTO);
      // El precio que ofrece el picker y el desglose del total dependen de esto:
      // refrescar para que la pantalla entera quede consistente.
      router.refresh();
    } catch {
      setError(t('error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <ShieldQuestion className="w-4 h-4 text-violet shrink-0" />
            {t('dialogTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <p className="text-[12px] text-text-muted">{t('dialogSubtitle')}</p>

          {!coverage.answered && coverage.suggestionSource && (
            <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
              {t(SUGGESTION_KEY[coverage.suggestionSource])}
            </div>
          )}

          {/* 1 columna en mobile — tres tarjetas apretadas no se pueden tocar
              con el dedo en un iPad de recepción (Regla #4). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {OPTIONS.map((o) => {
              const active = type === o.type;
              const Icon = o.icon;
              return (
                <button
                  key={o.type}
                  type="button"
                  onClick={() => setType(o.type)}
                  className={`text-left rounded-md border p-3 transition-colors ${
                    active ? o.activeCls : 'border-border bg-bg-2/40 hover:border-border-strong'
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1.5 ${active ? o.activeIcon : 'text-text-muted'}`} />
                  <div className={`text-[12.5px] font-semibold ${active ? 'text-text-1' : 'text-text-2'}`}>
                    {t(o.labelKey)}
                  </div>
                  <div className="text-[10.5px] text-text-muted mt-0.5 leading-snug">{t(o.hintKey)}</div>
                </button>
              );
            })}
          </div>

          {type === 'INSURANCE' && (
            <div className="space-y-3 rounded-md bg-bg-2/40 border border-border/40 p-3">
              <div>
                <label htmlFor="cov-carrier" className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1.5">
                  {t('carrierLabel')}
                </label>
                <input
                  id="cov-carrier"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder={t('carrierPlaceholder')}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
                />
                <p className="text-[10.5px] text-text-muted mt-1.5">{t('carrierHelp')}</p>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                  className="mt-0.5 accent-emerald"
                />
                <span>
                  <span className="text-[12.5px] text-text-1">{t('verifyLabel')}</span>
                  <span className="block text-[10.5px] text-text-muted">{t('verifyHelp')}</span>
                </span>
              </label>
            </div>
          )}

          <div>
            <label htmlFor="cov-note" className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1.5">
              {t('noteLabel')}
            </label>
            <input
              id="cov-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 outline-none focus:border-brand"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 shrink-0 border-t border-border flex-col sm:flex-row gap-2">
          {coverage.answered && (
            <button
              type="button"
              onClick={() => void save('CLEAR')}
              disabled={saving}
              className="text-[11px] text-text-muted hover:text-text-1 transition-colors sm:mr-auto disabled:opacity-50"
            >
              {t('clear')}
            </button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            {tc('cancel')}
          </Button>
          <Button onClick={() => void save(type)} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
