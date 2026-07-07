'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2, Stethoscope, Scale, ShieldCheck, DollarSign,
  FileText, Plus, Pencil, Trash2, ArrowRight, AlertCircle,
} from 'lucide-react';
import {
  Button, Input, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, Label,
} from '@precision/ui';
import { PageHeader, IconAction, EmptyState } from '@/components/ui-phoenix';

interface Clinic {
  id: string;
  name: string;
  address: string;
  phone: string;
  appointmentCount: number;
}

interface Props {
  initialClinics: Clinic[];
}

type Tab = 'clinicas' | 'especialidades' | 'bufetes' | 'aseguradoras' | 'servicios' | 'diagnosticos';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'clinicas',       label: 'Clínicas',       icon: Building2   },
  { id: 'especialidades', label: 'Especialidades',  icon: Stethoscope },
  { id: 'bufetes',        label: 'Bufetes',         icon: Scale       },
  { id: 'aseguradoras',   label: 'Aseguradoras',    icon: ShieldCheck },
  { id: 'servicios',      label: 'Servicios CPT',   icon: DollarSign  },
  { id: 'diagnosticos',   label: 'Diagnósticos',    icon: FileText    },
];

const CATALOG_LINKS: Record<Exclude<Tab, 'clinicas'>, { href: string; desc: string }> = {
  especialidades: { href: '/admin/specialties', desc: 'Service lines, tipos de caso, flujos de trabajo y CPT sugeridos.' },
  bufetes:        { href: '/admin/lawyers',     desc: 'Bufetes de abogados, miembros y velocidad de pago.' },
  aseguradoras:   { href: '/admin/insurances',  desc: 'Aseguradoras, códigos cortos y configuración de cobros.' },
  servicios:      { href: '/admin/services',    desc: 'Códigos CPT, tarifas y servicios favoritos.' },
  diagnosticos:   { href: '/admin/diagnoses',   desc: 'Códigos ICD-10 y diagnósticos frecuentes.' },
};

