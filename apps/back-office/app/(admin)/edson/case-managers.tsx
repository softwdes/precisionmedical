'use client';

/**
 * Encargados del caso — pedido de Edson.
 *
 * Dos piezas que comparten el mismo endpoint:
 *  · `ManagersPopover` — se abre desde la columna Attorney de la grilla. Solo
 *    lectura, con los emails copiables de un clic.
 *  · `ManagersSection` — dentro del modal. Asigna, quita y crea gente nueva.
 *
 * La PERSONA vive en el bufete; lo que es del caso es la ASIGNACION. Rotan, así
 * que quitar a alguien la CIERRA en vez de borrarla: Edson no puede perder a
 * quién le escribió el mes pasado.
 *
 * Ver docs/plan-vista-edson.md
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Check, Plus, X, Mail, Phone, UserRound, Loader2 } from 'lucide-react';
import { Button, Input, Label } from '@precision/ui';
import { localeApp } from '@/lib/fechas';

export interface Manager {
  id: string;
  assignedAt: string;
  assignedByName: string | null;
  removedAt: string | null;
  notes: string | null;
  lawyer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    memberRole: string | null;
    status: string;
    parentFirm: { id: string; firmName: string | null } | null;
  };
}

export const ROLE_LABEL: Record<string, string> = {
  ATTORNEY: 'Attorney',
  CASE_MANAGER: 'Case manager',
  PARALEGAL: 'Paralegal',
  LEGAL_ASSISTANT: 'Legal assistant',
  OTHER: '—',
};

export function managerName(m: Manager): string {
  return `${m.lawyer.firstName ?? ''} ${m.lawyer.lastName ?? ''}`.trim() || '—';
}

/** Carga los encargados de un caso. Compartido por el popover y el modal. */
export function useManagers(caseId: string | null) {
  const [current, setCurrent] = useState<Manager[]>([]);
  const [past, setPast]       = useState<Manager[]>([]);
  const [loading, setLoading] = useState(!!caseId);

  const reload = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/cases/${caseId}/managers`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) { setCurrent(json.current ?? []); setPast(json.past ?? []); }
    } finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { void reload(); }, [reload]);

  return { current, past, loading, reload };
}

/** Texto con botón de copiar — el email es lo que Edson usa todo el día. */
export function CopyLine({ icon, value, href }: { icon: React.ReactNode; value: string; href?: string }) {
  const t = useTranslations('phoenix.edsonTracking');
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5 min-w-0 group/copy">
      <span className="text-text-muted shrink-0">{icon}</span>
      {href
        ? <a href={href} className="text-cyan hover:underline truncate text-[12px]">{value}</a>
        : <span className="text-text-2 truncate text-[12px] font-mono">{value}</span>}
      <button
        type="button"
        title={copied ? t('copied') : t('copy')}
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="shrink-0 p-0.5 rounded text-text-muted opacity-0 group-hover/copy:opacity-100 focus:opacity-100 hover:text-text-1"
      >
        {copied ? <Check className="w-3 h-3 text-emerald" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

function ManagerCard({ m, onRemove }: { m: Manager; onRemove?: () => void }) {
  const t = useTranslations('phoenix.edsonTracking');
  return (
    <div className="rounded-md bg-bg-2/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-text-1 text-[13px] font-medium truncate">{managerName(m)}</div>
          <div className="text-text-muted text-[10.5px] uppercase tracking-wider">
            {ROLE_LABEL[m.lawyer.memberRole ?? 'OTHER'] ?? m.lawyer.memberRole}
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title={t('managerRemove')}
            className="shrink-0 p-1 rounded text-text-muted hover:text-rose hover:bg-rose/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1 space-y-0.5">
        {m.lawyer.email && <CopyLine icon={<Mail className="w-3 h-3" />} value={m.lawyer.email} href={`mailto:${m.lawyer.email}`} />}
        {m.lawyer.phone && <CopyLine icon={<Phone className="w-3 h-3" />} value={m.lawyer.phone} />}
      </div>
    </div>
  );
}

// ─── Popover de la grilla ────────────────────────────────────────────────────

export function ManagersPopover({
  caseId, attorneyName, attorneyEmail, firmName, onClose, onAdd,
}: {
  caseId: string;
  attorneyName: string | null;
  attorneyEmail: string | null;
  firmName: string | null;
  onClose: () => void;
  /** Abre el modal en la sección de encargados. */
  onAdd: () => void;
}) {
  const t = useTranslations('phoenix.edsonTracking');
  const { current, loading } = useManagers(caseId);
  const [copiedAll, setCopiedAll] = useState(false);

  // Abogado primero y despues los encargados, que es el orden en que Edson los
  // escribe en su correo.
  const lienEmails = [
    attorneyEmail,
    ...current.map(m => m.lawyer.email),
  ].filter((e): e is string => !!e);

  // Cierra al hacer clic afuera o con Escape. Se abre con CLIC y no con hover a
  // proposito: con hover el panel se cierra al ir hacia el, y copiar un email
  // se vuelve una pelea. Ademas en iPad el hover no existe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full mt-1 z-50 w-[260px] rounded-lg bg-surface shadow-xl p-3 space-y-2 text-left">
        <div>
          <div className="text-text-1 text-[13px] font-semibold">{attorneyName ?? firmName ?? '—'}</div>
          {firmName && attorneyName && <div className="text-text-muted text-[11px]">{firmName}</div>}
        </div>

        <div className="text-[10px] uppercase tracking-wider font-semibold text-amber pt-1">
          {t('groupManagers')}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-text-muted text-[12px] py-1">
            <Loader2 className="w-3 h-3 animate-spin" /> …
          </div>
        )}
        {!loading && current.length === 0 && (
          <p className="text-text-muted text-[12px] italic">{t('managerNone')}</p>
        )}
        {current.map(m => <ManagerCard key={m.id} m={m} />)}

        {/*
          * Copiar TODOS los emails de una vez.
          *
          * Es el trabajo real que Edson venía haciendo a mano: en su Excel
          * escribía "Send lien to attrny & CMs: erik@…; aimme@…; danna@…"
          * porque no tenía los correos a mano en ningún lado. Con esto ese
          * texto deja de hacer falta.
          */}
        {lienEmails.length > 0 && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(lienEmails.join('; '));
              setCopiedAll(true);
              setTimeout(() => setCopiedAll(false), 1400);
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded-md bg-bg-2 px-2 py-1.5 text-[12px] text-text-2 hover:text-text-1"
          >
            {copiedAll
              ? <><Check className="w-3 h-3 text-emerald" /> {t('copied')}</>
              : <><Copy className="w-3 h-3" /> {t('copyLienEmails', { count: lienEmails.length })}</>}
          </button>
        )}

        <button
          type="button"
          onClick={() => { onClose(); onAdd(); }}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 py-1.5 text-[12px] text-text-2 hover:text-text-1 hover:border-brand"
        >
          <Plus className="w-3 h-3" /> {t('managerAdd')}
        </button>
      </div>
    </>
  );
}

// ─── Sección del modal ───────────────────────────────────────────────────────

export function ManagersSection({
  caseId, lawFirmId, firmMembers, onChanged, autoOpen,
}: {
  caseId: string;
  lawFirmId: string | null;
  firmMembers: { id: string; label: string; subtitle?: string }[];
  onChanged?: () => void;
  /** Abre el formulario de alta al montar — se llega desde "Agregar encargado". */
  autoOpen?: boolean;
}) {
  const t = useTranslations('phoenix.edsonTracking');
  const { current, past, loading, reload } = useManagers(caseId);

  const [adding, setAdding]   = useState(!!autoOpen);
  const [mode, setMode]       = useState<'pick' | 'new'>('pick');
  const [pickId, setPickId]   = useState('');
  const [firstName, setFirst] = useState('');
  const [lastName, setLast]   = useState('');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const assignedIds = new Set(current.map(m => m.lawyer.id));
  const available   = firmMembers.filter(m => !assignedIds.has(m.id));

  async function assign() {
    setSaving(true); setError('');
    try {
      const body = mode === 'pick'
        ? { lawyerId: pickId }
        : { firstName: firstName.trim(), lastName: lastName.trim(),
            email: email.trim() || null, phone: phone.trim() || null,
            memberRole: 'CASE_MANAGER' as const };
      const res  = await fetch(`/api/admin/cases/${caseId}/managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // Se muestra el error REAL del servidor. Un "Error al guardar" generico
        // deja al usuario sin saber si falto el bufete, si la persona ya estaba
        // o si el endpoint fallo.
        setError(json.message ?? json.error ?? `${t('errSave')} (HTTP ${res.status})`);
        return;
      }
      setAdding(false); setPickId(''); setFirst(''); setLast(''); setEmail(''); setPhone('');
      await reload();
      onChanged?.();
    } catch { setError(t('errSave')); }
    finally { setSaving(false); }
  }

  async function remove(lawyerId: string) {
    const res = await fetch(`/api/admin/cases/${caseId}/managers?lawyerId=${encodeURIComponent(lawyerId)}`, { method: 'DELETE' });
    if (res.ok) { await reload(); onChanged?.(); }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(localeApp(), { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-text-muted">{t('managersHint')}</p>

      {loading && (
        <div className="flex items-center gap-2 text-text-muted text-[12px]">
          <Loader2 className="w-3 h-3 animate-spin" /> …
        </div>
      )}
      {!loading && current.length === 0 && !adding && (
        <p className="text-[12px] text-text-muted italic">{t('managerNone')}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {current.map(m => <ManagerCard key={m.id} m={m} onRemove={() => void remove(m.lawyer.id)} />)}
      </div>

      {past.length > 0 && (
        <details className="pt-1">
          <summary className="text-[11px] text-text-muted cursor-pointer hover:text-text-2">
            {t('managerPast')} ({past.length})
          </summary>
          <div className="mt-1.5 space-y-1">
            {past.map(m => (
              <div key={m.id} className="text-[11.5px] text-text-muted flex items-center gap-2">
                <UserRound className="w-3 h-3 shrink-0" />
                <span className="line-through">{managerName(m)}</span>
                {m.removedAt && <span className="text-[10.5px]">· {fmt(m.removedAt)}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {!adding && (
        <Button variant="outline" onClick={() => { setAdding(true); setMode(available.length ? 'pick' : 'new'); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {t('managerAdd')}
        </Button>
      )}

      {adding && (
        <div className="rounded-lg bg-bg-1 p-3 space-y-3">
          <div className="flex gap-1">
            {(['pick', 'new'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={m === 'pick' && available.length === 0}
                className={`px-3 py-1 rounded-md text-[12px] font-medium disabled:opacity-40 ${
                  mode === m ? 'bg-brand text-white' : 'bg-bg-2 text-text-2 hover:text-text-1'
                }`}
              >
                {m === 'pick' ? t('managerPick') : t('managerNew')}
              </button>
            ))}
          </div>

          {mode === 'pick' ? (
            <select
              value={pickId}
              onChange={e => setPickId(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              <option value="">—</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>{m.label}{m.subtitle ? ` · ${m.subtitle}` : ''}</option>
              ))}
            </select>
          ) : !lawFirmId ? (
            <p className="text-[12px] text-amber">{t('managerNoFirm')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cm-first">{t('managerFirstName')}</Label>
                <Input id="cm-first" value={firstName} onChange={e => setFirst(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cm-last">{t('managerLastName')}</Label>
                <Input id="cm-last" value={lastName} onChange={e => setLast(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cm-email">{t('managerEmail')}</Label>
                <Input id="cm-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cm-phone">{t('managerPhone')}</Label>
                <Input id="cm-phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
          )}

          {error && <div className="text-rose text-[12px]">{error}</div>}

          <div className="flex gap-2">
            <Button
              onClick={() => void assign()}
              disabled={saving || (mode === 'pick' ? !pickId : !firstName.trim() || !lastName.trim() || !lawFirmId)}
            >
              {saving ? '…' : t('managerAdd')}
            </Button>
            <Button variant="outline" onClick={() => { setAdding(false); setError(''); }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
