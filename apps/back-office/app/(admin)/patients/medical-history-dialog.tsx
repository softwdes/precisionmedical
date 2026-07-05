'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  User, Phone, Mail, AlertTriangle, Heart, Pill, Scissors, Users,
  MessageSquare, Activity, Brain, Shield, ClipboardList, Stethoscope,
  ChevronDown, ChevronUp, Edit2, Plus, Calendar, X,
  Cigarette, Wine, FlaskConical, Briefcase,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@precision/ui';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';
import type { PatientRow } from './patients-client';

// ── Types ──────────────────────────────────────────────────────────────────

export type MedicalHistoryData = {
  visitInfo?:        { referredBy?: string; mainReason?: string; otherConcerns?: string };
  healthInfo?:       { goals?: string; selfRating?: number | null };
  allergies?:        string;
  problems?:         Array<{ id: string; condition: string; diagnosedAt?: string; status?: string; comments?: string }>;
  history?:          Array<{ id: string; condition: string }>;
  medications?:      Array<{ id: string; name: string; dose?: string; instructions?: string; prescribedBy?: string }>;
  surgeries?:        Array<{ id: string; procedure: string; date?: string; notes?: string }>;
  familyHistory?:    Array<{ id: string; relation: string; condition: string }>;
  providers?:        Array<{ id: string; name: string; specialty?: string; notes?: string }>;
  vaccines?:         string;
  cognitiveStatus?:  string;
  functionalStatus?: string;
  implantedDevices?: string;
  systemsReview?:    string;
  healthExams?:      string;
  socialHistory?:    { work?: string; children?: string; tobacco?: string; alcohol?: string; drugs?: string };
  comments?:         Array<{ id: string; date: string; text: string; author?: string }>;
};

