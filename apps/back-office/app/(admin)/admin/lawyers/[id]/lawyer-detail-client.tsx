'use client';
import { localeApp } from '@/lib/fechas';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useServerError, type ServerErrorBody } from '@/lib/server-error';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, MapPin, Pencil, Plus, Trash2, UserCircle, Briefcase, ExternalLink, MoreHorizontal, FileText, Clock, CheckCircle2, PenLine, Users, Ban, History, X, AlertTriangle, KeyRound } from 'lucide-react';
import { SignaturePad } from '@/components/ui-phoenix/signature-pad';
import { KpiCard } from '@/components/ui-phoenix/kpi-card';
import { FormField } from '@/components/ui-phoenix/form-field';
import { LocationSelect } from '@/components/ui-phoenix/location-select';
import { FloatingPanel } from '@/components/ui-phoenix/floating-panel';
import { US_STATES, CITIES_BY_STATE, CITY_ZIP } from '@/lib/us-locations';
/* Esta pantalla tenía su PROPIA copia del formulario de bufete: 175 líneas
   iguales a la del catálogo pero con los textos en español en duro, así que el
   editar de acá era monolingüe y el del catálogo bilingüe. Ahora las dos usan la
   compartida. Ver `components/lawyers/firm-dialog`. */
import { FirmDialog } from '@/components/lawyers/firm-dialog';
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

// B.31 — Detalle de bufete

interface Firm {
  id: string;
  firmName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  paymentSpeed: string | null;
  caseflowFlags: string[];
  status: string;
  createdAt: Date;
}

interface Member {
  id:           string;
  firstName:    string | null;
  lastName:     string | null;
  email:        string | null;
  phone:        string | null;
  address:      string | null;
  city:         string | null;
  state:        string | null;
  zip:          string | null;
  memberRole:   string | null;
  status:       string;
  barNumber:    string | null;
  recoveryRate: number | null;
  casesCount:   number;
  /** Acceso al portal legal — ver `lib/lawyer-access.ts`. */
  access:       'none' | 'pending' | 'active' | 'revoked' | 'other-role';
}

interface Props {
  firm: Firm;
  members: Member[];
}

type Tab = 'summary' | 'members' | 'cases' | 'notes';

export function LawyerDetailClient({ firm, members }: Props) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'summary';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editFirmOpen, setEditFirmOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  const attorneys       = members.filter((m) => m.memberRole === 'ATTORNEY');
  const caseManagers    = members.filter((m) => m.memberRole === 'CASE_MANAGER');
  const paralegals      = members.filter((m) => m.memberRole === 'PARALEGAL');
  const legalAssistants = members.filter((m) => m.memberRole === 'LEGAL_ASSISTANT');
  const otherMembers    = members.filter((m) => !['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT'].includes(m.memberRole ?? ''));

  return (
    <div className="space-y-6">
      {/* Breadcrumb + back */}
      <Link href="/admin/lawyers" className="inline-flex items-center gap-1.5 text-text-2 hover:text-text-1 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span>{t('backTo')}</span>
      </Link>

      {/* Hero */}
      <div className="rounded-lg border border-border bg-bg-1 p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-xl bg-gradient-cyan flex items-center justify-center text-white font-bold text-xl shadow-glow shrink-0">
            {firmInitials(firm.firmName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-text-1">{firm.firmName}</h1>
              <StatusPill status={firm.status} />
              <PaymentSpeedPill speed={firm.paymentSpeed} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm text-text-2">
              {firm.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-text-muted" />
                  <a href={`mailto:${firm.email}`} className="hover:text-text-1 transition-colors">{firm.email}</a>
                </div>
              )}
              {firm.phone && (
                <div className="flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5 text-text-muted" />
                  {firm.phone}
                </div>
              )}
              {(firm.city || firm.state || firm.zip) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-text-muted" />
                  {[[firm.city, firm.state].filter(Boolean).join(', '), firm.zip].filter(Boolean).join(' ')}
                </div>
              )}
            </div>
            {firm.caseflowFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {firm.caseflowFlags.map((flag) => (
                  <span key={flag} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand-text border border-brand/20">
                    {flag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" onClick={() => setEditFirmOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> {tc('edit')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>{t('tabSummary')}</TabButton>
        <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
          {t('tabMembers')} <span className="text-text-muted ml-1 font-mono">({members.length})</span>
        </TabButton>
        <TabButton active={tab === 'cases'} onClick={() => setTab('cases')}>
          {t('tabCases')}
        </TabButton>
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>{t('tabNotes')}</TabButton>
      </div>

      {/* Tab content */}
      {tab === 'summary' && <SummaryTab firm={firm} members={members} attorneys={attorneys} caseManagers={caseManagers} />}
      {tab === 'members' && (
        <MembersTab
          firm={firm}
          attorneys={attorneys}
          caseManagers={caseManagers}
          paralegals={paralegals}
          legalAssistants={legalAssistants}
          others={otherMembers}
          onAddMember={() => { setEditingMember(null); setMemberDialogOpen(true); }}
          onEditMember={(m) => { setEditingMember(m); setMemberDialogOpen(true); }}
          onDeletedMember={refresh}
        />
      )}
      {tab === 'cases' && <CasesTab firmId={firm.id} members={members} />}
      {tab === 'notes' && <NotesTab firm={firm} onSaved={refresh} />}

      {/* Firm edit dialog */}
      <FirmDialog
        open={editFirmOpen}
        onOpenChange={setEditFirmOpen}
        editing={firm}
        onSaved={() => { setEditFirmOpen(false); refresh(); }}
      />

      {/* Member dialog */}
      <MemberDialog
        open={memberDialogOpen}
        onOpenChange={(open) => { if (!open) { setMemberDialogOpen(false); setEditingMember(null); } }}
        firmId={firm.id}
        editing={editingMember}
        onSaved={() => { setMemberDialogOpen(false); setEditingMember(null); refresh(); }}
      />
    </div>
  );
}

// ─── Tab buttons ────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
        disabled
          ? 'text-text-muted cursor-not-allowed'
          : active
            ? 'text-text-1'
            : 'text-text-2 hover:text-text-1'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-brand rounded-t" />
      )}
    </button>
  );
}

// ─── Summary Tab ────────────────────────────────────────────────────────────

