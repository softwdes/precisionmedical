'use client';

/**
 * Adjusters del claim — pedido de Edson.
 *
 * Gemelo de `case-managers.tsx` y por la misma razón: la PERSONA vive en el
 * catálogo (por aseguradora, con teléfono, extensión y fax escritos una vez) y
 * lo que es del caso es la ASIGNACIÓN. Son varios: su Excel dice "Kenneth Kelly
 * or Patricia Leon" — contactos alternativos para el mismo claim.
 *
 * La dirección de billing va acá aunque sea de la ASEGURADORA: Edson la usa en
 * el mismo momento que los teléfonos, y mandarlo a otra pantalla a buscarla es
 * como termina copiada a mano en un Excel.
 *
 * Ver docs/plan-vista-edson.md
 */

import { useState, useEffect, useCallback, useImperativeHandle, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X, Mail, Phone, Printer, Loader2, MapPin } from 'lucide-react';
import { Button, Input, Label } from '@precision/ui';
import { localeApp } from '@/lib/fechas';
import { CopyLine } from './case-managers';

export interface CaseAdjuster {
  id: string;
  assignedAt: string;
  removedAt: string | null;
  notes: string | null;
  adjuster: {
    id: string;
    name: string;
    phone: string | null;
    extension: string | null;
    phone2: string | null;
    fax: string | null;
    email: string | null;
    status: string;
    insuranceCarrier: { id: string; name: string; claimsAddress: string | null } | null;
  } | null;
  /** Escritos a mano — mandan cuando no hay `adjuster`. */
  name: string | null;
  phone: string | null;
  extension: string | null;
  phone2: string | null;
  fax: string | null;
  email: string | null;
}

/**
 * Lo escrito a mano gana; el catálogo es el respaldo.
 *
 * Exigir que la persona existiera en la aseguradora hacía imposible agregar a
 * nadie cuando el caso no tenía carrier. Ahora se escribe y ya.
 */
function adjData(a: CaseAdjuster) {
  return {
    name:      a.name      ?? a.adjuster?.name ?? '—',
    phone:     a.phone     ?? a.adjuster?.phone ?? null,
    extension: a.extension ?? a.adjuster?.extension ?? null,
    phone2:    a.phone2    ?? a.adjuster?.phone2 ?? null,
    fax:       a.fax       ?? a.adjuster?.fax ?? null,
    email:     a.email     ?? a.adjuster?.email ?? null,
  };
}

interface Carrier {
  id: string; name: string;
  claimsAddress: string | null; claimsPhone: string | null; claimsFax: string | null;
}

/** El teléfono y la extensión se guardan aparte pero se leen juntos. */
function withExt(phone: string | null, ext: string | null): string | null {
  if (!phone) return null;
  return ext ? `${phone} ext. ${ext}` : phone;
}

