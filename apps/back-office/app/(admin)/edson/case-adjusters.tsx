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

import { useState, useEffect, useCallback, useImperativeHandle, useRef, type Ref } from 'react';
import { useServerError, type ServerErrorBody } from '@/lib/server-error';
import { useTranslations } from 'next-intl';
import { Plus, X, Mail, Phone, Printer, Loader2, MapPin } from 'lucide-react';
import { Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { localeApp } from '@/lib/fechas';
import { CopyLine } from './case-managers';
import { AnchoredPanel, type AnchorRect } from './anchored-panel';

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

// ─── Buscador del catálogo ───────────────────────────────────────────────────

interface AdjusterDelCatalogo {
  id: string;
  name: string;
  phone: string | null;
  extension: string | null;
  insuranceCarrier: { id: string; name: string } | null;
}

/**
 * La gente que ya está cargada en el catálogo, para elegir en vez de tipear.
 *
 * Trae el catálogo entero y sube primero a los de la aseguradora del caso — no
 * filtra por ella. Ver el comentario del GET en `api/admin/adjusters`: filtrar
 * dejaba la lista vacía en el 83% de los casos.
 */
function CatalogoAdjusters({
  carrierId, onPick, saving, onCrear,
}: {
  carrierId: string | null;
  onPick: (a: AdjusterDelCatalogo) => void;
  saving: boolean;
  /**
   * Crear en el catálogo al que no está, con lo que Edson venía escribiendo.
   *
   * Aparece SOLO cuando la búsqueda no encontró nada, y esa es la protección
   * más importante contra los repetidos: el buscador recorre el catálogo
   * ENTERO, no solo la aseguradora del caso, así que para llegar a este botón
   * hay que haber visto antes que no había ningún parecido.
   *
   * Medido el 2026-09-24: 103 adjusters en el catálogo y solo 3 repetidos de
   * verdad, dos de ellos por culpa de una aseguradora duplicada y no del
   * adjuster. O sea que el riesgo real es chico y ya tiene freno.
   */
  onCrear?: (nombre: string) => void;
}) {
  const t = useTranslations('phoenix.edsonTracking');
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<AdjusterDelCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  /** Fila resaltada: con flechas se mueve y con Enter se elige. */
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Debounce, por lo mismo que el buscador de la grilla: sin esto cada tecla
  // dispara una consulta.
  useEffect(() => {
    let vivo = true;
    const id = setTimeout(async () => {
      setCargando(true);
      try {
        const sp = new URLSearchParams();
        if (q.trim()) sp.set('q', q.trim());
        if (carrierId) sp.set('carrierId', carrierId);
        const res  = await fetch(`/api/admin/adjusters?${sp}`);
        const json = await res.json().catch(() => ({}));
        if (vivo && res.ok) { setLista(json.adjusters ?? []); setHi(0); }
      } finally { if (vivo) setCargando(false); }
    }, q ? 300 : 0);
    return () => { vivo = false; clearTimeout(id); };
  }, [q, carrierId]);

  // El foco arranca en el buscador: se abre y se escribe, sin un clic de más.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // La fila resaltada se mantiene a la vista al moverse con las flechas.
  useEffect(() => {
    listaRef.current?.querySelector('[data-hi="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="ca-buscar">{t('adjusterFromCatalog')}</Label>
      <Input
        id="ca-buscar"
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={t('adjusterSearchPh')}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, lista.length - 1)); }
          if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            const elegido = lista[hi];
            if (elegido && !saving) onPick(elegido);
          }
        }}
      />

      {cargando && (
        <div className="flex items-center gap-2 text-text-muted text-[12px] py-1">
          <Loader2 className="w-3 h-3 animate-spin" /> …
        </div>
      )}

      {!cargando && lista.length === 0 && (
        <div className="py-1 space-y-1">
          <p className="text-[12px] text-text-muted italic">{t('adjusterCatalogEmpty')}</p>
          {/* Dar de alta al que no está, con lo que ya venía escrito. Va PEGADO
              al aviso de "no hay nadie" y no suelto en el panel: el momento en
              que alguien quiere crear es justo este, y en cualquier otro lugar
              sería una invitación a duplicar. */}
          {onCrear && q.trim().length > 0 && (
            <button
              type="button"
              onClick={() => onCrear(q.trim())}
              className="text-[11.5px] text-brand-text hover:underline underline-offset-2 font-medium"
            >
              {t('adjusterCreate', { nombre: q.trim() })}
            </button>
          )}
        </div>
      )}

      {/* Sin borde: el escalón de fondo ya separa la lista de la caja (Regla #0). */}
      {!cargando && lista.length > 0 && (
        <div ref={listaRef} className="max-h-52 overflow-y-auto rounded-md bg-bg-2/40">
          {lista.map((a, i) => {
            // La aseguradora del caso se marca, para que elegir a alguien de
            // otra compañía sea una decisión y no un descuido.
            const esDelCaso = !!carrierId && a.insuranceCarrier?.id === carrierId;
            return (
              <button
                key={a.id}
                type="button"
                disabled={saving}
                data-hi={i === hi ? '1' : undefined}
                onMouseEnter={() => setHi(i)}
                onClick={() => onPick(a)}
                className={'w-full text-left px-2.5 py-1.5 border-b border-row-sep last:border-0 disabled:opacity-50 flex items-baseline gap-2 '
                  + (i === hi ? 'bg-brand/15' : 'hover:bg-white/[0.02]')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-text-1 truncate">{a.name}</span>
                  <span className="block text-[11px] text-text-muted truncate">
                    {withExt(a.phone, a.extension) ?? '—'}
                  </span>
                </span>
                <span className={`shrink-0 text-[10px] ${esDelCaso ? 'text-brand-text font-semibold' : 'text-text-muted'}`}>
                  {a.insuranceCarrier?.name ?? '—'}
                </span>
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ─── Popover de la grilla ────────────────────────────────────────────────────

export function AdjustersPopover({
  caseId, rect, onClose, onAdd, onChanged,
}: {
  caseId: string;
  /** Rectangulo del boton que lo abrio — ver `AnchoredPanel`. */
  rect: AnchorRect;
  onClose: () => void;
  /** Abre el modal, para escribir a alguien que no está en el catálogo. */
  onAdd: () => void;
  /** Para que la grilla repinte la celda cuando se asigna desde acá. */
  onChanged?: () => void;
}) {
  const serverError = useServerError();
  const t  = useTranslations('phoenix.edsonTracking');
  const tc = useTranslations('phoenix.common');
  const { current, carrier, loading, reload } = useCaseAdjusters(caseId);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  /**
   * El alta en el catálogo, desde el mismo panel.
   *
   * `null` = no se está creando nada. Con un objeto adentro, el panel muestra
   * el formulario corto en vez de la lista.
   *
   * El catálogo exige aseguradora (`insurance_adjusters.insuranceCarrierId` es
   * obligatorio) y eso NO se puede dar por hecho: medido el 2026-09-24, **67 de
   * cada 100 casos de la cola no la tienen cargada**. Por eso el formulario la
   * pide siempre, aunque el caso ya traiga una: se precarga y se puede cambiar.
   *
   * Y NO se escribe en el caso. Decisión de Erick, 2026-09-24: "el adjuster solo
   * es para Edson hasta que digan que se ponga al caso". Elegir acá la
   * aseguradora sirve para clasificar al adjuster en el catálogo, no para
   * completarle el expediente a nadie.
   */
  const [alta, setAlta] = useState<{
    nombre: string; phone: string; extension: string;
    carrier: { id: string; label: string } | null;
  } | null>(null);
  /** Búsqueda de aseguradora del formulario de alta. */
  const [carrierQ, setCarrierQ] = useState('');
  const [carrierOpts, setCarrierOpts] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (!alta || alta.carrier) { setCarrierOpts([]); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      const sp = new URLSearchParams({ q: carrierQ.trim(), omitType: '1' });
      const res  = await fetch(`/api/admin/insurances/autocomplete?${sp}`);
      const json = await res.json().catch(() => ({}));
      if (vivo && res.ok) setCarrierOpts(json.results ?? []);
    }, 250);
    return () => { vivo = false; clearTimeout(id); };
  }, [alta, carrierQ]);

  /**
   * Crea en el catálogo y lo asigna al caso, en ese orden.
   *
   * Si el alta sale bien y la asignación falla, el adjuster queda creado — y
   * está bien que quede: es un dato válido del catálogo, y al reintentar ya
   * aparece en la lista en vez de crearse dos veces.
   */
  async function crearYAsignar() {
    if (!alta) return;
    if (!alta.carrier) { setError(t('adjusterCreateNeedsCarrier')); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/adjusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insuranceCarrierId: alta.carrier.id,
          name:      alta.nombre.trim(),
          phone:     alta.phone.trim() || null,
          extension: alta.extension.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(serverError(json, t('adjusterCreateFailed'))); return; }
      setAlta(null);
      setCarrierQ('');
      await asignar(json.adjuster?.id ?? json.id);
    } finally {
      setSaving(false);
    }
  }

  /**
   * El catálogo se asigna DESDE ACÁ, sin pasar por el modal.
   *
   * El panel no se cierra al elegir: el asignado aparece arriba en el acto y
   * Edson puede poner al segundo, que es el caso que él mismo describió
   * ("Kenneth Kelly or Patricia Leon"). Se cierra con Escape o clic afuera.
   */
  async function asignar(adjusterId: string) {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/adjusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjusterId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(serverError(json as ServerErrorBody, t('errSave')));
        return;
      }
      await reload();
      onChanged?.();
    } catch { setError(t('errSave')); }
    finally { setSaving(false); }
  }

  return (
    <AnchoredPanel rect={rect} width={320} onClose={onClose}>
      {carrier && <div className="text-text-1 text-[13px] font-semibold">{carrier.name}</div>}

      {loading && (
        <div className="flex items-center gap-2 text-text-muted text-[12px] py-1">
          <Loader2 className="w-3 h-3 animate-spin" /> …
        </div>
      )}

      {/* Los que ya están, arriba: es lo que Edson viene a leer para llamar. */}
      {!loading && current.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-amber">
            {t('groupAdjusters')}
          </div>
          {current.map(a => <AdjusterCard key={a.id} a={a} />)}
        </>
      )}

      {/*
        * La lista va en el PANEL y no detrás de un modal. Antes eran tres pasos
        * —panel, modal, botón "Agregar adjuster", recién ahí la lista— y Edson
        * lo rechazó el 2026-09-18: "que se quite todo eso y quede como el
        * provider: doble clic y aparece directo el listado".
        */}
      {alta ? (
        /* Alta en el catálogo. Reemplaza la lista en vez de apilarse debajo:
           el panel es angosto y dos cosas activas a la vez no se leen. */
        <div className="rounded-md bg-bg-2/40 p-2.5 space-y-2">
          <input
            value={alta.nombre}
            onChange={(e) => setAlta({ ...alta, nombre: e.target.value })}
            placeholder={t('adjusterCreateName')}
            className="w-full bg-bg-1 rounded px-2 py-1 text-[12px] text-text-1 focus:outline-none focus:ring-1 focus:ring-brand"
          />

          {/* La aseguradora SE ELIGE, no se escribe. Si se pudiera tipear, en un
              mes hay "Farm Bureau" y "Farm Bureau Ins." — que es exactamente el
              origen de 2 de los 3 repetidos que tiene el catálogo hoy. */}
          {alta.carrier ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-1 truncate flex-1">{alta.carrier.label}</span>
              <button
                type="button"
                onClick={() => { setAlta({ ...alta, carrier: null }); setCarrierQ(''); }}
                className="text-[10px] text-text-muted hover:text-text-1 underline underline-offset-2 shrink-0"
              >
                {t('adjusterCreateChange')}
              </button>
            </div>
          ) : (
            <div>
              <input
                value={carrierQ}
                onChange={(e) => setCarrierQ(e.target.value)}
                placeholder={t('adjusterCreateCarrier')}
                className="w-full bg-bg-1 rounded px-2 py-1 text-[12px] text-text-1 focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {carrierOpts.length > 0 && (
                <div className="mt-1 max-h-28 overflow-y-auto rounded bg-bg-1">
                  {carrierOpts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAlta({ ...alta, carrier: c })}
                      className="w-full text-left px-2 py-1 text-[11.5px] text-text-2 hover:bg-white/[0.04] border-b border-row-sep last:border-0"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={alta.phone}
              onChange={(e) => setAlta({ ...alta, phone: e.target.value })}
              placeholder={t('adjusterCreatePhone')}
              className="flex-1 min-w-0 bg-bg-1 rounded px-2 py-1 text-[12px] text-text-1 focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <input
              value={alta.extension}
              onChange={(e) => setAlta({ ...alta, extension: e.target.value })}
              placeholder={t('adjusterCreateExt')}
              className="w-16 shrink-0 bg-bg-1 rounded px-2 py-1 text-[12px] text-text-1 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => void crearYAsignar()} disabled={saving || !alta.nombre.trim()}>
              {t('adjusterCreateSave')}
            </Button>
            <button
              type="button"
              onClick={() => { setAlta(null); setCarrierQ(''); setError(''); }}
              className="text-[11px] text-text-muted hover:text-text-1 underline underline-offset-2"
            >
              {tc('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <CatalogoAdjusters
          carrierId={carrier?.id ?? null}
          onPick={(a) => void asignar(a.id)}
          saving={saving}
          onCrear={(nombre) => setAlta({
            nombre,
            phone: '',
            extension: '',
            // Se precarga la del caso cuando la hay — en 1 de cada 3 filas.
            carrier: carrier ? { id: carrier.id, label: carrier.name } : null,
          })}
        />
      )}

      {error && <div className="text-rose text-[12px]">{error}</div>}

      {carrier?.claimsAddress && (
        <div className="pt-1">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">
            {t('billingAddress')}
          </div>
          <p className="text-[11.5px] text-text-2 whitespace-pre-wrap font-mono">{carrier.claimsAddress}</p>
        </div>
      )}

      {/* El que no está en el catálogo se escribe en el modal, que tiene sitio
          para teléfono, extensión, fax y correo. */}
      <button
        type="button"
        onClick={() => { onClose(); onAdd(); }}
        className="text-[11px] text-text-muted hover:text-text-1 underline underline-offset-2"
      >
        {t('adjusterNotInList')}
      </button>
    </AnchoredPanel>
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
  const serverError = useServerError();
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
  /**
   * El formulario a mano queda detrás de un link. La lista del catálogo es el
   * camino normal —"solo al dar clic muestra la lista, selecciona, enter y
   * listo"— y escribir a alguien nuevo es la excepción, no el primer paso.
   */
  const [aMano, setAMano]     = useState(false);

  /**
   * Asignar a alguien del catálogo. Manda solo el id: el endpoint hace `upsert`
   * sobre (caseId, adjusterId), así que volver a elegir a quien ya estaba lo
   * reactiva en vez de fallar por el único.
   */
  async function asignarDelCatalogo(adjusterId: string) {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/adjusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjusterId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(serverError(json as ServerErrorBody, t('errSave')));
        return;
      }
      setAdding(false);
      await reload();
      onChanged?.();
    } catch { setError(t('errSave')); }
    finally { setSaving(false); }
  }

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
        setError(serverError(json as ServerErrorBody, t('errSave')));
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
    // Devuelve si se puede seguir: el pie del modal se detiene con `false`.
    // Acá no hay campo que pueda fallar la validación, así que siempre sigue.
    flush: async () => { if (adding && name.trim()) await assign(); return true; },
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
            * "Agregar adjuster" abre DIRECTO la lista, con el foco ya puesto en
            * el buscador: se escribe, se baja con las flechas y Enter lo asigna.
            * El formulario a mano queda detras de un link.
            *
            * Antes se abrian los dos juntos —lista arriba, formulario abajo— y
            * Edson lo rechazo el 2026-09-18: "ahora llama al formulario y sale
            * la lista para seleccionar y lo elige pero esta feo". Tenia razon:
            * el 100% de las veces el camino es la lista, y poner el formulario
            * en el medio hace ver un trabajo que casi nunca hay que hacer.
            *
            * Hubo un selector antes y se quito con razon: filtraba por la
            * aseguradora del caso y el catalogo estaba vacio, asi que salia en
            * blanco. Las dos cosas cambiaron. El catalogo tiene 93 personas
            * reales cargadas el 2026-09-12, y este buscador NO filtra por
            * aseguradora —solo la sube primero—, porque solo 177 de las 1.053
            * filas de la cola tienen una aseguradora con gente en el catalogo.
            *
            * Y el formulario a mano se queda: de los 4 adjusters que Edson ya
            * habia cargado, 2 no estan en el catalogo. Si el selector lo
            * reemplazara, perderia poder anotar a alguien nuevo.
            */}
          {!aMano && (
            <>
              <CatalogoAdjusters
                carrierId={carrier?.id ?? null}
                onPick={(a) => void asignarDelCatalogo(a.id)}
                saving={saving}
              />
              {error && <div className="text-rose text-[12px]">{error}</div>}
              <button
                type="button"
                onClick={() => { setAMano(true); setError(''); }}
                className="text-[11px] text-text-muted hover:text-text-1 underline underline-offset-2"
              >
                {t('adjusterNotInList')}
              </button>
            </>
          )}

          {aMano && (
          <>
          <button
            type="button"
            onClick={() => { setAMano(false); setError(''); }}
            className="text-[11px] text-text-muted hover:text-text-1 underline underline-offset-2"
          >
            ← {t('adjusterFromCatalog')}
          </button>

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
            <Button variant="outline" onClick={() => { setAdding(false); setAMano(false); setError(''); }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          </>
          )}
        </div>
      )}

      <BillingAddress carrier={carrier} onSaved={() => void reload()} />
    </div>
  );
}
