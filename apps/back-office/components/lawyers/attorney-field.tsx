'use client';

/**
 * AttorneyField — elegir el abogado del bufete, o darlo de alta sin salir de acá.
 *
 * La otra mitad del pedido de Erick (2026-09-07): «si un bufete **o abogado** no
 * está, agregarlo directamente desde esta vista». El bufete se resolvió con
 * `LawFirmField`; esto es el abogado persona.
 *
 * ── Por qué el formulario es CORTO y el del bufete es completo ───────────────
 *
 * No es incoherencia. Lo que le da valor a un bufete en el catálogo es su
 * contacto —el teléfono al que cobranza llama—, así que ahí se abre el
 * formulario completo: crear un bufete "solo con el nombre" es lo que ensució el
 * catálogo. A un MIEMBRO, en cambio, lo identifican nombre, bufete y rol: la
 * dirección, la ciudad y el estado **los hereda de la firma**, y eso ya lo hace
 * el servidor (`city: parsed.city ?? firm.city` en la ruta de members). Pedirle
 * a recepción la dirección del abogado mientras atiende una llamada es pedirle
 * un dato que no tiene y que el sistema ya sabe.
 *
 * El expediente completo del miembro (dirección, zip, tasa de recupero) se sigue
 * editando en la ficha del bufete, que es donde hay tiempo para eso.
 *
 * ── Sin bufete no hay abogado ───────────────────────────────────────────────
 *
 * `firmId` es obligatorio porque el miembro cuelga de la firma
 * (`parentFirmId` es requerido en la ruta). El wizard ya solo muestra este campo
 * cuando hay bufete elegido.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import {
  Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@precision/ui';
import { Autocomplete, type AutoResult } from '@/components/ui-phoenix';

/** Los roles que la ruta de members acepta. */
const ROLES = ['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT', 'OTHER'] as const;
type Rol = typeof ROLES[number];

export function AttorneyField({
  firmId,
  firmName,
  selected,
  onSelect,
  placeholder,
}: {
  firmId: string;
  firmName: string;
  selected: AutoResult | null;
  onSelect: (r: AutoResult | null) => void;
  placeholder: string;
}) {
  const t = useTranslations('phoenix.lawyers');
  const [abierto, setAbierto] = useState(false);
  const [buscado, setBuscado] = useState('');

  return (
    <>
      <Autocomplete
        /* `firmId` en los params: la ruta devuelve members de ESA firma. */
        endpoint="/api/admin/lawyers/autocomplete"
        extraParams={{ firmId }}
        placeholder={placeholder}
        selected={selected}
        onSelect={onSelect}
        emptyHint={t('noAttorneyMatch')}
        renderAvatar={(r) => (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-cyan/20 border border-cyan/30 text-cyan">
            {r.label.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
        )}
        renderAction={(query, close) => (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setBuscado(query);
              close();
              setAbierto(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-emerald/15 border border-emerald/30">
              <Plus className="w-3.5 h-3.5 text-emerald" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-emerald font-semibold truncate">
                {query ? t('addAttorneyNamed', { name: query }) : t('addAttorneyNew')}
              </div>
              <div className="text-[11px] text-text-muted truncate">
                {t('addAttorneyHint', { firm: firmName })}
              </div>
            </div>
          </button>
        )}
      />

      <AttorneyDialog
        open={abierto}
        onOpenChange={setAbierto}
        firmId={firmId}
        firmName={firmName}
        initialName={buscado}
        onCreated={(r) => { onSelect(r); setAbierto(false); }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AttorneyDialog({
  open, onOpenChange, firmId, firmName, initialName, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firmId: string;
  firmName: string;
  initialName: string;
  onCreated: (r: AutoResult) => void;
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');

  /**
   * El nombre buscado se parte en nombre y apellido: la ruta pide los dos por
   * separado y quien buscó escribió "Ana Harker" de una. La ÚLTIMA palabra es el
   * apellido y el resto el nombre — con apellidos compuestos ("Ana Del Río")
   * queda "Ana Del" + "Río", que es incorrecto pero editable a la vista, y es
   * mejor que dejar los dos campos vacíos.
   */
  const partes = initialName.trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [role,      setRole]      = useState<Rol>('ATTORNEY');
  const [phone,     setPhone]     = useState('');
  const [email,     setEmail]     = useState('');
  const [barNumber, setBarNumber] = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  /* Reset al abrir, con el nombre precargado. Mismo patrón que `FirmDialog`:
     el diálogo se monta una vez y se reusa. */
  const [ultimoAbierto, setUltimoAbierto] = useState(false);
  if (open !== ultimoAbierto) {
    if (open) {
      setFirstName(partes.length > 1 ? partes.slice(0, -1).join(' ') : (partes[0] ?? ''));
      setLastName(partes.length > 1 ? partes[partes.length - 1]! : '');
      setRole('ATTORNEY');
      setPhone(''); setEmail(''); setBarNumber(''); setError(null);
    }
    setUltimoAbierto(open);
  }

  async function guardar(): Promise<void> {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) { setError(t('errorAttorneyNameRequired')); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/lawyers/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentFirmId: firmId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          memberRole: role,
          phone: phone.trim() || null,
          email: email.trim() || null,
          barNumber: barNumber.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      if (data.member?.id) {
        onCreated({
          id: data.member.id,
          label: `${firstName.trim()} ${lastName.trim()}`,
          subtitle: t(`role${role}` as 'roleATTORNEY'),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('attorneyDialogTitle')}</DialogTitle>
          <DialogDescription>{t('attorneyDialogDesc', { firm: firmName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="attFirst">{t('fieldFirstName')} <span className="text-rose">*</span></Label>
              <Input id="attFirst" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="attLast">{t('fieldLastName')} <span className="text-rose">*</span></Label>
              <Input id="attLast" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="attRole">{t('fieldMemberRole')}</Label>
            <select
              id="attRole"
              value={role}
              onChange={(e) => setRole(e.target.value as Rol)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{t(`role${r}` as 'roleATTORNEY')}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="attPhone">{t('fieldPhone')}</Label>
              <Input id="attPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1-801-555-0000" />
            </div>
            <div>
              <Label htmlFor="attEmail">{t('fieldEmail')}</Label>
              <Input id="attEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          {/* Solo para abogados: el servidor descarta la matrícula en los otros
              roles, así que ofrecerla ahí sería un campo que no se guarda. */}
          {role === 'ATTORNEY' && (
            <div>
              <Label htmlFor="attBar">{t('fieldBarNumber')}</Label>
              <Input id="attBar" value={barNumber} onChange={(e) => setBarNumber(e.target.value)} />
            </div>
          )}

          <p className="text-[11px] text-text-muted">{t('attorneyDialogInherits')}</p>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">⚠ {error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{tc('cancel')}</Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? tc('saving') : t('btnCreateAttorney')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
