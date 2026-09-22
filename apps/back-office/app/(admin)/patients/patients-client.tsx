'use client';
import { localeApp, fecha, fechaCalendario } from '@/lib/fechas';

import { useState, useCallback, useEffect, useRef, useTransition, Fragment } from 'react';
import { useTwilioDevice } from '@/lib/use-twilio-device';
import { ActiveCallBar } from '@/components/cases/active-call-bar';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { CASE_PARAM, conCasoAbierto } from '@/lib/case-modal-url';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Pencil, Trash2, Users, AlertTriangle, Phone, PhoneCall, PhoneOutgoing, Mail, MessageSquare, Calendar, Car, Shield, UserCheck, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, UserPlus, Briefcase, QrCode, CalendarDays, Download, Printer, Copy, Check, Stethoscope, CheckCircle2, MoreHorizontal, FolderOpen, FileText, CreditCard, ClipboardList, History, Tag, Trophy, BadgeCheck, Camera, Upload, ImageOff, RefreshCw, Search, ArrowUp, ArrowDown, ArrowUpDown, X as XIcon } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@precision/ui';
import { PersonAvatar, TagPill, CaseStageProgress, FloatingPanel, FotoGrandeDialog, type FotoGrande } from '@/components/ui-phoenix';
import { ArchivosDialog, fotosDelCaso, fotosEliminadasDelCaso } from '@/components/patients/archivos-dialog';
import { telefonoDe } from '@/lib/telefono-paciente';
import { AppointmentDetailPanel, type CalendarAppointment } from '@/components/calendar/appointment-detail-panel';
import { AppointmentDialog } from '@/components/calendar/appointment-dialog';
import { etiquetaEstado } from '@/lib/appointment-style';
import { nombreProvider } from '@/lib/provider-name';
import { CoverageChip } from '@/components/coverage/coverage-chip';
import type { CoverageDTO } from '@/lib/coverage';
import { PatientEditDialog, type EditablePatient } from './patient-edit-dialog';
import { MedicalHistoryDialog } from './medical-history-dialog';
import { CaseWizardDialog } from '@/components/cases/case-wizard-dialog';
import { NewCaseDialog, type NewCaseInitialState } from '@/components/cases/new-case-dialog';
import { lugarDelAccidente, notasDelReferido, type ReferidoParaWizard } from '@/lib/referidos/referido';
import { QuickRegisterDialog, type ReferidoPrecarga } from '@/components/patients/quick-register-dialog';
import { SegurosDialog } from '@/components/patients/seguros-dialog';
import { fmtPhone } from '@/lib/telefono-formato';
import { ReferralChoiceDialog } from '@/components/cases/referral-choice-dialog';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import { CallHistoryDialog } from '@/components/calls/call-history-dialog';
import { CarreraDialog } from '@/components/patients/carrera-dialog';
import { SmsHistoryDialog } from '@/components/sms/sms-history-dialog';
import { PatientMessagesDialog, type MessagesCaseFilter } from '@/components/messaging/patient-messages-dialog';
import type { ComposePatientRef } from '@/components/messaging/compose-message-dialog';
import { PriceListDialog } from '@/components/catalog/price-list-dialog';
import { MembresiasDialog } from '@/components/membresias/membresias-dialog';
import { progresoIntake, type MissingKey } from '@/lib/intake-progreso';
import { PATIENTS_PAGE_SIZE, PATIENTS_PAGE_SIZES } from '@/lib/patients-page';
import { leerOrden, leerTipoDeCaso, ORDEN_POR_DEFECTO, type OrdenPacientes, type TipoDeCaso } from '@/lib/patients-orden';
import QRCode from 'qrcode';



// ── Case action types ──────────────────────────────────────────────────────
interface CaseRow {
  id: string;
  caseCode: string;
  status: string;
  caseType: string | null;
  accidentType: string | null;
  accidentDate: string | null;
  accidentNotes: string | null;
  intakeFormCompletedAt: string | null;
  consentsData: Record<string, unknown> | null;
  hasIntakeSubmission?: boolean;
  /** El seguro de auto vive en `case_auto_insurances`, no en `consentsData`. */
  hasAutoInsurance?: boolean;
  firstAppointment: { scheduledFor: string } | null;
  lastAppointment:  { scheduledFor: string } | null;
}

/**
 * Un caso que ya terminó su recorrido. Se pinta al 55% en el panel de casos:
 * con doce casos, lo que se busca es cuáles siguen vivos, y bajarles la
 * opacidad a los demás responde esa pregunta sin leer una sola fecha.
 * `CANCELLED` entra acá aunque sea "fuera de ruta" — tampoco está en curso.
 */
const CASOS_CERRADOS = new Set(['CLOSED', 'SETTLED', 'ARCHIVED', 'CANCELLED']);

/**
 * Capa de hover de una celda — copiada del primitivo `DataTable`, que es donde
 * vive la versión canónica (ver `HOVER_OVERLAY` ahí). Va en TODAS las celdas de
 * la fila, incluidas las fijas: componerla encima es lo que hace que el
 * resaltado cruce la fila entera en vez de cortarse donde empieza un fondo
 * opaco. Cuando esta tabla se migre al primitivo, esto se borra.
 */
const HOVER_CELDA =
  'relative before:absolute before:inset-0 before:pointer-events-none ' +
  'before:bg-white/[0.02] before:opacity-0 group-hover:before:opacity-100 before:transition-opacity';

const CASE_TYPE_LABEL: Record<string, string> = {
  MVA: 'MVA',
  GENERAL: 'GM',
  GENERAL_MEDICINE: 'GM',
  GM: 'GM',
  SELFPAY: 'Self-Pay',
  NURSING_HOME: 'Nursing Home',
};

/**
 * `MissingKey` y el cálculo de qué falta salieron de este archivo a
 * `lib/intake-progreso.ts` (importado arriba): los comparte el centinela del
 * dashboard, que corre en el SERVIDOR y no puede llamar a un componente de
 * cliente. Acá quedan solo los colores, que son decisión de esta pantalla.
 */

