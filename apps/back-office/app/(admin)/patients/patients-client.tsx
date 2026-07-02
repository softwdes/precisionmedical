'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2, Users, Phone, Mail, Calendar, Car, Shield, UserCheck, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Briefcase, QrCode, CalendarDays, Download, Copy, Check } from 'lucide-react';
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

// ── Case View Dialog ───────────────────────────────────────────────────────
interface CaseDetail {
  id: string; caseCode: string; caseType: string; status: string;
  accidentType: string | null; accidentDate: string | null;
  accidentLocation: string | null; accidentNotes: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string };
  lawFirm: { id: string; firmName: string } | null;
  attorney: { id: string; firstName: string; lastName: string } | null;
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
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
            {[1,2,3].map(i => <div key={i} className="h-10 rounded-md bg-bg-2 animate-pulse" />)}
          </div>
        )}

        {!loading && detail && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <TagPill label={CASE_STATUS_LABEL[detail.status] ?? detail.status} colorClass={CASE_STATUS_COLOR[detail.status] ?? 'bg-bg-2 text-text-2 border-border'} />
              <span className="text-[10px] text-text-muted uppercase tracking-wider">{detail.caseType}</span>
              {detail.specialty && <span className="text-[10px] text-text-muted">{detail.specialty.name}</span>}
            </div>

            <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Accidente</p>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-text-muted">Fecha · </span>
                  <span className="text-text-1">{fmtIsoDate(detail.accidentDate)}</span>
                </div>
                <div>
                  <span className="text-text-muted">Tipo · </span>
                  <span className="text-text-1">{detail.accidentType ?? '—'}</span>
                </div>
              </div>
              {detail.accidentLocation && (
                <div className="text-[12px]">
                  <span className="text-text-muted">Lugar · </span>
                  <span className="text-text-1">{detail.accidentLocation}</span>
                </div>
              )}
              {detail.accidentNotes && (
                <p className="text-[11px] text-text-muted italic">{detail.accidentNotes}</p>
              )}
            </div>

            {(detail.lawFirm || detail.attorney) && (
              <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Legal</p>
                {detail.lawFirm && <div className="text-[12px] text-text-1">{detail.lawFirm.firmName}</div>}
                {detail.attorney && <div className="text-[12px] text-text-muted">{detail.attorney.firstName} {detail.attorney.lastName}</div>}
              </div>
            )}

            <div className="text-[10px] text-text-muted">
              Creado: {fmtIsoDate(detail.createdAt)}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Cerrar</Button>
          <Button className="w-full sm:w-auto" onClick={() => { onClose(); onEdit(); }}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Case Edit Dialog ───────────────────────────────────────────────────────
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
  const [detail, setDetail]   = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const [status, setStatus]           = useState('');
  const [accidentType, setAccidentType] = useState('');
  const [accDateDisp, setAccDateDisp] = useState('');
  const [location, setLocation]       = useState('');
  const [notes, setNotes]             = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}`)
      .then(r => r.json())
      .then(j => {
        const c: CaseDetail = j.case;
        if (!c) return;
        setDetail(c);
        setStatus(c.status);
        setAccidentType(c.accidentType ?? '');
        setAccDateDisp(isoToDisp(c.accidentDate));
        setLocation(c.accidentLocation ?? '');
        setNotes(c.accidentNotes ?? '');
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
          status: status || undefined,
          accidentType: accidentType || null,
          accidentDate,
          accidentLocation: location || null,
          accidentNotes: notes || null,
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
      <DialogContent className="max-w-md">
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
            {[1,2,3,4].map(i => <div key={i} className="h-10 rounded-md bg-bg-2 animate-pulse" />)}
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {/* Status */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                {Object.entries(CASE_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {/* Accident type */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Tipo de accidente</label>
              <select value={accidentType} onChange={e => setAccidentType(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                <option value="">— Sin especificar —</option>
                <option value="AUTO">AUTO</option>
                <option value="MOTORCYCLE">MOTORCYCLE</option>
                <option value="PEDESTRIAN">PEDESTRIAN</option>
                <option value="WORKPLACE">WORKPLACE</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>

            {/* Accident date */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Fecha de accidente</label>
              <input
                type="text" inputMode="numeric" placeholder="MM/DD/YYYY" maxLength={10}
                value={accDateDisp}
                onChange={e => setAccDateDisp(fmtDateInput(e.target.value))}
                onBlur={() => { const iso = dispToIso(accDateDisp); if (iso) setAccDateDisp(isoToDisp(iso)); }}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>

            {/* Location */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Lugar del accidente</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="Dirección o intersección..."
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">Notas</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Notas adicionales del caso..."
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none"
              />
            </div>

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
function CaseAppointmentsDialog({ caseId, caseCode, open, onClose }: {
  caseId: string; caseCode: string; open: boolean; onClose: () => void;
}) {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading]           = useState(false);

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-brand" />
            Citas programadas
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs font-mono">
            Caso #{caseCode}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 py-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 rounded-md bg-bg-2 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && appointments.length === 0 && (
          <div className="text-center py-8 text-text-muted">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-[11px]">No se encontraron resultados</p>
          </div>
        )}

        {!loading && appointments.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {appointments.map(a => (
              <div key={a.id} className="rounded-md border border-border/60 bg-bg-1 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="text-[12px] text-text-1 font-medium">{fmtDateTime(a.scheduledFor)}</span>
                  </div>
                  <TagPill
                    label={a.status}
                    colorClass={APPT_STATUS_COLOR[a.status] ?? 'bg-bg-2 text-text-2 border-border'}
                  />
                </div>
                <div className="flex items-center gap-4 pl-5 text-[11px] text-text-muted">
                  {a.clinic && <span>{a.clinic.name}</span>}
                  {a.provider && <span>{a.provider.firstName} {a.provider.lastName}</span>}
                  <span>{a.durationMinutes} min</span>
                </div>
                <div className="flex gap-3 pl-5 text-[10px]">
                  {a.checkedInAt && <span className="text-emerald">✓ Check-in</span>}
                  {a.attendanceSignedAt && <span className="text-emerald">✓ Firma</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
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
      setDeleteCaseTarget(null);
      // Refresh expanded cases for affected patient
      setExpandedCases(prev => {
        const n: Record<string, CaseRow[]> = {};
        for (const [pid, cases] of Object.entries(prev)) {
          n[pid] = cases.map(c => c.id === deleteCaseTarget.id ? { ...c, status: 'CANCELLED' } : c);
        }
        return n;
      });
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

      {/* ─── Case Edit dialog ────────────────────────────────────────────────── */}
      {caseEditTarget && (
        <CaseEditDialog
          caseId={caseEditTarget.id}
          open={!!caseEditTarget}
          onClose={() => setCaseEditTarget(null)}
          onSaved={() => {
            // Refresh expanded cases to show updated status
            setExpandedCases(prev => { const n = { ...prev }; delete n[Object.keys(n).find(pid => (n[pid] ?? []).some(c => c.id === caseEditTarget.id)) ?? '']; return n; });
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

