'use client';

/**
 * B.4 mockup · PatientDetailClient
 *
 * Ficha completa del paciente:
 *  - Header con avatar + nombre + status + edad
 *  - 3 KPIs: casos totales · casos activos · citas
 *  - InfoCards: Datos personales · Referido por
 *  - Historial de casos (todos los PhoenixCase del paciente)
 *
 * Llegás aquí desde ⌘K search, PreCallStep "Ver historial",
 * o (futuro) clic en nombre de paciente en la queue.
 */

import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Phone, Mail, Calendar, MapPin, Scale, FileText,
  User, Building2, ChevronRight, MessageSquare, ClipboardList,
  Cake, Hash, Clock, Stethoscope,
} from 'lucide-react';
import { Button } from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  InfoCard,
  InfoRow,
  PersonAvatar,
  TagPill,
  EmptyState,
} from '@/components/ui-phoenix';

// ─── Tipos derivados del include de Prisma ────────────────────────────────────

type PatientStatus = 'NEW' | 'ACTIVE' | 'COMPLETED' | 'DISCHARGED' | 'INACTIVE';
type CaseStatus = 'NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED' | 'ACTIVE';

interface PatientCase {
  id: string;
  caseCode: string;
  status: CaseStatus;
  caseType: string;
  accidentDate: Date | null;
  accidentType: string | null;
  accidentLocation: string | null;
  createdAt: Date;
  lawFirm: { id: string; firmName: string; paymentSpeed: string | null } | null;
  attorney: { id: string; firstName: string | null; lastName: string | null } | null;
  specialty: { id: string; name: string; color: string } | null;
  primaryInsurance: { id: string; name: string; shortCode: string; color: string } | null;
  _count: { notes: number; appointments: number };
}

interface PatientData {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  status: PatientStatus;
  createdAt: Date;
  lawyerReferrer: { id: string; firmName: string | null } | null;
  providerReferrer: { id: string; firstName: string; lastName: string } | null;
  cases: PatientCase[];
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const PATIENT_STATUS_META: Record<PatientStatus, { label: string; colorClass: string }> = {
  NEW:        { label: 'Nuevo',       colorClass: 'bg-brand/10 text-brand border-brand/30' },
  ACTIVE:     { label: 'Activo',      colorClass: 'bg-emerald/10 text-emerald border-emerald/30' },
  COMPLETED:  { label: 'Completado',  colorClass: 'bg-cyan/10 text-cyan border-cyan/30' },
  DISCHARGED: { label: 'Dado de alta',colorClass: 'bg-violet/10 text-violet border-violet/30' },
  INACTIVE:   { label: 'Inactivo',    colorClass: 'bg-bg-2 text-text-muted border-border' },
};

const CASE_STATUS_META: Record<string, { label: string; colorClass: string; dot: string }> = {
  NEW_REFERRAL:     { label: 'Nuevo referido',       colorClass: 'bg-rose/10 text-rose border-rose/30',           dot: 'bg-rose' },
  INTAKE_PENDING:   { label: 'Intake pendiente',     colorClass: 'bg-amber/10 text-amber border-amber/30',        dot: 'bg-amber' },
  INTAKE_COMPLETED: { label: 'Por confirmar',        colorClass: 'bg-cyan/10 text-cyan border-cyan/30',           dot: 'bg-cyan' },
  CONFIRMED:        { label: 'Confirmado',           colorClass: 'bg-emerald/10 text-emerald border-emerald/30',  dot: 'bg-emerald' },
  ACTIVE:           { label: 'Activo (en clínica)',  colorClass: 'bg-brand/10 text-brand border-brand/30',        dot: 'bg-brand' },
};

// ─── Component principal ──────────────────────────────────────────────────────

export function PatientDetailClient({ patient }: { patient: PatientData }) {
  const router = useRouter();

  // Estadísticas del paciente
  const totalCases = patient.cases.length;
  const activeCases = patient.cases.filter(
    (c) => !['COMPLETED', 'DISCHARGED', 'INACTIVE'].includes(c.status)
  ).length;
  const totalAppointments = patient.cases.reduce((acc, c) => acc + c._count.appointments, 0);
  const totalNotes = patient.cases.reduce((acc, c) => acc + c._count.notes, 0);

  // Edad
  const age = patient.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const patientStatusMeta = PATIENT_STATUS_META[patient.status];

  return (
    <div className="space-y-6">

      {/* PageHeader */}
      <PageHeader
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <PersonAvatar
              firstName={patient.firstName}
              lastName={patient.lastName}
              size={10}
              gradientClass="bg-gradient-brand"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>{patient.firstName} {patient.lastName}</span>
                <TagPill
                  label={patientStatusMeta.label}
                  colorClass={patientStatusMeta.colorClass}
                />
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <code className="text-text-muted text-xs font-mono font-normal">{patient.patientCode}</code>
                {age !== null && (
                  <span className="text-text-muted text-xs font-normal flex items-center gap-1">
                    <Cake className="w-3 h-3" /> {age} años
                  </span>
                )}
                <span className="text-text-muted text-xs font-normal flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Registrado {formatRelative(patient.createdAt)}
                </span>
              </div>
            </div>
          </div>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Volver
            </Button>
            {patient.phone && (
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => window.open(`tel:${patient.phone}`)}
              >
                <Phone className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Llamar</span>
              </Button>
            )}
          </div>
        }
      />