function MissingTooltip({ items, pct, missingLabel }: { items: string[]; pct?: number; missingLabel: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function handleEnter() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top - 8, left: r.left });
  }

  if (!items.length) return null;

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[10px] text-text-muted font-medium flex-shrink-0">{missingLabel}</span>
        <p className="text-[10px] text-text-muted truncate cursor-default select-none flex-1 min-w-0">
          {items.join(', ')}
        </p>
        {pct !== undefined && (
          <span className="text-[10px] text-text-muted tabular-nums flex-shrink-0">{pct}%</span>
        )}
      </div>
      {pos && (
        <div
          className="fixed z-[9999] w-max max-w-[240px] rounded-lg border border-border bg-bg-1 shadow-lg shadow-black/40 p-2.5 pointer-events-none -translate-y-full"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">{missingLabel}</p>
          <ul className="space-y-1">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[11px] text-text-2">
                <span className="w-1 h-1 rounded-full bg-rose flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * El progreso de esta pantalla: la cuenta la hace `lib/intake-progreso.ts` y
 * acá se le ponen los colores.
 *
 * El corte en 57% no es arbitrario: son 4 de las 7 secciones. Vive de este lado
 * porque es cómo ESTA tabla decide pintar la barra, no parte de la definición
 * de qué falta — el centinela del dashboard usa la misma cuenta con otra escala.
 */
function calcIntakeProgress(c: CaseRow, p: PatientRow): {
  pct: number; missingKeys: MissingKey[]; colorClass: string; barClass: string;
} {
  const { pct, faltan } = progresoIntake(c, p);

  const colorClass = pct === 100 ? 'bg-emerald/10 text-emerald border-emerald/20'
    : pct >= 57  ? 'bg-amber/10 text-amber border-amber/20'
    : 'bg-rose/10 text-rose border-rose/20';
  const barClass = pct === 100 ? 'bg-emerald' : pct >= 57 ? 'bg-amber' : 'bg-rose';

  return { pct, missingKeys: faltan, colorClass, barClass };
}

type TFunc = ReturnType<typeof useTranslations<'phoenix.patients'>>;

/**
 * El badge nombra QUE falta, no un "Incompleto X%" generico — asi la columna
 * dice de una que hay que ir a buscar (mismo criterio que v2). Cuando falta
 * mas de una cosa se muestra la de mayor prioridad; la lista completa sigue
 * en el texto "Falta: ..." y en el tooltip.
 * Orden: primero lo que bloquea de verdad (sin consentimientos firmados no se
 * puede tratar), despues lo clinico/facturable, al final completitud de datos.
 */
const BADGE_PRIORITY: MissingKey[] = [
  'missingConsents',
  'missingMedicalHistory',
  'missingInsurance',
  'missingPersonal',
  'missingAccident',
  'missingEmergency',
  'missingDemographics',
];

const BADGE_LABEL_KEY: Record<MissingKey, string> = {
  missingConsents:       'badgeMissingConsents',
  missingMedicalHistory: 'badgeMissingMedicalHistory',
  missingInsurance:      'badgeMissingInsurance',
  missingPersonal:       'badgeMissingPersonal',
  missingAccident:       'badgeMissingAccident',
  missingEmergency:      'badgeMissingEmergency',
  missingDemographics:   'badgeMissingDemographics',
};

function formatProgress(prog: ReturnType<typeof calcIntakeProgress>, t: TFunc) {
  const { pct, missingKeys } = prog;
  const topMissing = BADGE_PRIORITY.find(k => missingKeys.includes(k));
  const badge = pct === 100
    ? t('progressComplete')
    : topMissing
      ? t(BADGE_LABEL_KEY[topMissing] as Parameters<typeof t>[0])
      : t('progressIncomplete', { pct });
  const missingItems = missingKeys.map(k => t(k as Parameters<typeof t>[0]));
  const sub = missingItems.length > 0
    ? `${t('progressMissingLabel')} ${missingItems.join(', ')}`
    : '';
  return { badge, sub, missingItems };
}


/**
 * Una cita del caso, tal como la manda `/api/admin/cases/[id]/appointments`.
 *
 * Se tipa contra `CalendarAppointment` a propósito: ese endpoint ya devuelve el
 * payload completo que consume `AppointmentDetailPanel` (paciente, caso, abogado,
 * seguro, servicios cargados), y el docblock del panel dice explícitamente que las
 * "citas del caso" son uno de sus consumidores. Antes acá se declaraban 8 campos
 * planos: el resto llegaba por la red y se tiraba.
 */
type AppointmentItem = CalendarAppointment & {
  checkedInAt: string | null;
  /** Sella el cierre de la visita. La columna Check-out estaba clavada en '—'. */
  checkedOutAt: string | null;
  attendanceSignedAt: string | null;
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(localeApp(), { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver' });
}

const APPT_STATUS_COLOR: Record<string, string> = {
  SCHEDULED:  'bg-brand/10 text-brand-text border-brand/20',
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
  NEW_REFERRAL:     'bg-brand/10 text-[#4338CA] dark:text-[#818CF8] border-brand/20',
  INTAKE_PENDING:   'bg-amber/10 text-amber border-amber/20',
  INTAKE_COMPLETED: 'bg-cyan/10 text-cyan border-cyan/20',
  CONFIRMED:        'bg-cyan/10 text-cyan border-cyan/20',
  ACTIVE:           'bg-emerald/10 text-emerald border-emerald/20',
  MMI:              'bg-violet/10 text-violet-text border-violet/20',
  CLOSED:           'bg-text-muted/10 text-text-muted border-text-muted/20',
  SETTLED:          'bg-emerald/10 text-emerald border-emerald/20',
  ARCHIVED:         'bg-text-muted/10 text-text-muted border-text-muted/20',
  CANCELLED:        'bg-rose/10 text-rose border-rose/20',
};

function fmtIsoDate(iso: string | null | undefined, locale = 'en-US'): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function CaseViewDialog({ caseId, open, onClose, onEdit }: {
  caseId: string; open: boolean; onClose: () => void; onEdit: () => void;
}) {
  const t      = useTranslations('phoenix.patients');
  const tWiz   = useTranslations('caseWizard');
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [coverage, setCoverage] = useState<CoverageDTO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}`)
      .then(r => r.json())
      .then(j => { setDetail(j.case ?? null); setCoverage(j.coverage ?? null); })
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
            <Briefcase className="w-4 h-4 text-brand-text" />
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
              <TagPill label={t(`caseStatus.${detail.status}` as Parameters<typeof t>[0]) ?? detail.status} colorClass={CASE_STATUS_COLOR[detail.status] ?? 'bg-bg-2 text-text-2 border-border'} />
              <span className="text-[11px] text-text-muted border border-border rounded px-1.5 py-0.5">{detail.caseType}</span>
              {detail.specialty && <span className="text-[11px] text-text-muted">{detail.specialty.name}</span>}
            </div>

            {/* Case info */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('caseInfoTitle')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-[12.5px]">
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelType')}</span><span className="text-text-1 font-medium">{detail.caseType}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelStatus')}</span><span className="text-text-1">{t(`caseStatus.${detail.status}` as Parameters<typeof t>[0]) ?? detail.status}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelCreated')}</span><span className="text-text-1">{fmtIsoDate(detail.createdAt)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelAccident')}</span><span className="text-text-1">{fmtIsoDate(detail.accidentDate)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelAttorney')}</span><span className="text-text-1">{detail.attorney ? `${detail.attorney.firstName} ${detail.attorney.lastName}` : t('caseNotSpecified')}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">{t('caseLabelChiro')}</span><span className="text-text-1">{chiropractor ?? t('caseNotSpecified')}</span></div>
              </div>
              {detail.accidentNotes && (
                <div className="pt-1 border-t border-border/40">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t('caseLabelDesc')}</p>
                  <p className="text-[12.5px] text-text-2">{detail.accidentNotes}</p>
                </div>
              )}
            </div>

            {/* Law firm */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('caseLabelLawFirm')}</p>
              </div>
              {lawFirmName ? (
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5">
                  <p className="text-[12.5px] text-text-1 font-medium">{lawFirmName}</p>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted italic">{t('caseNoLawFirm')}</p>
              )}
            </div>

            {/* Insurance */}
            <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('caseLabelInsurance')}</p>
              {/* Recepción decide acá, antes de que el paciente llegue: el chip
                  responde "¿tiene seguro?" sin abrir el diálogo de Seguros, que
                  pide 20 campos de póliza. */}
              {coverage && (
                <div className="pb-1">
                  <CoverageChip caseId={detail.id} coverage={coverage} size="md" onChanged={setCoverage} />
                </div>
              )}
              {detail.primaryInsurance ? (
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5">
                  <p className="text-[12.5px] text-text-1 font-medium">{detail.primaryInsurance.name}</p>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted italic">{t('caseNoInsurance')}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{t('btnClose')}</Button>
          <Button className="w-full sm:w-auto" onClick={() => { onClose(); onEdit(); }}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> {t('caseEditBtn')}
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
  const tWiz   = useTranslations('caseWizard');
  const t      = useTranslations('phoenix.patients');
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
        setAccDateDisp(c.accidentDate?.slice(0, 10) ?? '');
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
    const accidentDate = accDateDisp || null;
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
      if (!res.ok) { setError(json.message ?? t('errorSave')); return; }
      onSaved();
      onClose();
    } catch {
      setError(t('errorNetwork'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-brand-text" />
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
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">{tWiz('caseType')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([['MVA', tWiz('caseTypeMVA'), Car], ['GENERAL', tWiz('caseTypeGM'), Stethoscope]] as const).map(([val, label, Icon]) => (
                  <button key={val} type="button" onClick={() => setCaseType(val)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-all ${
                      caseType === val ? 'border-brand bg-brand/10 text-brand-text font-medium' : 'border-border bg-bg-2/40 text-text-muted hover:border-brand/40'
                    }`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                    {caseType === val && <Check className="w-3.5 h-3.5 ml-auto text-brand-text" />}
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
                  <input type="date"
                    value={accDateDisp}
                    onChange={e => setAccDateDisp(e.target.value)}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 outline-none focus:border-brand [color-scheme:dark]"
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
            <QrCode className="w-4 h-4 text-brand-text" />
            Patient Access
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs font-mono">
            Case #{caseCode}
          </DialogDescription>
        </DialogHeader>

        <p className="text-[11px] text-text-muted leading-relaxed -mt-1">
          Share this QR code or link with the patient so they can securely complete
          or update their registration information.
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
                className="p-1 rounded text-text-muted hover:text-brand-text transition-colors shrink-0"
                title="Copy link"
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
          <div className="text-[11px] text-rose text-center py-4">Could not generate the link.</div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Close</Button>
          {qrDataUrl && (
            <Button className="w-full sm:w-auto" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5 mr-1" /> Download QR
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Appointments Dialog ────────────────────────────────────────────────────
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(localeApp(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Denver' });
}
function addMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60000).toLocaleTimeString(localeApp(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Denver' });
}
function fmtApptDate(iso: string): string {
  return new Date(iso).toLocaleDateString(localeApp(), { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/Denver' });
}

function CaseAppointmentsDialog({ caseId, caseCode, open, onClose }: {
  caseId: string; caseCode: string; open: boolean; onClose: () => void;
}) {
  const t = useTranslations('phoenix.patients');
  // Las etiquetas de estado viven en el namespace del calendario: ya estaban las
  // nueve y no tiene sentido duplicarlas acá.
  const tc = useTranslations('phoenix.calendar');
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const [coverage, setCoverage]         = useState<CoverageDTO | undefined>(undefined);
  /** Cita abierta en el panel de detalle (el ojo). */
  const [verAppt, setVerAppt]   = useState<AppointmentItem | null>(null);
  /** Cita abierta directo en edición (el lápiz), sin pasar por el panel. */
  const [editAppt, setEditAppt] = useState<AppointmentItem | null>(null);
  const [page, setPage]         = useState(1);
  const [perPage, setPerPage]   = useState(10);
  const [recarga, setRecarga]   = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}/appointments`)
      .then(r => r.json())
      .then(j => { setAppointments(j.appointments ?? []); setCoverage(j.coverage ?? undefined); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, caseId, recarga]);

  // La página vuelve a 1 al reabrir o al cambiar el tamaño: quedarse en la 4 de
  // una lista que ahora tiene 2 páginas muestra una tabla vacía.
  useEffect(() => { setPage(1); }, [open, perPage]);

  const totalPages = Math.max(1, Math.ceil(appointments.length / perPage));
  const pagina = appointments.slice((page - 1) * perPage, page * perPage);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-text-1 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-brand-text" />
            {t('apptDialogTitle')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">
            {t('apptDialogDesc')}
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
              <p className="text-sm">{t('apptNoResults')}</p>
            </div>
          )}

          {!loading && appointments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-2 border-b border-border">
                  <tr>
                    {[t('apptColDate'),t('apptColStart'),t('apptColEnd'),t('apptColStatus'),t('apptColSigned'),t('apptColCheckin'),t('apptColCheckout'),t('apptColDoctor'),t('apptColSpecialty'),t('apptColActions')].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {pagina.map(a => (
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{fmtApptDate(a.scheduledFor)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{fmtTime(a.scheduledFor)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">{addMinutes(a.scheduledFor, a.durationMinutes)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {/* Mostraba el ENUM CRUDO (`CONFIRMED`) y traducía un solo
                            caso a mano, en inglés y sin pasar por i18n. */}
                        <TagPill label={etiquetaEstado(a, tc)} colorClass={APPT_STATUS_COLOR[a.status] ?? 'bg-bg-2 text-text-2 border-border'} />
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">
                        {a.attendanceSignedAt
                          ? <span className="text-emerald">✓ {t('apptSigned')}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">
                        {a.checkedInAt ? <span className="text-emerald text-[10px]">✓</span> : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">
                        {a.checkedOutAt
                          ? <span className="text-emerald text-[10px]">✓</span>
                          : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-1 whitespace-nowrap">
                        {nombreProvider(a.provider)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">
                        {a.provider?.specialty ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {/* Las cuatro acciones estaban rotas: el ojo y el lápiz
                            hacían el MISMO `router.push('/triage/<id>')` a una
                            página que no existe —y llamaban `onClose()` antes, así
                            que cerraban el diálogo y dejaban al usuario en un 404—
                            y las otras dos no tenían `onClick` en absoluto. */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setVerAppt(a)}
                            className="p-1.5 rounded text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                            title={t('apptActionView')}
                            aria-label={t('apptActionView')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {/* Atajo: el panel también tiene Editar adentro, pero
                              cambiar la hora o el doctor es lo más frecuente y no
                              tiene por qué costar dos pantallas. */}
                          <button
                            onClick={() => setEditAppt(a)}
                            className="p-1.5 rounded text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors"
                            title={t('apptActionEdit')}
                            aria-label={t('apptActionEdit')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
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

        {/* Pie de paginación. Era de cartón: el select no tenía estado, "Page 1 of
            1" estaba escrito a mano y los cuatro botones iban `disabled`, así que
            con más de 10 citas no había forma de ver las siguientes. */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-bg-1 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>{t('apptRowsPerPage')}</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="bg-bg-2 border border-border rounded px-2 py-1 text-[11px] text-text-1 focus:outline-none"
            >
              {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-text-muted">
            <span>{t('apptPageOf', { page, total: totalPages })}</span>
            <div className="flex gap-1 ml-2">
              {([
                { s: '«', to: 1,            off: page === 1 },
                { s: '‹', to: page - 1,     off: page === 1 },
                { s: '›', to: page + 1,     off: page === totalPages },
                { s: '»', to: totalPages,   off: page === totalPages },
              ]).map(b => (
                <button key={b.s} type="button" disabled={b.off} onClick={() => setPage(b.to)}
                  className="w-7 h-7 rounded border border-border text-text-muted disabled:opacity-30 enabled:hover:border-brand enabled:hover:text-brand-text transition-colors text-xs">
                  {b.s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>

      {/* El detalle de la cita: el MISMO panel del calendario. El endpoint de
          esta lista ya devolvía su payload completo —lo ampliaron para eso— y su
          docblock nombra a las "citas del caso" como consumidor. */}
      {verAppt && (
        <AppointmentDetailPanel
          appointment={verAppt}
          coverage={coverage}
          onClose={() => setVerAppt(null)}
          onRefresh={() => setRecarga(k => k + 1)}
        />
      )}

      {/* Edición directa desde la fila. */}
      {editAppt && (
        <AppointmentDialog
          mode="free"
          open
          onOpenChange={(o) => { if (!o) setEditAppt(null); }}
          editAppointment={{
            id: editAppt.id,
            scheduledFor: editAppt.scheduledFor,
            /* Decide si la fecha se puede mover: una cita atendida o con
               desenlace queda fija, una que solo venció se reprograma. */
            status: editAppt.status,
            durationMinutes: editAppt.durationMinutes,
            type: editAppt.type,
            notes: editAppt.notes,
            isOnline: editAppt.isOnline,
            meetingUrl: editAppt.meetingUrl,
            clinicId: editAppt.clinic.id,
            clinicName: editAppt.clinic.name,
            providerId: editAppt.provider?.id ?? null,
            providerFirstName: editAppt.provider?.firstName,
            providerLastName: editAppt.provider?.lastName,
            providerSpecialty: editAppt.provider?.specialty ?? undefined,
            caseId,
            caseCode,
            patient: {
              id: editAppt.patient.id,
              firstName: editAppt.patient.firstName,
              lastName: editAppt.patient.lastName,
            },
          }}
          onSuccess={() => { setEditAppt(null); setRecarga(k => k + 1); }}
        />
      )}
    </Dialog>
  );
}

const STATUS_COLORS: Record<string, string> = {
  NEW:        'bg-brand/15 text-[#4338CA] dark:text-[#818CF8] border-brand/30',
  ACTIVE:     'bg-emerald/15 text-emerald border-emerald/30',
  COMPLETED:  'bg-cyan/15 text-cyan border-cyan/30',
  DISCHARGED: 'bg-amber/15 text-amber border-amber/30',
  INACTIVE:   'bg-text-muted/15 text-text-muted border-text-muted/30',
};

// STATUS_LABEL is now computed inside PatientsClient using t()

export interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  patientCode: string | null;
  /**
   * Foto de perfil YA FIRMADA, o `null`. La arma el servidor en lote —ver
   * `patients-data.tsx`— y vence a los 15 minutos: no guardarla ni reusarla
   * fuera del render de esta página.
   */
  photoUrl: string | null;
  status: string;
  preferredLanguage: string | null;
  sex: string | null;
  maritalStatus: string | null;
  employer: string | null;
  preferredPharmacy: string | null;
  communicationPreference: string | null;
  referralSource: string | null;
  referralSourceOther: string | null;
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
  // El vínculo real al tutor; los tres de arriba son texto legado. Declarados
  // para que se vea que patients-data.tsx los tiene que traer: sin ellos el
  // diálogo de edición no ve el tutor que ya existe.
  guardianPatientId: string | null;
  guardianPatient: {
    id: string; patientCode: string | null;
    firstName: string; lastName: string;
    email: string | null; phone: string | null;
  } | null;
  accidentDate: Date | null;
  accidentType: string | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  medicalHistory: any;
  createdAt: Date;
  updatedAt: Date;
  latestCase: {
    id: string;
    caseCode: string;
    caseType: string;
    accidentDate: string | null;
    status: string;
    portalToken: string | null;
    intakeFormSentAt: string | null;
    intakeFormCompletedAt: string | null;
    consentsData: Record<string, unknown> | null;
    hasIntakeSubmission: boolean;
    hasAutoInsurance: boolean;
  } | null;
  caseCount: number;
}

interface Props {
  patients: PatientRow[];
  q?: string;
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  specialties: Array<{ id: string; name: string; color: string }>;
  clinics: Array<{ id: string; name: string; address: string | null }>;
  providers: Array<{ id: string; firstName: string; lastName: string; specialty: string }>;
  inactiveOnly?: boolean;
  inactiveTotal?: number;
  activeTotal?: number;
  agentName?: string;
  /** users.id (cuid Phoenix) del usuario logueado — mensajería interna */
  currentUserId?: string;
  /** SUPER_ADMIN/ADMIN — habilita borrar hilos del historial del paciente */
  isAdmin?: boolean;
  /**
   * Portal médico: QUIÉN es el provider de la sesión. Enciende el modo del
   * portal —esconde las acciones de mostrador y monta la ficha en solo
   * lectura— y hace que las URLs internas usen basePath.
   *
   * NO recorta la lista: desde 2026-09-16 el provider ve toda la clínica y el
   * recorte pasó a ser el filtro de abajo. Ver el docblock de PatientsData.
   */
  scopeProviderId?: string;
  /** El filtro "mis pacientes" está puesto. Lo único que recorta la lista. */
  soloMisPacientes?: boolean;
  /** Prefijo de rutas para navegación/paginación (default '/patients') */
  basePath?: string;
}


// ── QR Paciente dialog ─────────────────────────────────────────────────────
function QrPatientDialog({ patient, onClose }: { patient: PatientRow; onClose: () => void }) {
  const t = useTranslations('phoenix.patients');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    if (!patient.latestCase?.id) return;
    setLoading(true);
    fetch(`/api/admin/cases/${patient.latestCase.id}/generate-portal-token`, { method: 'POST' })
      .then(r => r.json())
      .then(async (j) => {
        if (j.portalUrl) {
          setPortalUrl(j.portalUrl);
          const url = await QRCode.toDataURL(j.portalUrl, {
            width: 280, margin: 2,
            color: { dark: '#e2e8f0', light: '#12141f' },
          });
          setQrDataUrl(url);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient.latestCase?.id]);

  const copyLink = async () => {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-${patient.firstName}-${patient.lastName}.png`;
    a.click();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('qrPatientTitle')} · {patient.firstName} {patient.lastName}</DialogTitle>
          <DialogDescription>{t('qrShareDesc')}</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {loading && (
            <div className="flex justify-center py-10 text-text-muted">
              <RefreshCw className="w-6 h-6 animate-spin opacity-40" />
            </div>
          )}
          {!loading && portalUrl && (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border bg-bg-2 px-3 py-2">
                <code className="flex-1 text-[11px] font-mono text-text-2 truncate">{portalUrl}</code>
                <button onClick={copyLink} className="p-1.5 rounded hover:bg-bg-1 text-text-muted hover:text-text-1 transition-colors shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              {qrDataUrl ? (
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="QR" className="rounded-lg border border-border" width={280} height={280} />
                </div>
              ) : (
                <div className="flex justify-center py-10 text-text-muted">
                  <RefreshCw className="w-6 h-6 animate-spin opacity-40" />
                </div>
              )}
            </>
          )}
          {!loading && !portalUrl && !patient.latestCase && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
              <QrCode className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">{t('qrNoPortal')}</p>
              <p className="text-[11px] text-center">{t('qrNoPortalDesc')}</p>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>{t('btnClose')}</Button>
          {qrDataUrl && (
            <Button onClick={downloadQr}>
              <Download className="w-3.5 h-3.5 mr-1" /> {t('btnDownload')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Título de columna que ordena la lista.
 *
 * Es un `<a>` y no un botón con `onClick`: el orden vive en la URL, así que el
 * título ES un enlace a esta misma lista ordenada de otra forma. Eso lo hace
 * abrible en otra pestaña, compartible por chat y —lo que importa acá— hace
 * que el navegador lo anuncie como enlace y no como un texto decorativo.
 *
 * La flecha se pinta SIEMPRE en la columna activa y sólo al pasar el mouse en
 * las demás: sin eso no hay forma de descubrir que el título se puede clickear,
 * que es exactamente lo que estaba pasando antes de que existiera.
 */
function ThOrden({
  label, href, dir, className = '',
}: {
  label: string;
  href: string;
  /** `'asc'`/`'desc'` si ESTA columna es la que ordena; `null` si no. */
  dir: 'asc' | 'desc' | null;
  className?: string;
}) {
  const Flecha = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      className={`px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold ${className}`}
    >
      <a
        href={href}
        className={`group/th inline-flex items-center gap-1 transition-colors ${
          dir ? 'text-brand-text' : 'text-text-muted hover:text-text-1'
        }`}
      >
        {label}
        <Flecha className={`w-3 h-3 shrink-0 transition-opacity ${
          dir ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-60'
        }`} />
      </a>
    </th>
  );
}


export function PatientsClient({ patients, q, page, pageSize = 10, totalPages, total, inactiveTotal = 0, activeTotal, specialties, clinics, providers, inactiveOnly = false, agentName, currentUserId, isAdmin = false, scopeProviderId, soloMisPacientes = false, basePath = '/patients' }: Props) {
  const doctorMode = !!scopeProviderId;
  const t      = useTranslations('phoenix.patients');
  const tCalls  = useTranslations('phoenix.calls');
  const tSms    = useTranslations('phoenix.sms');
  const tPrices = useTranslations('phoenix.catalog.priceList');
  const tMembresias = useTranslations('phoenix.memberships');
  const tCarrera = useTranslations('phoenix.carrera');
  const tMsg    = useTranslations('phoenix.messaging');
  const tCommon = useTranslations('phoenix.common');
  const router = useRouter();
  const searchParamsHook = useSearchParams();

  /**
   * Estados del CASO, traducidos. Las claves ya existían en
   * `phoenix.patients.caseStatus` y el panel de casos mostraba el enum crudo
   * ("INTAKE_PENDING") porque nadie las había cableado acá.
   */
  const CASE_STATUS_LABEL: Record<string, string> = {
    NEW_REFERRAL:     t('caseStatus.NEW_REFERRAL'),
    INTAKE_PENDING:   t('caseStatus.INTAKE_PENDING'),
    INTAKE_COMPLETED: t('caseStatus.INTAKE_COMPLETED'),
    CONFIRMED:        t('caseStatus.CONFIRMED'),
    ACTIVE:           t('caseStatus.ACTIVE'),
    MMI:              t('caseStatus.MMI'),
    CLOSED:           t('caseStatus.CLOSED'),
    SETTLED:          t('caseStatus.SETTLED'),
    ARCHIVED:         t('caseStatus.ARCHIVED'),
    CANCELLED:        t('caseStatus.CANCELLED'),
  };

  const STATUS_LABEL: Record<string, string> = {
    NEW:        t('patientStatus.NEW'),
    ACTIVE:     t('patientStatus.ACTIVE'),
    COMPLETED:  t('patientStatus.COMPLETED'),
    DISCHARGED: t('patientStatus.DISCHARGED'),
    INACTIVE:   t('patientStatus.INACTIVE'),
  };
  const [newCaseOpen,    setNewCaseOpen]    = useState(false);
  const [newCaseInitial, setNewCaseInitial] = useState<NewCaseInitialState | null>(null);

  /**
   * `?referral=<id>` — llegó desde el botón "Crear el caso" de un REFERIDO de
   * bufete (mensajería). Se trae el referido y se abre el wizard precargado:
   * paciente, accidente, bufete y abogado como representantes y como quienes
   * refirieron. Si otra persona ya lo convirtió, se abre ESE caso en vez de
   * crear otro — es el punto de guardar el estado.
   *
   * `referidosVistos` evita reabrirlo cuando el diálogo se cierra y el
   * `router.refresh()` vuelve a montar la lista con el mismo parámetro.
   */
  const referidosVistos = useRef<Set<string>>(new Set());
  useEffect(() => {
    const referralId = searchParamsHook.get('referral');
    if (!referralId || referidosVistos.current.has(referralId)) return;
    referidosVistos.current.add(referralId);
    let cancelado = false;
    fetch(`/api/referrals/${referralId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ref: (ReferidoParaWizard & { caseId: string | null }) | null) => {
        if (cancelado || !ref) return;
        const sp = new URLSearchParams(searchParamsHook.toString());
        sp.delete('referral');
        if (ref.status !== 'PENDING' && ref.caseId) {
          sp.set(CASE_PARAM, ref.caseId);
          router.replace(`${basePath}?${sp.toString()}`, { scroll: false });
          return;
        }
        const p = ref.payload;
        setNewCaseInitial({
          mode: 'manual',
          referralId: ref.id,
          firstName: p.cliente.firstName,
          lastName: p.cliente.lastName,
          phone: p.cliente.phone,
          email: p.cliente.email ?? '',
          dateOfBirth: p.cliente.dateOfBirth ?? '',
          language: p.cliente.language,
          caseType: 'MVA',
          accidentDate: p.accidente.date,
          accidentLocation: lugarDelAccidente(p.accidente),
          accidentNotes: notasDelReferido(p, {
            seguro: tMsg('refLblInsurance'), poliza: tMsg('refLblPolicy'), reclamo: tMsg('refLblClaim'),
            ajustador: tMsg('refLblAdjuster'), tercero: tMsg('refLblThirdParty'),
            notaDelBufete: tMsg('refLblNote'),
          }),
          lawFirm: { id: ref.firm.id, label: ref.firm.label, subtitle: ref.firm.subtitle },
          attorney: ref.attorney ? { id: ref.attorney.id, label: ref.attorney.label, subtitle: ref.attorney.subtitle } : null,
        });
        /**
         * Y la precarga del camino corto, con los MISMOS datos. Se arman las dos
         * acá y no dentro de cada diálogo: el referido se resuelve una sola vez y
         * la elección no vuelve a pedirle nada al servidor.
         */
        setReferidoRapido({
          firstName: p.cliente.firstName,
          lastName: p.cliente.lastName,
          phone: p.cliente.phone,
          email: p.cliente.email ?? undefined,
          dateOfBirth: p.cliente.dateOfBirth ?? undefined,
          language: p.cliente.language,
          caseType: 'MVA',
          accidentDate: p.accidente.date,
          description: notasDelReferido(p, {
            seguro: tMsg('refLblInsurance'), poliza: tMsg('refLblPolicy'), reclamo: tMsg('refLblClaim'),
            ajustador: tMsg('refLblAdjuster'), tercero: tMsg('refLblThirdParty'),
            notaDelBufete: tMsg('refLblNote'),
          }),
          lawFirmId: ref.firm.id,
          lawFirm: ref.firm.label,
          attorney: ref.attorney?.label ?? undefined,
        });
        // El wizard ya no se abre solo: primero se elige el camino.
        setReferidoElegir({
          id: ref.id,
          clientName: `${p.cliente.firstName} ${p.cliente.lastName}`.trim(),
          firmName: ref.firm.label,
        });
      })
      .catch(() => undefined);
    return () => { cancelado = true; };
  }, [searchParamsHook, router, basePath, tMsg]);

  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [deleteError,  setDeleteError]  = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<PatientRow | null>(null);
  const [viewTarget,   setViewTarget]   = useState<PatientRow | null>(null);
  const [quickRegister, setQuickRegister] = useState(false);
  /**
   * El referido que se está por dar de alta: abre la elección de camino.
   * `null` = no venimos de un referido y el registro rápido es el de siempre.
   */
  const [referidoElegir, setReferidoElegir] = useState<{ id: string; clientName: string; firmName: string | null } | null>(null);
  /** La precarga para el camino corto. Sobrevive a cerrar la elección. */
  const [referidoRapido, setReferidoRapido] = useState<ReferidoPrecarga | null>(null);
  /** El referido que viaja en el POST del camino corto, para marcarlo creado. */
  const [referidoRapidoId, setReferidoRapidoId] = useState<string | null>(null);
  // Set, no un id unico: se pueden tener varios pacientes expandidos a la vez
  const [expandedIds,   setExpandedIds]   = useState<Set<string>>(new Set());
  /** La foto que se está mirando en grande, o `null`. Ver `FotoGrandeDialog`. */
  const [fotoGrande,    setFotoGrande]    = useState<FotoGrande | null>(null);
  const [wizardPatient, setWizardPatient] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [expandedCases, setExpandedCases] = useState<Record<string, CaseRow[]>>({});
  const [loadingCases,  setLoadingCases]  = useState<Record<string, boolean>>({});
  const [pdfCaseId,      setPdfCaseId]      = useState<string | null>(null);
  const [caseQrTarget,   setCaseQrTarget]   = useState<CaseRow | null>(null);
  const [caseApptTarget, setCaseApptTarget] = useState<CaseRow | null>(null);
  const [caseViewTarget, setCaseViewTarget] = useState<CaseRow | null>(null);
  const [caseEditTarget, setCaseEditTarget] = useState<CaseRow | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<CaseRow | null>(null);
  const [segurosTarget,       setSegurosTarget]       = useState<PatientRow | null>(null);
  const [qrPatientTarget,    setQrPatientTarget]    = useState<PatientRow | null>(null);
  const [archivosTarget,     setArchivosTarget]     = useState<PatientRow | null>(null);
  const [medHistoryTarget,   setMedHistoryTarget]   = useState<PatientRow | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  /** El botón de la fila abierta. Se asigna al abrir: hay uno por fila. */
  const menuAnchor = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [searchValue,   setSearchValue]   = useState(q ?? '');

  /**
   * Abrir un caso = agregarle `?case=` a la URL de ESTA lista, sin tocar `q`,
   * `page` ni los filtros. Así un refresh vuelve con la búsqueda Y el caso
   * abierto; antes navegaba a la página del caso y al recargar se perdía todo.
   */
  const abrirCaso = useCallback((caseId: string) => {
    router.push(conCasoAbierto(basePath, searchParamsHook, caseId), { scroll: false });
  }, [router, basePath, searchParamsHook]);

  /**
   * Con el caso encima, los diálogos de mensajería se repliegan sin desmontarse
   * (ver `suspended` en PatientMessagesDialog): al cerrar el caso el hilo vuelve
   * como estaba, en vez de desaparecer.
   */
  const caseModalOpen = !!searchParamsHook.get(CASE_PARAM);
  const [isSearching,   setIsSearching]   = useState(false);
  const [localPatients, setLocalPatients] = useState<PatientRow[]>(patients);
  const [localTotal,    setLocalTotal]    = useState(total);
  const [localPages,    setLocalPages]    = useState(totalPages);
  const [isPending, startTransition] = useTransition();

  // Sync si el servidor devuelve datos nuevos (navegación de página)
  useEffect(() => { setLocalPatients(patients); setLocalTotal(total); setLocalPages(totalPages); }, [patients, total, totalPages]);

  /**
   * El servidor ya sirvió ESTA búsqueda: lo que pintó el render inicial.
   *
   * Sin esta marca el efecto corría en el montaje con el campo vacío y pedía la
   * lista de nuevo — cada visita a Pacientes ejecutaba la consulta dos veces (la
   * pesada: findMany de ~45 columnas + tres counts sobre el padrón) y tiraba el
   * render del servidor. Y peor: ese refetch no llevaba `page`, así que entrar
   * directo a `?page=3` mostraba la página 3 medio segundo y volvía sola a la 1,
   * con la URL reescrita sin `page`.
   *
   * Se compara contra `q` y no contra un booleano "ya monté": si el usuario
   * vuelve al término que ya estaba en la URL (escribe, borra, reescribe), lo
   * que hay en pantalla es exactamente eso y tampoco hace falta pedirlo.
   */
  const servidoPorElServidor = useRef((q ?? '').trim());

  useEffect(() => {
    const val = searchValue.trim();

    if (val === servidoPorElServidor.current) {
      setIsSearching(false);
      return;
    }

    // Spinner inmediato solo si hay término; limpiar debe sentirse instantáneo
    setIsSearching(!!val);

    // Nota: no se puede "restaurar" con la prop `patients` — si la página se
    // cargó con `?q=...` en la URL (p.ej. quedó pegado de una búsqueda
    // anterior por el replaceState de abajo), esa prop YA viene filtrada por
    // el servidor y no hay a qué volver. Limpiar pide siempre la lista real
    // al servidor, igual que cualquier otro término de búsqueda — sin
    // debounce, para que se sienta inmediato.
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (val) params.set('q', val);
        if (inactiveOnly) params.set('inactive', '1');
        // El recorte sigue al FILTRO, no a la identidad: sin el filtro puesto
        // el portal pide la lista completa, igual que el mostrador.
        if (soloMisPacientes && scopeProviderId) params.set('providerId', scopeProviderId);
        params.set('size', String(pageSize));
        // El orden y el filtro de tipo viajan también acá: sin esto, teclear
        // con la lista ordenada por nombre devolvía los resultados por fecha,
        // y el filtro MVA se soltaba solo al buscar.
        if (ordenUrl !== ORDEN_POR_DEFECTO) params.set('orden', ordenUrl);
        if (tipoUrl) params.set('tipo', tipoUrl);
        const res  = await fetch(`/api/admin/patients/list?${params}`);
        const data = await res.json();
        startTransition(() => {
          setLocalPatients(data.patients ?? []);
          setLocalTotal(data.total ?? 0);
          setLocalPages(data.totalPages ?? 1);
        });
        servidoPorElServidor.current = val;

        /**
         * La URL que queda tiene que poder RECARGARSE y dar esta pantalla.
         *
         * Se reconstruye con los nombres que lee la página, no con los de la
         * API: el filtro de archivados viaja como `inactive=1` en el fetch pero
         * la página lo lee de `showInactive`. Escribiendo el de la API, buscar
         * dentro de Archivados y recargar devolvía a Activos — y la búsqueda
         * seguía ahí, así que parecía que el paciente había "revivido".
         *
         * `page` se omite a propósito: una búsqueda nueva empieza en la primera
         * página, que es lo que acaba de pedir el fetch.
         */
        const url = new URLSearchParams();
        if (val) url.set('q', val);
        if (inactiveOnly) url.set('showInactive', '1');
        if (soloMisPacientes) url.set('mine', '1');
        if (pageSize !== PATIENTS_PAGE_SIZE) url.set('size', String(pageSize));
        if (ordenUrl !== ORDEN_POR_DEFECTO) url.set('orden', ordenUrl);
        if (tipoUrl) url.set('tipo', tipoUrl);
        const qs = url.toString();
        history.replaceState(null, '', `${basePath}${qs ? `?${qs}` : ''}`);
      } finally {
        setIsSearching(false);
      }
    }, val ? 350 : 0);

    return () => clearTimeout(timer);
  }, [searchValue, inactiveOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  // El cierre al scrollear lo maneja `FloatingPanel` con `onScrollClose`: al
  // scrollear la fila se va de la vista y el menú deja de tener a qué referirse.
  // Acá queda solo el clic afuera.
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => { document.removeEventListener('mousedown', handler); };
  }, [openMenuId]);

  const openMenu = (id: string, btn: HTMLButtonElement) => {
    menuAnchor.current = btn;
    setOpenMenuId(id);
  };

  const [sendPortalTarget, setSendPortalTarget] = useState<{ id: string; caseCode: string; patient: { firstName: string; lastName: string; phone: string | null; email: string | null; preferredLanguage?: 'es' | 'en' } } | null>(null);

  // ─── Mensajería interna (M1) — historial del paciente + compose ──────────
  // `msgCase` acota el historial a UN caso: es lo que abre el ícono de mensaje
  // de una fila de caso. Null = historial completo del paciente.
  const [msgPatient, setMsgPatient] = useState<ComposePatientRef | null>(null);
  const [msgCase, setMsgCase] = useState<MessagesCaseFilter | null>(null);

  const openPatientMessages = useCallback((p: { id: string; firstName: string; lastName: string }) => {
    setMsgCase(null);
    setMsgPatient({ id: p.id, name: `${p.lastName}, ${p.firstName}` });
  }, []);

  // PENDIENTE: abrir el caso desde un hilo de mensajería y replegar el diálogo
  // mientras el caso está encima. Requiere los props `onOpenCase`/`suspended` en
  // PatientMessagesDialog, que son parte de la edición de mensajes que otra
  // sesión tiene en curso. Se cableó antes de que existieran y rompió el build
  // de Vercel; vuelve cuando esa rama entre.

  const openCaseMessages = useCallback((
    p: { id: string; firstName: string; lastName: string },
    c: { id: string; caseCode: string; accidentDate: string | null },
  ) => {
    setMsgCase({ id: c.id, caseCode: c.caseCode, accidentDate: c.accidentDate });
    setMsgPatient({ id: p.id, name: `${p.lastName}, ${p.firstName}`, caseId: c.id });
  }, []);

  // ─── Llamar al paciente (Twilio real) ───────────────────────────────────
  const twilio = useTwilioDevice();
  // `patientId` puede ser null: devolver una llamada perdida de un número que
  // no está en la base es un caso válido — se marca igual, solo que el CallLog
  // queda sin vincular.
  const [callTarget, setCallTarget] = useState<{ name: string; phone: string; patientId: string | null; caseId: string | null } | null>(null);
  // A quien pertenece la llamada en curso — se usa para vincular el CallLog
  // cuando Twilio nos devuelve el SID (el webhook crea la fila sin dueño).
  const callOwnerRef = useRef<{ patientId: string | null; caseId: string | null } | null>(null);
  // Nombre/telefono de la llamada en curso, para mostrarlos en la barra.
  const [activeCallInfo, setActiveCallInfo] = useState<{ name: string; phone: string } | null>(null);
  const [callElapsed, setCallElapsed] = useState(0);
  const [callDismissedError, setCallDismissedError] = useState(false);

  useEffect(() => {
    if (twilio.callStatus !== 'in-call') { setCallElapsed(0); return; }
    const id = setInterval(() => setCallElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [twilio.callStatus]);

  useEffect(() => {
    const sid   = twilio.callSid;
    const owner = callOwnerRef.current;
    if (!sid || !owner) return;
    callOwnerRef.current = null;
    // Sin paciente no hay nada que vincular — la llamada igual queda
    // registrada por el webhook con el número, el agente y el resultado.
    if (!owner.patientId) return;
    void fetch('/api/twilio/link-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twilioCallSid: sid, patientId: owner.patientId, caseId: owner.caseId ?? undefined }),
    }).catch(() => {});
  }, [twilio.callSid]);

  // ─── Historial de llamadas ──────────────────────────────────────────────
  // Sin contador de "perdidas sin devolver": esas son entrantes perdidas, y
  // desde el 2026-08-05 Twilio desvía las entrantes a otro número, así que el
  // contador era un cero permanente y su fetch un viaje al servidor por cada
  // carga de la lista de pacientes.
  const [callHistoryOpen, setCallHistoryOpen] = useState(false);
  const [smsHistoryOpen,  setSmsHistoryOpen]  = useState(false);
  const [carreraOpen,     setCarreraOpen]     = useState(false);

  // ─── Precios (visor de mostrador, solo lectura) ─────────────────────────
  // Vive acá y no en el catálogo completo porque el uso es cotizar en el
  // momento, con el paciente enfrente. Visible también en el portal médico.
  const [priceListOpen, setPriceListOpen] = useState(false);

  /**
   * Membresías — el padrón de socios.
   *
   * No se muestra en el portal médico: el provider no necesita el padrón
   * entero (quién paga cuánto) para atender. Lo que sí ve es la membresía del
   * paciente que tiene delante, en la ficha y en el caso.
   */
  const [membresiasOpen, setMembresiasOpen] = useState(false);
  const [deletingCase, setDeletingCase]    = useState(false);
  const [deleteCaseError, setDeleteCaseError] = useState('');

  const fetchCases = useCallback(async (patientId: string) => {
    setLoadingCases(prev => ({ ...prev, [patientId]: true }));
    try {
      const res  = await fetch(`/api/admin/patients/${patientId}/cases`);
      const json = await res.json().catch(() => ({ cases: [] }));
      setExpandedCases(prev => ({ ...prev, [patientId]: json.cases ?? [] }));
    } finally {
      setLoadingCases(prev => ({ ...prev, [patientId]: false }));
    }
  }, []);

  // Expandir un paciente NO colapsa los demas: recepcion compara varios
  // pacientes con sus casos a la vista. Cada uno se cierra con su propio clic.
  const toggleExpand = useCallback(async (patientId: string) => {
    if (expandedIds.has(patientId)) {
      setExpandedIds(prev => { const next = new Set(prev); next.delete(patientId); return next; });
      return;
    }
    setExpandedIds(prev => new Set(prev).add(patientId));
    if (expandedCases[patientId]) return;
    await fetchCases(patientId);
  }, [expandedIds, expandedCases, fetchCases]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/patients/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.message ?? t('errorDelete'));
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setDeleteError(t('errorNetwork'));
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
      if (!res.ok) { setDeleteCaseError(json.message ?? t('errorCancelCase')); return; }
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
      setDeleteCaseError(t('errorNetwork'));
    } finally {
      setDeletingCase(false);
    }
  }

  const [restoreTarget,  setRestoreTarget]  = useState<PatientRow | null>(null);
  const [restoring,      setRestoring]      = useState(false);
  const [restoreError,   setRestoreError]   = useState('');

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreError('');
    try {
      const res = await fetch(`/api/admin/patients/${restoreTarget.id}/restore`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setRestoreError(json.message ?? t('errorRestore')); return; }
      setRestoreTarget(null);
      router.refresh();
    } catch {
      setRestoreError(t('errorNetwork'));
    } finally {
      setRestoring(false);
    }
  }

  /**
   * ── El término y la página, LEÍDOS DE LA URL VIVA ─────────────────────────
   *
   * No de las props, y es el arreglo del bug que reportó Erick el 2026-09-09:
   * *"el buscador solo busca en la primera página; en la siguiente deja de
   * buscar"*.
   *
   * La causa: el buscador **no navega** a propósito (ver el comentario del
   * `setTimeout` de arriba — pide la lista por `fetch`, la mete en estado local
   * y escribe la URL con `history.replaceState` para que se sienta inmediata y
   * para no exponer el `providerId`). Pero **`replaceState` no le avisa al
   * router de Next**: la URL dice `?q=patient` y la prop `q` que este componente
   * recibió sigue siendo la del último viaje real al servidor — vacía.
   *
   * Con la prop vacía, "página siguiente" navegaba a `/patients?page=1` **sin
   * `q`**, el servidor devolvía la página 2 de la lista COMPLETA, y el efecto de
   * sincronización pisaba los resultados de la búsqueda con esa lista. De ahí la
   * frase exacta del reporte.
   *
   * `page` tiene el mismo problema y por eso también sale de acá: después de
   * buscar, la URL ya no lleva `page` pero la prop sigue en el número viejo, así
   * que el "página X de Y" y el `disabled` de los botones mentían igual.
   *
   * Leerlas de la URL las vuelve una sola fuente de verdad, y deja de importar
   * si el último cambio vino de una navegación o de un `replaceState`.
   */
  const qUrl = searchParamsHook.get('q') ?? '';
  const pageUrl = Math.max(0, parseInt(searchParamsHook.get('page') ?? '0', 10) || 0);

  /**
   * Orden y filtro por tipo de caso, también de la URL y por el mismo motivo:
   * son lo que el servidor ya usó para armar ESTA página. Se leen con los
   * helpers —no con un cast— así una URL escrita a mano cae al default en vez
   * de pintar una flecha en una columna que no ordenó nada.
   */
  const ordenUrl = leerOrden(searchParamsHook.get('orden'));
  const tipoUrl  = leerTipoDeCaso(searchParamsHook.get('tipo'));

  /**
   * URL de la lista con estos parámetros. Una sola función para la paginación,
   * el selector de filas y las pestañas: cada una armaba la suya y perdía lo
   * que la otra acababa de poner.
   *
   * El `size` viaja salvo que sea el default (`PATIENTS_PAGE_SIZE`). La
   * comparación era contra `15`, un número que ya no es el default de nadie:
   * elegir 15 filas y pasar de página volvía a 10, porque justo ese valor se
   * omitía de la URL.
   */
  function listaUrl({
    page: p = pageUrl, size = pageSize, inactive = inactiveOnly, q: term = qUrl,
    mine = soloMisPacientes, orden = ordenUrl, tipo = tipoUrl ?? null,
  }: {
    page?: number; size?: number; inactive?: boolean; q?: string;
    mine?: boolean; orden?: OrdenPacientes;
    /** `null` = sin filtro. NO `undefined`: eso dispara el default y conserva el filtro puesto. */
    tipo?: TipoDeCaso | null;
  } = {}) {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (p > 0) params.set('page', String(p));
    if (inactive) params.set('showInactive', '1');
    if (mine) params.set('mine', '1');
    if (size !== PATIENTS_PAGE_SIZE) params.set('size', String(size));
    // El default no viaja: la URL de la lista "normal" queda limpia.
    if (orden !== ORDEN_POR_DEFECTO) params.set('orden', orden);
    if (tipo) params.set('tipo', tipo);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  }

  /**
   * Clickear un título: si esa columna ya ordena, invierte; si no, la toma con
   * su sentido natural (nombre de la A a la Z, fecha de la más nueva a la más
   * vieja). Siempre vuelve a la primera página — la fila que buscabas ya no
   * está en la página 4 después de reordenar.
   */
  const ordenUrlPara = (asc: OrdenPacientes, desc: OrdenPacientes, natural: OrdenPacientes) =>
    listaUrl({ page: 0, orden: ordenUrl === asc ? desc : ordenUrl === desc ? asc : natural });

  /** El sentido con el que ESTA columna está ordenando, o `null` si no lo está. */
  const dirDe = (asc: OrdenPacientes, desc: OrdenPacientes): 'asc' | 'desc' | null =>
    ordenUrl === asc ? 'asc' : ordenUrl === desc ? 'desc' : null;

  /** Filtro MVA / GM — vuelve a la primera página y conserva el resto. */
  const tipoUrlPara = (tipo: TipoDeCaso | null) => listaUrl({ page: 0, tipo });

  /** Cambiar de página o de tamaño: el tamaño nuevo manda y se vuelve al inicio. */
  const buildPageUrl = (p: number, size = pageSize) =>
    listaUrl({ page: size === pageSize ? p : 0, size });

  /** Pestaña Activos / Archivados — conserva búsqueda y filas por página. */
  const tabUrl = (inactive: boolean) => listaUrl({ page: 0, inactive });

  /** Filtro "mis pacientes" — vuelve a la primera página, conserva el resto. */
  const misUrl = (mine: boolean) => listaUrl({ page: 0, mine });

  return (
    <>
      {/* La foto en grande. Va acá arriba y no dentro de la fila: es `fixed` y
          tiene que escapar de cualquier contenedor con `transform`. */}
      <FotoGrandeDialog foto={fotoGrande} onClose={() => setFotoGrande(null)} cerrarLabel={tCommon('close')} />

      {/* Título + conteo unificado — compacto para que la grilla entre en
          pantalla sin scroll (v2 tampoco gasta una fila alta en el titulo). */}
      <div className="flex items-baseline gap-2 mb-2">
        <h1 className="text-xl font-bold text-text-1">{t('listTitle')}</h1>
        {localTotal > 0 && (
          <span className="text-sm font-medium text-text-muted tabular-nums">
            · {localTotal.toLocaleString()}
          </span>
        )}
      </div>

      {/* Toolbar: búsqueda + acciones en una sola fila */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {/* Search form — izquierda, ocupa el espacio disponible */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <div className="relative flex-1">
            {isSearching || isPending
              ? <RefreshCw className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-text animate-spin pointer-events-none" />
              : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            }
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className={`w-full pl-8 pr-3 py-2 bg-bg-2 border rounded-md text-sm text-text-1 placeholder:text-text-muted focus:outline-none transition-colors ${
                isSearching || isPending ? 'border-brand/50' : 'border-border focus:border-brand'
              }`}
              autoComplete="off"
            />
            {false && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-brand-text font-medium animate-pulse">
                Buscando…
              </span>
            )}
          </div>
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue('')}
              className="p-2 rounded-md border border-border text-text-muted hover:text-text-1 hover:border-border-strong transition-colors"
              title={t('btnClear')}
              aria-label={t('btnClear')}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Acciones — derecha */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Historial de llamadas — el contador rojo son las perdidas sin
              devolver, visible desde la lista sin entrar a ningún lado.
              A diferencia de "Create Patient / Create Case", esto NO está
              limitado a admin: hoy lo ve también el portal médico, que es el
              único usuario con acceso mientras se prueba. Cuando el módulo se
              agregue a roles_config, el gate pasa a ser por rol y este botón
              deja de depender de `doctorMode`. */}
          <button
            type="button"
            onClick={() => setCallHistoryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-bg-2 text-text-2 text-sm font-medium hover:border-brand hover:text-brand-text transition-colors whitespace-nowrap"
            title={tCalls('historyTitle')}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tCalls('historyTitle')}</span>
            <span className="sm:hidden">{tCalls('historyShort')}</span>
          </button>

          {/* Historial de SMS — hermano del de llamadas. Lo que se mira aca es
              el estado de ENTREGA: un SMS aceptado por Twilio no es un SMS
              recibido, y esta es la unica pantalla donde se ve la diferencia. */}
          <button
            type="button"
            onClick={() => setSmsHistoryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-bg-2 text-text-2 text-sm font-medium hover:border-brand hover:text-brand-text transition-colors whitespace-nowrap"
            title={tSms('title')}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tSms('title')}</span>
            <span className="sm:hidden">{tSms('short')}</span>
          </button>

          {/* Carrera — el ritmo de trabajo del equipo, abierto a todos con
              nombres completos (decisión de Erick, 31-ago-2026: "es una carrera
              entre todos"). Va acá, entre los historiales y Precios, y con la
              misma mecánica: un botón que abre un diálogo sin sacar a nadie de
              la lista.

              Lo que la hace segura de compartir es lo que su API NO devuelve:
              ni llamadas, ni SMS, ni desglose acción por acción, ni un solo
              dato de paciente — ver `lib/carrera.ts`. */}
          <button
            type="button"
            onClick={() => setCarreraOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-bg-2 text-text-2 text-sm font-medium hover:border-brand hover:text-brand-text transition-colors whitespace-nowrap"
            title={tCarrera('subtitle')}
          >
            <Trophy className="w-3.5 h-3.5" />
            {tCarrera('title')}
          </button>

          {/* Precios — visor de mostrador. Solo lectura y sin costo real: se
              abre con el paciente enfrente. Igual que el historial de llamadas,
              lo ve también el portal médico. */}
          <button
            type="button"
            onClick={() => setPriceListOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-bg-2 text-text-2 text-sm font-medium hover:border-brand hover:text-brand-text transition-colors whitespace-nowrap"
            title={tPrices('title')}
          >
            <Tag className="w-3.5 h-3.5" />
            {tPrices('button')}
          </button>

          {/* Membresías — el padrón de socios de la clínica.

              Va pegado a Precios porque se usa en el mismo momento: alguien
              enfrente preguntando cuánto sale algo, o si su membresía sigue
              viva. Y va ANTES de Crear paciente / Crear caso, que es donde
              Erick lo pidió (13-sep-2026).

              No aparece en el portal médico: el provider no necesita saber
              quién paga cuánto. La membresía del paciente que está atendiendo
              sí la ve, en la ficha y en el caso. */}
          {!doctorMode && (
            <button
              type="button"
              onClick={() => setMembresiasOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-bg-2 text-text-2 text-sm font-medium hover:border-brand hover:text-brand-text transition-colors whitespace-nowrap"
              title={tMembresias('subtitulo')}
            >
              <BadgeCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tMembresias('boton')}</span>
              <span className="sm:hidden">{tMembresias('botonCorto')}</span>
            </button>
          )}

          {/* Creación — solo admin; el doctor no crea pacientes/casos.
              "New patient" (patient-create-dialog.tsx) fue eliminado del todo:
              "Create Patient / Create Case" es el único camino de creación, y
              es el que tiene la detección de menor de edad con vínculo real al
              padre/apoderado. El otro dialog había quedado huérfano (nadie lo
              importaba) y mantenerlo habría sido una segunda implementación del
              mismo flujo lista para desviarse — el mismo patrón que ya causó
              bugs con calcAge y los generadores de código duplicados. */}
          {/**
            * En el PORTAL MÉDICO el mismo botón abre DIRECTO el alta rápida.
            *
            * El provider también da de alta pacientes —MVA o GM, eligiendo el
            * tipo— y entra por el mismo lugar que la clínica (Erick,
            * 2026-09-11). Lo que no recibe es el selector de escenarios: sus
            * otras tres opciones son de mostrador (marcar por Twilio, buscar a
            * quién llamar, alta con bufete y seguros), y el dial-pad no es algo
            * que se abra de refilón desde la consulta.
            */}
          <button
            type="button"
            onClick={() => {
              if (doctorMode) { setQuickRegister(true); return; }
              setNewCaseInitial(null);
              setNewCaseOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald text-white text-sm font-medium hover:bg-emerald/90 transition-colors whitespace-nowrap"
            title={doctorMode ? t('btnQuickRegisterTooltip') : t('btnCreatePatientCaseTooltip')}
          >
            {doctorMode
              ? <UserPlus className="w-3.5 h-3.5" />
              : <PhoneOutgoing className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {doctorMode ? t('btnQuickRegister') : t('btnCreatePatientCase')}
            </span>
            <span className="sm:hidden">{t('btnCreateShort')}</span>
          </button>
        </div>
      </div>

      {/* Tabs: Activos / Archivados */}
      <div className="flex items-center gap-1 border-b border-border mb-2 flex-wrap">
        <a
          href={tabUrl(false)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !inactiveOnly
              ? 'border-brand text-brand-text'
              : 'border-transparent text-text-muted hover:text-text-1'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          {t('btnActive')}
          <span className={`ml-1 text-[10px] rounded-full px-1.5 py-0.5 tabular-nums font-semibold ${
            !inactiveOnly ? 'bg-brand/10 text-brand-text' : 'bg-bg-2 text-text-muted'
          }`}>
            {!inactiveOnly ? localTotal : (activeTotal ?? total)}
          </span>
        </a>
        <a
          href={tabUrl(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            inactiveOnly
              ? 'border-amber text-amber'
              : 'border-transparent text-text-muted hover:text-text-1'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('btnInactive')}
          <span className={`ml-1 text-[10px] rounded-full px-1.5 py-0.5 tabular-nums font-semibold ${
            inactiveOnly ? 'bg-amber/10 text-amber' : 'bg-bg-2 text-text-muted'
          }`}>
            {inactiveOnly ? localTotal : inactiveTotal}
          </span>
        </a>
        {/*
          Los filtros de la derecha. Comparten fila con las pestañas y se
          separan de ellas con `ml-auto`: son ejes distintos —la pestaña es el
          ESTADO del paciente, esto es DE QUIÉN es y DE QUÉ TIPO— y mezclarlos
          entre las pestañas sugeriría que se excluyen entre sí.
        */}
        <div className="ml-auto flex items-center gap-1.5 pb-1.5 flex-wrap">
          {/*
            FILTRO DEL PORTAL · toda la clínica / mis pacientes.

            El provider ve toda la clínica igual que el mostrador; esto es una
            COMODIDAD para volver a su gente, no un permiso (Erick, 2026-09-16:
            "el provider ve todo sin restricción, la única diferencia es que
            podrá filtrar sus pacientes").

            Por eso el default es "Todos" y no "Mis pacientes": lo contrario
            escondería la mitad de la clínica detrás de un control que hay que
            descubrir, que es justo lo que se pidió cambiar.
          */}
          {doctorMode && ([
            { mine: false, label: t('filterAllPatients') },
            { mine: true,  label: t('filterMyPatients')  },
          ]).map(op => (
            <a
              key={String(op.mine)}
              href={misUrl(op.mine)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                soloMisPacientes === op.mine
                  ? 'bg-violet/15 text-violet-text'
                  : 'bg-bg-2 text-text-muted hover:text-text-1'
              }`}
            >
              {op.label}
            </a>
          ))}

          {/*
            TIPO DE CASO · todos / MVA / GM.

            Va acá y no en un título de la tabla porque es un filtro, no un
            orden: recorta el padrón, igual que Activos/Archivados, y tiene que
            poder verse y tocarse en el teléfono. La columna "Casos" existe pero
            está `hidden` abajo de md, así que colgarlo de ese título lo habría
            dejado inalcanzable justo donde más se usa la lista.

            El tipo vive en el CASO, no en el paciente: quien tiene un MVA y un
            GM aparece en las dos listas, que es lo correcto.
          */}
          <div className="flex items-center gap-1 rounded-md bg-bg-2 p-0.5" role="group" aria-label={t('filtroTipoLabel')}>
            {([
              { tipo: null,               label: t('filtroTipoTodos') },
              { tipo: 'MVA' as const,     label: CASE_TYPE_LABEL.MVA! },
              { tipo: 'GENERAL' as const, label: CASE_TYPE_LABEL.GENERAL! },
            ]).map(op => (
              <a
                key={op.tipo ?? 'todos'}
                href={tipoUrlPara(op.tipo)}
                aria-current={(tipoUrl ?? null) === op.tipo ? 'true' : undefined}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  (tipoUrl ?? null) === op.tipo
                    ? 'bg-brand/15 text-brand-text'
                    : 'text-text-muted hover:text-text-1'
                }`}
              >
                {op.label}
              </a>
            ))}
          </div>

          {/*
            El mismo orden que dan los títulos de la tabla, para las pantallas
            donde esos títulos no están.

            "Creado" es `hidden xl:table-cell`, así que abajo de xl el único
            título clickeable es Paciente y no habría forma de pedir "los más
            recientes" — que es justo lo que se pidió. De xl para arriba los dos
            títulos se ven y este control sobra, así que desaparece en vez de
            decir lo mismo dos veces.
          */}
          <label className="xl:hidden flex items-center gap-1 text-text-muted">
            <ArrowUpDown className="w-3 h-3 shrink-0" />
            <span className="sr-only">{t('ordenLabel')}</span>
            <select
              value={ordenUrl}
              onChange={e => router.push(listaUrl({ page: 0, orden: leerOrden(e.target.value) }))}
              className="py-1 pl-1.5 pr-5 text-[11px] font-semibold bg-bg-2 border border-border rounded-md text-text-2 focus:outline-none focus:ring-1 focus:ring-brand/40 appearance-none cursor-pointer"
            >
              <option value="reciente">{t('ordenReciente')}</option>
              <option value="antiguo">{t('ordenAntiguo')}</option>
              <option value="nombre">{t('ordenNombre')}</option>
              <option value="nombreDesc">{t('ordenNombreDesc')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="relative rounded-lg border border-border">
        {(isSearching || isPending) && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-12 bg-bg-1/60 backdrop-blur-[1px] rounded-lg pointer-events-none">
            <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-full px-3 py-1.5 shadow-lg pointer-events-auto">
              <RefreshCw className="w-3.5 h-3.5 text-brand-text animate-spin" />
              <span className="text-[11px] text-text-2 font-medium">{t('searching')}</span>
            </div>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg">
        {/* El `min-w` arranca en sm: abajo de ese breakpoint las 6 columnas del
            medio son `hidden`, así que solo quedan Paciente y Acciones —y
            forzar 980px para dos columnas hacía que Paciente midiera 674px y
            que Acciones, que es sticky a la derecha, se pintara ENCIMA del
            nombre (668px de superposición, medidos a 388px), más 668px de
            paneo hacia un medio vacío. Con `w-full` las dos entran sin scroll. */}
        <table className={`w-full sm:min-w-[980px] table-fixed text-sm transition-opacity duration-150 ${isSearching || isPending ? 'opacity-40' : 'opacity-100'}`}>
          <thead className="bg-bg-2 border-b border-border">
            <tr>
              {/* Anchos parejos a proposito: las 3 columnas de texto miden lo
                  mismo (220px) y las 5 compactas comparten 100px, asi la tabla
                  se lee cuadrada en vez de con saltos de 56px a 200px. */}
              {/* Sin ancho fijo abajo de sm: ahí las 6 del medio están `hidden` y
                  220 + 100 de Acciones dan 320 contra un contenedor de 310, así
                  que Acciones —sticky y opaca— se comía los últimos 10px del
                  nombre. En auto, table-fixed le da lo que sobra. */}
              <ThOrden
                label={t('colPatient')}
                href={ordenUrlPara('nombre', 'nombreDesc', 'nombre')}
                dir={dirDe('nombre', 'nombreDesc')}
                className="sticky left-0 z-10 bg-bg-2 text-left sm:w-[220px]"
              />
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell w-[220px]">{t('colContact')}</th>
              <th className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell w-[100px]">{t('colCases')}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell w-[100px]">{t('colStatus')}</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell w-[220px]">{t('colAdmission')}</th>
              <th className="text-center px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell w-[100px]">{t('colForm')}</th>
              <ThOrden
                label={t('colCreated')}
                href={ordenUrlPara('antiguo', 'reciente', 'reciente')}
                dir={dirDe('antiguo', 'reciente')}
                className="text-left hidden xl:table-cell w-[100px]"
              />
              <th className="sticky right-0 z-10 bg-bg-2 w-[100px] px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-text-muted text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {/* De la URL viva, por lo mismo que los links: buscar no
                      navega, así que con la prop una búsqueda sin resultados
                      decía "no hay pacientes" en vez de "sin resultados para X". */}
                  {qUrl ? t('noResultsFor', { q: qUrl }) : t('noPatients')}
                </td>
              </tr>
            )}
            {localPatients.map((p) => (
              <Fragment key={p.id}>
              {/**
                * El hover se pinta CELDA POR CELDA, no cambiando el fondo de la
                * fila.
                *
                * Estaba como `hover:bg-white/[0.02]` en el `<tr>`, y las dos
                * celdas fijas (Paciente y Acciones) pintan su propio fondo
                * opaco encima — así que el resaltado aparecía SOLO en las
                * columnas del medio, como si se encendiera una franja. Es la
                * trampa que el CLAUDE.md documenta para las tablas con celdas
                * fijas escritas a mano, y esta es una de las cuatro que la
                * tenían. `HOVER_CELDA` es la misma capa `::before` que usa el
                * primitivo `DataTable`, activada por el `group` de la fila: se
                * compone SOBRE el fondo de cada celda en vez de reemplazarlo,
                * así que cruza la fila entera.
                *
                * La fila abierta además se tiñe de `brand`: el panel de abajo
                * lleva el mismo tinte, y juntos se leen como un bloque.
                */}
              <tr className={`group border-b border-row-sep ${expandedIds.has(p.id) ? 'bg-brand/[0.04]' : ''}`}>
                {/* Chevron expand */}
                <td className={`sticky left-0 z-10 bg-bg-0 px-4 py-2 w-[220px] ${HOVER_CELDA}`}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className={`p-1.5 rounded transition-colors shrink-0 ${expandedIds.has(p.id) ? "text-brand-text" : "text-text-muted hover:text-brand-text"}`}
                      title={expandedIds.has(p.id) ? t('tooltipCollapse') : t('tooltipExpand')}
                      aria-label={expandedIds.has(p.id) ? t('tooltipCollapse') : t('tooltipExpand')}
                      aria-expanded={expandedIds.has(p.id)}
                      aria-controls={`cases-row-${p.id}`}
                    >
                      {expandedIds.has(p.id)
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {/*
                      La carita, a la izquierda del nombre.
                      ─────────────────────────────────────────────────────
                      Con foto se agranda al hacerle clic; sin foto son las
                      iniciales y no hay nada que abrir — por eso el botón
                      existe solo cuando hay `photoUrl`, en vez de estar
                      siempre y no hacer nada la mayoría de las veces (solo el
                      17,3% de los pacientes tiene foto).

                      `stopPropagation` porque la fila entera navega al perfil:
                      sin eso, agrandar la foto te saca de la lista.
                    */}
                    {p.photoUrl ? (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setFotoGrande({ url: p.photoUrl!, nombre: `${p.firstName} ${p.lastName}`.trim() }); }}
                        title={t('tooltipVerFoto')}
                        aria-label={t('tooltipVerFoto')}
                        className="shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand/50"
                      >
                        <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={6} photoUrl={p.photoUrl} />
                      </button>
                    ) : (
                      <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={6} />
                    )}
                    <div className="min-w-0">
                      <button
                        onClick={() => router.push(`${basePath}/${p.id}`)}
                        className="text-text-1 text-sm font-medium hover:text-brand-text transition-colors text-left truncate block w-full"
                        title={`${p.firstName} ${p.lastName}`}
                        aria-label={`Ver perfil de ${p.firstName} ${p.lastName}`}
                      >
                        {p.firstName} {p.lastName}
                      </button>
                      {p.patientCode && (
                        <div className="text-text-muted text-[11px] font-mono leading-tight">{p.patientCode}</div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contact */}
                <td className={`px-4 py-2 hidden sm:table-cell w-[220px] ${HOVER_CELDA}`}>
                  {/* Una sola linea (estandar de listas §4). Muestra el CORREO,
                      no el telefono: llamar va a ser una accion del menu "..."
                      (igual que v2, que en esta columna pone el email). */}
                  <div className="flex items-center gap-1.5 text-[13px] min-w-0">
                    {p.email ? (
                      <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} title={p.email}
                        className="text-text-2 hover:text-brand-text transition-colors truncate">
                        {p.email}
                      </a>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                    {p.preferredLanguage && (
                      <span className="shrink-0 text-[10px] text-text-muted" title={p.preferredLanguage === 'es' ? 'Español' : 'English'}>
                        {p.preferredLanguage === 'es' ? '🇪🇸' : '🇺🇸'}
                      </span>
                    )}
                  </div>
                </td>

                {/* Casos */}
                <td className={`px-3 py-2 hidden md:table-cell w-[100px] text-center ${HOVER_CELDA}`}>
                  <button
                    onClick={() => toggleExpand(p.id)}
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold transition-colors tabular-nums ${expandedIds.has(p.id) ? "bg-brand/20 border border-transparent text-brand-text" : "bg-bg-2 border border-border text-text-2 hover:bg-brand/10 hover:border-brand/40 hover:text-brand-text"}`}
                    title={p.caseCount === 1 ? t('caseCountSingular') : t('caseCountPlural', { n: p.caseCount })}
                    aria-label={p.caseCount === 1 ? t('caseCountSingular') : t('caseCountPlural', { n: p.caseCount })}
                  >
                    {p.caseCount}
                  </button>
                </td>

                {/* Estado */}
                <td className={`px-4 py-2 hidden sm:table-cell w-[100px] ${HOVER_CELDA}`}>
                  <TagPill
                    label={STATUS_LABEL[p.status] ?? p.status}
                    colorClass={STATUS_COLORS[p.status] ?? 'bg-bg-2 text-text-2 border-border'}
                  />
                </td>

                {/* Admisión */}
                <td className={`px-4 py-2 hidden lg:table-cell w-[220px] ${HOVER_CELDA}`}>
                  {p.latestCase ? (() => {
                    const prog = calcIntakeProgress(
                      {
                        id: '', caseCode: '', status: p.latestCase.status,
                        caseType: p.latestCase.caseType, accidentType: null,
                        accidentDate: p.latestCase.accidentDate, accidentNotes: null,
                        intakeFormCompletedAt: p.latestCase.intakeFormCompletedAt,
                        consentsData: p.latestCase.consentsData,
                        hasIntakeSubmission: p.latestCase.hasIntakeSubmission,
                        firstAppointment: null, lastAppointment: null,
                      },
                      p,
                    );
                    const { badge, missingItems } = formatProgress(prog, t);
                    return (
                      <div className="leading-tight">
                        <div className="flex items-center gap-2 mb-0.5">
                          {/* Icono dentro del badge (como v2): el color solo no
                              alcanza — con ⚠ / ✓ el estado se lee de un vistazo
                              y funciona tambien para daltonismo rojo-verde. */}
                          <TagPill
                            label={badge}
                            colorClass={prog.colorClass}
                            icon={prog.pct === 100
                              ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                              : <AlertTriangle className="w-3 h-3 shrink-0" />}
                          />
                        </div>
                        <div className="h-1 rounded-full bg-bg-2 overflow-hidden w-full">
                          <div className={`h-full rounded-full transition-all ${prog.barClass}`} style={{ width: `${prog.pct}%` }} />
                        </div>
                        <MissingTooltip items={missingItems} pct={prog.pct < 100 ? prog.pct : undefined} missingLabel={t('progressMissingLabel')} />
                      </div>
                    );
                  })() : <span className="text-[10px] text-text-muted">—</span>}
                </td>

                {/* Formulario */}
                <td className={`px-3 py-2 hidden lg:table-cell w-[100px] ${HOVER_CELDA}`}>
                  <div className="flex items-center gap-1.5">
                    {/* Llamar — va primero. Solo habilitado si hay telefono.
                        El teléfono sale de los DOS campos: mirando solo `phone`,
                        a más de la mitad de los pacientes el botón les salía
                        bloqueado teniendo el número cargado en el celular
                        (ver `lib/telefono-paciente`). */}
                    {telefonoDe(p) && !doctorMode ? (
                      <button
                        onClick={() => setCallTarget({
                          name:   `${p.firstName} ${p.lastName}`,
                          phone:  telefonoDe(p)!,
                          patientId: p.id,
                          caseId: p.latestCase?.id ?? null,
                        })}
                        className="p-1.5 rounded hover:bg-emerald/10 transition-colors group"
                        title={t('tooltipCallPatient', { phone: telefonoDe(p)! })}
                        aria-label={t('tooltipCallPatient', { phone: telefonoDe(p)! })}
                      >
                        <PhoneCall className="w-3.5 h-3.5 text-text-muted group-hover:text-emerald transition-colors" />
                      </button>
                    ) : (
                      /**
                       * Bloqueado, y diciendo POR QUÉ. Los dos motivos caían en
                       * el mismo `else` con el mismo cartel, así que en el
                       * portal médico el ícono decía "sin teléfono registrado"
                       * sobre un paciente que lo tenía anotado: la razón era el
                       * rol, no el dato. Un cartel que miente es peor que no
                       * tener cartel — manda a recepción a "arreglar" una ficha
                       * que está completa.
                       */
                      <span title={doctorMode && telefonoDe(p) ? t('tooltipStaffOnly') : t('tooltipNoPhone')}>
                        <PhoneCall className="w-3.5 h-3.5 text-text-muted opacity-25" />
                      </span>
                    )}
                    {/* Ícono email — clickeable si hay caso + email (solo admin) */}
                    {p.latestCase && p.email && !doctorMode ? (
                      <button
                        onClick={() => setSendPortalTarget({
                          id: p.latestCase!.id,
                          caseCode: p.latestCase!.caseCode,
                          patient: {
                            firstName: p.firstName,
                            lastName: p.lastName,
                            phone: telefonoDe(p),
                            email: p.email,
                            preferredLanguage: (p.preferredLanguage as 'es' | 'en' | null) ?? undefined,
                          },
                        })}
                        className="p-1.5 rounded hover:bg-brand/10 transition-colors group"
                        title={p.latestCase.intakeFormSentAt ? t('tooltipSendFormResend', { date: fecha(p.latestCase.intakeFormSentAt) }) : t('tooltipSendFormNew')}
                        aria-label={p.latestCase.intakeFormSentAt ? t('tooltipSendFormResend', { date: fecha(p.latestCase.intakeFormSentAt) }) : t('tooltipSendFormNew')}
                      >
                        <Mail className={`w-3.5 h-3.5 transition-colors ${p.latestCase.intakeFormSentAt ? 'text-brand-text' : 'text-text-muted group-hover:text-brand-text'}`} />
                      </button>
                    ) : (
                      // Mismo criterio que el teléfono: en el portal el motivo
                      // es el rol, y el cartel tiene que decir eso.
                      <span title={
                        doctorMode && p.latestCase && p.email ? t('tooltipStaffOnly')
                        : !p.email ? t('tooltipNoEmail')
                        : t('tooltipNoCase')
                      }>
                        <Mail className="w-3.5 h-3.5 text-text-muted opacity-25" />
                      </span>
                    )}
                    {/* Mensajería interna — disponible también en el portal
                        médico (mismo componente para ambos módulos).
                        Sin casos no hay nada que consultar: el ícono queda
                        deshabilitado, igual que teléfono/email cuando faltan.
                        NO se pasa caseId: el compose elige el caso vivo. */}
                    {currentUserId && (
                      p.caseCount > 0 ? (
                        <button
                          onClick={() => openPatientMessages(p)}
                          className="p-1.5 rounded hover:bg-brand/10 transition-colors group"
                          title={tMsg('tooltipPatientMessages')}
                          aria-label={`${tMsg('tooltipPatientMessages')} — ${p.firstName} ${p.lastName}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-text-muted group-hover:text-brand-text transition-colors" />
                        </button>
                      ) : (
                        <span title={tMsg('tooltipNoCaseForMessage')} className="p-1.5 inline-flex">
                          <MessageSquare className="w-3.5 h-3.5 text-text-muted opacity-25" />
                        </span>
                      )
                    )}
                  </div>
                </td>

                {/* Created */}
                <td className={`hidden xl:table-cell px-4 py-2 text-[11px] text-text-muted tabular-nums whitespace-nowrap ${HOVER_CELDA}`}>
                  {fecha(p.createdAt)}
                </td>

                {/* Acciones */}
                <td className={`sticky right-0 z-10 bg-bg-0 px-4 py-2 ${HOVER_CELDA}`}>
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => openMenu(p.id, e.currentTarget)}
                      className="p-2 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors"
                      title={t('colActions')}
                      aria-label={`${t('colActions')} — ${p.firstName} ${p.lastName}`}
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === p.id}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>

              {/* ── Fila expandida: los casos del paciente ────────────────────
                  Era una TABLA adentro de la tabla: su propio juego de
                  encabezados grises competía con el de arriba y el ojo no sabía
                  cuál era de quién. Y el bloque arrancaba pegado al borde
                  izquierdo, a 220px del nombre del que cuelga, así que nada lo
                  ataba a su fila.

                  Ahora cada caso es una FILA-TARJETA y el panel se indenta bajo
                  el nombre, con la barra de acento ahí. Con un caso se ve
                  liviano y con doce sigue leyéndose igual — que es el punto: hay
                  pacientes con doce (Erick, 2026-09-13).

                  La misma tarjeta sirve para teléfono y escritorio: antes había
                  dos implementaciones (`md:hidden` + `hidden md:block`) que se
                  mantenían por separado y ya habían divergido en qué acciones
                  ofrecía cada una. */}
              {expandedIds.has(p.id) && (
                <tr key={`${p.id}-cases`} id={`cases-row-${p.id}`} className="bg-brand/[0.04] border-b border-row-sep">
                  {/* colSpan 8, no 7: la tabla tiene OCHO columnas y con siete el
                      panel dejaba una franja muerta bajo Acciones — se veía como
                      un corte a la derecha del bloque. */}
                  <td colSpan={8} className="p-0">
                    <div className="pl-8 sm:pl-10 pr-3 sm:pr-4 pb-3">
                      <div className="border-l-2 border-brand pl-3.5">
                        <div className="flex items-center justify-between flex-wrap gap-2 py-2">
                          <span className="text-[11px] text-text-muted">
                            {p.caseCount === 1 ? t('caseCountSingular') : t('caseCountPlural', { n: p.caseCount })}
                          </span>
                          {!inactiveOnly && (
                            <button
                              onClick={() => setWizardPatient({ id: p.id, firstName: p.firstName, lastName: p.lastName })}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand/15 text-brand-text text-[11px] font-medium hover:bg-brand/25 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> {t('btnAddCase')}
                            </button>
                          )}
                        </div>

                        {loadingCases[p.id] && (
                          <p className="text-[11px] text-text-muted py-2">{t('loadingCases')}</p>
                        )}

                        {!loadingCases[p.id] && (expandedCases[p.id] ?? []).length === 0 && (
                          <p className="text-[11px] text-text-muted py-2">{t('noCasesRegistered')}</p>
                        )}

                        {!loadingCases[p.id] && (expandedCases[p.id] ?? []).length > 0 && (
                          /* Con más de cinco casos la lista scrollea sola en vez
                             de empujar media pantalla hacia abajo. El tope deja
                             ver ~5 tarjetas y media, así que se nota que sigue. */
                          <div className={`flex flex-col gap-1.5 ${
                            (expandedCases[p.id] ?? []).length > 5 ? 'max-h-[286px] overflow-y-auto pr-1.5' : ''
                          }`}>
                            {(expandedCases[p.id] ?? []).map((c) => {
                              const cerrado = CASOS_CERRADOS.has(c.status);
                              const esMva   = c.caseType === 'MVA';
                              const IconoTipo = esMva ? Car : Stethoscope;
                              /* El tipo se lee por color ANTES que por texto. Un
                                 caso cerrado no lo necesita: lo suyo es quedarse
                                 atrás, así que va en gris. */
                              const colorTipo = cerrado ? 'text-text-muted' : esMva ? 'text-cyan' : 'text-violet-text';
                              /* Una sola línea de metadatos en vez de cuatro
                                 columnas: descripción, y las fechas que de
                                 verdad ubican al caso en el tiempo. */
                              const meta = [
                                c.accidentNotes,
                                c.accidentDate ? `${t('colAccidentDate')} ${fechaCalendario(c.accidentDate)}` : null,
                                c.firstAppointment ? `${t('colFirstAppt')} ${fmtApptDate(c.firstAppointment.scheduledFor)}` : null,
                                c.lastAppointment ? `${t('colLastAppt')} ${fmtApptDate(c.lastAppointment.scheduledFor)}` : null,
                              ].filter(Boolean).join(' · ');

                              return (
                                <div
                                  key={c.id}
                                  className={`flex items-center gap-3 rounded-md bg-bg-2 px-3 py-2.5 transition-opacity ${
                                    cerrado ? 'opacity-55 hover:opacity-100' : ''
                                  }`}
                                >
                                  <IconoTipo className={`w-4 h-4 shrink-0 ${colorTipo}`} aria-hidden="true" />

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[12px] font-mono text-text-1">{c.caseCode}</span>
                                      <TagPill
                                        label={CASE_STATUS_LABEL[c.status] ?? c.status}
                                        colorClass={
                                          c.status === 'CANCELLED' ? 'bg-rose/10 text-rose border-rose/20'
                                          : cerrado                ? 'bg-bg-2 text-text-muted border-border'
                                          : c.status === 'ACTIVE'  ? 'bg-emerald/10 text-emerald border-emerald/20'
                                          : 'bg-brand/10 text-brand-text border-brand/20'
                                        }
                                      />
                                      {c.caseType && (
                                        <span className="text-[10px] text-text-muted">
                                          {CASE_TYPE_LABEL[c.caseType] ?? c.caseType}
                                        </span>
                                      )}
                                    </div>
                                    {meta && (
                                      <div className="text-[11px] text-text-muted truncate mt-0.5" title={meta}>{meta}</div>
                                    )}
                                  </div>

                                  {/* La etapa del CASO — la fila colapsada ya
                                      muestra el progreso de ADMISIÓN, que es otra
                                      cosa. En teléfono no entra y se va. */}
                                  <div className="hidden sm:block w-[150px] shrink-0">
                                    <CaseStageProgress
                                      status={c.status}
                                      labels={{
                                        admission: t('caseStageAdmission'),
                                        treatment: t('caseStageTreatment'),
                                        closure:   t('caseStageClosure'),
                                        cancelled: t('caseStageCancelled'),
                                      }}
                                    />
                                  </div>

                                  {/* Acciones. En teléfono quedan las tres que se
                                      usan de parado —ver, mensajes, citas—; el
                                      resto aparece desde `sm`, porque siete
                                      íconos de 24px no entran en 375px sin
                                      comerse el código del caso. */}
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={() => abrirCaso(c.id)}
                                      className="p-1.5 rounded text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                                      title={t('tooltipViewCase')}
                                      aria-label={`${t('tooltipViewCase')} — ${c.caseCode}`}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    {currentUserId && (
                                      <button
                                        onClick={() => openCaseMessages(p, c)}
                                        className="p-1.5 rounded text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors"
                                        title={tMsg('tooltipCaseMessages')}
                                        aria-label={`${tMsg('tooltipCaseMessages')} — ${c.caseCode}`}
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setCaseApptTarget(c)}
                                      className="p-1.5 rounded text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                                      title={t('tooltipViewAppts')}
                                      aria-label={`${t('tooltipViewAppts')} — ${c.caseCode}`}
                                    >
                                      <CalendarDays className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setCaseEditTarget(c)}
                                      className="hidden sm:inline-flex p-1.5 rounded text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors"
                                      title={t('tooltipEditCase')}
                                      aria-label={`${t('tooltipEditCase')} — ${c.caseCode}`}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setPdfCaseId(c.id)}
                                      className="hidden sm:inline-flex p-1.5 rounded text-text-muted hover:text-amber hover:bg-amber/10 transition-colors"
                                      title={t('tooltipDownloadPdf')}
                                      aria-label={`${t('tooltipDownloadPdf')} — ${c.caseCode}`}
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setCaseQrTarget(c)}
                                      className="hidden sm:inline-flex p-1.5 rounded text-text-muted hover:text-brand-text hover:bg-brand/10 transition-colors"
                                      title={t('tooltipPatientQr')}
                                      aria-label={`${t('tooltipPatientQr')} — ${c.caseCode}`}
                                    >
                                      <QrCode className="w-3.5 h-3.5" />
                                    </button>
                                    {/* Cancelar va último, en rojo y separado:
                                        pegado a editar, un misclick cancelaba un
                                        caso (criterio de v2). */}
                                    {!doctorMode && (
                                      <>
                                        <span aria-hidden="true" className="hidden sm:block w-px h-4 bg-border mx-1" />
                                        <button
                                          onClick={() => { setDeleteCaseTarget(c); setDeleteCaseError(''); }}
                                          className="hidden sm:inline-flex p-1.5 rounded text-rose/60 hover:text-rose hover:bg-rose/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                          title={t('tooltipCancelCase')}
                                          aria-label={`${t('tooltipCancelCase')} — ${c.caseCode}`}
                                          disabled={c.status === 'CANCELLED'}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ─── Paginación ─────────────────────────────────────────────────────── */}
      <nav aria-label={t('paginationNav')} className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <label htmlFor="page-size-select" className="sr-only">{t('rowsPerPage')}</label>
          <span aria-hidden="true">{t('rowsPerPage')}</span>
          <select
            id="page-size-select"
            value={pageSize}
            onChange={(e) => router.push(buildPageUrl(0, Number(e.target.value)))}
            className="bg-bg-2 border border-border rounded px-2 py-1 text-[11px] text-text-1 focus:outline-none focus:border-brand cursor-pointer"
            aria-label={t('rowsPerPage')}
          >
            {PATIENTS_PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {localPages > 0 && (
            <span className="ml-2" aria-live="polite" aria-atomic="true">
              {t('pageInfo', { page: pageUrl + 1, total: localPages })}
            </span>
          )}
        </div>
        {localPages > 1 && (
          <div className="flex gap-1" role="group" aria-label={t('pageControls')}>
            <button
              onClick={() => router.push(buildPageUrl(pageUrl - 1))}
              disabled={pageUrl === 0}
              aria-label={t('prevPage', { page: pageUrl, total: localPages })}
              className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => router.push(buildPageUrl(pageUrl + 1))}
              disabled={pageUrl >= localPages - 1}
              aria-label={t('nextPage', { page: pageUrl + 2, total: localPages })}
              className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </nav>

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
                {/* Con `viewTarget.phone &&` acá afuera, un paciente que tiene
                    SOLO celular no mostraba ningún teléfono: la condición miraba
                    el fijo y se llevaba puesto al `phone2` de adentro. */}
                {(viewTarget.phone || viewTarget.phone2) && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Phone className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono">{telefonoDe(viewTarget)}</span>
                    {viewTarget.phone && viewTarget.phone2 && viewTarget.phone !== viewTarget.phone2 && (
                      <span className="font-mono text-text-muted">· {viewTarget.phone2}</span>
                    )}
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
                    <span>{fechaCalendario(viewTarget.dateOfBirth)}</span>
                  </div>
                )}
              </div>

              {(viewTarget.accidentDate || viewTarget.accidentType) && (
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Accidente</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <Car className="w-3.5 h-3.5 text-text-muted" />
                    <span>{fechaCalendario(viewTarget.accidentDate)}</span>
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

              {/* Responsable legal. El tutor VINCULADO gana sobre el texto
                  legado: esta vista miraba solo `guardianName`, que nadie llena,
                  así que un menor con su apoderado bien cargado no mostraba nada.
                  Es el mismo defecto que tenía el formulario de edición. */}
              {(viewTarget.guardianPatient || viewTarget.guardianName) && (
                <div className="rounded-md bg-amber/10 border border-amber/30 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber">Responsable legal</p>
                  <div className="flex items-center gap-2 text-text-2 flex-wrap">
                    <UserCheck className="w-3.5 h-3.5 text-amber" />
                    <span>
                      {viewTarget.guardianPatient
                        ? `${viewTarget.guardianPatient.firstName} ${viewTarget.guardianPatient.lastName}`.trim()
                        : viewTarget.guardianName}
                    </span>
                    {viewTarget.guardianPatient?.patientCode && (
                      <span className="font-mono text-[10px] text-text-muted">{viewTarget.guardianPatient.patientCode}</span>
                    )}
                    {viewTarget.guardianRelation && <span className="text-text-muted text-xs">· {viewTarget.guardianRelation}</span>}
                  </div>
                  {(viewTarget.guardianPatient?.email || viewTarget.guardianPatient?.phone || viewTarget.guardianPhone) && (
                    <div className="flex items-center gap-3 text-text-2 pl-5 flex-wrap">
                      {viewTarget.guardianPatient?.email && <span className="text-xs">{viewTarget.guardianPatient.email}</span>}
                      <span className="font-mono text-xs">
                        {viewTarget.guardianPatient ? viewTarget.guardianPatient.phone : viewTarget.guardianPhone}
                      </span>
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
            // Mantener al paciente expandido y traer la lista fresca con el
            // caso nuevo (toggleExpand lo cerraria si ya estaba abierto)
            setExpandedIds(prev => new Set(prev).add(wizardPatient.id));
            fetchCases(wizardPatient.id);
          }}
        />
      )}

      {/* ─── Quick Register ──────────────────────────────────────────────────── */}
      {/* En el portal se sella quién trajo al paciente: sin eso el provider no
          vería en "Mis pacientes" al que acaba de dar de alta. */}
      <QuickRegisterDialog
        open={quickRegister}
        onOpenChange={(o) => {
          setQuickRegister(o);
          // Al cerrarlo se suelta el referido: el próximo alta manual no puede
          // heredar ni los datos ni el id del que acabamos de convertir.
          if (!o) { setReferidoRapido(null); setReferidoRapidoId(null); }
        }}
        providerId={scopeProviderId}
        initial={referidoRapido ?? undefined}
        referralId={referidoRapidoId ?? undefined}
      />

      {/* ─── Referido del bufete: con qué camino lo damos de alta ───────────── */}
      <ReferralChoiceDialog
        open={!!referidoElegir}
        onOpenChange={(o) => { if (!o) setReferidoElegir(null); }}
        clientName={referidoElegir?.clientName ?? ''}
        firmName={referidoElegir?.firmName ?? null}
        onCasoYCita={() => { setReferidoElegir(null); setNewCaseOpen(true); }}
        onRegistroRapido={() => {
          setReferidoRapidoId(referidoElegir?.id ?? null);
          setReferidoElegir(null);
          setQuickRegister(true);
        }}
      />

      {/* ─── Send Portal Link ────────────────────────────────────────────────── */}
      <SendPortalDialog
        open={!!sendPortalTarget}
        onOpenChange={(o) => { if (!o) setSendPortalTarget(null); }}
        caseInfo={sendPortalTarget}
      />

      {/* ─── Mensajería interna del paciente (M1) ────────────────────────────
          "Messages & Requests": historial permanente del paciente + nuevo
          mensaje ya vinculado a él y a su caso más reciente. */}
      {currentUserId && (
        <PatientMessagesDialog
          open={!!msgPatient}
          onClose={() => { setMsgPatient(null); setMsgCase(null); }}
          patient={msgPatient}
          caseFilter={msgCase}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onOpenCase={abrirCaso}
          suspended={caseModalOpen}
        />
      )}

      {/* ─── Historial de llamadas ─────────────────────────────────────────── */}
      <CallHistoryDialog open={callHistoryOpen} onOpenChange={setCallHistoryOpen} />
      <CarreraDialog open={carreraOpen} onOpenChange={setCarreraOpen} />
      <SmsHistoryDialog  open={smsHistoryOpen}  onOpenChange={setSmsHistoryOpen} />

      {/* ─── Precios ─────────────────────────────────────────────────────────
          Los datos se piden la primera vez que se abre, no con la lista. */}
      <PriceListDialog open={priceListOpen} onOpenChange={setPriceListOpen} />

      {/* ─── Membresías ──────────────────────────────────────────────────────
          Misma mecánica que Precios: se pide al abrir, no con la lista. */}
      <MembresiasDialog open={membresiasOpen} onOpenChange={setMembresiasOpen} />

      {/* ─── Llamar al paciente ──────────────────────────────────────────────
          Confirmacion explicita antes de marcar: es una llamada real por
          Twilio, no un link tel:. Al confirmar guardamos a quien pertenece
          para vincular el CallLog cuando llegue el SID. */}
      <ConfirmDialog
        open={!!callTarget}
        variant="info"
        title={t('confirmCallTitle', { name: callTarget?.name ?? '' })}
        description={t('confirmCallDescription', { phone: callTarget?.phone ?? '' })}
        confirmLabel={t('confirmCallAccept')}
        cancelLabel={t('btnCancel')}
        onConfirm={() => {
          if (!callTarget) return;
          callOwnerRef.current = { patientId: callTarget.patientId, caseId: callTarget.caseId };
          setCallDismissedError(false);
          setActiveCallInfo({ name: callTarget.name, phone: callTarget.phone });
          twilio.connect(callTarget.phone);
          setCallTarget(null);
        }}
        onCancel={() => setCallTarget(null)}
      />

      {/* ActiveCallBar no es overlay: lo fijamos abajo a la derecha para que
          se vea mientras se sigue navegando la lista. */}
      {/* Si la llamada falla hay que DECIRLO: el hook guardaba el error y
          nadie lo mostraba, asi que el dialogo se cerraba y no pasaba nada
          visible (parecia que el boton no hacia nada). */}
      {/* Llamada fallida — mismo diseño que "No contestó" de Nuevo caso.
          Distingue las dos fallas: si la llamada NUNCA se inició (device sin
          registrar, sin credenciales) decir "verificá el número" seria un
          consejo falso, el numero esta bien; el problema es la conexion. */}
      <Dialog open={!!twilio.error && !callDismissedError && !!activeCallInfo} onOpenChange={(o) => { if (!o) setCallDismissedError(true); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogTitle className="sr-only">{t('callFailedTitle')}</DialogTitle>
          <div className="flex flex-col items-center px-8 py-10 gap-5">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-700 to-rose flex items-center justify-center text-white font-bold text-2xl shadow-[0_8px_24px_rgba(244,63,94,.35)]">
              {(activeCallInfo?.name ?? '?').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
            </div>

            <div className="text-center space-y-1">
              <div className="text-text-1 font-bold text-xl">{activeCallInfo?.name}</div>
              <div className="text-text-muted font-mono text-sm">{activeCallInfo?.phone}</div>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <XIcon className="w-4 h-4 text-rose" />
                <span className="text-rose text-xs font-semibold uppercase tracking-widest">{t('callFailedTitle')}</span>
              </div>
              {/* El motivo cambia el consejo: si el navegador bloqueo el
                  microfono, decir "verifica el numero" manda a revisar lo que
                  no es — el numero esta bien, falta el permiso. */}
              <p className="text-text-2 text-[13px] pt-2">
                {/Permission|31401|NotAllowed|user media/i.test(twilio.error ?? '')
                  ? t('callFailedMicHint')
                  : t('callFailedHint')}
              </p>
              <p className="text-text-muted text-[10px] font-mono break-words pt-1">{twilio.error}</p>
            </div>

            <div className="flex flex-col w-full gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  if (!activeCallInfo) return;
                  setCallDismissedError(false);
                  twilio.connect(activeCallInfo.phone);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 bg-brand text-white font-semibold text-sm hover:bg-brand/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {t('callFailedRetry')}
              </button>
              <button
                type="button"
                onClick={() => { setCallDismissedError(true); setActiveCallInfo(null); }}
                className="w-full flex items-center justify-center gap-2 rounded-full py-2.5 border border-border bg-bg-2 text-text-1 font-semibold text-sm hover:bg-white/5 transition-colors"
              >
                {t('callFailedClose')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Llamada en curso — al medio, no en una barrita al pie: es el estado
          mas importante de la pantalla mientras dura, y ahi abajo pasaba
          desapercibido. Sin boton de cerrar: se sale colgando. */}
      <Dialog open={!!activeCallInfo && (twilio.callStatus === 'connecting' || twilio.callStatus === 'in-call')}>
        <DialogContent className="max-w-md p-0 overflow-hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">{activeCallInfo?.name}</DialogTitle>
          <div className="flex flex-col items-center px-8 py-10 gap-5">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-emerald/30 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald/80 to-emerald flex items-center justify-center text-white font-bold text-2xl shadow-[0_8px_24px_rgba(16,185,129,.35)]">
                {(activeCallInfo?.name ?? '?').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
              </div>
            </div>

            <div className="text-center space-y-1">
              <div className="text-text-1 font-bold text-xl">{activeCallInfo?.name}</div>
              <div className="text-text-muted font-mono text-sm">{activeCallInfo?.phone}</div>
            </div>

            {activeCallInfo && (twilio.callStatus === 'connecting' || twilio.callStatus === 'in-call') && (
              <ActiveCallBar
                status={twilio.callStatus}
                phone={activeCallInfo.phone}
                patientName={activeCallInfo.name}
                elapsed={callElapsed}
                muted={twilio.muted}
                onMuteToggle={twilio.toggleMute}
                onHangUp={() => { twilio.hangUp(); setActiveCallInfo(null); }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Seguros ─────────────────────────────────────────────────────────── */}
      {segurosTarget && (
        <SegurosDialog
          caso={segurosTarget.latestCase
            ? {
                id: segurosTarget.latestCase.id,
                caseCode: segurosTarget.latestCase.caseCode,
                consentsData: segurosTarget.latestCase.consentsData,
              }
            : null}
          titular={`${segurosTarget.firstName} ${segurosTarget.lastName}`.trim()}
          onClose={() => { setSegurosTarget(null); router.refresh(); }}
        />
      )}

      {/* ─── QR Paciente ─────────────────────────────────────────────────────── */}
      {qrPatientTarget && (
        <QrPatientDialog
          patient={qrPatientTarget}
          onClose={() => setQrPatientTarget(null)}
        />
      )}

      {/* ─── Archivos personales ─────────────────────────────────────────────── */}
      {archivosTarget && (
        <ArchivosDialog
          patientId={archivosTarget.id}
          firstName={archivosTarget.firstName}
          lastName={archivosTarget.lastName}
          fotos={fotosDelCaso(archivosTarget.latestCase?.consentsData)}
          fotosEliminadas={fotosEliminadasDelCaso(archivosTarget.latestCase?.consentsData)}
          tieneCaso={!!archivosTarget.latestCase}
          soloLectura={doctorMode}
          onClose={() => setArchivosTarget(null)}
        />
      )}

      {/* ─── Historial médico ────────────────────────────────────────────────── */}
      {medHistoryTarget && (
        <MedicalHistoryDialog
          patient={medHistoryTarget}
          open={true}
          onClose={() => setMedHistoryTarget(null)}
        />
      )}

      {/* ─── Menú de acciones de la fila ──────────────────────────────────────
          Va por `FloatingPanel`: portalea (escapa el overflow de la tabla) y
          además VOLTEA hacia arriba si abajo no entra. Antes se calculaba
          `top: r.bottom + 4` a mano y siempre abría hacia abajo, así que en las
          últimas filas de la página el menú se salía de la ventana y cinco de
          las ocho opciones —incluida Archivar— quedaban inalcanzables: no había
          volteo, ni alto máximo para scrollear por dentro, y el cierre al
          scrollear impedía correr la página para verlas. */}
      {openMenuId && (() => {
        const p = localPatients.find(x => x.id === openMenuId);
        if (!p) return null;
        return (
          <FloatingPanel
            anchorRef={menuAnchor}
            open
            width={208}
            align="end"
            maxHeight={340}
            onScrollClose={() => setOpenMenuId(null)}
            className="border border-border py-1 text-sm"
          >
          <div ref={menuRef}>
            <button onClick={() => { setEditTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <Pencil className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuEdit')}
            </button>
            <button onClick={() => { setSegurosTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <Shield className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuInsurance')}
            </button>
            <button onClick={() => { setQrPatientTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <QrCode className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuPatientQr')}
            </button>
            <button onClick={() => { setArchivosTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <FolderOpen className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuPersonalFiles')}
            </button>
            <button onClick={() => { setMedHistoryTarget(p); setOpenMenuId(null); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 hover:bg-bg-2 hover:text-text-1 transition-colors text-left">
              <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuMedicalHistory')}
            </button>
            {/* Deshabilitado pero explicado: estaba en gris, sin cartel, y la
                única lectura posible era "algo se rompió". Ver
                `regla-historial-sale-del-audit-log` — la pantalla existe como
                pendiente, el dato ya está en `before`/`after` del audit log. */}
            <button disabled title={t('menuAuditHistorySoon')}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-text-2 transition-colors text-left opacity-40 cursor-not-allowed">
              <History className="w-3.5 h-3.5 text-text-muted shrink-0" /> {t('menuAuditHistory')}
            </button>
            {/* Archivar/restaurar: acciones administrativas — ocultas en el portal médico */}
            {!doctorMode && (
              <>
                <div className="my-1 border-t border-border/60" />
                {p.status === 'INACTIVE' ? (
                  <button onClick={() => { setRestoreTarget(p); setRestoreError(''); setOpenMenuId(null); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-emerald hover:bg-emerald/10 transition-colors text-left">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" /> {t('menuRestore')}
                  </button>
                ) : (
                  <button onClick={() => { setDeleteTarget(p); setDeleteError(''); setOpenMenuId(null); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-rose hover:bg-rose/10 transition-colors text-left">
                    <Trash2 className="w-3.5 h-3.5 shrink-0" /> {t('menuDelete')}
                  </button>
                )}
              </>
            )}
          </div>
          </FloatingPanel>
        );
      })()}

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
            <DialogTitle className="text-text-1">{t('deleteCaseTitle')}</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              {t('deleteCaseBody')}
            </DialogDescription>
          </DialogHeader>
          {deleteCaseError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {deleteCaseError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDeleteCase} disabled={deletingCase}>
              {deletingCase ? t('btnDeleting') : t('menuDelete')}
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteCaseTarget(null)} disabled={deletingCase}>
              {t('btnCancel')}
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

      {/* ─── Nueva llamada / Crear caso ─────────────────────────────────────── */}
      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={(open) => {
          setNewCaseOpen(open);
          if (!open) {
            setNewCaseInitial(null);
            // El `?referral=` ya cumplió: se saca de la URL para que F5 no
            // vuelva a abrir el wizard con el mismo referido.
            if (searchParamsHook.get('referral')) {
              const sp = new URLSearchParams(searchParamsHook.toString());
              sp.delete('referral');
              const qs = sp.toString();
              router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
            }
            router.refresh();
          }
        }}
        specialties={specialties}
        clinics={clinics}
        providers={providers}
        initialState={newCaseInitial}
        agentName={agentName}
        onQuickRegister={() => setQuickRegister(true)}
      />

      {/* ─── Delete confirm ──────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            {/*
              * Baja de PACIENTE, no de caso (decisión de Erick 2026-08-21).
              *
              * El texto decía "Delete patient — This cannot be undone" mientras la
              * acción es un archivado reversible (`status: INACTIVE`), y dos líneas
              * abajo el mismo diálogo decía "the data is kept and can be restored".
              * Se contradecía solo, y "eliminar" asustaba de una acción que no
              * borra nada.
              *
              * Ahora dice qué es y para qué sirve: bajas reales —un duplicado,
              * data de prueba—. Cerrar la atención de alguien es archivar SU CASO,
              * que es otra acción y otro botón.
              */}
            <DialogTitle className="text-text-1">{t('archivePatientTitle')}</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              {t('archivePatientBody', { name: `${deleteTarget?.firstName ?? ''} ${deleteTarget?.lastName ?? ''}` })}
            </DialogDescription>
          </DialogHeader>
          {(deleteTarget?.caseCount ?? 0) > 0 && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber mt-2">
              {t('deletePatientCasesNote', { count: deleteTarget!.caseCount })}
            </div>
          )}
          <div className="rounded-md bg-bg-2/40 px-3 py-2 text-xs text-text-2 mt-2">
            {t('archivePatientKept')}
          </div>
          {/* La agenda es la consecuencia que no se ve en esta pantalla: archivar
              libera el horario del doctor cancelando las citas futuras, y eso NO
              se revierte al restaurar. Se avisa antes, no después. */}
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber mt-2">
            {t('deletePatientAppointmentsNote')}
          </div>
          {deleteError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {deleteError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t('btnCancel')}
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={deleting}>
              {deleting ? t('btnDeleting') : t('btnYesArchive')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Restore confirm ─────────────────────────────────────────────────── */}
      <Dialog open={!!restoreTarget} onOpenChange={(o) => { if (!o) setRestoreTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-1">Restaurar paciente</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              ¿Restaurar a <strong>{restoreTarget?.firstName} {restoreTarget?.lastName}</strong>? El paciente y todos sus casos archivados volverán a estar visibles.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber mt-2">
            {t('restorePatientAppointmentsNote')}
          </div>
          {restoreError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {restoreError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRestoreTarget(null)} disabled={restoring}>
              Cancelar
            </Button>
            <Button className="w-full sm:w-auto bg-emerald hover:bg-emerald/90 text-white" onClick={handleRestore} disabled={restoring}>
              {restoring ? 'Restaurando...' : 'Sí, restaurar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── PDF Viewer modal ────────────────────────────────────────────────── */}
      <Dialog open={!!pdfCaseId} onOpenChange={(o) => { if (!o) setPdfCaseId(null); }}>
        <DialogContent className="max-w-5xl w-full p-0 gap-0 overflow-hidden" style={{ height: '90vh' }}>
          <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between shrink-0">
            <DialogTitle className="text-text-1 text-sm flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber" />
              Patient Intake Form
            </DialogTitle>
          </DialogHeader>
          {pdfCaseId && (
            <iframe
              src={`/api/admin/cases/${pdfCaseId}/pdf`}
              className="w-full flex-1"
              style={{ height: 'calc(90vh - 57px)', border: 'none' }}
              title="Patient Intake Form"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

