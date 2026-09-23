'use client';

/**
 * El editor de seguros del paciente — compartido por la lista de Pacientes y
 * la portada del caso.
 *
 * Vivía adentro de `patients-client.tsx`, que es la pantalla de la LISTA. El
 * único lugar del sistema donde se podían cargar el titular de la póliza, su
 * fecha de nacimiento, el parentesco, el grupo, la vigencia, el copago y el
 * deducible era ese diálogo, escondido en el menú "…" de una fila; la ficha del
 * caso —donde el mostrador mira el seguro con el paciente enfrente— tenía otro
 * editor con DOS campos: aseguradora y número de póliza (Erick, 22-sep-2026).
 *
 * Se movió tal cual, sin tocar la validación ni el guardado. Lo único que
 * cambió es la forma de entrar: antes pedía un `PatientRow` entero —un tipo de
 * la lista— y ahora pide el caso y el nombre del paciente, que es lo único que
 * usaba. Así lo puede abrir cualquier pantalla que tenga un caso a mano.
 *
 * Dónde se guarda cada cosa:
 *  · los MEDICAL van al JSON `Case.consentsData.insurances[]` (el mismo array
 *    que escribe el paso 6 del intake — mismas claves, mismo orden);
 *  · el de AUTO vive en su propia tabla, `case_auto_insurances`.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Shield, RefreshCw } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@precision/ui';
import { TagPill } from '@/components/ui-phoenix';
import { localeApp } from '@/lib/fechas';
import { fmtPhone } from '@/lib/telefono-formato';


// ── InsuranceEntry (mismo tipo que forms wizard) ──────────────────────────
export type InsuranceEntry = {
  id: string; insType: 'MEDICAL' | 'AUTO';
  carrier: string; policyId: string; holderName: string; groupNum: string;
  holderDOB: string; holderRelation: string; effectiveDate: string;
  copay: string; deductible: string;
  lossDate: string; pipAvailable: string; claimNum: string;
  adjusterName: string; adjusterPhone: string; adjusterFax: string;
  adjusterPhone2: string; adjusterEmail: string; comments: string;
  fullLien: boolean; lienComments: string;
};

export function emptyInsEntry(insType: 'MEDICAL' | 'AUTO'): InsuranceEntry {
  return {
    id: Math.random().toString(36).slice(2),
    insType, carrier: '', policyId: '', holderName: '', groupNum: '',
    holderDOB: '', holderRelation: '', effectiveDate: '', copay: '', deductible: '',
    lossDate: '', pipAvailable: '', claimNum: '', adjusterName: '', adjusterPhone: '',
    adjusterFax: '', adjusterPhone2: '', adjusterEmail: '', comments: '',
    fullLien: false, lienComments: '',
  };
}

const insLabel = 'text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5';
const insInput = 'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand';

export function NuevoSeguroDialog({ onClose, onSave, initialEntry }: {
  onClose: () => void;
  onSave: (entry: InsuranceEntry) => void;
  /** Si viene, el diálogo edita este seguro en vez de crear uno nuevo. */
  initialEntry?: InsuranceEntry;
}) {
  const t = useTranslations('phoenix.patients');
  const isEditing = !!initialEntry;
  const [tab, setTab] = useState<'MEDICAL' | 'AUTO'>(initialEntry?.insType ?? 'MEDICAL');
  const [entry, setEntry] = useState<InsuranceEntry>(() => initialEntry ?? emptyInsEntry('MEDICAL'));
  const [errors, setErrors] = useState<Partial<Record<keyof InsuranceEntry, string>>>({});

  const today = new Date().toISOString().split('T')[0];
  const minDOB = `${new Date().getFullYear() - 120}-01-01`;

  function switchTab(tp: 'MEDICAL' | 'AUTO') { setTab(tp); setEntry(emptyInsEntry(tp)); setErrors({}); }
  function set(k: keyof InsuranceEntry, v: string | boolean) {
    setEntry(prev => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors(prev => ({ ...prev, [k]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof InsuranceEntry, string>> = {};
    if (!entry.carrier.trim()) e.carrier = t('segurosErrRequired');
    /**
     * La póliza se exige SOLO en el seguro médico.
     *
     * El de AUTO ya no la pide (Erick, 22-sep-2026): el campo se sacó de esa
     * pestaña porque lo que identifica un siniestro es el **nº de reclamo**, no
     * la póliza del asegurado —que además muchas veces es del tercero que
     * chocó, y recepción no la tiene—. Dejar la validación como estaba
     * bloquearía el guardado de todo seguro de auto por un campo invisible.
     */
    if (tab === 'MEDICAL') {
      if (!entry.policyId.trim()) {
        e.policyId = t('segurosErrRequired');
      } else if (!/^[a-zA-Z0-9\-]{4,30}$/.test(entry.policyId.trim())) {
        e.policyId = t('segurosErrPolicyFormat');
      }
    }
    if (tab === 'MEDICAL') {
      if (!entry.holderRelation.trim()) e.holderRelation = t('segurosErrRequired');
      /**
       * La fecha de vigencia NO es obligatoria (pedido de recepción, 17-sep).
       *
       * Decía:
       *
       *     if (!entry.effectiveDate) e.effectiveDate = t('segurosErrRequired');
       *
       * Muchas tarjetas de seguro no la traen. Exigirla no conseguía el dato:
       * conseguía una fecha inventada, que es peor que un campo vacío porque
       * parece real y nadie la vuelve a mirar.
       *
       * Y ya estaba al revés: en el formulario que llena el PACIENTE este campo
       * siempre fue opcional. O sea que la encargada —que tiene la tarjeta en la
       * mano— estaba sujeta a una regla más estricta que el paciente.
       *
       * Sacarlo no rompe nada: el seguro médico se guarda en el JSON de
       * `consentsData.insurances[]` (no hay columna con NOT NULL), ninguna ruta
       * ni librería lee este campo, y la tarjeta que lo muestra ya se dibuja
       * condicionada a que exista.
       */
      if (entry.holderDOB && entry.holderDOB < minDOB) e.holderDOB = t('segurosErrDOBRange');
      const copayVal = parseFloat(entry.copay);
      if (entry.copay && (isNaN(copayVal) || copayVal < 0 || copayVal > 999999)) e.copay = t('segurosErrAmount');
      const dedVal = parseFloat(entry.deductible);
      if (entry.deductible && (isNaN(dedVal) || dedVal < 0 || dedVal > 999999)) e.deductible = t('segurosErrAmount');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() { if (validate()) { onSave(entry); onClose(); } }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-brand-text" /> {isEditing ? t('segurosEditTitle') : t('segurosNewTitle')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">{isEditing ? t('segurosEditDesc') : t('segurosNewDesc')}</DialogDescription>
        </DialogHeader>

        {/* Tabs — el tipo de seguro no se cambia al editar, ya define la forma del registro */}
        {!isEditing && (
          <div className="flex px-6 pt-4 gap-2 shrink-0">
            {(['MEDICAL', 'AUTO'] as const).map(tp => (
              <button key={tp} onClick={() => switchTab(tp)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === tp ? 'bg-brand text-white' : 'bg-bg-2 text-text-2 hover:bg-bg-2/80 border border-border'}`}
              >
                {tp === 'MEDICAL' ? t('segurosTabMedico') : t('segurosTabAuto')}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {tab === 'MEDICAL' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosCarrier')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.carrier ? 'border-rose' : ''}`} value={entry.carrier} onChange={e => set('carrier', e.target.value)} />
                  {errors.carrier && <p className="text-[11px] text-rose mt-1">{errors.carrier}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosPolicyId')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.policyId ? 'border-rose' : ''}`} value={entry.policyId} onChange={e => set('policyId', e.target.value)} />
                  {errors.policyId && <p className="text-[11px] text-rose mt-1">{errors.policyId}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosHolderName')}</label><input className={insInput} value={entry.holderName} onChange={e => set('holderName', e.target.value)} /></div>
                <div><label className={insLabel}>{t('segurosGroupNum')}</label><input className={insInput} value={entry.groupNum} onChange={e => set('groupNum', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosHolderDOB')}</label>
                  <input
                    type="date"
                    min={minDOB}
                    max={today}
                    className={`${insInput} [color-scheme:dark] ${errors.holderDOB ? 'border-rose' : ''}`}
                    value={entry.holderDOB}
                    onChange={e => set('holderDOB', e.target.value)}
                  />
                  {errors.holderDOB && <p className="text-[11px] text-rose mt-1">{errors.holderDOB}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosHolderRelation')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.holderRelation ? 'border-rose' : ''}`} value={entry.holderRelation} onChange={e => set('holderRelation', e.target.value)} />
                  {errors.holderRelation && <p className="text-[11px] text-rose mt-1">{errors.holderRelation}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosEffectiveDate')}</label>
                  <input
                    type="date"
                    className={`${insInput} [color-scheme:dark] ${errors.effectiveDate ? 'border-rose' : ''}`}
                    value={entry.effectiveDate}
                    onChange={e => set('effectiveDate', e.target.value)}
                  />
                  {errors.effectiveDate && <p className="text-[11px] text-rose mt-1">{errors.effectiveDate}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosCopay')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm select-none">$</span>
                    <input
                      type="number"
                      min="0"
                      max="999999"
                      step="0.01"
                      className={`${insInput} pl-7 ${errors.copay ? 'border-rose' : ''}`}
                      placeholder="0.00"
                      value={entry.copay}
                      onChange={e => set('copay', e.target.value)}
                    />
                  </div>
                  {errors.copay && <p className="text-[11px] text-rose mt-1">{errors.copay}</p>}
                </div>
                <div>
                  <label className={insLabel}>{t('segurosDeductible')}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm select-none">$</span>
                    <input
                      type="number"
                      min="0"
                      max="999999"
                      step="0.01"
                      className={`${insInput} pl-7 ${errors.deductible ? 'border-rose' : ''}`}
                      placeholder="0.00"
                      value={entry.deductible}
                      onChange={e => set('deductible', e.target.value)}
                    />
                  </div>
                  {errors.deductible && <p className="text-[11px] text-rose mt-1">{errors.deductible}</p>}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Una sola columna: acá iba "ID / Póliza #" al lado, y se sacó
                  (Erick, 22-sep-2026). Lo que identifica un siniestro de auto es
                  el nº de RECLAMO, que está abajo; la póliza es del asegurado y
                  muchas veces es la del tercero que chocó, así que recepción la
                  dejaba vacía o inventaba algo. El dato NO se borró de la base:
                  `case_auto_insurances.policyId` sigue existiendo y lo que ya
                  estaba cargado se conserva al editar. */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={insLabel}>{t('segurosCarrier')} <span className="text-rose">*</span></label>
                  <input className={`${insInput} ${errors.carrier ? 'border-rose' : ''}`} value={entry.carrier} onChange={e => set('carrier', e.target.value)} />
                  {errors.carrier && <p className="text-[11px] text-rose mt-1">{errors.carrier}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosLossDate')}</label><input type="date" className={`${insInput} [color-scheme:dark]`} value={entry.lossDate} onChange={e => set('lossDate', e.target.value)} /></div>
                <div><label className={insLabel}>{t('segurosPip')}</label><input className={insInput} value={entry.pipAvailable} onChange={e => set('pipAvailable', e.target.value)} /></div>
              </div>
              <div><label className={insLabel}>{t('segurosClaimNum')}</label><input className={insInput} value={entry.claimNum} onChange={e => set('claimNum', e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosAdjusterName')}</label><input className={insInput} value={entry.adjusterName} onChange={e => set('adjusterName', e.target.value)} /></div>
                <div><label className={insLabel}>{t('segurosAdjusterPhone')}</label><input className={insInput} placeholder="(000) 000-0000" inputMode="numeric" maxLength={14} value={entry.adjusterPhone} onChange={e => set('adjusterPhone', fmtPhone(e.target.value))} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={insLabel}>{t('segurosAdjusterFax')}</label><input className={insInput} placeholder="(000) 000-0000" inputMode="numeric" maxLength={14} value={entry.adjusterFax} onChange={e => set('adjusterFax', fmtPhone(e.target.value))} /></div>
                <div><label className={insLabel}>{t('segurosAdjusterPhone2')}</label><input className={insInput} placeholder="(000) 000-0000" inputMode="numeric" maxLength={14} value={entry.adjusterPhone2} onChange={e => set('adjusterPhone2', fmtPhone(e.target.value))} /></div>
              </div>
              <div><label className={insLabel}>{t('segurosAdjusterEmail')}</label><input type="email" className={insInput} value={entry.adjusterEmail} onChange={e => set('adjusterEmail', e.target.value)} /></div>
              <div><label className={insLabel}>{t('segurosComments')}</label><textarea className={`${insInput} resize-none`} rows={3} value={entry.comments} onChange={e => set('comments', e.target.value)} /></div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={entry.fullLien} onChange={e => set('fullLien', e.target.checked)} className="w-4 h-4 rounded border border-border accent-brand" />
                <span className="text-sm text-text-2">{t('segurosFullLien')}</span>
              </label>
              {entry.fullLien && (
                <div><label className={insLabel}>{t('segurosLienComments')}</label><textarea className={`${insInput} resize-none`} rows={2} value={entry.lienComments} onChange={e => set('lienComments', e.target.value)} /></div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{t('btnCancel')}</Button>
          <Button className="w-full sm:w-auto" onClick={handleSave}>{t('segurosGuardar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const INS_TYPE_COLOR: Record<string, string> = {
  MEDICAL: 'bg-cyan/10 text-cyan border-cyan/20',
  AUTO:    'bg-amber/10 text-amber border-amber/20',
};

/**
 * Id fijo de la entrada AUTO en la lista de la UI.
 *
 * El seguro de auto dejó de vivir en `consentsData.insurances[]` y pasó a la
 * tabla `case_auto_insurances`, que es 1:1 con el caso — o sea que hay UNO solo
 * y no necesita id propio. Los seguros MEDICAL siguen en el JSON con su id.
 */
const AUTO_ENTRY_ID = '__auto__';

const PIP_TO_TEXT: Record<string, string> = {
  YES: 'Y', NO: 'N', UNKNOWN: '', NOT_APPLICABLE: 'N/A',
};

/**
 * Acá se escribe a mano, así que hay que aceptar lo que la gente realmente
 * tipea. Ojo con el orden: "na" y "n/a" tienen que mirarse ANTES que "n", o
 * un "N/A" terminaría guardado como NO —que significa lo contrario— y el caso
 * se leería como "se preguntó y no hay PIP".
 */
function textToPip(raw: string): 'YES' | 'NO' | 'UNKNOWN' | 'NOT_APPLICABLE' {
  const v = raw.trim().toLowerCase();
  if (['n/a', 'na', 'no aplica', 'not applicable'].includes(v)) return 'NOT_APPLICABLE';
  if (['y', 'yes', 'si', 'sí', 's', 'true', '1'].includes(v)) return 'YES';
  if (['n', 'no', 'false', '0'].includes(v)) return 'NO';
  return 'UNKNOWN';
}

/** El caso al que pertenecen estos seguros. `null` = el paciente no tiene ninguno. */
export interface CasoDeSeguros {
  id: string;
  caseCode: string;
  consentsData: Record<string, unknown> | null;
}

/**
 * La lista de seguros de un caso, con alta, edición y baja.
 *
 * Antes recibía un `PatientRow` —el tipo de una fila de la lista de pacientes—
 * y de todo eso usaba cinco campos. Pedir el caso y el nombre lo vuelve
 * abrible desde cualquier pantalla que tenga un caso a mano, que es lo que
 * necesitaba la portada del caso.
 */
export function SegurosDialog({ caso, titular, onClose }: {
  caso: CasoDeSeguros | null;
  /** Nombre completo del paciente, solo para el encabezado. */
  titular: string;
  onClose: () => void;
}) {
  const t = useTranslations('phoenix.patients');
  const tCommon = useTranslations('phoenix.common');
  const cd = caso?.consentsData ?? null;
  // Del JSON ya solo salen los MEDICAL: los AUTO viven en su propia tabla.
  const initialIns = (Array.isArray(cd?.insurances) ? (cd!.insurances as InsuranceEntry[]) : [])
    .filter(i => i.insType !== 'AUTO');
  const [insurances, setInsurances] = useState<InsuranceEntry[]>(initialIns);
  // 'new' = formulario vacío · InsuranceEntry = editando ese seguro existente
  const [formTarget, setFormTarget] = useState<'new' | InsuranceEntry | null>(null);
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(!!caso);
  const [error, setError]           = useState('');

  const caseId = caso?.id ?? null;

  // El seguro de auto se pide al abrir el modal en vez de viajar en el payload
  // de la lista de pacientes, que ya es pesado y se abre mucho más seguido que
  // este diálogo.
  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`/api/admin/cases/${caseId}/auto-insurance`);
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const row = json.autoInsurance;
        if (!row) return;
        const entry: InsuranceEntry = {
          ...emptyInsEntry('AUTO'),
          id: AUTO_ENTRY_ID,
          carrier: row.carrier?.name ?? row.carrierNameRaw ?? '',
          policyId: row.policyId ?? '',
          lossDate: row.lossDate ? String(row.lossDate).slice(0, 10) : '',
          pipAvailable: PIP_TO_TEXT[row.pipAvailable] ?? '',
          claimNum: row.claimNum ?? '',
          adjusterName: row.adjuster?.name ?? row.adjusterNameRaw ?? '',
          adjusterPhone: row.adjuster?.phone ?? row.adjusterPhoneRaw ?? '',
          comments: row.comments ?? '',
          fullLien: row.fullLien ?? false,
          lienComments: row.lienComments ?? '',
        };
        setInsurances(prev => [entry, ...prev.filter(i => i.id !== AUTO_ENTRY_ID)]);
      } catch { /* si falla, el modal muestra solo los MEDICAL */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  /** Guarda los MEDICAL en el JSON del caso (los AUTO ya no van acá). */
  async function saveMedical(updated: InsuranceEntry[]) {
    if (!caseId) return false;
    const res = await fetch(`/api/admin/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consents: { insurances: updated.filter(i => i.insType !== 'AUTO') } }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.message ?? t('errorSave'));
      return false;
    }
    return true;
  }

  /** Guarda el seguro de auto en su tabla. */
  async function saveAuto(entry: InsuranceEntry) {
    if (!caseId) return false;
    const res = await fetch(`/api/admin/cases/${caseId}/auto-insurance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carrierNameRaw: entry.carrier.trim() || null,
        policyId: entry.policyId.trim() || null,
        lossDate: entry.lossDate || null,
        pipAvailable: textToPip(entry.pipAvailable),
        claimNum: entry.claimNum.trim() || null,
        adjusterNameRaw: entry.adjusterName.trim() || null,
        adjusterPhoneRaw: entry.adjusterPhone.trim() || null,
        comments: entry.comments.trim() || null,
        fullLien: entry.fullLien,
        lienComments: entry.lienComments.trim() || null,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.message ?? t('errorSave'));
      return false;
    }
    return true;
  }

  const insTypeLabel = { MEDICAL: t('segurosTypeMedical'), AUTO: t('segurosTypeAuto') };

  async function handleUpsert(entry: InsuranceEntry) {
    if (!caseId) return;
    setSaving(true); setError('');
    try {
      if (entry.insType === 'AUTO') {
        // La tabla es 1:1 con el caso: un segundo auto reemplaza al anterior en
        // vez de agregarse, que es lo que el JSON dejaba hacer sin querer.
        const withId = { ...entry, id: AUTO_ENTRY_ID };
        if (!(await saveAuto(withId))) return;
        setInsurances(prev => [withId, ...prev.filter(i => i.insType !== 'AUTO')]);
      } else {
        const exists  = insurances.some(i => i.id === entry.id);
        const updated = exists
          ? insurances.map(i => (i.id === entry.id ? entry : i))
          : [...insurances, entry];
        if (!(await saveMedical(updated))) return;
        setInsurances(updated);
      }
    } catch { setError(t('errorNetwork')); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!caseId) return;
    setSaving(true); setError('');
    try {
      if (id === AUTO_ENTRY_ID) {
        const res = await fetch(`/api/admin/cases/${caseId}/auto-insurance`, { method: 'DELETE' });
        if (!res.ok) { setError(t('errorDelete')); return; }
        setInsurances(prev => prev.filter(i => i.id !== AUTO_ENTRY_ID));
      } else {
        const updated = insurances.filter(i => i.id !== id);
        if (!(await saveMedical(updated))) return;
        setInsurances(updated);
      }
    } catch { setError(t('errorNetwork')); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-text" />
              {t('menuInsurance')} — {titular}
            </DialogTitle>
            <DialogDescription className="text-text-muted text-xs">
              {caso?.caseCode ?? t('segurosNoCase')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {!caso && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
                <Shield className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">{t('segurosNoCase')}</p>
                <p className="text-[11px] text-center">{t('segurosNoCaseDesc')}</p>
              </div>
            )}

            {caso && insurances.length === 0 && !saving && !loading && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
                <Shield className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">{t('segurosEmpty')}</p>
                <p className="text-[11px]">{t('segurosEmptyDesc')}</p>
              </div>
            )}

            {(saving || loading) && (
              <div className="flex items-center justify-center py-6 text-text-muted gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                {/* Decía "Guardando…" también mientras CARGA, que son dos cosas
                    distintas: al abrir el diálogo se está pidiendo el seguro de
                    auto y no se está escribiendo nada. */}
                <span className="text-sm">{saving ? t('segurosSaving') : tCommon('loading')}</span>
              </div>
            )}

            {!saving && insurances.map((ins) => (
              <div key={ins.id} className="rounded-lg border border-border bg-bg-1 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TagPill
                      label={insTypeLabel[ins.insType] ?? ins.insType}
                      colorClass={INS_TYPE_COLOR[ins.insType] ?? 'bg-bg-2 text-text-2 border-border'}
                    />
                    <span className="text-sm font-medium text-text-1">{ins.carrier || '—'}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setFormTarget(ins)}
                      disabled={saving}
                      className="p-1.5 rounded text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors"
                      title={t('segurosEditTooltip')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(ins.id)}
                      disabled={saving}
                      className="p-1.5 rounded text-text-muted hover:text-rose hover:bg-rose/10 transition-colors"
                      title={t('segurosDelete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                  {ins.policyId && <div className="flex justify-between"><span className="text-text-muted">{t('segurosPolicyLabel')}</span><span className="text-text-1 font-mono">{ins.policyId}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.holderName && <div className="flex justify-between"><span className="text-text-muted">{t('segurosHolderLabel')}</span><span className="text-text-1">{ins.holderName}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.holderRelation && <div className="flex justify-between"><span className="text-text-muted">{t('segurosRelationLabel')}</span><span className="text-text-1">{ins.holderRelation}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.copay && <div className="flex justify-between"><span className="text-text-muted">{t('segurosCopay')}</span><span className="text-text-1 font-mono">${parseFloat(ins.copay).toFixed(2)}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.deductible && <div className="flex justify-between"><span className="text-text-muted">{t('segurosDeductible')}</span><span className="text-text-1 font-mono">${parseFloat(ins.deductible).toFixed(2)}</span></div>}
                  {ins.insType === 'MEDICAL' && ins.effectiveDate && <div className="flex justify-between"><span className="text-text-muted">{t('segurosEffectiveDate')}</span><span className="text-text-1">{new Date(ins.effectiveDate + 'T00:00:00').toLocaleDateString(localeApp(), { month: '2-digit', day: '2-digit', year: 'numeric' })}</span></div>}
                  {ins.insType === 'AUTO' && ins.claimNum && <div className="flex justify-between"><span className="text-text-muted">{t('segurosClaimLabel')}</span><span className="text-text-1 font-mono">{ins.claimNum}</span></div>}
                  {ins.insType === 'AUTO' && ins.adjusterName && <div className="flex justify-between"><span className="text-text-muted">{t('segurosAdjusterLabel')}</span><span className="text-text-1">{ins.adjusterName}</span></div>}
                  {ins.insType === 'AUTO' && ins.adjusterPhone && <div className="flex justify-between"><span className="text-text-muted">{t('segurosTelLabel')}</span><span className="text-text-1 font-mono">{ins.adjusterPhone}</span></div>}
                  {ins.insType === 'AUTO' && ins.adjusterEmail && <div className="flex justify-between"><span className="text-text-muted">{t('segurosEmailLabel')}</span><span className="text-text-1 truncate max-w-[130px]">{ins.adjusterEmail}</span></div>}
                  {ins.insType === 'AUTO' && ins.lossDate && <div className="flex justify-between"><span className="text-text-muted">{t('segurosLossLabel')}</span><span className="text-text-1">{ins.lossDate}</span></div>}
                  {ins.insType === 'AUTO' && ins.pipAvailable && <div className="flex justify-between"><span className="text-text-muted">{t('segurosPipLabel')}</span><span className="text-text-1">{ins.pipAvailable}</span></div>}
                  {ins.fullLien && <div className="flex items-center gap-1.5 col-span-2"><span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" /><span className="text-amber font-medium">{t('segurosFullLienLabel')}</span></div>}
                </div>
              </div>
            ))}

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
            <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{t('btnClose')}</Button>
            {caso && (
              <Button className="w-full sm:w-auto" onClick={() => setFormTarget('new')} disabled={saving}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t('segurosAdd')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {formTarget && (
        <NuevoSeguroDialog
          onClose={() => setFormTarget(null)}
          onSave={handleUpsert}
          initialEntry={formTarget === 'new' ? undefined : formTarget}
        />
      )}
    </>
  );
}
