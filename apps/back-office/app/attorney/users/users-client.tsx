'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, KeyRound, Ban, Loader2 } from 'lucide-react';
import {
  PageHeader, DataTable, StatusPill, TagPill, EmptyState, PersonAvatar, IconAction,
} from '@/components/ui-phoenix';
import {
  Button, Input, Label, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from '@precision/ui';
import { useTransitionProgress } from '@/components/layout/navigation-progress';
import { fecha } from '@/lib/fechas';

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
  access: AccessState;
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
}

const EMPTY_FORM: FormState = {
  firstName: '', lastName: '', email: '', phone: '',
  memberRole: 'CASE_MANAGER', barNumber: '', grantAccess: false,
};

export function AttorneyUsersClient({ members }: { members: MemberRow[] }): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);

  const [form, setForm] = React.useState<FormState | null>(null);
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
        <DataTable.Card>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th sticky="left">{tc('name')}</DataTable.Th>
                <DataTable.Th>{t('colRole')}</DataTable.Th>
                <DataTable.Th>{t('colEmail')}</DataTable.Th>
                <DataTable.Th>{t('colPhone')}</DataTable.Th>
                <DataTable.Th>{t('colAccess')}</DataTable.Th>
                <DataTable.Th>{t('colCreated')}</DataTable.Th>
                <DataTable.Th align="right" sticky="right">{tc('actions')}</DataTable.Th>
              </DataTable.Head>
              <tbody>
                {members.map((m) => {
                  const pill = ACCESS_PILL[m.access];
                  const busy = busyId === m.id;
                  return (
                    <DataTable.Row key={m.id} muted={m.status !== 'ACTIVE'}>
                      <DataTable.Td sticky="left">
                        <div className="flex items-center gap-2">
                          <PersonAvatar firstName={m.firstName} lastName={m.lastName} size={6} />
                          <span className="text-text-1">{fullName(m)}</span>
                        </div>
                      </DataTable.Td>
                      <DataTable.Td>
                        <TagPill
                          label={t(`role${m.memberRole ?? 'OTHER'}` as 'roleOTHER')}
                          compact
                          colorClass="bg-white/5 text-text-2 border-border"
                        />
                      </DataTable.Td>
                      <DataTable.Td>
                        {m.email
                          ? <a href={`mailto:${m.email}`} className="hover:text-brand-text">{m.email}</a>
                          : '—'}
                      </DataTable.Td>
                      <DataTable.Td>
                        <span className="font-mono text-[12.5px]">{m.phone ?? '—'}</span>
                      </DataTable.Td>
                      <DataTable.Td>
                        <StatusPill state={pill.state} label={t(pill.key as 'accessNone')} />
                      </DataTable.Td>
                      <DataTable.Td>
                        <span className="whitespace-nowrap">{fecha(m.createdAt)}</span>
                      </DataTable.Td>
                      <DataTable.Td align="right" sticky="right">
                        <div className="flex items-center justify-end gap-1">
                          {busy && <Loader2 className="w-3 h-3 text-text-muted animate-spin" />}

                          {m.access === 'active' ? (
                            <IconAction
                              icon={Ban}
                              label={t('revokeAccess')}
                              variant="danger"
                              disabled={busy}
                              onClick={() => void accessAction(m, 'revoke')}
                            />
                          ) : m.access === 'other-role' ? null : (
                            <IconAction
                              icon={KeyRound}
                              label={m.email
                                ? (m.access === 'pending' ? t('resendAccess')
                                  : m.access === 'revoked' ? t('grantAccess')
                                  : t('grantAccess'))
                                : t('noEmailHint')}
                              disabled={busy || !m.email}
                              onClick={() => void accessAction(m, 'grant')}
                            />
                          )}

                          <IconAction
                            icon={Pencil}
                            label={tc('edit')}
                            disabled={busy}
                            onClick={() => setForm({
                              id: m.id,
                              firstName: m.firstName ?? '',
                              lastName: m.lastName ?? '',
                              email: m.email ?? '',
                              phone: m.phone ?? '',
                              memberRole: m.memberRole ?? 'OTHER',
                              barNumber: m.barNumber ?? '',
                              grantAccess: false,
                            })}
                          />
                          <IconAction
                            icon={Trash2}
                            label={tc('delete')}
                            variant="danger"
                            disabled={busy}
                            onClick={() => void remove(m)}
                          />
                        </div>
                      </DataTable.Td>
                    </DataTable.Row>
                  );
                })}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
        </DataTable.Card>
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
              <Field label={t('colPhone')}>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
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
                disabled={!form.firstName.trim() || !form.lastName.trim()}
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