      {/* KPIs strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Casos totales"    value={totalCases}       sub="en este sistema"   color="text-brand" />
        <KpiCard label="Casos activos"    value={activeCases}      sub="en proceso"         color="text-emerald" />
        <KpiCard label="Citas totales"    value={totalAppointments} sub="acumuladas"        color="text-cyan" />
        <KpiCard label="Notas internas"   value={totalNotes}        sub="de encargados"     color="text-violet" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Datos personales */}
        <InfoCard title="Datos personales" icon={User}>
          <InfoRow
            label="Código"
            value={<code className="font-mono text-brand text-[11px]">{patient.patientCode}</code>}
          />
          <InfoRow
            label="Fecha nac."
            value={
              patient.dateOfBirth
                ? <span>{formatDate(patient.dateOfBirth)}{age !== null ? <span className="text-text-muted ml-2">({age} años)</span> : null}</span>
                : <span className="text-text-muted italic">No registrada</span>
            }
          />
          <InfoRow
            label="Teléfono"
            value={
              patient.phone
                ? <a href={`tel:${patient.phone}`} className="text-brand hover:underline font-mono text-[12.5px]">{patient.phone}</a>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label="Email"
            value={
              patient.email
                ? <a href={`mailto:${patient.email}`} className="text-brand hover:underline text-[12.5px] break-all">{patient.email}</a>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label="Status"
            value={<TagPill label={patientStatusMeta.label} colorClass={patientStatusMeta.colorClass} />}
          />
        </InfoCard>

        {/* Referido por */}
        <InfoCard title="Referido por" icon={Scale}>
          <InfoRow
            label="Bufete"
            value={
              patient.lawyerReferrer
                ? <span className="flex items-center gap-1.5"><Scale className="w-3 h-3 text-text-muted" />{patient.lawyerReferrer.firmName}</span>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label="Proveedor"
            value={
              patient.providerReferrer
                ? `${patient.providerReferrer.firstName} ${patient.providerReferrer.lastName}`
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label="Registrado"
            value={<span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-text-muted" />{formatDate(patient.createdAt)}</span>}
          />
          <InfoRow
            label="Total casos"
            value={
              <span className="flex items-center gap-1 text-brand font-semibold">
                <Hash className="w-3 h-3" />{totalCases} caso{totalCases !== 1 ? 's' : ''}
              </span>
            }
          />
        </InfoCard>
      </div>

      {/* Historial de casos */}
      <InfoCard
        title="Historial de casos"
        icon={ClipboardList}
        rightSlot={
          <TagPill
            label={`${totalCases} caso${totalCases !== 1 ? 's' : ''}`}
            colorClass="bg-brand/10 text-brand border-brand/30"
            compact
          />
        }
      >
        {patient.cases.length === 0 ? (
          <EmptyState.Inline message="No hay casos registrados para este paciente" />
        ) : (
          <div className="space-y-2 -mx-1">
            {patient.cases.map((c) => (
              <CaseRow
                key={c.id}
                case={c}
                onClick={() => router.push(`/front-office/${c.id}`)}
              />
            ))}
          </div>
        )}
      </InfoCard>

      {/* Footer note */}
      <div className="text-xs text-text-muted text-center pt-2 border-t border-border/40">
        Phase 1A · mock data · sin PHI real · 2026-06-07
      </div>
    </div>
  );
}

// ─── CaseRow — fila de caso dentro de la ficha del paciente ─────────────────

function CaseRow({ case: c, onClick }: { case: PatientCase; onClick: () => void }) {
  const st = CASE_STATUS_META[c.status] ?? CASE_STATUS_META.NEW_REFERRAL;
  const ageH = (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
  const ageLabel = ageH < 1 ? 'hace minutos' : ageH < 24 ? `hace ${Math.floor(ageH)}h` : `hace ${Math.floor(ageH / 24)}d`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-lg border border-border bg-bg-2/40 hover:bg-bg-2 hover:border-border-strong px-4 py-3 transition-all"
    >
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">

        {/* Status dot + code */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
          <code className="text-text-2 text-xs font-mono">{c.caseCode}</code>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <TagPill label={st.label} colorClass={st.colorClass} compact />
            {c.specialty && (
              <TagPill
                label={c.specialty.name}
                colorClass="bg-bg-3 text-text-2 border-border"
                compact
                icon={<span className="w-1.5 h-1.5 rounded-full" style={{ background: c.specialty.color }} />}
              />
            )}
            {c.caseType && c.caseType !== 'MVA' && (
              <TagPill label={c.caseType} colorClass="bg-bg-3 text-text-2 border-border" compact />
            )}
          </div>

          <div className="flex items-center gap-x-4 gap-y-0.5 text-[11px] text-text-muted flex-wrap">
            {c.accidentDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />DOL: {formatDate(c.accidentDate)}
              </span>
            )}
            {c.accidentLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />{c.accidentLocation}
              </span>
            )}
            {c.lawFirm && (
              <span className="flex items-center gap-1">
                <Scale className="w-3 h-3" />{c.lawFirm.firmName}
              </span>
            )}
            {c.primaryInsurance && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />{c.primaryInsurance.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />{c._count.notes} nota{c._count.notes !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Stethoscope className="w-3 h-3" />{c._count.appointments} cita{c._count.appointments !== 1 ? 's' : ''}
            </span>
            <span className="ml-auto">{ageLabel}</span>
          </div>
        </div>

        {/* Chevron */}
        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-1 transition-colors shrink-0 self-center" />
      </div>
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatRelative(d: Date | string): string {
  const h = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
  if (h < 1) return 'hace minutos';
  if (h < 24) return `hace ${Math.floor(h)}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months !== 1 ? 'es' : ''}`;
}