export function useCaseAdjusters(caseId: string | null) {
  const [current, setCurrent] = useState<CaseAdjuster[]>([]);
  const [past, setPast]       = useState<CaseAdjuster[]>([]);
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [loading, setLoading] = useState(!!caseId);

  const reload = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/cases/${caseId}/adjusters`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setCurrent(json.current ?? []);
        setPast(json.past ?? []);
        setCarrier(json.carrier ?? null);
      }
    } finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { void reload(); }, [reload]);

  return { current, past, carrier, loading, reload };
}

function AdjusterCard({ a, onRemove }: { a: CaseAdjuster; onRemove?: () => void }) {
  const d = adjData(a);
  const phone = withExt(d.phone, d.extension);
  return (
    <div className="rounded-md bg-bg-2/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-text-1 text-[13px] font-medium truncate">
          {d.name}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove}
                  className="shrink-0 p-1 rounded text-text-muted hover:text-rose hover:bg-rose/10">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1 space-y-0.5">
        {phone && <CopyLine icon={<Phone className="w-3 h-3" />} value={phone} />}
        {d.phone2 && <CopyLine icon={<Phone className="w-3 h-3" />} value={d.phone2} />}
        {d.fax && <CopyLine icon={<Printer className="w-3 h-3" />} value={d.fax} />}
        {d.email && (
          <CopyLine icon={<Mail className="w-3 h-3" />} value={d.email} href={`mailto:${d.email}`} />
        )}
      </div>
    </div>
  );
}

/** Dirección de billing — de la aseguradora, no del caso. */
function BillingAddress({ carrier, onSaved }: { carrier: Carrier | null; onSaved: () => void }) {
  const t = useTranslations('phoenix.edsonTracking');
  const [value, setValue]   = useState(carrier?.claimsAddress ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty]   = useState(false);

  useEffect(() => { setValue(carrier?.claimsAddress ?? ''); setDirty(false); }, [carrier?.id, carrier?.claimsAddress]);

  if (!carrier) return null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/insurances/claims-address', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrierId: carrier!.id, claimsAddress: value }),
      });
      if (res.ok) { setDirty(false); onSaved(); }
    } finally { setSaving(false); }
  }

  return (
    <div>
      <Label htmlFor="adj-address" className="flex items-center gap-1.5">
        <MapPin className="w-3 h-3" /> {t('billingAddress')}
      </Label>
      <textarea
        id="adj-address"
        rows={4}
        value={value}
        onChange={e => { setValue(e.target.value); setDirty(true); }}
        placeholder={t('billingAddressPh')}
        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-[12.5px] text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none font-mono"
      />
      <div className="flex items-center gap-2 mt-1">
        {/* Se avisa siempre, no solo al editar: Edson tiene que saber que lo que
            escribe acá cambia TODOS los casos de esa aseguradora. */}
        <span className="text-[11px] text-amber flex-1">{t('billingAddressHint')}</span>
        {dirty && (
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? '…' : t('save')}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Popover de la grilla ────────────────────────────────────────────────────

export function AdjustersPopover({
  caseId, onClose, onAdd,
}: {
  caseId: string;
  onClose: () => void;
  onAdd: () => void;
}) {
  const t = useTranslations('phoenix.edsonTracking');
  const { current, carrier, loading } = useCaseAdjusters(caseId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 w-[270px] rounded-lg bg-surface shadow-xl p-3 space-y-2 text-left">
        {carrier && <div className="text-text-1 text-[13px] font-semibold">{carrier.name}</div>}

        <div className="text-[10px] uppercase tracking-wider font-semibold text-amber">
          {t('groupAdjusters')}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-text-muted text-[12px] py-1">
            <Loader2 className="w-3 h-3 animate-spin" /> …
          </div>
        )}
        {!loading && current.length === 0 && (
          <p className="text-text-muted text-[12px] italic">{t('adjusterNone')}</p>
        )}
        {current.map(a => <AdjusterCard key={a.id} a={a} />)}

        {carrier?.claimsAddress && (
          <div className="pt-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">
              {t('billingAddress')}
            </div>
            <p className="text-[11.5px] text-text-2 whitespace-pre-wrap font-mono">{carrier.claimsAddress}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => { onClose(); onAdd(); }}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 py-1.5 text-[12px] text-text-2 hover:text-text-1 hover:border-brand"
        >
          <Plus className="w-3 h-3" /> {t('adjusterAdd')}
        </button>
      </div>
    </>
  );
}

// ─── Sección del modal ───────────────────────────────────────────────────────

export function AdjustersSection({
  caseId, onChanged, autoOpen, handleRef,
}: {
  caseId: string;
  onChanged?: () => void;
  /** Abre el formulario de alta al montar — se llega desde "Agregar adjuster". */
  autoOpen?: boolean;
  handleRef?: Ref<import('./case-managers').SectionHandle>;
}) {
  const t = useTranslations('phoenix.edsonTracking');
  const { current, past, carrier, loading, reload } = useCaseAdjusters(caseId);

  const [adding, setAdding]   = useState(!!autoOpen);
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [ext, setExt]         = useState('');
  const [fax, setFax]         = useState('');
  const [email, setEmail]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');


  async function assign() {
    setSaving(true); setError('');
    try {
      const body = { name: name.trim(), phone: phone.trim() || null, extension: ext.trim() || null,
                     fax: fax.trim() || null, email: email.trim() || null };
      const res = await fetch(`/api/admin/cases/${caseId}/adjusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.message ?? json.error ?? `${t('errSave')} (HTTP ${res.status})`);
        return;
      }
      setAdding(false); setName(''); setPhone(''); setExt(''); setFax(''); setEmail('');
      await reload();
      onChanged?.();
    } catch { setError(t('errSave')); }
    finally { setSaving(false); }
  }

  async function remove(assignmentId: string) {
    const res = await fetch(`/api/admin/cases/${caseId}/adjusters?id=${encodeURIComponent(assignmentId)}`, { method: 'DELETE' });
    if (res.ok) { await reload(); onChanged?.(); }
  }

  // Ver la nota en `ManagersSection`: el pie del modal tambien confirma lo que
  // quedo escrito acá, para que "Guardar cambios" haga lo que aparenta.
  useImperativeHandle(handleRef, () => ({
    flush: async () => { if (adding && name.trim()) await assign(); },
  }));

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(localeApp(), { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-text-muted">{t('adjustersHint')}</p>

      {loading && (
        <div className="flex items-center gap-2 text-text-muted text-[12px]">
          <Loader2 className="w-3 h-3 animate-spin" /> …
        </div>
      )}
      {!loading && current.length === 0 && !adding && (
        <p className="text-[12px] text-text-muted italic">{t('adjusterNone')}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {current.map(a => <AdjusterCard key={a.id} a={a} onRemove={() => void remove(a.id)} />)}
      </div>

      {past.length > 0 && (
        <details>
          <summary className="text-[11px] text-text-muted cursor-pointer hover:text-text-2">
            {t('managerPast')} ({past.length})
          </summary>
          <div className="mt-1.5 space-y-1">
            {past.map(a => (
              <div key={a.id} className="text-[11.5px] text-text-muted">
                <span className="line-through">{adjData(a).name}</span>
                {a.removedAt && <span className="text-[10.5px]"> · {fmt(a.removedAt)}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {!adding && (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {t('adjusterAdd')}
        </Button>
      )}

      {adding && (
        <div className="rounded-lg bg-bg-1 p-3 space-y-3">
          {/*
            * Un solo formulario, sin pestañas. Antes habia una para elegir del
            * catalogo de la aseguradora, pero el catalogo esta vacio y elegir
            * de ahi exigia que el caso tuviera carrier — dos condiciones para
            * algo que se resuelve escribiendo el nombre.
            */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="sm:col-span-2">
              <Label htmlFor="ca-name">{t('adjusterName')}</Label>
              <Input id="ca-name" value={name} onChange={e => setName(e.target.value)} placeholder="Kenneth Kelly" />
            </div>
            <div>
              <Label htmlFor="ca-phone">{t('fieldPhone')}</Label>
              <Input id="ca-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="800-531-8722" />
            </div>
            <div>
              <Label htmlFor="ca-ext">{t('fieldExtension')}</Label>
              <Input id="ca-ext" value={ext} onChange={e => setExt(e.target.value)} placeholder="41773" maxLength={20} />
            </div>
            <div>
              <Label htmlFor="ca-fax">{t('fieldFax')}</Label>
              <Input id="ca-fax" value={fax} onChange={e => setFax(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ca-email">{t('fieldEmail')}</Label>
              <Input id="ca-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          {error && <div className="text-rose text-[12px]">{error}</div>}

          <div className="flex gap-2">
            <Button onClick={() => void assign()} disabled={saving || !name.trim()}>
              {saving ? '…' : t('adjusterAdd')}
            </Button>
            <Button variant="outline" onClick={() => { setAdding(false); setError(''); }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <BillingAddress carrier={carrier} onSaved={() => void reload()} />
    </div>
  );
}
