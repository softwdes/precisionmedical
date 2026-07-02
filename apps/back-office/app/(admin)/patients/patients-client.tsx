'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2, Users, Phone, Mail, Calendar, Car, Shield, UserCheck, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Briefcase, QrCode, CalendarDays, Download, Copy, Check, Stethoscope } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@precision/ui';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';
import { PatientEditDialog, type EditablePatient } from './patient-edit-dialog';
import { PatientCreateDialog } from './patient-create-dialog';
import { CaseWizardDialog } from '@/components/cases/case-wizard-dialog';
import { QuickRegisterDialog } from '@/components/patients/quick-register-dialog';
import QRCode from 'qrcode';

function fmtLocalDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const iso = typeof d === 'string' ? d : (d as Date).toISOString();
  const [y, mo, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Case action types ──────────────────────────────────────────────────────
interface CaseRow {
  id: string;
  caseCode: string;
  status: string;
  accidentType: string | null;
}

interface AppointmentItem {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  type: string;
  status: string;
  notes: string | null;
  checkedInAt: string | null;
  attendanceSignedAt: string | null;
  clinic: { id: string; name: string };
  provider: { id: string; firstName: string; lastName: string; specialty: string | null } | null;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver' });
}

const APPT_STATUS_COLOR: Record<string, string> = {
  SCHEDULED:  'bg-brand/10 text-brand border-brand/20',
  CONFIRMED:  'bg-cyan/10 text-cyan border-cyan/20',
  CHECKED_IN: 'bg-emerald/10 text-emerald border-emerald/20',
  COMPLETED:  'bg-emerald/10 text-emerald border-emerald/20',
  CANCELLED:  'bg-rose/10 text-rose border-rose/20',
  NO_SHOW:    'bg-amber/10 text-amber border-amber/20',
};

// ── Law firm select (same as CaseWizardDialog) ────────────────────────────
interface LawFirmOption { id: string; label: string; }

function LawFirmSelectInline({ firmId, onChange }: {
  firmId: string | null;
  onChange: (label: string, id: string | null) => void;
}) {
  const [firms, setFirms] = useState<LawFirmOption[]>([]);
  useEffect(() => {
    fetch('/api/admin/lawyers/autocomplete').then(r => r.json()).then(j => setFirms(j.results ?? [])).catch(() => {});
  }, []);
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Firma de abogados</label>
      <select value={firmId ?? ''} onChange={e => {
        const sel = firms.find(f => f.id === e.target.value);
        onChange(sel?.label ?? '', sel?.id ?? null);
      }} className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 outline-none focus:border-brand appearance-none">
        <option value="">Nombre de la firma de abogados que refirió el caso médico...</option>
        {firms.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
    </div>
  );
}

// ── Case View Dialog ───────────────────────────────────────────────────────
interface CaseDetail {
  id: string; caseCode: string; caseType: string; status: string;
  accidentType: string | null; accidentDate: string | null;
  accidentLocation: string | null; accidentNotes: string | null;
  consentsData: Record<string, unknown> | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string };
  lawFirm: { id: string; firmName: string } | null;
  attorney: { id: string; firstName: string; lastName: string } | null;
  primaryInsurance: { id: string; name: string } | null;
  specialty: { id: string; name: string } | null;
}

const CASE_STATUS_LABEL: Record<string, string> = {
  NEW_REFERRAL:     'Nuevo referido', INTAKE_PENDING: 'Intake pendiente',
  INTAKE_COMPLETED: 'Intake completo', CONFIRMED: 'Confirmado',
  ACTIVE: 'Activo', MMI: 'MMI', CLOSED: 'Cerrado',
  SETTLED: 'Liquidado', ARCHIVED: 'Archivado', CANCELLED: 'Cancelado',
};
const CASE_STATUS_COLOR: Record<string, string> = {
  NEW_REFERRAL:     'bg-brand/10 text-brand border-brand/20',
  INTAKE_PENDING:   'bg-amber/10 text-amber border-amber/20',
  INTAKE_COMPLETED: 'bg-cyan/10 text-cyan border-cyan/20',
  CONFIRMED:        'bg-cyan/10 text-cyan border-cyan/20',
  ACTIVE:           'bg-emerald/10 text-emerald border-emerald/20',
  MMI:              'bg-violet/10 text-violet border-violet/20',
  CLOSED:           'bg-text-muted/10 text-text-muted border-text-muted/20',
  SETTLED:          'bg-emerald/10 text-emerald border-emerald/20',
  ARCHIVED:         'bg-text-muted/10 text-text-muted border-text-muted/20',
  CANCELLED:        'bg-rose/10 text-rose border-rose/20',
};

function fmtIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CaseViewDialog({ caseId, open, onClose, onEdit }: {
  caseId: string; open: boolean; onClose: () => void; onEdit: () => void;
}) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}`)
      .then(r => r.json())
      .then(j => setDetail(j.case ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  const cd = detail?.consentsData as Record<string, string> | null;
  const lawFirmName    = detail?.lawFirm?.firmName ?? (cd?.lawFirm as string | undefined) ?? null;
  const chiropractor   = (cd?.chiropractor as string | undefined) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-brand" />
            {detail?.caseCode ?? 'Caso'}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {detail?.patient ? `${detail.patient.firstName} ${detail.patient.lastName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-2">
            {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-md bg-bg-2 animate-pulse" />)}
          </div>
        )}

        {!loading && detail && (
          <div className="space-y-4">
            {/* Status + type */}
            <div className="flex items-center gap-2 flex-wrap">
              <TagPill label={CASE_STATUS_LABEL[detail.status] ?? detail.status} colorClass={CASE_STATUS_COLOR[detail.status] ?? 'bg-bg-2 text-text-2 border-border'} />
              <span className="text-[11px] text-text-muted border border-border rounded px-1.5 py-0.5">{detail.caseType}</span>
              {detail.specialty && <span className="text-[11px] text-text-muted">{detail.specialty.name}</span>}
            </div>

            {/* Información del caso */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Información del caso</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-[12.5px]">
                <div className="flex justify-between"><span className="text-text-muted">Tipo de caso</span><span className="text-text-1 font-medium">{detail.caseType}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Estado</span><span className="text-text-1">{CASE_STATUS_LABEL[detail.status] ?? detail.status}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Fecha de creación</span><span className="text-text-1">{fmtIsoDate(detail.createdAt)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Fecha del accidente</span><span className="text-text-1">{fmtIsoDate(detail.accidentDate)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Abogado representante</span><span className="text-text-1">{detail.attorney ? `${detail.attorney.firstName} ${detail.attorney.lastName}` : 'No especificado'}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Quiropráctico tratante</span><span className="text-text-1">{chiropractor ?? 'No especificado'}</span></div>
              </div>
              {detail.accidentNotes && (
                <div className="pt-1 border-t border-border/40">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Descripción del caso</p>
                  <p className="text-[12.5px] text-text-2">{detail.accidentNotes}</p>
                </div>
              )}
            </div>

            {/* Firma de abogados */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Firma de abogados</p>
              </div>
              {lawFirmName ? (
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5">
                  <p className="text-[12.5px] text-text-1 font-medium">{lawFirmName}</p>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted italic">No hay firma de abogados</p>
              )}
            </div>

            {/* Información de seguros */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Información de seguros</p>
              {detail.primaryInsurance ? (
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5">
                  <p className="text-[12.5px] text-text-1 font-medium">{detail.primaryInsurance.name}</p>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted italic">No hay seguros activos · Agrega un seguro para comenzar</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Cerrar</Button>
          <Button className="w-full sm:w-auto" onClick={() => { onClose(); onEdit(); }}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar caso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Case Edit Dialog — replica wizard step 1 ──────────────────────────────
function isoToDisp(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}
function dispToIso(disp: string): string {
  const c = disp.replace(/\D/g, '');
  if (c.length < 8) return '';
  return `${c.slice(4, 8)}-${c.slice(0, 2)}-${c.slice(2, 4)}`;
}
function fmtDateInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

function CaseEditDialog({ caseId, open, onClose, onSaved }: {
  caseId: string; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [detail, setDetail]     = useState<CaseDetail | null>(null);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const [caseType, setCaseType]       = useState<'MVA' | 'GENERAL'>('MVA');
  const [accDateDisp, setAccDateDisp] = useState('');
  const [description, setDescription] = useState('');
  const [lawFirmId, setLawFirmId]     = useState<string | null>(null);
  const [lawFirmLabel, setLawFirmLabel] = useState('');
  const [attorney, setAttorney]       = useState('');
  const [chiropractor, setChiropractor] = useState('');

  const isMVA = caseType === 'MVA';

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}`)
      .then(r => r.json())
      .then(j => {
        const c: CaseDetail = j.case;
        if (!c) return;
        setDetail(c);
        setCaseType((c.caseType === 'MVA' ? 'MVA' : 'GENERAL') as 'MVA' | 'GENERAL');
        setAccDateDisp(isoToDisp(c.accidentDate));
        setDescription(c.accidentNotes ?? '');
        setLawFirmId(c.lawFirm?.id ?? null);
        setLawFirmLabel(c.lawFirm?.firmName ?? '');
        const cd = (c.consentsData ?? {}) as Record<string, string>;
        setAttorney((cd.attorney as string | undefined) ?? '');
        setChiropractor((cd.chiropractor as string | undefined) ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  async function handleSave() {
    setSaving(true);
    setError('');
    const accidentDate = dispToIso(accDateDisp) || null;
    try {
      const res = await fetch(`/api/admin/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseType,
          accidentDate,
          accidentNotes: description || null,
          lawFirmId: lawFirmId || null,
          lawFirmLabel: lawFirmLabel || null,
          chiropractor: chiropractor || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.message ?? 'Error al guardar.'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-brand" />
            Editar caso {detail?.caseCode ?? ''}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {detail?.patient ? `${detail.patient.firstName} ${detail.patient.lastName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-2">
            {[1,2,3,4].map(i => <div key={i} className="h-11 rounded-md bg-bg-2 animate-pulse" />)}
          </div>
        )}

        {!loading && (
          <div className="space-y-5 py-1">
            {/* Tipo de caso — same cards as wizard */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Tipo de caso</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([['MVA', 'MVA (Accidente de vehículo a motor)', Car], ['GENERAL', 'GM (Medicina general)', Stethoscope]] as const).map(([val, label, Icon]) => (
                  <button key={val} type="button" onClick={() => setCaseType(val)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-all ${
                      caseType === val ? 'border-brand bg-brand/10 text-brand font-medium' : 'border-border bg-bg-2/40 text-text-muted hover:border-brand/40'
                    }`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                    {caseType === val && <Check className="w-3.5 h-3.5 ml-auto text-brand" />}
                  </button>
                ))}
              </div>
            </div>

            {/* MVA-only fields */}
            {isMVA && (
              <>
                {/* Fecha del accidente */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Fecha del accidente</label>
                  <input type="text" inputMode="numeric" placeholder="MM/DD/YYYY" maxLength={10}
                    value={accDateDisp}
                    onChange={e => setAccDateDisp(fmtDateInput(e.target.value))}
                    onBlur={() => { const iso = dispToIso(accDateDisp); if (iso) setAccDateDisp(isoToDisp(iso)); }}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Descripción del accidente</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                    placeholder="Describe brevemente los síntomas y el accidente."
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand resize-none"
                  />
                </div>

                {/* Firma de abogados */}
                <LawFirmSelectInline
                  firmId={lawFirmId}
                  onChange={(label, id) => { setLawFirmLabel(label); setLawFirmId(id); }}
                />

                {/* Abogado + Quiropráctico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Abogado representante</label>
                    <input type="text" value={attorney} onChange={e => setAttorney(e.target.value)}
                      placeholder="Nombre del abogado"
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">Quiropráctico tratante</label>
                    <input type="text" value={chiropractor} onChange={e => setChiropractor(e.target.value)}
                      placeholder="Nombre del quiropráctico"
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand"
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── QR Dialog ──────────────────────────────────────────────────────────────
function CaseQrDialog({ caseId, caseCode, open, onClose }: {
  caseId: string; caseCode: string; open: boolean; onClose: () => void;
}) {
  const [portalUrl, setPortalUrl]   = useState('');
  const [qrDataUrl, setQrDataUrl]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [copied, setCopied]         = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}/generate-portal-token`, { method: 'POST' })
      .then(r => r.json())
      .then(async (j) => {
        if (j.portalUrl) {
          setPortalUrl(j.portalUrl);
          const url = await QRCode.toDataURL(j.portalUrl, {
            width: 220, margin: 2,
            color: { dark: '#e2e8f0', light: '#12141f' },
          });
          setQrDataUrl(url);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  function handleCopy() {
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-caso-${caseCode}.png`;
    a.click();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-brand" />
            Acceso de paciente
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs font-mono">
            Caso #{caseCode}
          </DialogDescription>
        </DialogHeader>

        <p className="text-[11px] text-text-muted leading-relaxed -mt-1">
          Comparte este código QR o enlace con el paciente para que pueda completar
          o actualizar su información de registro de manera segura.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-[220px] h-[220px] rounded-lg bg-bg-2 animate-pulse" />
          </div>
        )}

        {!loading && portalUrl && (
          <>
            <div className="flex items-center gap-2 rounded-md bg-bg-2 border border-border px-3 py-2">
              <span className="text-[11px] text-text-2 truncate flex-1 font-mono">{portalUrl}</span>
              <button
                onClick={handleCopy}
                className="p-1 rounded text-text-muted hover:text-brand transition-colors shrink-0"
                title="Copiar enlace"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {qrDataUrl && (
              <div className="flex justify-center">
                <img src={qrDataUrl} alt="QR Code" className="rounded-lg w-[220px] h-[220px]" />
              </div>
            )}
          </>
        )}

        {!loading && !portalUrl && (
          <div className="text-[11px] text-rose text-center py-4">No se pudo generar el enlace.</div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Cerrar</Button>
          {qrDataUrl && (
            <Button className="w-full sm:w-auto" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5 mr-1" /> Descargar QR
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Appointments Dialog ────────────────────────────────────────────────────
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Denver' });
}
function addMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Denver' });
}
function fmtApptDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Denver' });
}

function CaseAppointmentsDialog({ caseId, caseCode, open, onClose }: {
  caseId: string; caseCode: string; open: boolean; onClose: () => void;
}) {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}/appointments`)
      .then(r => r.json())
      .then(j => setAppointments(j.appointments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-brand" />
            Citas programadas
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            Puedes revisar los detalles acerca de tus citas programadas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="space-y-2 p-4">
              {[1,2,3].map(i => <div key={i} className="h-10 rounded bg-bg-2 animate-pulse" />)}
            </div>
          )}

          {!loading && appointments.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No se encontraron resultados</p>
            </div>
          )}

          {!loading && appointments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-2 border-b border-border">
                  <tr>
                    {['Fecha','Hora de inicio','Hora de conclusión','Estado','Firmado por el paciente','Registro','Salida','Doctor','Especialidad','Acciones'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {appointments.map(a => (
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{fmtApptDate(a.scheduledFor)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{fmtTime(a.scheduledFor)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{addMinutes(a.scheduledFor, a.durationMinutes)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <TagPill label={a.status === 'SCHEDULED' ? 'Pendiente' : a.status} colorClass={APPT_STATUS_COLOR[a.status] ?? 'bg-bg-2 text-text-2 border-border'} />
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">
                        {a.attendanceSignedAt ? <span className="text-emerald">✓ Firmado</span> : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">
                        {a.checkedInAt ? <span className="text-emerald text-[10px]">✓</span> : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">—</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">
                        {a.provider ? `${a.provider.firstName} ${a.provider.lastName}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">
                        {a.provider?.specialty ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { onClose(); router.push(`/triage/${a.id}`); }}
                            className="p-1.5 rounded text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { onClose(); router.push(`/triage/${a.id}`); }}
                            className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                            title="Editar / Triaje"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                            title="Formularios"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded text-text-muted hover:text-amber hover:bg-amber/10 transition-colors"
                            title="Descargar"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-bg-1">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>Filas por página</span>
            <select className="bg-bg-2 border border-border rounded px-2 py-1 text-[11px] text-text-1 focus:outline-none">
              <option>10</option>
              <option>25</option>
            </select>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-text-muted">
            <span>Página 1 de 1</span>
            <div className="flex gap-1 ml-2">
              {['«','‹','›','»'].map(s => (
                <button key={s} disabled className="w-7 h-7 rounded border border-border text-text-muted disabled:opacity-30 hover:border-brand hover:text-brand transition-colors text-xs">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COLORS: Record<string, string> = {
  NEW:        'bg-brand/15 text-brand border-brand/30',
  ACTIVE:     'bg-emerald/15 text-emerald border-emerald/30',
  COMPLETED:  'bg-cyan/15 text-cyan border-cyan/30',
  DISCHARGED: 'bg-amber/15 text-amber border-amber/30',
  INACTIVE:   'bg-text-muted/15 text-text-muted border-text-muted/30',
};

const STATUS_LABEL: Record<string, string> = {
  NEW:        'Nuevo',
  ACTIVE:     'Activo',
  COMPLETED:  'Completado',
  DISCHARGED: 'Dado de alta',
  INACTIVE:   'Inactivo',
};

export interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  patientCode: string | null;
  status: string;
  preferredLanguage: string | null;
  sex: string | null;
  maritalStatus: string | null;
  employer: string | null;
  preferredPharmacy: string | null;
  communicationPreference: string | null;
  referralSource: string | null;
  race: string | null;
  ethnicity: string | null;
  socialSecurityNumber: string | null;
  addressLine1: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  emergency2Name: string | null;
  emergency2Phone: string | null;
  emergency2Relation: string | null;
  dateOfBirth: Date | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  accidentDate: Date | null;
  accidentType: string | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
  createdAt: Date;
  updatedAt?: Date;
  caseCount: number;
}

interface Props {
  patients: PatientRow[];
  q?: string;
  page: number;
  totalPages: number;
  total: number;
}


export function PatientsClient({ patients, q, page, totalPages, total }: Props) {
  const router  = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [deleteError,  setDeleteError]  = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<PatientRow | null>(null);
  const [viewTarget,   setViewTarget]   = useState<PatientRow | null>(null);
  const [quickRegister, setQuickRegister] = useState(false);
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [wizardPatient, setWizardPatient] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [expandedCases, setExpandedCases] = useState<Record<string, CaseRow[]>>({});
  const [loadingCases,  setLoadingCases]  = useState<Record<string, boolean>>({});
  const [caseQrTarget,   setCaseQrTarget]   = useState<CaseRow | null>(null);
  const [caseApptTarget, setCaseApptTarget] = useState<CaseRow | null>(null);
  const [caseViewTarget, setCaseViewTarget] = useState<CaseRow | null>(null);
  const [caseEditTarget, setCaseEditTarget] = useState<CaseRow | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<CaseRow | null>(null);
  const [deletingCase, setDeletingCase]    = useState(false);
  const [deleteCaseError, setDeleteCaseError] = useState('');

  const toggleExpand = useCallback(async (patientId: string) => {
    if (expandedId === patientId) { setExpandedId(null); return; }
    setExpandedId(patientId);
    if (expandedCases[patientId]) return;
    setLoadingCases(prev => ({ ...prev, [patientId]: true }));
    try {
      const res  = await fetch(`/api/admin/patients/${patientId}/cases`);
      const json = await res.json().catch(() => ({ cases: [] }));
      setExpandedCases(prev => ({ ...prev, [patientId]: json.cases ?? [] }));
    } finally {
      setLoadingCases(prev => ({ ...prev, [patientId]: false }));
    }
  }, [expandedId, expandedCases]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/patients/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.message ?? 'Error al eliminar.');
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setDeleteError('Error de red. Intenta de nuevo.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteCase() {
    if (!deleteCaseTarget) return;
    setDeletingCase(true);
    setDeleteCaseError('');
    try {
      const res = await fetch(`/api/admin/cases/${deleteCaseTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteCaseError(json.message ?? 'Error al cancelar.'); return; }
      const pid = Object.keys(expandedCases).find(k => (expandedCases[k] ?? []).some(c => c.id === deleteCaseTarget.id));
      setDeleteCaseTarget(null);
      if (pid) {
        setExpandedCases(prev => { const n = { ...prev }; delete n[pid]; return n; });
        setLoadingCases(prev => ({ ...prev, [pid]: true }));
        try {
          const r2 = await fetch(`/api/admin/patients/${pid}/cases`);
          const j2 = await r2.json().catch(() => ({ cases: [] }));
          setExpandedCases(prev => ({ ...prev, [pid]: j2.cases ?? [] }));
        } finally {
          setLoadingCases(prev => ({ ...prev, [pid]: false }));
        }
      }
    } catch {
      setDeleteCaseError('Error de red. Intenta de nuevo.');
    } finally {
      setDeletingCase(false);
    }
  }

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 0) params.set('page', String(p));
    const qs = params.toString();
    return `/patients${qs ? `?${qs}` : ''}`;
  }

  return (
    <>
      {/* Barra de acciones — Registro rápido + Agregar paciente */}
      <div className="flex flex-wrap items-center justify-end gap-2 -mt-2 mb-1">
        <button
          type="button"
          onClick={() => setQuickRegister(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-text-muted hover:border-brand/40 hover:text-brand transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Registro rápido
        </button>
        <PatientCreateDialog />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-2 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Paciente</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell">Contacto</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell">Casos</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell">Status</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden xl:table-cell">Registrado</th>
              <th className="w-24 px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {patients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-muted text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {q ? `Sin resultados para "${q}"` : 'No hay pacientes registrados'}
                </td>
              </tr>
            )}
            {patients.map((p) => (
              <>
              <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                {/* Chevron expand */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className="p-1 rounded text-text-muted hover:text-brand transition-colors shrink-0"
                      title={expandedId === p.id ? 'Colapsar' : 'Ver casos'}
                    >
                      {expandedId === p.id
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={8} />
                    <div>
                      <button
                        onClick={() => router.push(`/patients/${p.id}`)}
                        className="text-text-1 font-medium hover:text-brand transition-colors text-left"
                      >
                        {p.firstName} {p.lastName}
                      </button>
                      {p.patientCode && (
                        <div className="text-text-muted text-[10px] font-mono">{p.patientCode}</div>
                      )}
                      {(p.addressCity || p.addressState) && (
                        <div className="text-text-muted text-[10px]">
                          {[p.addressCity, p.addressState].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contacto */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="text-text-2 text-xs space-y-0.5">
                    {p.phone && <div className="font-mono">{p.phone}</div>}
                    {p.email && <div className="text-text-muted truncate max-w-[180px]">{p.email}</div>}
                    {p.preferredLanguage && (
                      <div className="text-[10px] text-text-muted">{p.preferredLanguage === 'es' ? '🇪🇸 Español' : '🇺🇸 English'}</div>
                    )}
                  </div>
                </td>

                {/* Casos */}
                <td className="px-4 py-3 hidden lg:table-cell">
                  <button
                    onClick={() => router.push(`/patients/${p.id}`)}
                    className="text-text-2 hover:text-brand transition-colors"
                  >
                    {p.caseCount} caso{p.caseCount !== 1 ? 's' : ''}
                  </button>
                </td>

                {/* Status */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <TagPill
                    label={STATUS_LABEL[p.status] ?? p.status}
                    colorClass={STATUS_COLORS[p.status] ?? 'bg-bg-2 text-text-2 border-border'}
                  />
                </td>

                {/* Registrado */}
                <td className="px-4 py-3 hidden xl:table-cell text-[11px] text-text-muted">
                  {fmtLocalDate(p.createdAt)}
                </td>

                {/* Acciones */}
                <td className="w-28 px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => router.push(`/patients/${p.id}`)}
                      className="p-1.5 rounded-md text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                      title="Ver detalle y casos"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewTarget(p)}
                      className="p-1.5 rounded-md text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                      title="Ver ficha rápida"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditTarget(p)}
                      className="p-1.5 rounded-md text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(p); setDeleteError(''); }}
                      className="p-1.5 rounded-md text-text-muted hover:text-rose hover:bg-rose/10 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>

              {/* ── Fila expandida: casos del paciente ── */}
              {expandedId === p.id && (
                <tr key={`${p.id}-cases`} className="bg-bg-2/30">
                  <td colSpan={6} className="px-6 py-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
                          <Briefcase className="w-3 h-3" /> Casos del paciente
                        </span>
                        <button
                          onClick={() => setWizardPatient({ id: p.id, firstName: p.firstName, lastName: p.lastName })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-[11px] font-medium hover:bg-brand/90 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Agregar caso
                        </button>
                      </div>

                      {loadingCases[p.id] && (
                        <p className="text-[11px] text-text-muted py-2">Cargando casos...</p>
                      )}

                      {!loadingCases[p.id] && (expandedCases[p.id] ?? []).length === 0 && (
                        <p className="text-[11px] text-text-muted py-2">No hay casos registrados.</p>
                      )}

                      {!loadingCases[p.id] && (expandedCases[p.id] ?? []).map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-bg-1 px-3 py-2 flex-wrap">
                          <div className="flex items-center gap-3">
                            <Car className="w-3.5 h-3.5 text-text-muted shrink-0" />
                            <span className="text-[12px] font-mono text-text-1">{c.caseCode}</span>
                            {c.accidentType && (
                              <span className="text-[10px] text-text-muted">{c.accidentType}</span>
                            )}
                            <TagPill
                              label={c.status}
                              colorClass={
                                c.status === 'CANCELLED' ? 'bg-rose/10 text-rose border-rose/20'
                                : c.status === 'ACTIVE'  ? 'bg-emerald/10 text-emerald border-emerald/20'
                                : 'bg-brand/10 text-brand border-brand/20'
                              }
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setCaseViewTarget(c)}
                              className="p-1.5 rounded text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                              title="Ver caso"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setCaseEditTarget(c)}
                              className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                              title="Editar caso"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => { setDeleteCaseTarget(c); setDeleteCaseError(''); }}
                              className="p-1.5 rounded text-text-muted hover:text-rose hover:bg-rose/10 transition-colors"
                              title="Cancelar caso"
                              disabled={c.status === 'CANCELLED'}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => window.open(`/api/admin/cases/${c.id}/pdf`, '_blank')}
                              className="p-1.5 rounded text-text-muted hover:text-amber hover:bg-amber/10 transition-colors"
                              title="Descargar PDF"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setCaseApptTarget(c)}
                              className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                              title="Ver citas programadas"
                            >
                              <CalendarDays className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setCaseQrTarget(c)}
                              className="p-1.5 rounded text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                              title="Acceso paciente / QR"
                            >
                              <QrCode className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Paginación ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-text-muted">
            Página {page + 1} de {totalPages} · {total} paciente{total !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => router.push(buildPageUrl(page - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push(buildPageUrl(page + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── View modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-text-1 flex items-center gap-2">
              {viewTarget && <PersonAvatar firstName={viewTarget.firstName} lastName={viewTarget.lastName} size={8} />}
              {viewTarget?.firstName} {viewTarget?.lastName}
            </DialogTitle>
            <DialogDescription className="text-text-muted text-xs font-mono">
              {viewTarget?.patientCode}
            </DialogDescription>
          </DialogHeader>

          {viewTarget && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Contacto</p>
                {viewTarget.phone && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Phone className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono">{viewTarget.phone}</span>
                    {viewTarget.phone2 && <span className="font-mono text-text-muted">· {viewTarget.phone2}</span>}
                  </div>
                )}
                {viewTarget.email && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Mail className="w-3.5 h-3.5 text-text-muted" />
                    <span>{viewTarget.email}</span>
                  </div>
                )}
                {viewTarget.dateOfBirth && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Calendar className="w-3.5 h-3.5 text-text-muted" />
                    <span>{fmtLocalDate(viewTarget.dateOfBirth)}</span>
                  </div>
                )}
              </div>

              {(viewTarget.accidentDate || viewTarget.accidentType) && (
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Accidente</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <Car className="w-3.5 h-3.5 text-text-muted" />
                    <span>{fmtLocalDate(viewTarget.accidentDate)}</span>
                    {viewTarget.accidentType && <span className="text-text-muted">· {viewTarget.accidentType}</span>}
                  </div>
                </div>
              )}

              {(viewTarget.insuranceCarrier || viewTarget.policyNumber) && (
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Seguro</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <Shield className="w-3.5 h-3.5 text-text-muted" />
                    <span>{viewTarget.insuranceCarrier ?? '—'}</span>
                    {viewTarget.policyNumber && <span className="text-text-muted font-mono text-xs">· {viewTarget.policyNumber}</span>}
                  </div>
                </div>
              )}

              {viewTarget.guardianName && (
                <div className="rounded-md bg-amber/10 border border-amber/30 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber">Responsable legal</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <UserCheck className="w-3.5 h-3.5 text-amber" />
                    <span>{viewTarget.guardianName}</span>
                    {viewTarget.guardianRelation && <span className="text-text-muted text-xs">· {viewTarget.guardianRelation}</span>}
                  </div>
                  {viewTarget.guardianPhone && (
                    <div className="flex items-center gap-2 text-text-2 pl-5">
                      <span className="font-mono text-xs">{viewTarget.guardianPhone}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <TagPill
                  label={STATUS_LABEL[viewTarget.status] ?? viewTarget.status}
                  colorClass={STATUS_COLORS[viewTarget.status] ?? 'bg-bg-2 text-text-2 border-border'}
                />
                <span className="text-text-muted text-xs">{viewTarget.caseCount} caso{viewTarget.caseCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setViewTarget(null)}>Cerrar</Button>
            <Button className="w-full sm:w-auto" onClick={() => { setEditTarget(viewTarget); setViewTarget(null); }}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit modal ─────────────────────────────────────────────────────── */}
      {editTarget && (
        <PatientEditDialog
          patient={editTarget as EditablePatient}
          externalOpen
          onClose={() => { setEditTarget(null); router.refresh(); }}
        />
      )}

      {/* ─── Case Wizard ─────────────────────────────────────────────────────── */}
      {wizardPatient && (
        <CaseWizardDialog
          open={!!wizardPatient}
          onOpenChange={(v) => { if (!v) setWizardPatient(null); }}
          patient={wizardPatient}
          onCreated={() => {
            setExpandedCases(prev => { const n = { ...prev }; delete n[wizardPatient.id]; return n; });
            toggleExpand(wizardPatient.id);
          }}
        />
      )}

      {/* ─── Quick Register ──────────────────────────────────────────────────── */}
      <QuickRegisterDialog open={quickRegister} onOpenChange={setQuickRegister} />

      {/* ─── Case QR dialog ─────────────────────────────────────────────────── */}
      {caseQrTarget && (
        <CaseQrDialog
          caseId={caseQrTarget.id}
          caseCode={caseQrTarget.caseCode}
          open={!!caseQrTarget}
          onClose={() => setCaseQrTarget(null)}
        />
      )}

      {/* ─── Case Appointments dialog ────────────────────────────────────────── */}
      {caseApptTarget && (
        <CaseAppointmentsDialog
          caseId={caseApptTarget.id}
          caseCode={caseApptTarget.caseCode}
          open={!!caseApptTarget}
          onClose={() => setCaseApptTarget(null)}
        />
      )}

      {/* ─── Delete Case confirm ─────────────────────────────────────────────── */}
      <Dialog open={!!deleteCaseTarget} onOpenChange={(o) => { if (!o) setDeleteCaseTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-1">¿Estás seguro de eliminar este registro?</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteCaseError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {deleteCaseError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDeleteCase} disabled={deletingCase}>
              {deletingCase ? 'Eliminando...' : 'Eliminar'}
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteCaseTarget(null)} disabled={deletingCase}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Case View dialog ────────────────────────────────────────────────── */}
      {caseViewTarget && (
        <CaseViewDialog
          caseId={caseViewTarget.id}
          open={!!caseViewTarget}
          onClose={() => setCaseViewTarget(null)}
          onEdit={() => setCaseEditTarget(caseViewTarget)}
        />
      )}

      {/* ─── Case Edit (full wizard in edit mode) ──────────────────────────── */}
      {caseEditTarget && (
        <CaseWizardDialog
          open={!!caseEditTarget}
          onOpenChange={(v) => { if (!v) setCaseEditTarget(null); }}
          patient={{ id: '', firstName: '', lastName: '' }}
          editCaseId={caseEditTarget.id}
          onSaved={async () => {
            const pid = Object.keys(expandedCases).find(k => (expandedCases[k] ?? []).some(c => c.id === caseEditTarget.id));
            setCaseEditTarget(null);
            if (pid) {
              // Clear cache and re-fetch so the updated case shows up
              setExpandedCases(prev => { const n = { ...prev }; delete n[pid]; return n; });
              setLoadingCases(prev => ({ ...prev, [pid]: true }));
              try {
                const res = await fetch(`/api/admin/patients/${pid}/cases`);
                const json = await res.json().catch(() => ({ cases: [] }));
                setExpandedCases(prev => ({ ...prev, [pid]: json.cases ?? [] }));
              } finally {
                setLoadingCases(prev => ({ ...prev, [pid]: false }));
              }
            }
          }}
        />
      )}

      {/* ─── Delete confirm ──────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-1">¿Eliminar paciente?</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              Esta acción eliminará a{' '}
              <span className="font-semibold text-text-1">
                {deleteTarget?.firstName} {deleteTarget?.lastName}
              </span>{' '}
              del sistema. No se puede deshacer.
              {(deleteTarget?.caseCount ?? 0) > 0 && (
                <span className="block mt-2 text-amber text-xs">
                  ⚠ Este paciente tiene {deleteTarget!.caseCount} caso{deleteTarget!.caseCount !== 1 ? 's' : ''} asociado{deleteTarget!.caseCount !== 1 ? 's' : ''} — no se podrá eliminar.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {deleteError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