export function SettingsClient({ initialClinics }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('clinicas');
  const [clinics, setClinics]     = useState<Clinic[]>(initialClinics);

  // ── Dialog state ──────────────────────────────────────────────────────
  const [createOpen, setCreateOpen]   = useState(false);
  const [editing, setEditing]         = useState<Clinic | null>(null);
  const [deleting, setDeleting]       = useState<Clinic | null>(null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────
  const [formName, setFormName]       = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone]     = useState('');

  function openCreate() {
    setFormName(''); setFormAddress(''); setFormPhone('');
    setError(null); setCreateOpen(true);
  }

  function openEdit(c: Clinic) {
    setFormName(c.name); setFormAddress(c.address); setFormPhone(c.phone);
    setError(null); setEditing(c);
  }

  async function handleCreate() {
    setError(null); setSaving(true);
    try {
      const res = await fetch('/api/admin/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), address: formAddress.trim() || undefined, phone: formPhone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      setClinics((prev) => [...prev, { ...data.clinic, appointmentCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al crear'); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!editing) return;
    setError(null); setSaving(true);
    try {
      const res = await fetch(`/api/admin/clinics/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), address: formAddress.trim() || null, phone: formPhone.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      setClinics((prev) => prev.map((c) => c.id === editing.id ? { ...c, name: formName.trim(), address: formAddress.trim(), phone: formPhone.trim() } : c));
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al guardar'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clinics/${deleting.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      setClinics((prev) => prev.filter((c) => c.id !== deleting.id));
      setDeleting(null);
    } catch (e) { alert(e instanceof Error ? e.message : 'Error al eliminar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Configuración"
        subtitle="Clínicas, catálogos y configuración global del sistema"
      />

      {/* ── Tab bar ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                active
                  ? 'bg-gradient-brand text-white shadow-glow'
                  : 'text-text-2 hover:text-text-1 hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Clínicas tab ── */}
      {activeTab === 'clinicas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-text-1 font-semibold text-sm">{clinics.length} clínica{clinics.length !== 1 ? 's' : ''} registrada{clinics.length !== 1 ? 's' : ''}</p>
              <p className="text-text-muted text-[11px]">Ubicaciones donde se atiende a los pacientes</p>
            </div>
            <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Agregar clínica
            </Button>
          </div>

          {clinics.length === 0 ? (
            <EmptyState.Rich icon={Building2} title="Sin clínicas" subtitle="Agrega la primera ubicación clínica." />
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="sm:hidden space-y-2">
                {clinics.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border bg-bg-1 p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-text-1 font-semibold text-sm truncate">{c.name}</p>
                      {c.address && <p className="text-text-muted text-[11px] mt-0.5 truncate">{c.address}</p>}
                      {c.phone && <p className="text-text-muted text-[11px] font-mono">{c.phone}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <IconAction icon={Pencil} label="Editar" onClick={() => openEdit(c)} />
                      <IconAction icon={Trash2} label="Eliminar" tone="danger" onClick={() => setDeleting(c)} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg-2/40">
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Nombre</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Dirección</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Teléfono</th>
                      <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Citas</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {clinics.map((c) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-semibold text-text-1">{c.name}</td>
                        <td className="px-4 py-3 text-text-2 text-[12.5px]">{c.address || <span className="text-text-muted italic">—</span>}</td>
                        <td className="px-4 py-3 text-text-2 font-mono text-[12.5px]">{c.phone || <span className="text-text-muted italic">—</span>}</td>
                        <td className="px-4 py-3 text-text-muted text-[12.5px]">{c.appointmentCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <IconAction icon={Pencil} label="Editar" onClick={() => openEdit(c)} />
                            <IconAction icon={Trash2} label="Eliminar" tone="danger" onClick={() => setDeleting(c)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Other catalog tabs ── */}
      {activeTab !== 'clinicas' && (
        <div className="max-w-lg">
          {(() => {
            const info = CATALOG_LINKS[activeTab as Exclude<Tab, 'clinicas'>];
            const tab  = TABS.find((t) => t.id === activeTab)!;
            const Icon = tab.icon;
            return (
              <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-brand" />
                  </div>
                  <div>
                    <p className="text-text-1 font-semibold text-sm">{tab.label}</p>
                    <p className="text-text-muted text-[11px] mt-0.5">{info.desc}</p>
                  </div>
                </div>
                <Link href={info.href}>
                  <Button className="flex items-center gap-2 w-full sm:w-auto">
                    Gestionar {tab.label} <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand" /> Nueva clínica
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nombre <span className="text-rose">*</span></Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Murray, Provo, West Valley..." autoFocus />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(801) 000-0000" />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="275 E 6100 S, Murray, UT 84107" />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-rose/30 bg-rose/5 px-3 py-2 text-[11px] text-rose">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleCreate} disabled={!formName.trim() || saving} className="w-full sm:w-auto">
              {saving ? 'Guardando…' : 'Crear clínica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-brand" /> Editar clínica
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nombre <span className="text-rose">*</span></Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(801) 000-0000" />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-rose/30 bg-rose/5 px-3 py-2 text-[11px] text-rose">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleEdit} disabled={!formName.trim() || saving} className="w-full sm:w-auto">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ── */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose">
              <Trash2 className="w-4 h-4" /> Eliminar clínica
            </DialogTitle>
          </DialogHeader>
          <p className="text-text-2 text-sm py-2">
            ¿Eliminar <strong>{deleting?.name}</strong>? Esta acción no se puede deshacer.
            {deleting && deleting.appointmentCount > 0 && (
              <span className="block mt-2 text-amber text-[11px]">
                ⚠ Esta clínica tiene {deleting.appointmentCount} cita(s) — no se podrá eliminar.
              </span>
            )}
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} className="w-full sm:w-auto">Cancelar</Button>
            <Button
              onClick={handleDelete}
              disabled={saving || (deleting?.appointmentCount ?? 0) > 0}
              className="w-full sm:w-auto bg-rose hover:bg-rose/90 text-white"
            >
              {saving ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