function SummaryTab({
  firm,
  members,
  attorneys,
  caseManagers,
}: {
  firm: Firm;
  members: Member[];
  attorneys: Member[];
  caseManagers: Member[];
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title={t('sectionContact')}>
          <InfoRow label={t('fieldEmail')} value={firm.email ? <a href={`mailto:${firm.email}`} className="text-cyan hover:text-text-1">{firm.email}</a> : undefined} />
          <InfoRow label={t('colPhone')}       value={firm.phone ?? <Empty />} mono />
          <InfoRow label={t('colAddress')}     value={firm.address ?? <Empty />} />
          <InfoRow label={t('infoCityState')}  value={[firm.city, firm.state].filter(Boolean).join(', ') || <Empty />} />
          <InfoRow label={t('fieldZip')}       value={firm.zip ?? <Empty />} mono />
        </Card>

        <Card title={t('sectionConfig')}>
          <InfoRow label={tc('status')}            value={<StatusPill status={firm.status} />} />
          <InfoRow label={t('fieldPaymentSpeed')}  value={<PaymentSpeedPill speed={firm.paymentSpeed} />} />
          <InfoRow label={t('fieldFlags')}         value={
            firm.caseflowFlags.length === 0 ? <Empty /> : (
              <div className="flex flex-wrap gap-1">
                {firm.caseflowFlags.map((f) => (
                  <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand-text border border-brand/20">{f}</span>
                ))}
              </div>
            )
          } />
          <InfoRow label={t('infoRegistered')}      value={formatDate(firm.createdAt)} mono />
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={t('sectionMembers')}>
          <div className="text-center py-4">
            <div className="text-4xl font-bold text-text-1">{members.length}</div>
            <div className="text-text-muted text-xs uppercase tracking-wider mt-1">{t('totalMembers')}</div>
          </div>
          <div className="space-y-2 pt-3 border-t border-border">
            <SummaryStatRow label={t('groupATTORNEY')}     count={attorneys.length} />
            <SummaryStatRow label={t('groupCASE_MANAGER')} count={caseManagers.length} />
            <SummaryStatRow label={t('summaryOthers')}     count={members.length - attorneys.length - caseManagers.length} />
          </div>
        </Card>

        <Card title={t('sectionMetrics')}>
          <div className="text-text-muted text-xs italic text-center py-6">
            {t('metricsPlaceholder')}
            <br /><br />
            {t('metricsHint')}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Members Tab ────────────────────────────────────────────────────────────

function MembersTab({
  attorneys,
  caseManagers,
  paralegals,
  legalAssistants,
  others,
  onAddMember,
  onEditMember,
  onDeletedMember,
}: {
  firm: Firm;
  attorneys: Member[];
  caseManagers: Member[];
  paralegals: Member[];
  legalAssistants: Member[];
  others: Member[];
  onAddMember: () => void;
  onEditMember: (m: Member) => void;
  onDeletedMember: () => void;
}) {
  const t = useTranslations('phoenix.lawyers');
  const total = attorneys.length + caseManagers.length + paralegals.length + legalAssistants.length + others.length;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-text-2 text-sm">{t('membersCount', { count: total })}</div>
        <Button onClick={onAddMember}>
          <Plus className="w-4 h-4 mr-1" /> {t('btnAddMember')}
        </Button>
      </div>

      <MemberGroup title={t('groupATTORNEY')} icon={Briefcase} members={attorneys} onEdit={onEditMember} onDeleted={onDeletedMember} />
      <MemberGroup title={t('groupCASE_MANAGER')} icon={UserCircle} members={caseManagers} onEdit={onEditMember} onDeleted={onDeletedMember} />
      <MemberGroup title={t('groupPARALEGAL')} icon={UserCircle} members={paralegals} onEdit={onEditMember} onDeleted={onDeletedMember} />
      <MemberGroup title={t('groupLEGAL_ASSISTANT')} icon={UserCircle} members={legalAssistants} onEdit={onEditMember} onDeleted={onDeletedMember} />
      <MemberGroup title={t('groupOTHER')} icon={UserCircle} members={others} onEdit={onEditMember} onDeleted={onDeletedMember} />

      {total === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-8 text-center text-text-muted text-sm">
          {t('emptyMembers')}
        </div>
      )}
    </div>
  );
}

function MemberGroup({
  title,
  icon: Icon,
  members,
  onEdit,
  onDeleted,
}: {
  title: string;
  icon: React.ElementType;
  members: Member[];
  onEdit: (m: Member) => void;
  onDeleted: () => void;
}) {
  if (members.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-bg-2/50 flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-text" />
        <span className="text-text-1 font-semibold text-sm">{title}</span>
        <span className="text-text-muted text-xs font-mono">· {members.length}</span>
      </div>
      <div className="divide-y divide-row-sep">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} onEdit={onEdit} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  );
}

/**
 * Acceso al portal legal de UN miembro.
 *
 * El estado viene del directorio Admin (otra base — ver `lib/lawyer-access.ts`),
 * así que después de cada acción se refresca la página en vez de mutar estado
 * local: la fuente de verdad está del otro lado y adivinarla acá sería mentir.
 */
const ACCESS_BADGE: Record<Member['access'], { key: string; className: string } | null> = {
  none:         null,
  pending:      { key: 'accessInvited',   className: 'bg-amber/10 text-amber-text border-amber/20' },
  active:       { key: 'accessActive',    className: 'bg-emerald/10 text-emerald-text border-emerald/20' },
  revoked:      { key: 'accessRevoked',   className: 'bg-rose/10 text-rose-text border-rose/20' },
  'other-role': { key: 'accessOtherRole', className: 'bg-white/5 text-text-muted border-white/10' },
};

