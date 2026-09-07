'use client';

/**
 * FirmDialog — el formulario de bufete, compartido.
 *
 * Vivía como función privada dentro de `admin/lawyers/lawyers-client.tsx`, así
 * que el único lugar donde se podía dar de alta un bufete era esa pantalla de
 * catálogo. Mientras tanto, el wizard de caso nuevo mostraba un aviso que decía
 * «si no está en la lista, usá "Agregar bufete"» — un botón que ahí NO existía.
 * Recepción tenía que abandonar el alta del paciente, irse al catálogo, crear el
 * bufete y volver a empezar.
 *
 * Se movió TAL CUAL (los mismos 9 campos, el mismo POST, el mismo manejo de
 * error) y se le agregaron dos props para poder usarlo desde un wizard:
 *
 *  · `initialName` — precarga el nombre con lo que ya venía tecleado en el
 *    buscador. Si escribió "Harker" y no apareció, retipearlo es fricción gratis.
 *  · `onCreated`   — devuelve el bufete recién creado para que la pantalla que
 *    lo pidió lo SELECCIONE y siga donde estaba. Sin esto habría que buscarlo de
 *    nuevo en el autocomplete, que es la mitad del problema que vinimos a
 *    resolver.
 *
 * Anidarlo dentro de otro diálogo funciona: el wizard de caso nuevo ya monta
 * `ContactoCompartidoDialog` adentro, con este mismo primitivo.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, Phone as PhoneIcon } from 'lucide-react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';

/** Lo que el diálogo necesita de un bufete para EDITARLO. */
export interface FirmEditable {
  id: string;
  firmName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  paymentSpeed: string | null;
  caseflowFlags: string[];
  status: string;
}

/** El bufete recién creado — lo mínimo para seleccionarlo en el wizard. */
export interface FirmCreado {
  id: string;
  firmName: string;
  city: string | null;
}

interface Similar {
  id: string;
  firmName: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  paymentSpeed: string | null;
  mismoNombre: boolean;
}

