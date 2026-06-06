'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, MapPin, Pencil, Plus, Trash2, UserCircle, Briefcase } from 'lucide-react';
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
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  paymentSpeed: string | null;
  caseflowFlags: string[];
  status: string;
  createdAt: Date;
}

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  memberRole: string | null;
  status: string;
}

interface Props {
  firm: Firm;
  members: Member[];
}

type Tab = 'summary' | 'members' | 'cases' | 'notes';

export function LawyerDetailClient({ firm, members }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>('summary');
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  const attorneys      = members.filter((m) => m.memberRole === 'ATTORNEY');
  const caseManagers   = members.filter((m) => m.memberRole === 'CASE_MANAGER');
  const paralegals     = members.filter((m) => m.memberRole === 'PARALEGAL');
  const otherMembers   = members.filter((m) => !['ATTORNEY', 'CASE_MANAGER', 'PARALEGAL'].includes(m.memberRole ?? ''));

  return (
    <div className="space-y-6">
      {/* Breadcrumb + back */}
      <Link href="/admin/lawyers" className="inline-flex items-center gap-1.5 text-text-2 hover:text-white text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span>Volver a Bufetes</span>
      </Link>

      {/* Hero */}
      <div className="rounded-lg border border-border bg-bg-1 p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-xl bg-gradient-cyan flex items-center justify-center text-white font-bold text-xl shadow-glow shrink-0">
            {firmInitials(firm.firmName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{firm.firmName}</h1>
              <StatusPill status={firm.status} />
              <PaymentSpeedPill speed={firm.paymentSpeed} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-sm text-text-2">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-text-muted" />
                <a href={`mailto:${firm.email}`} className="hover:text-white transition-colors">{firm.email}</a>
              </div>
              {firm.phone && (
                <div className="flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5 text-text-muted" />
                  {firm.phone}
                </div>
              )}
              {(firm.city || firm.state) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-text-muted" />
                  {[firm.city, firm.state].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
            {firm.caseflowFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {firm.caseflowFlags.map((flag) => (
                  <span key={flag} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                    {flag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Link href={`/admin/lawyers?edit=${firm.id}`}>
            <Button variant="outline">
              <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>Resumen</TabButton>
        <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
          Miembros <span className="text-text-muted ml-1 font-mono">({members.length})</span>
        </TabButton>
        <TabButton active={tab === 'cases'} onClick={() => setTab('cases')} disabled>
          Casos <span className="text-text-muted ml-1 text-[10px]">(Phase 2)</span>
        </TabButton>
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>Notas internas</TabButton>
      </div>

      {/* Tab content */}
      {tab === 'summary' && <SummaryTab firm={firm} members={members} attorneys={attorneys} caseManagers={caseManagers} />}
      {tab === 'members' && (
        <MembersTab
          firm={firm}
          attorneys={attorneys}
          caseManagers={caseManagers}
          paralegals={paralegals}
          others={otherMembers}
          onAddMember={() => { setEditingMember(null); setMemberDialogOpen(true); }}
          onEditMember={(m) => { setEditingMember(m); setMemberDialogOpen(true); }}
          onDeletedMember={refresh}
        />
      )}
      {tab === 'cases' && (
        <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-12 text-center">
          <Briefcase className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <div className="text-white font-semibold">Casos activos del bufete</div>
          <div className="text-text-2 text-sm mt-1">Disponible cuando se construya el módulo de Casos (Phase 2).</div>
        </div>
      )}
      {tab === 'notes' && <NotesTab firm={firm} onSaved={refresh} />}

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
          ? 'text-text-muted/40 cursor-not-allowed'
          : active
            ? 'text-white'
            : 'text-text-2 hover:text-white'
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
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Información de contacto">
          <InfoRow label="Email principal" value={<a href={`mailto:${firm.email}`} className="text-cyan hover:text-white">{firm.email}</a>} />
          <InfoRow label="Teléfono"        value={firm.phone ?? <Empty />} mono />
          <InfoRow label="Dirección"       value={firm.address ?? <Empty />} />
          <InfoRow label="Ciudad / Estado" value={[firm.city, firm.state].filter(Boolean).join(', ') || <Empty />} />
        </Card>

        <Card title="Configuración operativa">
          <InfoRow label="Estado"           value={<StatusPill status={firm.status} />} />
          <InfoRow label="Velocidad pago"   value={<PaymentSpeedPill speed={firm.paymentSpeed} />} />
          <InfoRow label="Caseflow flags"   value={
            firm.caseflowFlags.length === 0 ? <Empty /> : (
              <div className="flex flex-wrap gap-1">
                {firm.caseflowFlags.map((f) => (
                  <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">{f}</span>
                ))}
              </div>
            )
          } />
          <InfoRow label="Registrado"       value={formatDate(firm.createdAt)} mono />
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Miembros del bufete">
          <div className="text-center py-4">
            <div className="text-4xl font-bold text-white">{members.length}</div>
            <div className="text-text-muted text-xs uppercase tracking-wider mt-1">Total miembros</div>
          </div>
          <div className="space-y-2 pt-3 border-t border-border">
            <SummaryStatRow label="Attorneys"     count={attorneys.length} />
            <SummaryStatRow label="Case Managers" count={caseManagers.length} />
            <SummaryStatRow label="Paralegals + Otros" count={members.length - attorneys.length - caseManagers.length} />
          </div>
        </Card>

        <Card title="Métricas PI (Phase 2)">
          <div className="text-text-muted text-xs italic text-center py-6">
            Casos activos · Settlements · Recovery rate · Avg days
            <br /><br />
            Disponible cuando exista módulo de Casos.
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
  others,
  onAddMember,
  onEditMember,
  onDeletedMember,
}: {
  firm: Firm;
  attorneys: Member[];
  caseManagers: Member[];
  paralegals: Member[];
  others: Member[];
  onAddMember: () => void;
  onEditMember: (m: Member) => void;
  onDeletedMember: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-text-2 text-sm">
          {attorneys.length + caseManagers.length + paralegals.length + others.length} miembros
        </div>
        <Button onClick={onAddMember}>
          <Plus className="w-4 h-4 mr-1" /> Agregar miembro
        </Button>
      </div>

      <MemberGroup title="Attorneys" icon={Briefcase} members={attorneys} onEdit={onEditMember} onDeleted={onDeletedMember} />
      <MemberGroup title="Case Managers" icon={UserCircle} members={caseManagers} onEdit={onEditMember} onDeleted={onDeletedMember} />
      <MemberGroup title="Paralegals" icon={UserCircle} members={paralegals} onEdit={onEditMember} onDeleted={onDeletedMember} />
      <MemberGroup title="Otros" icon={UserCircle} members={others} onEdit={onEditMember} onDeleted={onDeletedMember} />

      {attorneys.length + caseManagers.length + paralegals.length + others.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-8 text-center text-text-muted text-sm">
          Sin miembros aún. Agregá el primero arriba.
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
        <Icon className="w-4 h-4 text-brand" />
        <span className="text-white font-semibold text-sm">{title}</span>
        <span className="text-text-muted text-xs font-mono">· {members.length}</span>
      </div>
      <div className="divide-y divide-border/30">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} onEdit={onEdit} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  );
}

function MemberRow({ member, onEdit, onDeleted }: { member: Member; onEdit: (m: Member) => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar a ${member.firstName} ${member.lastName}?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/lawyers/members?id=${member.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const fullName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || '(sin nombre)';

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
        {(member.firstName?.[0] ?? '?') + (member.lastName?.[0] ?? '')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold text-sm">{fullName}</div>
        <div className="flex items-center gap-x-3 gap-y-0.5 text-xs text-text-2 flex-wrap mt-0.5">
          <span className="flex items-center gap-1">
            <Mail className="w-3 h-3 text-text-muted" />
            <a href={`mailto:${member.email}`} className="hover:text-white truncate max-w-[200px]" title={member.email}>{member.email}</a>
          </span>
          {member.phone && (
            <span className="flex items-center gap-1 font-mono">
              <Phone className="w-3 h-3 text-text-muted" />
              {member.phone}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onEdit(member)} className="w-8 h-8 rounded-md text-text-muted hover:text-white hover:bg-white/5" title="Editar">
          <Pencil className="w-3.5 h-3.5 mx-auto" />
        </button>
        <button onClick={handleDelete} disabled={deleting} className="w-8 h-8 rounded-md text-text-muted hover:text-rose hover:bg-rose/10 disabled:opacity-50" title="Eliminar">
          <Trash2 className="w-3.5 h-3.5 mx-auto" />
        </button>
      </div>
    </div>
  );
}

// ─── Notes Tab ──────────────────────────────────────────────────────────────

function NotesTab({ firm, onSaved }: { firm: Firm; onSaved: () => void }) {
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
      <div className="text-text-2 text-sm">
        Notas privadas del bufete (visibles solo para Super Admin y Edson). Útiles para registrar contexto operativo: paga lento, prefiere email, etc.
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full bg-bg-2 border border-border rounded-md px-4 py-3 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[200px]"
        placeholder="Escribí las notas internas aquí..."
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {saved && <span className="text-emerald">✓ Guardado</span>}
        </span>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar notas'}
        </Button>
      </div>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-bg-2/50">
        <div className="text-white font-semibold text-sm">{title}</div>
      </div>
      <div className="p-5 space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-center py-2 border-b border-border/20 last:border-0">
      <div className="text-text-muted text-xs uppercase tracking-wider font-semibold">{label}</div>
      <div className={`col-span-2 text-sm text-white ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function SummaryStatRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-2">{label}</span>
      <span className="text-white font-mono font-semibold">{count}</span>
    </div>
  );
}

function Empty() {
  return <span className="text-text-muted italic">—</span>;
}

function StatusPill({ status }: { status: string }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald/15 text-emerald border border-emerald/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald" /> Activo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-text-muted border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted" /> Inactivo
    </span>
  );
}

function PaymentSpeedPill({ speed }: { speed: string | null }) {
  if (!speed || speed === 'UNKNOWN') return <span className="text-text-muted text-[10px] italic">Sin data</span>;
  const styles: Record<string, string> = {
    FAST:    'bg-emerald/15 text-emerald border-emerald/30',
    AVERAGE: 'bg-cyan/15 text-cyan border-cyan/30',
    SLOW:    'bg-amber/15 text-amber border-amber/30',
  };
  const labels: Record<string, string> = { FAST: '⚡ Rápido', AVERAGE: '~ Promedio', SLOW: '⚠ Lento' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles[speed]}`}>
      {labels[speed]}
    </span>
  );
}

function firmInitials(name: string): string {
  return name.split(/[\s&]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('es-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Member Dialog ──────────────────────────────────────────────────────────

const MEMBER_ROLES = [
  { value: 'ATTORNEY',     label: 'Attorney (Abogado)' },
  { value: 'CASE_MANAGER', label: 'Case Manager' },
  { value: 'PARALEGAL',    label: 'Paralegal' },
  { value: 'OTHER',        label: 'Otro' },
];

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
  const [firstName, setFirstName] = useState(editing?.firstName ?? '');
  const [lastName, setLastName]   = useState(editing?.lastName ?? '');
  const [email, setEmail]         = useState(editing?.email ?? '');
  const [phone, setPhone]         = useState(editing?.phone ?? '');
  const [memberRole, setMemberRole] = useState(editing?.memberRole ?? 'ATTORNEY');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const editingId = editing?.id ?? null;
  const [lastEditingId, setLastEditingId] = useState<string | null>(null);
  if (open && editingId !== lastEditingId) {
    setFirstName(editing?.firstName ?? '');
    setLastName(editing?.lastName ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setMemberRole(editing?.memberRole ?? 'ATTORNEY');
    setError(null);
    setLastEditingId(editingId);
  }

  const handleSave = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError('Nombre y apellido son obligatorios');
    if (!email.trim()) return setError('Email es obligatorio');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/lawyers/members', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          parentFirmId: firmId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          memberRole,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar miembro` : 'Agregar miembro al bufete'}</DialogTitle>
          <DialogDescription>Attorney, Case Manager o Paralegal del bufete.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">Nombre <span className="text-rose">*</span></Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="lastName">Apellido <span className="text-rose">*</span></Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">Email <span className="text-rose">*</span></Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} placeholder="+1-801-..." />
            </div>
          </div>

          <div>
            <Label htmlFor="memberRole">Rol</Label>
            <select
              id="memberRole"
              value={memberRole ?? 'ATTORNEY'}
              onChange={(e) => setMemberRole(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
            >
              {MEMBER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2">
              ⚠ {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar miembro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
