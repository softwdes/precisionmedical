'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, KeyRound, Ban, Loader2, Mail, Phone, MapPin } from 'lucide-react';
import {
  PageHeader, StatusPill, TagPill, EmptyState, PersonAvatar, IconAction, FormField,
} from '@/components/ui-phoenix';
import {
  Button, Input, Label, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from '@precision/ui';
import { useTransitionProgress } from '@/components/layout/navigation-progress';

/**
 * Portal Legal · directorio del despacho.
 *
 * El bufete administra a su propia gente. Ninguna acción manda un `firmId`: la
 * API lo saca de la sesión, así que desde acá no hay forma de tocar otro
 * despacho ni siquiera manipulando el payload.
 */

export type AccessState = 'none' | 'pending' | 'active' | 'revoked' | 'other-role';

export interface MemberRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  memberRole: string | null;
  barNumber: string | null;
  status: string;
  createdAt: string;
  /** Dirección ya compuesta (calle, ciudad, estado, ZIP). */
  address: string | null;
  access: AccessState;
  /** Casos donde figura, por puesto. Se cuenta con el alcance de la sesión. */
  caseLoad: { attorney: number; paralegal: number; assistant: number };
}

const MEMBER_ROLES = ['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT', 'OTHER'] as const;

const ACCESS_PILL: Record<AccessState, { state: 'active' | 'warning' | 'danger' | 'neutral'; key: string }> = {
  active:       { state: 'active',  key: 'accessActive' },
  pending:      { state: 'warning', key: 'accessPending' },
  revoked:      { state: 'danger',  key: 'accessRevoked' },
  none:         { state: 'neutral', key: 'accessNone' },
  'other-role': { state: 'neutral', key: 'accessNone' },
};

interface FormState {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  memberRole: string;
  barNumber: string;
  grantAccess: boolean;
  /** Lo reporta `FormField.Phone`. Un teléfono vacío es válido: es opcional. */
  phoneValid: boolean;
}

const EMPTY_FORM: FormState = {
  firstName: '', lastName: '', email: '', phone: '',
  memberRole: 'CASE_MANAGER', barNumber: '', grantAccess: false, phoneValid: true,
};

