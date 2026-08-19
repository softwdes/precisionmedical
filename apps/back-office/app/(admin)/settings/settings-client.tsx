'use client';

import { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useTranslations } from 'next-intl';
import {
  Building2, Stethoscope, Scale, ShieldCheck, DollarSign,
  FileText, Plus, Pencil, Trash2, AlertCircle, Shield, UserRound, Headset, Rocket,
} from 'lucide-react';
import {
  Button, Input, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, Label,
} from '@precision/ui';
import { PageHeader, IconAction, EmptyState } from '@/components/ui-phoenix';
import { US_STATES, CITIES_BY_STATE, CITY_ZIP } from '@/lib/us-locations';
import { SpecialtiesClient } from '@/app/(admin)/admin/specialties/specialties-client';
import { LawyersClient }     from '@/app/(admin)/admin/lawyers/lawyers-client';
import { InsurancesClient }  from '@/app/(admin)/admin/insurances/insurances-client';
import { AdjustersClient }   from '@/app/(admin)/admin/adjusters/adjusters-client';
import { ServicesClient }    from '@/app/(admin)/admin/services/services-client';
import { DiagnosesClient }   from '@/app/(admin)/admin/diagnoses/diagnoses-client';
import { AuditLogsClient }  from '@/app/(admin)/audit-logs/audit-logs-client';
import { ReleasesClient }  from '@/app/(admin)/settings/releases/releases-client';
import { ProvidersClient }  from '@/app/(admin)/admin/providers/providers-client';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Clinic {
  id: string; name: string; address: string; phone: string; cellPhone: string;
  email: string; zipCode: string; state: string; city: string; color: string;
  appointmentCount: number;
}

// Nota: el tab 'plantillas' se retiró — las plantillas clínicas se gestionan
// en el portal del doctor (/doctor/templates), con editor rich text y diagnósticos.
type Tab = 'clinicas' | 'especialidades' | 'doctores' | 'bufetes' | 'aseguradoras' | 'ajustadores' | 'servicios' | 'diagnosticos' | 'auditlog' | 'releases';

// La etiqueta sale de `phoenix.settings.tabs.<id>` — antes era texto fijo en
// español y no cambiaba al pasar la app a inglés.
const TABS: Array<{ id: Tab; icon: React.ElementType }> = [
  { id: 'clinicas',       icon: Building2   },
  { id: 'especialidades', icon: Stethoscope },
  { id: 'doctores',       icon: UserRound   },
  { id: 'bufetes',        icon: Scale       },
  { id: 'aseguradoras',   icon: ShieldCheck },
  { id: 'ajustadores',    icon: Headset     },
  { id: 'servicios',      icon: DollarSign  },
  { id: 'diagnosticos',   icon: FileText    },
  { id: 'auditlog',       icon: Shield      },
  // Notas de release: es un registro que se lee y se cura, mas parecido al
  // audit log que a los catalogos de al lado.
  { id: 'releases',       icon: Rocket      },
];

interface Props {
  initialClinics:     Clinic[];
  initialSpecialties: React.ComponentProps<typeof SpecialtiesClient>['specialties'];
  specialtyStats:     React.ComponentProps<typeof SpecialtiesClient>['stats'];
  initialFirms:       React.ComponentProps<typeof LawyersClient>['firms'];
  firmStats:          React.ComponentProps<typeof LawyersClient>['stats'];
  initialInsurances:  React.ComponentProps<typeof InsurancesClient>['insurances'];
  insuranceStats:     React.ComponentProps<typeof InsurancesClient>['stats'];
  initialAdjusters:   React.ComponentProps<typeof AdjustersClient>['adjusters'];
  adjusterCarriers:   React.ComponentProps<typeof AdjustersClient>['carriers'];
  adjusterStats:      React.ComponentProps<typeof AdjustersClient>['stats'];
  initialServices:    React.ComponentProps<typeof ServicesClient>['services'];
  serviceStats:       React.ComponentProps<typeof ServicesClient>['stats'];
  diagnosisStats:     React.ComponentProps<typeof DiagnosesClient>['stats'];
  diagnosisUserId?:   string;
  initialProviders:   React.ComponentProps<typeof ProvidersClient>['providers'];
  providerStats:      React.ComponentProps<typeof ProvidersClient>['stats'];
  auditKpis:          React.ComponentProps<typeof AuditLogsClient>['kpis'];
  initialAuditLogs:   React.ComponentProps<typeof AuditLogsClient>['initialLogs'];
}