export function FirmDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
  initialName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: FirmEditable | null;
  onSaved: () => void;
  /** Wizard: lo que ya venía tecleado en el buscador. */
  initialName?: string;
  /** Wizard: el bufete creado, para seleccionarlo y seguir. */
  onCreated?: (firm: FirmCreado) => void;
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');

  const PAYMENT_SPEEDS = [
    { value: 'UNKNOWN', label: t('speedUnknown') },
    { value: 'FAST',    label: t('speedFastOption') },
    { value: 'AVERAGE', label: t('speedAvgOption') },
    { value: 'SLOW',    label: t('speedSlowOption') },
  ];

  const [firmName, setFirmName] = useState(editing?.firmName ?? '');
  const [email, setEmail]       = useState(editing?.email ?? '');
  const [phone, setPhone]       = useState(editing?.phone ?? '');
  const [address, setAddress]   = useState(editing?.address ?? '');
  const [city, setCity]         = useState(editing?.city ?? '');
  const [state, setState]       = useState(editing?.state ?? 'UT');
  const [paymentSpeed, setPaymentSpeed] = useState(editing?.paymentSpeed ?? 'UNKNOWN');
  const [flagsInput, setFlagsInput]     = useState(editing?.caseflowFlags.join(', ') ?? '');
  const [notes, setNotes]   = useState(editing?.notes ?? '');
  const [isActive, setIsActive] = useState(editing?.status === 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    /* Alta desde un wizard: el nombre arranca con lo que se estaba buscando.
       `editing` manda cuando hay: editar nunca debe ver el `initialName`. */
    setFirmName(editing?.firmName ?? initialName?.trim() ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setAddress(editing?.address ?? '');
    setCity(editing?.city ?? '');
    setState(editing?.state ?? 'UT');
    setPaymentSpeed(editing?.paymentSpeed ?? 'UNKNOWN');
    setFlagsInput(editing?.caseflowFlags.join(', ') ?? '');
    setNotes(editing?.notes ?? '');
    setIsActive(editing?.status === 'ACTIVE');
    setError(null);
    setLastEditingId(editingId);
  }

  /**
   * Parecidos ya en el catálogo — AVISA, no bloquea (decisión de Erick).
   *
   * Solo al CREAR: editando un bufete existente, sus propios hermanos de nombre
   * no son un hallazgo. Y se consulta mientras se escribe el nombre, que es el
   * único momento en que el aviso sirve: después de llenar nueve campos, decirle
   * que ya existía es hacerle perder el trabajo.
   */
  const [similares, setSimilares] = useState<Similar[]>([]);
  const buscado = editing ? '' : firmName.trim();
  useEffect(() => {
    if (!open || editing || buscado.length < 2) { setSimilares([]); return; }
    const id = setTimeout(() => {
      fetch(`/api/admin/lawyers/similar?name=${encodeURIComponent(buscado)}`)
        .then((r) => r.json())
        .then((j) => setSimilares(Array.isArray(j.similares) ? j.similares : []))
        .catch(() => setSimilares([]));
    }, 300);
    return () => clearTimeout(id);
  }, [open, editing, buscado]);

  const handleSave = async () => {
    setError(null);
    if (!firmName.trim()) return setError(t('errorFirmNameRequired'));
    setSaving(true);
    try {
      const flags = flagsInput.split(',').map((f) => f.trim()).filter(Boolean);
      const res = await fetch('/api/admin/lawyers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          firmName: firmName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          paymentSpeed,
          caseflowFlags: flags,
          notes: notes.trim() || null,
          isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      /* El wizard necesita el id para SELECCIONARLO. Va antes de `onSaved`
         porque esa suele cerrar el diálogo y recargar la lista. */
      if (!editing && data.firm?.id) {
        onCreated?.({
          id: data.firm.id,
          firmName: data.firm.firmName ?? firmName.trim(),
          city: data.firm.city ?? (city.trim() || null),
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t('dialogEditTitle', { name: editing.firmName }) : t('dialogCreateTitle')}</DialogTitle>
          <DialogDescription>
            {t('dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <Label htmlFor="firmName">{t('fieldFirmName')} <span className="text-rose">*</span></Label>
            <Input id="firmName" value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Ej: Smith & Johnson LLP" autoFocus />
          </div>

          {/* El aviso de parecidos. Ámbar y no rosa: no es un error, es "mirá
              esto antes de seguir". La CIUDAD va al lado del nombre porque el
              catálogo tiene sucursales — "Sterling Legal Partners" existe en
              New York, Phoenix y Miami, y sin la ciudad el aviso parece un
              falso positivo y se aprende a ignorarlo. */}
          {similares.length > 0 && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5">
              <div className="text-[11.5px] font-semibold text-amber">{t('similarTitle')}</div>
              <div className="text-[11px] text-text-2 mt-0.5">{t('similarHint')}</div>
              <div className="mt-2 space-y-1">
                {similares.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 flex-wrap rounded bg-bg-2/40 px-2 py-1.5">
                    <span className="text-[12px] text-text-1 font-medium">{s.firmName}</span>
                    {s.mismoNombre && (
                      <span className="text-[9.5px] font-bold px-1.5 py-px rounded bg-amber/20 text-amber">
                        {t('similarSameName')}
                      </span>
                    )}
                    {s.city && (
                      <span className="text-[11px] text-text-muted inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{s.city}{s.state ? `, ${s.state}` : ''}
                      </span>
                    )}
                    {s.phone && (
                      <span className="text-[11px] text-text-muted inline-flex items-center gap-1">
                        <PhoneIcon className="w-3 h-3" />{s.phone}
                      </span>
                    )}
                    <div className="flex-1" />
                    {/* Solo desde un wizard: en el catálogo no hay nada que
                        "usar", ahí el aviso es informativo. */}
                    {onCreated && (
                      <button
                        type="button"
                        onClick={() => {
                          onCreated({ id: s.id, firmName: s.firmName ?? '', city: s.city });
                          onOpenChange(false);
                        }}
                        className="text-[11px] font-semibold text-brand-text hover:underline shrink-0"
                      >
                        {t('similarUse')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">{t('fieldEmail')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@firm.com" />
            </div>
            <div>
              <Label htmlFor="phone">{t('fieldPhone')}</Label>
              <Input id="phone" value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} placeholder="+1-801-555-0000" />
            </div>
          </div>

          <div>
            <Label htmlFor="address">{t('fieldAddress')}</Label>
            <Input id="address" value={address ?? ''} onChange={(e) => setAddress(e.target.value)} placeholder="123 Center St, Suite 200" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="city">{t('fieldCity')}</Label>
              <Input id="city" value={city ?? ''} onChange={(e) => setCity(e.target.value)} placeholder="Provo" />
            </div>
            <div>
              <Label htmlFor="state">{t('fieldState')}</Label>
              <Input id="state" value={state ?? ''} onChange={(e) => setState(e.target.value)} placeholder="UT" maxLength={2} />
            </div>
          </div>

          <div>
            <Label htmlFor="paymentSpeed">{t('fieldPaymentSpeed')}</Label>
            <select
              id="paymentSpeed"
              value={paymentSpeed ?? 'UNKNOWN'}
              onChange={(e) => setPaymentSpeed(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              {PAYMENT_SPEEDS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="flagsInput">
              {t('fieldFlags')}
              <span className="text-text-muted text-xs ml-1 font-normal">{t('fieldFlagsHint')}</span>
            </Label>
            <Input id="flagsInput" value={flagsInput} onChange={(e) => setFlagsInput(e.target.value)} placeholder="PIP-COVERED, MED-PAY" />
          </div>

          <div>
            <Label htmlFor="notes">{t('fieldNotesLabel')}</Label>
            <textarea
              id="notes"
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[60px]"
              placeholder={t('placeholderNotes')}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
            <span className="text-sm text-text-2">{t('fieldActiveLabel')}</span>
          </label>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">
              ⚠ {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{tc('cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? tc('saving') : editing ? t('btnSaveChanges') : t('btnCreateFirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