function MemberAccessControl({ member, onChanged }: { member: Member; onChanged: () => void }) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const serverError = useServerError();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo se muestra cuando el correo NO salió: sin RESEND_API_KEY configurado
  // este enlace es la única forma de que la persona entre.
  const [manualLink, setManualLink] = useState<string | null>(null);

  const name = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || t('accessThisMember');
  const badge = ACCESS_BADGE[member.access];

  const call = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lawyers/${member.id}/access`, { method });
      const data = await res.json() as ServerErrorBody & { emailSent?: boolean; activationLink?: string | null };
      if (!res.ok) { setError(serverError(data, t('accessErrorGeneric'))); return; }
      if (method === 'POST' && !data.emailSent && data.activationLink) setManualLink(data.activationLink);
      onChanged();
    } catch {
      setError(t('accessErrorNetwork'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = () => {
    if (!confirm(t('accessRevokeConfirm', { name }))) return;
    void call('DELETE');
  };

  return (
    <>
      {badge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border mr-1 ${badge.className}`}>
          {t(badge.key)}
        </span>
      )}

      {member.access === 'other-role' ? (
        <span className="w-8 h-8 flex items-center justify-center text-text-muted/40" title={t('accessTooltipOtherRole')}>
          <Ban className="w-3.5 h-3.5" />
        </span>
      ) : !member.email ? (
        <span className="w-8 h-8 flex items-center justify-center text-text-muted/40" title={t('accessTooltipNoEmail')}>
          <KeyRound className="w-3.5 h-3.5" />
        </span>
      ) : member.access === 'active' ? (
        <button
          onClick={revoke}
          disabled={busy}
          className="w-8 h-8 rounded-md text-text-muted hover:text-rose hover:bg-rose/10 disabled:opacity-50"
          title={t('accessTooltipRevoke')}
        >
          <Ban className="w-3.5 h-3.5 mx-auto" />
        </button>
      ) : (
        <button
          onClick={() => void call('POST')}
          disabled={busy}
          className="w-8 h-8 rounded-md text-text-muted hover:text-brand-text hover:bg-brand/10 disabled:opacity-50"
          title={
            member.access === 'pending' ? t('accessTooltipResend')
            : member.access === 'revoked' ? t('accessTooltipReactivate')
            : t('accessTooltipCreate')
          }
        >
          <KeyRound className="w-3.5 h-3.5 mx-auto" />
        </button>
      )}

      {error && (
        <Dialog open onOpenChange={() => setError(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('accessErrorTitle')}</DialogTitle>
              <DialogDescription>{error}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setError(null)}>{t('accessErrorOk')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {manualLink && (
        <Dialog open onOpenChange={() => setManualLink(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('accessManualTitle')}</DialogTitle>
              <DialogDescription>
                {t('accessManualDesc', { name })}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-white/10 bg-black/30 p-3 text-xs font-mono break-all text-text-2">
              {manualLink}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(manualLink); }}>
                {t('accessManualCopy')}
              </Button>
              <Button onClick={() => setManualLink(null)}>{tc('close')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function MemberRow({ member, onEdit, onDeleted }: { member: Member; onEdit: (m: Member) => void; onDeleted: () => void }) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(t('memberDeleteConfirm', { name: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() }))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/lawyers/members?id=${member.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const fullName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || t('memberNoName');
  const isAttorney = member.memberRole === 'ATTORNEY';

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
        {(member.firstName?.[0] ?? '?') + (member.lastName?.[0] ?? '')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-text-1 font-semibold text-sm">{fullName}</div>
        <div className="flex items-center gap-x-3 gap-y-0.5 text-xs text-text-2 flex-wrap mt-0.5">
          {member.email && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-text-muted" />
              <a href={`mailto:${member.email}`} className="hover:text-text-1 truncate max-w-[200px]" title={member.email}>{member.email}</a>
            </span>
          )}
          {member.phone && (
            <span className="flex items-center gap-1 font-mono">
              <Phone className="w-3 h-3 text-text-muted" />
              {member.phone}
            </span>
          )}
          {isAttorney && member.barNumber && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand-text border border-brand/20">
              {t('memberBarNumber', { number: member.barNumber })}
            </span>
          )}
          {isAttorney && member.recoveryRate != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet/10 text-violet-text border border-violet/20">
              {t('memberFeeRate', { rate: member.recoveryRate.toFixed(1) })}
            </span>
          )}
          {isAttorney && member.casesCount > 0 && (
            <span className="text-text-muted text-[10px]">
              {t('memberCases', { count: member.casesCount })}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <MemberAccessControl member={member} onChanged={onDeleted} />
        <button onClick={() => onEdit(member)} className="w-8 h-8 rounded-md text-text-muted hover:text-text-1 hover:bg-white/5" title={tc('edit')}>
          <Pencil className="w-3.5 h-3.5 mx-auto" />
        </button>
        <button onClick={handleDelete} disabled={deleting} className="w-8 h-8 rounded-md text-text-muted hover:text-rose hover:bg-rose/10 disabled:opacity-50" title={tc('delete')}>
          <Trash2 className="w-3.5 h-3.5 mx-auto" />
        </button>
      </div>
    </div>
  );
}

// ─── Notes Tab ──────────────────────────────────────────────────────────────

function NotesTab({ firm, onSaved }: { firm: Firm; onSaved: () => void }) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const [notes, setNotes] = useState(firm.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/lawyers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: firm.id,
          firmName: firm.firmName,
          email: firm.email,
          phone: firm.phone,
          address: firm.address,
          city: firm.city,
          state: firm.state,
          zip: firm.zip,
          paymentSpeed: firm.paymentSpeed,
          caseflowFlags: firm.caseflowFlags,
          notes: notes.trim() || null,
          isActive: firm.status === 'ACTIVE',
        }),
      });
      if (res.ok) {
        setSaved(true);
        onSaved();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-text-2 text-sm">{t('notesHint')}</div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full bg-bg-2 border border-border rounded-md px-4 py-3 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[200px]"
        placeholder={t('placeholderInternalNotes')}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {saved && <span className="text-emerald">✓ {t('notesSaved')}</span>}
        </span>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? tc('saving') : t('btnSaveNotes')}
        </Button>
      </div>
    </div>
  );
}

// ─── Cases Tab ──────────────────────────────────────────────────────────────

interface CaseMember { id: string; firstName: string | null; lastName: string | null }

interface CaseRow {
  id: string;
  caseCode: string;
  caseType: string;
  status: string;
  createdAt: string;
  patient: { firstName: string | null; lastName: string | null };
  attorney:       CaseMember | null;
  paralegal:      CaseMember | null;
  legalAssistant: CaseMember | null;
  hasSigned: boolean;
  signatureExempt: boolean;
}

interface CasesStats {
  total: number;
  recentCount: number;
  signatureRate: number;
  byMonth: Array<{ month: string; count: number }>;
}

const CASE_TYPE_COLORS: Record<string, string> = {
  MVA:          'bg-brand/15 text-brand-text border-brand/30',
  GENERAL:      'bg-cyan/15 text-cyan border-cyan/30',
  WORKERS_COMP: 'bg-amber/15 text-amber border-amber/30',
  NURSING_HOME: 'bg-violet/15 text-violet-text border-violet/30',
};