// ── Color palette ──────────────────────────────────────────────────────────────
const COLOR_SWATCHES = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#F59E0B', '#CA8A04', '#16A34A', '#10B981',
  '#06B6D4', '#0EA5E9', '#1D4ED8', '#DC2626',
  '#94A3B8', '#64748B', '#C2410C', '#1E293B',
];

// ── Empty form ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: '', phone: '', cellPhone: '', email: '',
  address: '', zipCode: '', state: 'UT', city: '', color: '#6366F1',
};

export function SettingsClient({
  initialClinics,
  initialSpecialties, specialtyStats,
  initialFirms,       firmStats,
  initialInsurances,  insuranceStats,
  initialAdjusters,   adjusterCarriers, adjusterStats,
  initialServices,    serviceStats,
  diagnosisStats,     diagnosisUserId,
  initialProviders,   providerStats,
  auditKpis,          initialAuditLogs,
}: Props) {
  const ts = useTranslations('phoenix.settings');
  const [activeTab, setActiveTab] = useState<Tab>('clinicas');
  const [clinics, setClinics]     = useState<Clinic[]>(initialClinics);

  // ── Color picker toggle ────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [pickerOpen]);

  // ── Dialog state ───────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]       = useState<Clinic | null>(null);
  const [deleting, setDeleting]     = useState<Clinic | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [k]: val };
      if (k === 'state') { next.city = ''; next.zipCode = ''; }
      if (k === 'city' && val) {
        const zip = CITY_ZIP[val];
        if (zip) next.zipCode = zip;
      }
      return next;
    });
  };

  const cities = form.state ? (CITIES_BY_STATE[form.state] ?? []) : [];

  function openCreate() { setForm(EMPTY_FORM); setError(null); setPickerOpen(false); setCreateOpen(true); }
  function openEdit(c: Clinic) {
    setForm({ name: c.name, phone: c.phone, cellPhone: c.cellPhone, email: c.email,
              address: c.address, zipCode: c.zipCode,
              state: US_STATES.find(s => s.name === c.state || s.code === c.state)?.code ?? c.state,
              city: c.city, color: c.color || '#6366F1' });
    setError(null); setEditing(c);
  }

  async function handleCreate() {
    if (!form.name.trim()) return setError('El nombre de la clínica es requerido.');
    if (!form.state)       return setError('Selecciona un estado.');
    if (!form.city)        return setError('Selecciona una ciudad.');
    setError(null); setSaving(true);
    try {
      const res = await fetch('/api/admin/clinics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, name: form.name.trim() }),
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
    if (!form.state) return setError('Selecciona un estado.');
    if (!form.city)  return setError('Selecciona una ciudad.');
    setError(null); setSaving(true);
    try {
      const res = await fetch(`/api/admin/clinics/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, name: form.name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      setClinics((prev) => prev.map((c) => c.id === editing.id ? { ...c, ...form } : c));
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
    <div className="space-y-4 sm:space-y-6">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <PageHeader title={ts('title')} subtitle={ts('subtitle')} />

        {/* ── Tab bar ── */}
        <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar border-b border-border mt-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                  active ? 'bg-gradient-brand text-white shadow-glow' : 'text-text-2 hover:text-text-1 hover:bg-white/5'
                }`}>
                <Icon className="w-3.5 h-3.5" />{ts(`tabs.${tab.id}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Clínicas tab ── */}
      {activeTab === 'clinicas' && (
        <div className="px-4 sm:px-6 pb-6 space-y-4">
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
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-3 h-3 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: c.color || '#6366F1' }} />
                      <div className="min-w-0">
                        <p className="text-text-1 font-semibold text-sm truncate">{c.name}</p>
                        {c.city && <p className="text-text-muted text-[11px]">{c.city}{c.state ? `, ${c.state}` : ''}</p>}
                        {c.phone && <p className="text-text-muted text-[11px] font-mono">{c.phone}</p>}
                        {c.email && <p className="text-text-muted text-[11px] truncate">{c.email}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <IconAction icon={Pencil} label="Editar" onClick={() => openEdit(c)} />
                      <IconAction icon={Trash2} label="Eliminar" variant="danger" onClick={() => setDeleting(c)} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="border-b border-border bg-bg-2/40">
                      {['Color','Nombre','Teléfono','Celular','Correo','Estado','Ciudad','Código postal','Acciones'].map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clinics.map((c) => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-white/[0.02]">
                        <td className="px-3 py-3">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color || '#6366F1' }} />
                        </td>
                        <td className="px-3 py-3 font-semibold text-text-1 whitespace-nowrap">{c.name}</td>
                        <td className="px-3 py-3 text-text-2 font-mono text-[12px]">{c.phone || <span className="text-text-muted italic">—</span>}</td>
                        <td className="px-3 py-3 text-text-2 font-mono text-[12px]">{c.cellPhone || <span className="text-text-muted italic">—</span>}</td>
                        <td className="px-3 py-3 text-text-2 text-[12px] max-w-[180px] truncate">{c.email || <span className="text-text-muted italic">—</span>}</td>
                        <td className="px-3 py-3 text-text-2 text-[12px]">{c.state || <span className="text-text-muted italic">—</span>}</td>
                        <td className="px-3 py-3 text-text-2 text-[12px]">{c.city || <span className="text-text-muted italic">—</span>}</td>
                        <td className="px-3 py-3 text-text-muted text-[12px] font-mono">{c.zipCode || <span className="italic">—</span>}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <IconAction icon={Pencil} label="Editar" onClick={() => openEdit(c)} />
                            <IconAction icon={Trash2} label="Eliminar" variant="danger" onClick={() => setDeleting(c)} />
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

      {/* ── Catalog tabs ── */}
      {activeTab === 'especialidades' && <SpecialtiesClient specialties={initialSpecialties} stats={specialtyStats} />}
      {activeTab === 'doctores'       && <ProvidersClient providers={initialProviders} stats={providerStats} />}
      {activeTab === 'bufetes'        && <LawyersClient firms={initialFirms} stats={firmStats} />}
      {activeTab === 'aseguradoras'   && <InsurancesClient insurances={initialInsurances} stats={insuranceStats} />}
      {activeTab === 'ajustadores'    && <AdjustersClient adjusters={initialAdjusters} carriers={adjusterCarriers} stats={adjusterStats} />}
      {activeTab === 'servicios'      && <ServicesClient services={initialServices} stats={serviceStats} />}
      {activeTab === 'diagnosticos'   && <DiagnosesClient stats={diagnosisStats} userId={diagnosisUserId} />}
      {activeTab === 'auditlog'       && <AuditLogsClient kpis={auditKpis} initialLogs={initialAuditLogs} />}
      {activeTab === 'releases'       && <ReleasesClient />}

      {/* ── Clinic form dialog (shared for create + edit) ── */}
      {[
        { open: createOpen, onClose: () => setCreateOpen(false), title: 'Nueva clínica', onSave: handleCreate, saveLabel: 'Crear clínica' },
        { open: !!editing,  onClose: () => setEditing(null),     title: 'Editar clínica', onSave: handleEdit,  saveLabel: 'Guardar cambios' },
      ].map(({ open, onClose, title, onSave, saveLabel }) => (
        <Dialog key={title} open={open} onOpenChange={(o) => !o && onClose()}>
          <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-brand-text" /> {title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Nombre */}
              <div>
                <Label>Nombre <span className="text-rose">*</span></Label>
                <Input value={form.name} onChange={set('name')} placeholder="Murray, Provo, West Valley..." autoFocus />
              </div>

              {/* Color swatches */}
              <div>
                <Label>Color</Label>
                <div className="mt-1.5 flex flex-wrap gap-2 items-center">
                  {COLOR_SWATCHES.map((hex) => (
                    <button key={hex} type="button" onClick={() => { setForm((p) => ({ ...p, color: hex })); setPickerOpen(false); }}
                      title={hex}
                      className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: hex,
                        borderColor: form.color === hex ? 'white' : 'transparent',
                        boxShadow: form.color === hex ? `0 0 0 1px ${hex}` : 'none',
                      }} />
                  ))}
                  {/* Custom color toggle */}
                  <div className="relative" ref={pickerRef}>
                    <button type="button" onClick={() => setPickerOpen((o) => !o)}
                      title="Color personalizado"
                      className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center bg-bg-2 border-border hover:border-text-muted"
                      style={!COLOR_SWATCHES.includes(form.color) ? {
                        borderColor: 'white',
                        boxShadow: `0 0 0 1px ${form.color}`,
                        backgroundColor: form.color,
                      } : {}}>
                      {COLOR_SWATCHES.includes(form.color) && (
                        <span className="text-text-muted text-[14px] leading-none">+</span>
                      )}
                    </button>
                    {pickerOpen && (
                      <div className="absolute left-0 top-9 z-50 rounded-lg border border-border bg-bg-1 p-3 shadow-xl">
                        <HexColorPicker
                          color={form.color}
                          onChange={(c) => setForm((p) => ({ ...p, color: c }))}
                          style={{ width: '180px', height: '140px' }}
                        />
                        <p className="mt-2 text-center text-text-muted text-[11px] font-mono">{form.color}</p>
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-text-muted text-[11px] font-mono">{form.color}</p>
              </div>

              {/* Teléfono + Celular */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Teléfono</Label>
                  <Input value={form.phone} onChange={set('phone')} placeholder="(801) 000-0000" />
                </div>
                <div>
                  <Label>Celular</Label>
                  <Input value={form.cellPhone} onChange={set('cellPhone')} placeholder="(801) 000-0000" />
                </div>
              </div>

              {/* Email */}
              <div>
                <Label>Correo electrónico</Label>
                <Input type="email" value={form.email} onChange={set('email')} placeholder="info@clinica.com" />
              </div>

              {/* Estado + Ciudad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Estado</Label>
                  <select value={form.state} onChange={set('state')}
                    className="w-full rounded-md border border-border bg-bg-1 px-3 py-2 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-brand">
                    <option value="">Seleccionar estado</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Ciudad</Label>
                  <select value={form.city} onChange={set('city')} disabled={!form.state}
                    className="w-full rounded-md border border-border bg-bg-1 px-3 py-2 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-40">
                    <option value="">Seleccionar ciudad</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Código postal + Dirección */}
              <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3">
                <div>
                  <Label>Código postal</Label>
                  <Input value={form.zipCode} onChange={set('zipCode')} placeholder="84107" maxLength={10} />
                </div>
                <div>
                  <Label>Dirección</Label>
                  <Input value={form.address} onChange={set('address')} placeholder="275 E 6100 S Suite 100" />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-rose/30 bg-rose/5 px-3 py-2 text-[11px] text-rose">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}
                </div>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancelar</Button>
              <Button onClick={onSave} disabled={!form.name.trim() || saving} className="w-full sm:w-auto">
                {saving ? 'Guardando…' : saveLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}

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
            <Button onClick={handleDelete} disabled={saving || (deleting?.appointmentCount ?? 0) > 0}
              className="w-full sm:w-auto bg-rose hover:bg-rose/90 text-white">
              {saving ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