interface Props {
  patient: PatientRow;
  open:    boolean;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDOB(dob: Date | string | null | undefined, locale: string): string {
  if (!dob) return 'N/D';
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  return d.toLocaleDateString(locale, { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function calcAge(dob: Date | string | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SideSection({
  icon, title, defaultOpen = true, editBtn = false, children,
}: {
  icon: React.ReactNode; title: string; defaultOpen?: boolean;
  editBtn?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        className="flex items-center justify-between w-full py-2.5 px-4 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="text-brand w-3.5 h-3.5 shrink-0">{icon}</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {editBtn && open && (
            <span
              className="p-0.5 rounded text-text-muted hover:text-brand transition-colors"
              onClick={e => { e.stopPropagation(); }}
            >
              <Edit2 className="w-3 h-3" />
            </span>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
        </div>
      </button>
      {open && <div className="px-4 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function SideRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[11px]">
      <span className="text-text-muted shrink-0">{label}:</span>
      <span className="text-text-1 text-right">{value || 'N/D'}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-bg-2/40 px-3 py-2.5 text-[11px] text-text-muted text-center">
      {text}
    </div>
  );
}

function SectionCard({
  icon, title, count, onAdd, editBtn = false, children,
}: {
  icon: React.ReactNode; title: string; count?: number;
  onAdd?: () => void; editBtn?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="text-emerald">{icon}</span>
          <span className="text-sm font-semibold text-text-1">{title}</span>
          {count !== undefined && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald/20 text-emerald text-[9px] font-bold">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand transition-colors"
            >
              <Plus className="w-3 h-3" /> Agregar
            </button>
          )}
          {editBtn && (
            <button className="text-text-muted hover:text-brand transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} className="text-text-muted hover:text-text-1 transition-colors">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function TableShell({
  headers, rows, emptyText,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border/60">
            {headers.map((h, i) => (
              <th key={i} className="text-left pb-2 pr-4 text-text-muted font-medium last:text-right">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="py-4 text-center text-text-muted italic">{emptyText}</td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-text-2 last:text-right">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pt-2 text-right text-[10px] text-text-muted">
        Total registros: {rows.length}
      </div>
    </div>
  );
}

// ── Main dialog ────────────────────────────────────────────────────────────

export function MedicalHistoryDialog({ patient, open, onClose }: Props) {
  const locale = useLocale();

  const mh = (patient.medicalHistory ?? {}) as MedicalHistoryData;
  const insurances = (patient.latestCase?.consentsData as Record<string, unknown> | null)?.insurances as Array<Record<string, string>> | undefined;

  const age    = calcAge(patient.dateOfBirth);
  const dobStr = fmtDOB(patient.dateOfBirth, locale);

  // Sidebar section label maps
  const SEX_LABEL: Record<string, string> = {
    MALE: 'Masculino', FEMALE: 'Femenino', NON_BINARY: 'No binario',
    OTHER: 'Otro', PREFER_NOT_TO_SAY: 'Prefiero no decir',
  };
  const MARITAL_LABEL: Record<string, string> = {
    SINGLE: 'Soltero/a', MARRIED: 'Casado/a', DIVORCED: 'Divorciado/a',
    WIDOWED: 'Viudo/a', SEPARATED: 'Separado/a', OTHER: 'Otro',
  };
  const LANG_LABEL: Record<string, string> = {
    es: 'Español', en: 'Inglés', fr: 'Francés', it: 'Italiano', pt: 'Portugués', other: 'Otro',
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-full max-h-[96vh] p-0 overflow-hidden flex flex-col">

        {/* ── Dialog header ── */}
        <DialogHeader className="px-6 py-3 border-b border-border bg-bg-1 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-text-1 text-base font-semibold">
                {patient.firstName} {patient.lastName}
              </DialogTitle>
              <DialogDescription className="text-text-muted text-xs">
                Historial médico · {patient.patientCode ?? ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body: left panel + main ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ════ Left sidebar ════ */}
          <div className="w-72 shrink-0 border-r border-border overflow-y-auto bg-bg-1">

            {/* Patient avatar */}
            <div className="px-4 py-4 border-b border-border/60 flex items-center gap-3">
              <PersonAvatar
                firstName={patient.firstName}
                lastName={patient.lastName}
                size={10}
              />
              <div>
                <p className="text-sm font-semibold text-text-1">{patient.lastName}, {patient.firstName}</p>
                <p className="text-[10px] text-text-muted">{patient.patientCode}</p>
              </div>
            </div>

            {/* Personal info */}
            <SideSection icon={<User className="w-3.5 h-3.5" />} title="Información personal">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-text-muted">Fecha de nacimiento:</span>
                <span className="text-[11px] text-text-1">{dobStr}</span>
                {age !== null && (
                  <span className="bg-emerald/20 text-emerald text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {age} años
                  </span>
                )}
              </div>
              <SideRow label="Sexo"        value={patient.sex ? (SEX_LABEL[patient.sex] ?? patient.sex) : null} />
              <SideRow label="Estado civil" value={patient.maritalStatus ? (MARITAL_LABEL[patient.maritalStatus] ?? patient.maritalStatus) : null} />
              <SideRow label="Idioma"      value={patient.preferredLanguage ? (LANG_LABEL[patient.preferredLanguage] ?? patient.preferredLanguage) : null} />
            </SideSection>

            {/* Contact */}
            <SideSection icon={<Phone className="w-3.5 h-3.5" />} title="Información de contacto">
              <SideRow label="Teléfono"          value={patient.phone} />
              <SideRow label="Celular"           value={patient.phone2} />
              <SideRow label="Correo electrónico" value={patient.email} />
            </SideSection>

            {/* Emergency + additional */}
            <SideSection icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Emergencia y adicional">
              <SideRow label="Emergencia"  value={patient.emergencyContactName} />
              <SideRow label="Referido por" value={patient.referralSource} />
              <SideRow label="Farmacia"    value={patient.preferredPharmacy} />
              <SideRow label="Empleador"   value={patient.employer} />
              <SideRow label="Proveedor"   value={mh.providers?.[0]?.name ?? null} />
            </SideSection>

            {/* Insurance */}
            <SideSection icon={<Shield className="w-3.5 h-3.5" />} title="Detalles del seguro" defaultOpen={false}>
              {insurances && insurances.length > 0 ? (
                insurances.map((ins, i) => (
                  <div key={i} className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2 space-y-0.5 mb-2 last:mb-0">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                      {ins.insType === 'MEDICAL' ? 'Seguro médico' : 'Seguro de auto'}
                    </p>
                    <p className="text-[11px] text-text-1 font-medium">{ins.carrier || 'Sin nombre'}</p>
                    {ins.policyId && <p className="text-[10px] text-text-muted">Póliza: {ins.policyId}</p>}
                  </div>
                ))
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">Seguro principal</p>
                  <EmptyState text="No hay seguro principal registrado" />
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mt-2 mb-1">Seguro secundario</p>
                  <EmptyState text="No hay seguro secundario registrado" />
                </>
              )}
            </SideSection>

            {/* Allergies */}
            <SideSection icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Alergias" editBtn defaultOpen={false}>
              <EmptyState text={mh.allergies ?? 'No se conocen alergias a medicamentos'} />
            </SideSection>

            {/* Problems list (sidebar) */}
            <SideSection icon={<Heart className="w-3.5 h-3.5" />} title="Lista de problemas" defaultOpen={false}>
              {(mh.problems?.length ?? 0) > 0
                ? mh.problems!.map(p => (
                    <div key={p.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{p.condition}</div>
                  ))
                : <EmptyState text="No hay problemas activos" />}
            </SideSection>

            {/* Active medications */}
            <SideSection icon={<Pill className="w-3.5 h-3.5" />} title="Medicamentos activos" defaultOpen={false}>
              {(mh.medications?.length ?? 0) > 0
                ? mh.medications!.map(m => (
                    <div key={m.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{m.name}</div>
                  ))
                : <EmptyState text="No hay medicamentos activos" />}
            </SideSection>

            {/* Surgeries */}
            <SideSection icon={<Scissors className="w-3.5 h-3.5" />} title="Cirugías y procedimientos" defaultOpen={false}>
              {(mh.surgeries?.length ?? 0) > 0
                ? mh.surgeries!.map(s => (
                    <div key={s.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{s.procedure}</div>
                  ))
                : <EmptyState text="No hay procedimientos quirúrgicos" />}
            </SideSection>

            {/* Family history */}
            <SideSection icon={<Users className="w-3.5 h-3.5" />} title="Antecedentes familiares" defaultOpen={false}>
              {(mh.familyHistory?.length ?? 0) > 0
                ? mh.familyHistory!.map(f => (
                    <div key={f.id} className="text-[11px] text-text-2 border-b border-border/40 py-1 last:border-0">{f.relation}: {f.condition}</div>
                  ))
                : <EmptyState text="No hay antecedentes familiares" />}
            </SideSection>

            {/* Social history */}
            <SideSection icon={<MessageSquare className="w-3.5 h-3.5" />} title="Historia social" editBtn defaultOpen={false}>
              <div className="space-y-2">
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">Trabajo y familia</p>
                  <SideRow label="Trabajo" value={mh.socialHistory?.work} />
                  <SideRow label="Hijos"   value={mh.socialHistory?.children} />
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cigarette className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">Uso de tabaco</p>
                  </div>
                  <SideRow label="Estado" value={mh.socialHistory?.tobacco} />
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wine className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">Uso de alcohol</p>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-muted">Estado:</span>
                    {mh.socialHistory?.alcohol
                      ? <TagPill label={mh.socialHistory.alcohol} colorClass="bg-amber/10 text-amber border-amber/20" />
                      : <span className="text-text-muted">N/D</span>}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-bg-2/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FlaskConical className="w-3 h-3 text-text-muted" />
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">Uso de drogas</p>
                  </div>
                  <SideRow label="Estado" value={mh.socialHistory?.drugs} />
                </div>
              </div>
            </SideSection>

          </div>

          {/* ════ Main content ════ */}
          <div className="flex-1 overflow-y-auto bg-bg-2/30 p-4 space-y-4">

            {/* Row 1: Visit info + Health info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Información de la visita */}
              <SectionCard
                icon={<User className="w-4 h-4" />}
                title="Información de la visita"
                editBtn
              >
                <div className="space-y-2 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Referido por:</span>
                    <span className="text-text-1">{mh.visitInfo?.referredBy || 'N/D'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Razón principal:</span>
                    <span className="text-text-1">{mh.visitInfo?.mainReason || 'N/D'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Otras inquietudes:</span>
                    <span className="text-text-1">{mh.visitInfo?.otherConcerns || 'N/D'}</span>
                  </div>
                </div>
              </SectionCard>

              {/* Información de salud */}
              <SectionCard
                icon={<Activity className="w-4 h-4" />}
                title="Información de salud"
                editBtn
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border/60 bg-bg-2/40 p-3">
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">Metas de salud</p>
                    <p className="text-[11px] text-text-2">{mh.healthInfo?.goals || 'No hay metas establecidas'}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-bg-2/40 p-3">
                    <p className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1">Autoevaluación</p>
                    <p className="text-[11px] text-text-2">
                      {mh.healthInfo?.selfRating != null ? `${mh.healthInfo.selfRating}/10` : 'Sin calificación'}
                    </p>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Lista de problemas */}
            <SectionCard
              icon={<Heart className="w-4 h-4" />}
              title="Lista de problemas"
              count={mh.problems?.length ?? 0}
              onAdd={() => {}}
            >
              <TableShell
                headers={['Condición', 'Diagnosticado el', 'Estado', 'Comentarios', 'Acciones']}
                rows={(mh.problems ?? []).map(p => [
                  p.condition,
                  p.diagnosedAt ?? '—',
                  p.status ? <TagPill label={p.status} colorClass="bg-cyan/10 text-cyan border-cyan/20" /> : '—',
                  p.comments ?? '—',
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">Eliminar</button>,
                ])}
                emptyText="No hay datos para mostrar."
              />
            </SectionCard>

            {/* Historial médico */}
            <SectionCard
              icon={<ClipboardList className="w-4 h-4" />}
              title="Historial médico"
              count={mh.history?.length ?? 0}
              onAdd={() => {}}
            >
              <TableShell
                headers={['Condición', 'Acciones']}
                rows={(mh.history ?? []).map(h => [
                  h.condition,
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">Eliminar</button>,
                ])}
                emptyText="No hay datos para mostrar."
              />
            </SectionCard>

            {/* Medicamentos */}
            <SectionCard
              icon={<Pill className="w-4 h-4" />}
              title="Medicamentos"
              count={mh.medications?.length ?? 0}
              onAdd={() => {}}
            >
              <TableShell
                headers={['Medicamento', 'Dosis', 'Indicaciones', 'Prescrito por', 'Acciones']}
                rows={(mh.medications ?? []).map(m => [
                  m.name,
                  m.dose ?? '—',
                  m.instructions ?? '—',
                  m.prescribedBy ?? '—',
                  <button key="del" className="text-text-muted hover:text-rose transition-colors text-[10px]">Eliminar</button>,
                ])}
                emptyText="No hay datos para mostrar."
              />
            </SectionCard>

            {/* Row: Cirugías + Historial familiar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Scissors className="w-4 h-4" />} title="Cirugías y procedimientos" count={mh.surgeries?.length ?? 0} onAdd={() => {}}>
                {(mh.surgeries?.length ?? 0) === 0
                  ? <EmptyState text="No hay procedimientos quirúrgicos registrados" />
                  : mh.surgeries!.map(s => (
                      <div key={s.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">{s.procedure}</div>
                    ))}
              </SectionCard>

              <SectionCard icon={<Users className="w-4 h-4" />} title="Historial familiar" count={mh.familyHistory?.length ?? 0} onAdd={() => {}}>
                {(mh.familyHistory?.length ?? 0) === 0
                  ? <EmptyState text="No hay historial familiar registrado" />
                  : mh.familyHistory!.map(f => (
                      <div key={f.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">
                        <span className="text-text-muted">{f.relation}:</span> {f.condition}
                      </div>
                    ))}
              </SectionCard>
            </div>

            {/* Row: Historial de proveedores + Vacunas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Briefcase className="w-4 h-4" />} title="Historial de proveedores" count={mh.providers?.length ?? 0} onAdd={() => {}}>
                {(mh.providers?.length ?? 0) === 0
                  ? <EmptyState text="No hay historial de proveedores registrado" />
                  : mh.providers!.map(p => (
                      <div key={p.id} className="text-[11px] text-text-2 border-b border-border/40 py-1.5 last:border-0">{p.name}</div>
                    ))}
              </SectionCard>

              <SectionCard icon={<Shield className="w-4 h-4" />} title="Vacunas" editBtn>
                <EmptyState text={mh.vaccines ?? 'No hay vacunas registradas'} />
              </SectionCard>
            </div>

            {/* Row: Estado cognitivo + Estado funcional */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Brain className="w-4 h-4" />} title="Estado cognitivo" editBtn>
                <EmptyState text={mh.cognitiveStatus ?? 'No hay información de estado cognitivo disponible'} />
              </SectionCard>

              <SectionCard icon={<Activity className="w-4 h-4" />} title="Estado funcional" editBtn>
                <EmptyState text={mh.functionalStatus ?? 'No hay información de estado funcional disponible'} />
              </SectionCard>
            </div>

            {/* Row: Dispositivos implantados + Revisión de sistemas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Stethoscope className="w-4 h-4" />} title="Dispositivos implantados" editBtn>
                <EmptyState text={mh.implantedDevices ?? 'No hay dispositivos implantados registrados'} />
              </SectionCard>

              <SectionCard icon={<ClipboardList className="w-4 h-4" />} title="Revisión de sistemas" editBtn>
                <EmptyState text={mh.systemsReview ?? 'No hay revisiones de sistemas registradas'} />
              </SectionCard>
            </div>

            {/* Row: Exámenes de salud + Historial de comentarios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard icon={<Activity className="w-4 h-4" />} title="Exámenes de salud" editBtn>
                <EmptyState text={mh.healthExams ?? 'No hay exámenes de salud registrados'} />
              </SectionCard>

              <SectionCard
                icon={<MessageSquare className="w-4 h-4" />}
                title="Historial de comentarios"
                count={mh.comments?.length ?? 0}
                onAdd={() => {}}
              >
                {(mh.comments?.length ?? 0) === 0
                  ? <EmptyState text="No hay comentarios disponibles." />
                  : mh.comments!.map(c => (
                      <div key={c.id} className="border-b border-border/40 py-2 last:border-0">
                        <div className="flex justify-between text-[10px] text-text-muted mb-0.5">
                          <span>{c.author ?? 'Sistema'}</span>
                          <span>{c.date}</span>
                        </div>
                        <p className="text-[11px] text-text-2">{c.text}</p>
                      </div>
                    ))}
              </SectionCard>
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