/** Solo el ORDEN del filtro: la etiqueta de cada estado vive en `caseStatus*`. */
const CASE_STATUSES = [
  'NEW_REFERRAL',
  'INTAKE_PENDING',
  'INTAKE_COMPLETED',
  'CONFIRMED',
  'ACTIVE',
  'MMI',
  'CLOSED',
  'SETTLED',
  'ARCHIVED',
  'CANCELLED',
] as const;

const PAGE_SIZE = 10;

function CasesTab({ firmId, members }: { firmId: string; members: Member[] }) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [stats, setStats] = useState<CasesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [signCase, setSignCase] = useState<CaseRow | null>(null);
  const [historyCase, setHistoryCase] = useState<CaseRow | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<CaseRow | null>(null);
  const [confirmExempt, setConfirmExempt] = useState<CaseRow | null>(null);
  const [page, setPage] = useState(1);

  const patchCase = useCallback(async (
    caseId: string,
    field: 'attorneyId' | 'paralegalId' | 'legalAssistantId',
    member: CaseMember | null,
  ) => {
    setCases((prev) => prev.map((c) => {
      if (c.id !== caseId) return c;
      const key = field.replace('Id', '') as 'attorney' | 'paralegal' | 'legalAssistant';
      return { ...c, [key]: member };
    }));
    await fetch(`/api/admin/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: member?.id ?? null }),
    });
  }, []);

  const toggleExempt = useCallback(async (caseId: string, current: boolean) => {
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, signatureExempt: !current } : c));
    await fetch(`/api/admin/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureExempt: !current }),
    });
  }, []);

  const removeCase = useCallback(async (caseId: string) => {
    setCases((prev) => prev.filter((c) => c.id !== caseId));
    setConfirmRemove(null);
    await fetch(`/api/admin/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lawFirmId: null, attorneyId: null, paralegalId: null, legalAssistantId: null }),
    });
  }, []);

  const attorneys = members.filter((m) => m.memberRole === 'ATTORNEY');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/admin/lawyers/${firmId}/cases?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCases(data.cases);
      setStats(data.stats);
    }
    setLoading(false);
  }, [firmId, search, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenu]);

  const monthLabels = (stats?.byMonth ?? []).map((b) => {
    const [, m] = b.month.split('-');
    return new Date(2024, parseInt(m, 10) - 1).toLocaleString(localeApp(), { month: 'short' });
  });
  const monthCounts = (stats?.byMonth ?? []).map((b) => b.count);
  const maxCount = Math.max(...monthCounts, 1);

  const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
  const paginated = cases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* KPIs 2×2 + Sparkline — estándar aprobado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KpiCard label={t('kpiTotalCases')} value={stats?.total ?? '—'} compact icon={FileText} iconBg="bg-brand/10" iconColor="text-brand-text" />
          <KpiCard label={t('kpiAttorneys')} value={attorneys.length} compact icon={Users} iconBg="bg-violet/10" iconColor="text-violet-text" />
          <KpiCard label={t('kpiSignRate')} value={stats ? `${stats.signatureRate}%` : '—'} compact icon={CheckCircle2} iconBg="bg-emerald/10" iconColor="text-emerald" />
          <KpiCard label={t('kpiLast30')} value={stats?.recentCount ?? '—'} compact icon={Clock} iconBg="bg-cyan/10" iconColor="text-cyan" />
        </div>

        {/* Sparkline a la derecha */}
        <div className="rounded-lg border border-border bg-bg-1 px-4 py-3 flex flex-col">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">{t('casesPerMonth')}</div>
          {monthCounts.length > 0 ? (
            <>
              <svg viewBox={`0 0 ${monthCounts.length * 60} 60`} className="w-full h-12 flex-1" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d={[
                    `M ${30} ${50 - (monthCounts[0]! / maxCount) * 44}`,
                    ...monthCounts.slice(1).map((c, i) => `L ${(i + 1) * 60 + 30} ${50 - (c / maxCount) * 44}`),
                    `L ${(monthCounts.length - 1) * 60 + 30} 60 L 30 60 Z`,
                  ].join(' ')}
                  fill="url(#spark-fill)"
                />
                {monthCounts.map((c, i) => {
                  const x = i * 60 + 30;
                  const y = 50 - (c / maxCount) * 44;
                  return (
                    <g key={i}>
                      {i < monthCounts.length - 1 && (
                        <line x1={x} y1={y} x2={(i + 1) * 60 + 30} y2={50 - (monthCounts[i + 1]! / maxCount) * 44}
                          stroke="rgb(99,102,241)" strokeWidth="1.5" strokeLinecap="round" />
                      )}
                      {i === monthCounts.length - 1 && <circle cx={x} cy={y} r="2.5" fill="rgb(99,102,241)" />}
                    </g>
                  );
                })}
              </svg>
              <div className="flex justify-between mt-1">
                {monthLabels.map((l, i) => (
                  <span key={i} className="text-[10px] text-text-muted font-mono capitalize">{l}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-xs">{t('noDataYet')}</div>
          )}
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchCasesPlaceholder')}
          className="flex-1 bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
        >
          <option value="">{t('filterAllStatuses')}</option>
          {CASE_STATUSES.map((v) => (
            <option key={v} value={v}>{t(`caseStatus${v}`)}</option>
          ))}
        </select>
      </div>

      {/* Modals */}
      {signCase && (
        <SignAttorneyModal
          caseRow={signCase}
          defaultName={signCase.attorney ? `${signCase.attorney.firstName ?? ''} ${signCase.attorney.lastName ?? ''}`.trim() : ''}
          onClose={() => setSignCase(null)}
          onSigned={() => { setSignCase(null); load(); }}
        />
      )}
      {confirmRemove && (
        <ConfirmRemoveModal
          caseRow={confirmRemove}
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => removeCase(confirmRemove.id)}
        />
      )}
      {confirmExempt && (
        <ConfirmExemptModal
          caseRow={confirmExempt}
          onClose={() => setConfirmExempt(null)}
          onConfirm={() => { toggleExempt(confirmExempt.id, confirmExempt.signatureExempt); setConfirmExempt(null); }}
        />
      )}
      {historyCase && (
        <CaseHistoryDrawer
          caseRow={historyCase}
          onClose={() => setHistoryCase(null)}
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-bg-2 animate-pulse" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-10 text-center">
          <Briefcase className="w-10 h-10 text-text-muted mx-auto mb-2" />
          <div className="text-text-2 text-sm">{t('noCasesFound')}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-row-sep bg-bg-2/50 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  <th className="sticky left-0 z-10 bg-bg-2 px-4 py-2.5 text-left">{t('colCase')}</th>
                  <th className="px-4 py-2.5 text-left">{t('columnType')}</th>
                  <th className="px-4 py-2.5 text-left">{tc('date')}</th>
                  <th className="px-4 py-2.5 text-left">{t('colPatient')}</th>
                  <th className="px-4 py-2.5 text-left">{t('colAttorney')}</th>
                  <th className="px-4 py-2.5 text-left">{t('colParalegal')}</th>
                  <th className="px-4 py-2.5 text-left">{t('colAssistant')}</th>
                  <th className="px-4 py-2.5 text-left">{t('colSignature')}</th>
                  <th className="sticky right-0 z-10 bg-bg-2 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-row-sep">
                {paginated.map((c) => (
                  <CaseTableRow
                    key={c.id}
                    row={c}
                    members={members}
                    menuOpen={openMenu === c.id}
                    onMenuToggle={(e) => {
                      e.stopPropagation();
                      setOpenMenu(openMenu === c.id ? null : c.id);
                    }}
                    onMenuClose={() => setOpenMenu(null)}
                    onSign={() => { setOpenMenu(null); setSignCase(c); }}
                    onAssign={patchCase}
                    onToggleExempt={() => { setOpenMenu(null); setConfirmExempt(c); }}
                    onRemove={() => { setOpenMenu(null); setConfirmRemove(c); }}
                    onHistory={() => { setOpenMenu(null); setHistoryCase(c); }}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-row-sep flex items-center justify-between text-[11px] text-text-muted">
            <span>{t('casesFooter', { count: cases.length, page, total: totalPages })}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded text-[11px] border border-border hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← {t('pagerPrev')}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded text-[11px] border border-border hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t('pagerNext')} →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline assignment dropdown ─────────────────────────────────────────────

function AssignDropdown({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: CaseMember | null;
  options: Member[];
  placeholder: string;
  onChange: (m: CaseMember | null) => void;
}) {
  const t = useTranslations('phoenix.lawyers');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter((m) => {
    const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.toLowerCase();
    return name.includes(q.toLowerCase());
  });

  const label = value
    ? `${value.firstName ?? ''} ${value.lastName ?? ''}`.trim()
    : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); setQ(''); }}
        className={`flex items-center gap-1 text-xs rounded px-2 py-1 border transition-colors w-full text-left
          ${open ? 'border-brand/50 bg-brand/5' : 'border-transparent hover:border-border hover:bg-white/[0.03]'}
          ${label ? 'text-text-1' : 'text-text-muted'}`}
      >
        <span className="truncate max-w-[120px]">{label ?? placeholder}</span>
        <svg className="w-3 h-3 shrink-0 text-text-muted ml-auto" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-52 rounded-lg border border-border bg-bg-2 shadow-xl py-1" onClick={(e) => e.stopPropagation()}>
          <div className="px-2 py-1.5 border-b border-border">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('assignSearchPlaceholder')}
              className="w-full bg-bg-1 border border-border rounded px-2 py-1 text-xs text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:bg-white/5 transition-colors"
            >
              <span className="italic">{t('assignUnassigned')}</span>
            </button>
            {filtered.map((m) => {
              const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
              const isSelected = value?.id === m.id;
              const roleLabel = m.memberRole && ['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT'].includes(m.memberRole)
                ? t(`role${m.memberRole}`)
                : null;
              return (
                <button
                  key={m.id}
                  onClick={() => { onChange({ id: m.id, firstName: m.firstName, lastName: m.lastName }); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5
                    ${isSelected ? 'text-brand-text' : 'text-text-1'}`}
                >
                  <span className="flex items-center gap-1.5">
                    {isSelected && <span className="text-brand-text">✓</span>}
                    {name || t('memberNoName')}
                  </span>
                  {roleLabel && <span className="text-[10px] text-text-muted shrink-0">{roleLabel}</span>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-muted italic">{t('assignNoResults')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CaseTableRow({
  row,
  members,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onSign,
  onAssign,
  onToggleExempt,
  onRemove,
  onHistory,
}: {
  row: CaseRow;
  members: Member[];
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  /** Lo pide `FloatingPanel` para cerrarse al scrollear. */
  onMenuClose: () => void;
  onSign: () => void;
  onAssign: (caseId: string, field: 'attorneyId' | 'paralegalId' | 'legalAssistantId', member: CaseMember | null) => void;
  onToggleExempt: () => void;
  onRemove: () => void;
  onHistory: () => void;
}) {
  const t = useTranslations('phoenix.lawyers');
  const patientName = `${row.patient.lastName ?? ''}, ${row.patient.firstName ?? ''}`.trim().replace(/^,\s*/, '');
  const typeColor = CASE_TYPE_COLORS[row.caseType] ?? 'bg-white/5 text-text-muted border-border';
  const dateStr = new Date(row.createdAt).toLocaleDateString(localeApp(), { year: 'numeric', month: 'short', day: 'numeric' });
  const btnRef = useRef<HTMLButtonElement>(null);

  const attorneys     = members.filter((m) => m.memberRole === 'ATTORNEY');
  const nonAttorneys  = members.filter((m) => m.memberRole !== 'ATTORNEY');
  const caseManagers  = nonAttorneys;
  const legalAssists  = nonAttorneys;

  return (
    <tr className="hover:bg-white/[0.02] transition-colors">
      <td className="sticky left-0 z-10 bg-bg-1 px-4 py-1.5">
        <span className="font-mono text-xs text-text-1">{row.caseCode}</span>
      </td>
      <td className="px-4 py-1.5">
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${typeColor}`}>
          {row.caseType}
        </span>
      </td>
      <td className="px-4 py-1.5 text-xs text-text-2 font-mono">{dateStr}</td>
      <td className="px-4 py-1.5 text-sm text-text-1">{patientName || '—'}</td>
      <td className="px-4 py-1.5 min-w-[140px]">
        <AssignDropdown
          value={row.attorney}
          options={attorneys}
          placeholder={t('placeholderAttorney')}
          onChange={(m) => onAssign(row.id, 'attorneyId', m)}
        />
      </td>
      <td className="px-4 py-1.5 min-w-[140px]">
        <AssignDropdown
          value={row.paralegal}
          options={caseManagers}
          placeholder={t('placeholderParalegal')}
          onChange={(m) => onAssign(row.id, 'paralegalId', m)}
        />
      </td>
      <td className="px-4 py-1.5 min-w-[140px]">
        <AssignDropdown
          value={row.legalAssistant}
          options={legalAssists}
          placeholder={t('placeholderAssistant')}
          onChange={(m) => onAssign(row.id, 'legalAssistantId', m)}
        />
      </td>
      <td className="px-4 py-1.5">
        {row.hasSigned ? (
          <span className="text-[10px] text-emerald font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {t('signSigned')}
          </span>
        ) : row.signatureExempt ? (
          <span className="text-[10px] text-amber font-semibold flex items-center gap-1">
            <Ban className="w-3 h-3" /> {t('signExempt')}
          </span>
        ) : (
          <span className="text-[10px] text-text-muted">{t('signPending')}</span>
        )}
      </td>
      <td className="sticky right-0 z-10 bg-bg-1 px-4 py-1.5">
        <button
          ref={btnRef}
          onClick={onMenuToggle}
          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-1 hover:bg-white/5 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {/* Por `FloatingPanel`: portalea y VOLTEA si abajo no entra. Antes leía el
            rect del botón dentro del `style` —o sea en cada render, y con la
            posición congelada al abrir— y siempre abría hacia abajo, así que en
            las últimas filas de la tabla el menú se salía de la ventana. */}
        <FloatingPanel
          anchorRef={btnRef}
          open={menuOpen}
          width={216}
          align="end"
          maxHeight={300}
          onScrollClose={onMenuClose}
          className="border border-border py-1"
        >
          <div>
            <Link
              href={`/front-office/${row.id}`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-text-1 hover:bg-white/5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-brand-text" />
              {t('menuViewCase')}
            </Link>

            <div className="h-px bg-border/50 my-1" />

            {!row.hasSigned && !row.signatureExempt && (
              <button
                onClick={onSign}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-1 hover:bg-white/5 transition-colors"
              >
                <PenLine className="w-3.5 h-3.5 text-emerald" />
                {t('menuSign')}
              </button>
            )}
            {row.hasSigned && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted cursor-default">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald" />
                {t('menuAlreadySigned')}
              </div>
            )}
            {!row.hasSigned && (
              <button
                onClick={onToggleExempt}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-1 hover:bg-white/5 transition-colors"
              >
                <Ban className="w-3.5 h-3.5 text-amber" />
                {row.signatureExempt ? t('menuUnexempt') : t('menuExempt')}
              </button>
            )}

            <div className="h-px bg-border/50 my-1" />

            <button
              onClick={onHistory}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-1 hover:bg-white/5 transition-colors"
            >
              <History className="w-3.5 h-3.5 text-cyan" />
              {t('menuHistory')}
            </button>

            <div className="h-px bg-border/50 my-1" />

            <button
              onClick={onRemove}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose hover:bg-rose/5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('menuRemove')}
            </button>
          </div>
        </FloatingPanel>
      </td>
    </tr>
  );
}

// ─── Sign Attorney Modal ─────────────────────────────────────────────────────

function SignAttorneyModal({
  caseRow,
  defaultName,
  onClose,
  onSigned,
}: {
  caseRow: CaseRow;
  defaultName: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const [signerName, setSignerName] = useState(defaultName);
  const [signerEmail, setSignerEmail] = useState('');
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadySigned, setAlreadySigned] = useState(false);

  const canSubmit = signerName.trim() && signaturePng && agreed && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cases/${caseRow.id}/sign-attorney`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim(), signerEmail: signerEmail.trim() || undefined, signatureSvg: signaturePng }),
      });
      if (res.status === 409) { setAlreadySigned(true); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onSigned();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSignSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border rounded-xl w-full max-w-xl space-y-5 p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
            <PenLine className="w-4 h-4 text-brand-text" /> {t('signTitle', { code: caseRow.caseCode })}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-1 text-lg leading-none">×</button>
        </div>

        {alreadySigned ? (
          <div className="rounded-md border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
            {t('signAlready')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('signerName')} <span className="text-rose">*</span>
                </label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder={t('placeholderFullName')}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">{t('signerEmail')}</label>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder={t('signerEmailPlaceholder')}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-2">
                {t('signPadLabel')} <span className="text-rose">*</span>
              </label>
              <SignaturePad
                onChange={setSignaturePng}
                hintLabel={t('signPadHint')}
                height={240}
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-brand shrink-0"
              />
              <span className="text-[11px] text-text-2">{t('signConsent')}</span>
            </label>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">⚠ {error}</div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-md border border-border text-text-2 text-sm hover:bg-white/5 transition-colors"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 px-4 py-2 rounded-md bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? tc('saving') : t('signSubmit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-bg-2/50">
        <div className="text-text-1 font-semibold text-sm">{title}</div>
      </div>
      <div className="p-5 space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 items-start sm:items-center py-2 border-b border-border/20 last:border-0">
      <div className="text-text-muted text-xs uppercase tracking-wider font-semibold">{label}</div>
      <div className={`sm:col-span-2 text-sm text-text-1 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function SummaryStatRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-2">{label}</span>
      <span className="text-text-1 font-mono font-semibold">{count}</span>
    </div>
  );
}

function Empty() {
  return <span className="text-text-muted italic">—</span>;
}

function StatusPill({ status }: { status: string }) {
  const t = useTranslations('phoenix.lawyers');
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald/15 text-emerald border border-emerald/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald" /> {t('statusActive')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-text-muted border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted" /> {t('statusInactive')}
    </span>
  );
}

const SPEED_KEY: Record<string, string> = { FAST: 'speedFast', AVERAGE: 'speedAverage', SLOW: 'speedSlow' };

function PaymentSpeedPill({ speed }: { speed: string | null }) {
  const t = useTranslations('phoenix.lawyers');
  if (!speed || !SPEED_KEY[speed]) return <span className="text-text-muted text-[10px] italic">{t('speedNoData')}</span>;
  const styles: Record<string, string> = {
    FAST:    'bg-emerald/15 text-emerald border-emerald/30',
    AVERAGE: 'bg-cyan/15 text-cyan border-cyan/30',
    SLOW:    'bg-amber/15 text-amber border-amber/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles[speed]}`}>
      {t(SPEED_KEY[speed])}
    </span>
  );
}

function firmInitials(name: string): string {
  return name.split(/[\s&]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(localeApp(), { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Member Dialog ──────────────────────────────────────────────────────────

/** Solo el ORDEN del select: la etiqueta de cada rol vive en `role*`. */
const MEMBER_ROLES = ['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL', 'LEGAL_ASSISTANT', 'OTHER'] as const;

function MemberDialog({
  open,
  onOpenChange,
  firmId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firmId: string;
  editing: Member | null;
  onSaved: () => void;
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const serverError = useServerError();
  const [firstName,    setFirstName]    = useState(editing?.firstName ?? '');
  const [lastName,     setLastName]     = useState(editing?.lastName ?? '');
  const [email,        setEmail]        = useState(editing?.email ?? '');
  const [phone,        setPhone]        = useState(editing?.phone ?? '');
  const [address,      setAddress]      = useState(editing?.address ?? '');
  const [city,         setCity]         = useState(editing?.city ?? '');
  const [state,        setState]        = useState(editing?.state ?? '');
  const [zip,          setZip]          = useState(editing?.zip ?? '');
  const [memberRole,   setMemberRole]   = useState(editing?.memberRole ?? 'ATTORNEY');
  const [barNumber,    setBarNumber]    = useState(editing?.barNumber ?? '');
  const [recoveryRate, setRecoveryRate] = useState(editing?.recoveryRate != null ? String(editing.recoveryRate) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Reset al ABRIR (no al cambiar editingId) — reabrir "Agregar miembro" dos
  // veces seguidas siempre tiene editingId=null, así que comparar contra el
  // valor anterior nunca detectaba el segundo open() y quedaban los datos
  // del miembro recién creado.
  useEffect(() => {
    if (!open) return;
    setFirstName(editing?.firstName ?? '');
    setLastName(editing?.lastName ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setAddress(editing?.address ?? '');
    setCity(editing?.city ?? '');
    setState(editing?.state ?? '');
    setZip(editing?.zip ?? '');
    setMemberRole(editing?.memberRole ?? 'ATTORNEY');
    setBarNumber(editing?.barNumber ?? '');
    setRecoveryRate(editing?.recoveryRate != null ? String(editing.recoveryRate) : '');
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const handleSave = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError(t('errorAttorneyNameRequired'));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/lawyers/members', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:           editing?.id,
          parentFirmId: firmId,
          firstName:    firstName.trim(),
          lastName:     lastName.trim(),
          email:        email.trim() || null,
          phone:        phone.trim() || null,
          address:      address.trim() || null,
          city:         city.trim() || null,
          state:        state.trim() || null,
          zip:          zip.trim() || null,
          memberRole,
          barNumber:    memberRole === 'ATTORNEY' ? (barNumber.trim() || null) : null,
          recoveryRate: memberRole === 'ATTORNEY' && recoveryRate !== ''
            ? parseFloat(recoveryRate)
            : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as ServerErrorBody;
        throw new Error(serverError(data));
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t('memberDialogEditTitle') : t('memberDialogCreateTitle')}</DialogTitle>
          <DialogDescription>{t('memberDialogDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">{t('fieldFirstName')} <span className="text-rose">*</span></Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="lastName">{t('fieldLastName')} <span className="text-rose">*</span></Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">{t('fieldEmailPlain')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <FormField.Phone label={t('colPhone')} value={phone ?? ''} onChange={(v) => setPhone(v)} />
            </div>
          </div>

          <div>
            <Label htmlFor="address">{t('fieldAddress')}</Label>
            <Input id="address" value={address ?? ''} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <LocationSelect
              label={t('fieldState')}
              value={state ?? ''}
              onChange={(v) => { setState(v); setCity(''); }}
              options={['Utah', ...US_STATES.filter(s => s.code !== 'UT').map(s => s.name)]}
              placeholder={t('selectStatePlaceholder')}
            />
            <LocationSelect
              label={t('fieldCity')}
              value={city ?? ''}
              onChange={(v) => { setCity(v); setZip((prev) => CITY_ZIP[v] ?? prev); }}
              options={state ? (CITIES_BY_STATE[US_STATES.find(s => s.name === state)?.code ?? ''] ?? []) : []}
              placeholder={state ? t('selectCityPlaceholder') : t('selectStateFirst')}
              disabled={!state}
            />
            <div>
              <Label htmlFor="zip">{t('fieldZipShort')}</Label>
              <Input id="zip" value={zip ?? ''} onChange={(e) => setZip(e.target.value)} placeholder="84601" maxLength={10} />
            </div>
          </div>

          <div>
            <Label htmlFor="memberRole">{t('fieldRole')}</Label>
            <select
              id="memberRole"
              value={memberRole ?? 'ATTORNEY'}
              onChange={(e) => setMemberRole(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
            >
              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{t(`role${r}`)}</option>)}
            </select>
          </div>

          {memberRole === 'ATTORNEY' && (
            <div className="rounded-md border border-brand/20 bg-brand/5 p-3 space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-brand-text">
                {t('attorneyDataSection')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="barNumber">{t('fieldBarNumber')}</Label>
                  <Input
                    id="barNumber"
                    value={barNumber}
                    onChange={(e) => setBarNumber(e.target.value)}
                    placeholder={t('barNumberPlaceholder')}
                    maxLength={50}
                  />
                </div>
                <div>
                  <Label htmlFor="recoveryRate">{t('fieldRecoveryRate')}</Label>
                  <div className="relative">
                    <Input
                      id="recoveryRate"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={recoveryRate}
                      onChange={(e) => setRecoveryRate(e.target.value)}
                      placeholder="33.3"
                      className="pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">
              ⚠ {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">{tc('cancel')}</Button>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? tc('saving') : editing ? t('btnSaveChanges') : t('btnAddMember')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirm Remove Modal ─────────────────────────────────────────────────────

function ConfirmRemoveModal({
  caseRow,
  onClose,
  onConfirm,
}: {
  caseRow: CaseRow;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border rounded-xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose" />
          </div>
          <div>
            <div className="text-text-1 font-semibold text-sm">{t('removeTitle')}</div>
            <div className="text-text-muted text-[11px] font-mono mt-0.5">{caseRow.caseCode}</div>
          </div>
        </div>
        <p className="text-text-2 text-sm">{t('removeDesc')}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-2 hover:text-text-1 border border-border rounded-md hover:bg-white/5 transition-colors"
          >
            {tc('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-rose hover:bg-rose/80 rounded-md transition-colors"
          >
            {t('removeConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Exempt Modal ─────────────────────────────────────────────────────

function ConfirmExemptModal({
  caseRow,
  onClose,
  onConfirm,
}: {
  caseRow: CaseRow;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const isExempting = !caseRow.signatureExempt;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border rounded-xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isExempting ? 'bg-amber/10' : 'bg-brand/10'}`}>
            <Ban className={`w-5 h-5 ${isExempting ? 'text-amber' : 'text-brand-text'}`} />
          </div>
          <div>
            <div className="text-text-1 font-semibold text-sm">
              {isExempting ? t('exemptTitle') : t('requireSignTitle')}
            </div>
            <div className="text-text-muted text-[11px] font-mono mt-0.5">{caseRow.caseCode}</div>
          </div>
        </div>
        <p className="text-text-2 text-sm">
          {isExempting ? t('exemptDesc') : t('requireSignDesc')}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-2 hover:text-text-1 border border-border rounded-md hover:bg-white/5 transition-colors"
          >
            {tc('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-md transition-colors ${isExempting ? 'bg-amber hover:bg-amber/80' : 'bg-brand hover:bg-brand/80'}`}
          >
            {isExempting ? t('exemptConfirm') : t('requireSignTitle')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Case History Drawer ──────────────────────────────────────────────────────

type HistoryEvent = {
  id: string;
  action: string;
  actorType: string;
  createdAt: string;
  isAssignment: boolean;
  changeType: string | null;
  changeAction: string | null;
  changedByEmail: string | null;
  previousValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
};

function ActionBadge({ action }: { action: string | null }) {
  const t = useTranslations('phoenix.lawyers');
  if (!action) return null;
  const color =
    action === 'Asignado'    ? 'bg-emerald/15 text-emerald border-emerald/30' :
    action === 'Removido'    ? 'bg-rose/15 text-rose border-rose/30' :
    'bg-brand/15 text-brand-text border-brand/30';
  const label =
    action === 'Asignado' ? t('historyActionAssigned') :
    action === 'Removido' ? t('historyActionRemoved') :
    action;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>{label}</span>
  );
}

function CaseHistoryDrawer({
  caseRow,
  onClose,
}: {
  caseRow: CaseRow;
  onClose: () => void;
}) {
  const t  = useTranslations('phoenix.lawyers');
  const tc = useTranslations('phoenix.common');
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/cases/${caseRow.id}/audit`)
      .then((r) => r.ok ? r.json() : { events: [] })
      .then((d) => { setEvents(d.events ?? []); setLoadingHistory(false); })
      .catch(() => setLoadingHistory(false));
  }, [caseRow.id]);

  const assignmentEvents = events.filter((e) => e.isAssignment);
  const otherEvents      = events.filter((e) => !e.isAssignment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-1 border border-border rounded-xl w-full max-w-5xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-text-1 font-semibold text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-cyan" /> {t('historyTitle')}
            </div>
            <div className="text-text-muted text-[11px] font-mono mt-0.5">
              {caseRow.caseCode} · {caseRow.patient.firstName} {caseRow.patient.lastName}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-1 hover:bg-white/5 rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingHistory ? (
            <div className="p-5 space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded bg-bg-2 animate-pulse" />)}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
              <History className="w-8 h-8" />
              <span className="text-sm">{t('historyEmpty')}</span>
            </div>
          ) : (
            <>
              {/* Assignment history table */}
              {assignmentEvents.length > 0 && (
                <div className="p-4">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3 flex items-center gap-2">
                    <History className="w-3 h-3" /> {t('historyAssignments', { count: assignmentEvents.length })}
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-border bg-bg-2/40">
                            <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider">{tc('date')}</th>
                            <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider">{t('columnType')}</th>
                            <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider">{t('colAction')}</th>
                            <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider">{t('colUser')}</th>
                            <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider">{t('colPrevious')}</th>
                            <th className="text-left px-3 py-2 text-text-muted font-semibold uppercase tracking-wider">{t('colNew')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignmentEvents.map((ev, idx) => (
                            <tr key={ev.id} className={`border-b border-border/30 hover:bg-white/[0.02] ${idx % 2 === 0 ? '' : 'bg-bg-2/10'}`}>
                              <td className="px-3 py-2 text-text-muted font-mono whitespace-nowrap">
                                {new Date(ev.createdAt).toLocaleDateString(localeApp(), { day: 'numeric', month: 'short', year: 'numeric' })}{', '}
                                {new Date(ev.createdAt).toLocaleTimeString(localeApp(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-bg-2 border-border/60 text-text-2 whitespace-nowrap">
                                  {ev.changeType ?? '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <ActionBadge action={ev.changeAction} />
                              </td>
                              <td className="px-3 py-2 text-text-2 whitespace-nowrap">{ev.changedByEmail ?? '—'}</td>
                              <td className="px-3 py-2 text-text-muted">{ev.previousValue ?? <span className="text-text-muted italic">{t('historyEmptyValue')}</span>}</td>
                              <td className="px-3 py-2 text-text-1 font-medium">{ev.newValue ?? <span className="text-text-muted italic">{t('historyEmptyValue')}</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Other events timeline */}
              {otherEvents.length > 0 && (
                <div className="px-4 pb-4">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-3 flex items-center gap-2">
                    <History className="w-3 h-3" /> {t('historyOther', { count: otherEvents.length })}
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-border/40" />
                    <div className="space-y-3">
                      {otherEvents.map((ev) => (
                        <div key={ev.id} className="flex gap-3 pl-1">
                          <div className="w-5 h-5 rounded-full bg-bg-2 border border-border flex items-center justify-center shrink-0 mt-0.5 z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan" />
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="text-text-2 text-[11px] font-medium">{ev.action}</div>
                            <div className="text-text-muted text-[10px] mt-0.5 font-mono">
                              {new Date(ev.createdAt).toLocaleDateString(localeApp(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border/50">
          <Link
            href={`/front-office/${caseRow.id}`}
            className="text-brand-text text-xs hover:underline flex items-center gap-1"
            onClick={onClose}
          >
            <ExternalLink className="w-3 h-3" /> {t('historyViewCase')}
          </Link>
        </div>
      </div>
    </div>
  );
}