export function AttorneyUsersClient({ members }: { members: MemberRow[] }): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();
  // El acceso rápido "Invitar personal" del Panel entra con `?new=1` y abre el
  // alta directo, sin obligar a buscar el botón después de navegar.
  const params = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);

  const [form, setForm] = React.useState<FormState | null>(
    () => (params.get('new') === '1' ? { ...EMPTY_FORM } : null),
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [manualLink, setManualLink] = React.useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  const fullName = (m: MemberRow): string =>
    `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || '—';

  /** Toda respuesta pasa por acá: un solo lugar decide error, enlace y refresh. */
  async function handle(res: Response): Promise<boolean> {
    const data = await res.json().catch(() => ({})) as {
      message?: string; error?: string;
      access?: { emailSent?: boolean; activationLink?: string | null; message?: string; ok?: boolean } | null;
    };
    if (!res.ok) {
      setError(data.message ?? data.error ?? t('actionError'));
      return false;
    }
    // El alta puede salir bien y el acceso fallar: son dos pasos, no uno.
    if (data.access && data.access.ok === false) {
      setError(data.access.message ?? t('actionError'));
    } else if (data.access && !data.access.emailSent && data.access.activationLink) {
      setManualLink(data.access.activationLink);
    }
    refresh();
    return true;
  }

  async function save(): Promise<void> {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const isEdit = !!form.id;
      const body = isEdit
        ? {
            id: form.id,
            firstName: form.firstName, lastName: form.lastName,
            email: form.email || null, phone: form.phone || null,
            memberRole: form.memberRole,
            barNumber: form.memberRole === 'ATTORNEY' ? (form.barNumber || null) : null,
          }
        : {
            firstName: form.firstName, lastName: form.lastName,
            email: form.email || null, phone: form.phone || null,
            memberRole: form.memberRole,
            barNumber: form.memberRole === 'ATTORNEY' ? (form.barNumber || null) : null,
            grantAccess: form.grantAccess,
          };

      const ok = await handle(await fetch('/api/attorney/members', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      if (ok) setForm(null);
    } finally {
      setSaving(false);
    }
  }

  async function accessAction(m: MemberRow, action: 'grant' | 'revoke'): Promise<void> {
    if (action === 'revoke' && !confirm(t('confirmRevoke', { name: fullName(m) }))) return;
    setBusyId(m.id);
    setError(null);
    try {
      await handle(await fetch('/api/attorney/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, accessAction: action }),
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m: MemberRow): Promise<void> {
    if (!confirm(t('confirmDelete', { name: fullName(m) }))) return;
    setBusyId(m.id);
    setError(null);
    try {
      await handle(await fetch(`/api/attorney/members?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('usersTitle')}
        subtitle={t('usersSubtitle')}
        action={
          <Button onClick={() => setForm({ ...EMPTY_FORM })}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('addUser')}
          </Button>
        }
      />

      {error && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
          {error}
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState.Inline message={t('usersEmpty')} />
      ) : (
        /* Tarjetas y no tabla, en todos los tamaños (decisión de Erick,
           replicando v2). Cada persona junta su rol, su carga y su contacto en
           un bloque, que es como se lee un directorio. */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              busy={busyId === m.id}
              onEdit={() => setForm({
                id: m.id,
                firstName: m.firstName ?? '',
                lastName: m.lastName ?? '',
                email: m.email ?? '',
                phone: m.phone ?? '',
                memberRole: m.memberRole ?? 'OTHER',
                barNumber: m.barNumber ?? '',
                grantAccess: false,
                // Lo que ya está guardado se acepta tal cual: si el número vino
                // mal de la migración, obligar a corregirlo para poder cambiar
                // el rol convertiría un dato viejo en un bloqueo.
                phoneValid: true,
              })}
              onAccess={(action) => void accessAction(m, action)}
              onRemove={() => void remove(m)}
            />
          ))}
        </div>
      )}

      {form && (
        <Dialog open onOpenChange={() => setForm(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.id ? t('editUser') : t('addUser')}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('formFirstName')}>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </Field>
              <Field label={t('formLastName')}>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </Field>
              <Field label={t('colEmail')}>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              {/* `FormField.Phone` y no un Input pelado: formatea a
                  `(801) 555-0100` mientras se escribe y valida las reglas NANP.
                  Con el input crudo se guardaban números como `656565989811` en
                  la misma columna donde el resto está formateado — hay 8 así en
                  la base. Es el mismo primitivo que usa Externals para la ficha
                  del miembro, así que las dos puertas guardan igual. */}
              <FormField.Phone
                label={t('colPhone')}
                value={form.phone}
                onChange={(v, valid) => setForm({ ...form, phone: v, phoneValid: valid })}
              />
              <Field label={t('colRole')}>
                <select
                  value={form.memberRole}
                  onChange={(e) => setForm({ ...form, memberRole: e.target.value })}
                  className="w-full rounded-md border border-border bg-bg-1 px-3 py-2 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-brand/40"
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>{t(`role${r}` as 'roleOTHER')}</option>
                  ))}
                </select>
              </Field>
              {form.memberRole === 'ATTORNEY' && (
                <Field label={t('formBarNumber')}>
                  <Input value={form.barNumber} onChange={(e) => setForm({ ...form, barNumber: e.target.value })} />
                </Field>
              )}
            </div>

            {!form.id && (
              <label className="flex items-start gap-2 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.grantAccess}
                  disabled={!form.email}
                  onChange={(e) => setForm({ ...form, grantAccess: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-text-1 text-sm">{t('formGrantAccess')}</span>
                  <span className="block text-text-muted text-[11px]">
                    {form.email ? t('formGrantAccessHint') : t('noEmailHint')}
                  </span>
                </span>
              </label>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setForm(null)}>
                {tc('cancel')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                loading={saving}
                disabled={!form.firstName.trim() || !form.lastName.trim() || !form.phoneValid}
                onClick={() => void save()}
              >
                {tc('save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {manualLink && (
        <Dialog open onOpenChange={() => setManualLink(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('linkTitle')}</DialogTitle>
              <DialogDescription>{t('linkBody')}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md bg-bg-2/40 p-3 text-xs font-mono break-all text-text-2">
              {manualLink}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => { void navigator.clipboard.writeText(manualLink); }}
              >
                {t('copyLink')}
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => setManualLink(null)}>
                {tc('close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Carga de casos de un miembro, con cada número enlazado a la lista filtrada.
 *
 * Los números son LINKS y no texto a propósito: "26 casos" sin poder abrirlos
 * obliga a ir a Casos y reconstruir el filtro a mano. Acá el desglose es la
 * navegación — es lo que el desplegable del modal de v2 hacía por dentro, pero
 * llevando a la pantalla real, donde además se puede buscar y cruzar filtros.
 */
function CaseLoad({ member }: { member: MemberRow }): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const { attorney, paralegal, assistant } = member.caseLoad;
  const total = attorney + paralegal + assistant;

  if (total === 0) {
    return <span className="text-text-muted text-[11px] italic">{t('noAssigned')}</span>;
  }

  const parts: Array<{ role: string; count: number; label: string }> = [
    { role: 'attorney',  count: attorney,  label: t('asAttorney') },
    { role: 'paralegal', count: paralegal, label: t('asParalegal') },
    { role: 'assistant', count: assistant, label: t('asAssistant') },
  ].filter((p) => p.count > 0);

  return (
    <div className="flex flex-col gap-0.5">
      {parts.map((p) => (
        <Link
          key={p.role}
          href={`/attorney/cases?assignee=${member.id}&role=${p.role}`}
          className="text-[11.5px] text-text-2 hover:text-brand-text whitespace-nowrap"
        >
          <span className="font-semibold text-text-1">{p.count}</span> {p.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Tarjeta de un miembro del despacho — réplica de la vista de v2.
 *
 * Sin bordes (Regla #0): el escalón `bg-1` para la tarjeta y `bg-2/40` para la
 * caja de carga ya separan los niveles; una línea encima sería decir lo mismo
 * dos veces.
 */
function MemberCard({
  member, busy, onEdit, onAccess, onRemove,
}: {
  member: MemberRow;
  busy: boolean;
  onEdit: () => void;
  onAccess: (action: 'grant' | 'revoke') => void;
  onRemove: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');

  const full = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || '—';
  const pill = ACCESS_PILL[member.access];
  const isActive = member.status === 'ACTIVE';

  return (
    <div className={`rounded-lg bg-bg-1 p-5 flex flex-col gap-3 ${isActive ? '' : 'opacity-50'}`}>
      <div className="flex items-start gap-3">
        <PersonAvatar firstName={member.firstName} lastName={member.lastName} size={10} />
        <div className="flex-1 min-w-0">
          <div className="text-text-1 font-semibold text-sm truncate">{full}</div>
          <div className="text-text-2 text-xs mt-0.5">
            {t(`role${member.memberRole ?? 'OTHER'}` as 'roleOTHER')}
          </div>
        </div>
        <StatusPill
          state={isActive ? 'active' : 'inactive'}
          label={isActive ? tc('active') : tc('inactive')}
        />
      </div>

      <div className="rounded-md bg-bg-2/40 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
            {t('colAssigned')}
          </span>
          <TagPill
            label={String(member.caseLoad.attorney + member.caseLoad.paralegal + member.caseLoad.assistant)}
            compact
            mono
            colorClass="bg-brand/10 text-brand-text border-brand/20"
          />
        </div>
        <CaseLoad member={member} />
      </div>

      <div className="space-y-1 text-[11.5px] text-text-2">
        {member.email && (
          <div className="flex items-center gap-1.5 min-w-0">
            <Mail className="w-3 h-3 text-text-muted shrink-0" />
            <a href={`mailto:${member.email}`} className="hover:text-brand-text truncate">{member.email}</a>
          </div>
        )}
        {member.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-text-muted shrink-0" />
            <span className="font-mono">{member.phone}</span>
          </div>
        )}
        {member.address && (
          <div className="flex items-start gap-1.5">
            <MapPin className="w-3 h-3 text-text-muted shrink-0 mt-0.5" />
            <span>{member.address}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
        <StatusPill state={pill.state} label={t(pill.key as 'accessNone')} />
        <div className="flex items-center gap-1">
          {busy && <Loader2 className="w-3 h-3 text-text-muted animate-spin" />}
          {member.access === 'active' ? (
            <IconAction icon={Ban} label={t('revokeAccess')} variant="danger" disabled={busy} onClick={() => onAccess('revoke')} />
          ) : member.access === 'other-role' ? null : (
            <IconAction
              icon={KeyRound}
              label={member.email
                ? (member.access === 'pending' ? t('resendAccess') : t('grantAccess'))
                : t('noEmailHint')}
              disabled={busy || !member.email}
              onClick={() => onAccess('grant')}
            />
          )}
          <IconAction icon={Pencil} label={tc('edit')} disabled={busy} onClick={onEdit} />
          <IconAction icon={Trash2} label={tc('delete')} variant="danger" disabled={busy} onClick={onRemove} />
        </div>
      </div>
    </div>
  );
}
