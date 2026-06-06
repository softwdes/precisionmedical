'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, PhoneCall, FileText, Mail, Send, ChevronRight, AlertCircle, Plus, Calendar, MapPin, Building2 } from 'lucide-react';
import { Button } from '@precision/ui';

// B.1 — Front Office · Recepción primaria

type CaseStatus = 'NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED';

interface PhoenixCase {
  id: string;
  caseCode: string;
  status: CaseStatus;
  source: string;
  accidentDate: Date | null;
  accidentType: string | null;
  accidentLocation: string | null;
  patient: {
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    dateOfBirth: Date | null;
  };
  lawFirm: { firmName: string; paymentSpeed: string | null } | null;
  attorney: { firstName: string | null; lastName: string | null } | null;
  primaryInsurance: {
    name: string;
    shortCode: string;
    color: string;
    responseSpeed: string;
  } | null;
  specialty: { name: string; color: string } | null;
  intakeFormSentAt: Date | null;
  intakeFormSentVia: string | null;
  intakeFormCompletedAt: Date | null;
  pipVerifiedAt: Date | null;
  firstAppointmentConfirmedAt: Date | null;
  appointmentCount: number;
  noteCount: number;
  createdAt: Date;
}

interface Props {
  cases: PhoenixCase[];
  stats: Record<CaseStatus, number>;
}

export function FrontOfficeClient({ cases, stats }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | CaseStatus>('all');

  const filtered = filter === 'all' ? cases : cases.filter((c) => c.status === filter);

  const handleNewCase = () => {
    // B.2 — Crear caso. Por ahora abre modal stub.
    alert('B.2 viene a continuación · Modal de crear caso por llamada');
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-lg border border-border bg-gradient-to-br from-bg-1 via-bg-1 to-brand/5 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-1">
              <Building2 className="w-3 h-3" /> Front Office · Workspace
            </div>
            <h1 className="text-2xl font-bold text-text-1">Recepción primaria</h1>
            <p className="text-text-2 text-sm mt-1">
              Contestá la llamada · Capturá el referido en 90 segundos · Mockup B.1 + B.2
            </p>
          </div>
          <Button onClick={handleNewCase} className="shadow-glow">
            <PhoneCall className="w-4 h-4 mr-2" />
            Nueva llamada / Crear caso
          </Button>
        </div>

        {/* Phone-style call indicator */}
        <div className="mt-5 rounded-lg border border-emerald/30 bg-emerald/5 px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald/15 flex items-center justify-center">
            <Phone className="w-4 h-4 text-emerald" />
          </div>
          <div className="flex-1">
            <div className="text-emerald text-xs font-semibold uppercase tracking-wider">Línea principal disponible</div>
            <div className="text-text-2 text-xs">(801) 375-2207 · Weave routing activo · Auto-attendant fuera de horario</div>
          </div>
          <span className="text-text-muted text-[10px] font-mono">CALL READY</span>
        </div>
      </div>

      {/* KPIs por status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatusKpi
          label="Nuevos referidos"
          count={stats.NEW_REFERRAL}
          sub="Sin contactar"
          color="text-rose"
          bg="bg-rose/5 border-rose/20"
        />
        <StatusKpi
          label="Intake pendiente"
          count={stats.INTAKE_PENDING}
          sub="Portal enviado"
          color="text-amber"
          bg="bg-amber/5 border-amber/20"
        />
        <StatusKpi
          label="Intake completado"
          count={stats.INTAKE_COMPLETED}
          sub="A confirmar 24h"
          color="text-cyan"
          bg="bg-cyan/5 border-cyan/20"
        />
        <StatusKpi
          label="Confirmados"
          count={stats.CONFIRMED}
          sub="Listos para venir"
          color="text-emerald"
          bg="bg-emerald/5 border-emerald/20"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-text-muted text-xs uppercase tracking-wider font-semibold mr-2">Cola:</span>
        <FilterPill active={filter === 'all'}              onClick={() => setFilter('all')}              label="Todos"             count={cases.length} />
        <FilterPill active={filter === 'NEW_REFERRAL'}     onClick={() => setFilter('NEW_REFERRAL')}     label="🔴 Nuevos"         count={stats.NEW_REFERRAL} />
        <FilterPill active={filter === 'INTAKE_PENDING'}   onClick={() => setFilter('INTAKE_PENDING')}   label="🟡 Intake pending" count={stats.INTAKE_PENDING} />
        <FilterPill active={filter === 'INTAKE_COMPLETED'} onClick={() => setFilter('INTAKE_COMPLETED')} label="🔵 Por confirmar"   count={stats.INTAKE_COMPLETED} />
        <FilterPill active={filter === 'CONFIRMED'}        onClick={() => setFilter('CONFIRMED')}        label="🟢 Confirmados"    count={stats.CONFIRMED} />
      </div>

      {/* Case list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-12 text-center">
            <FileText className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <div className="text-text-1 font-semibold">No hay casos en esta cola</div>
            <div className="text-text-2 text-sm mt-1">Buen trabajo. Cuando entre una llamada, click "Nueva llamada".</div>
          </div>
        ) : (
          filtered.map((c) => <CaseCard key={c.id} case={c} onClick={() => router.push(`/front-office/${c.id}`)} />)
        )}
      </div>

      {/* Footer help */}
      <div className="text-xs text-text-muted text-center pt-4 border-t border-border/40">
        Mock data · CERO PHI real · Phase 1A local
      </div>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────

function StatusKpi({ label, count, sub, color, bg }: { label: string; count: number; sub: string; color: string; bg: string }) {
  return (
    <div className={`rounded-lg border px-5 py-4 ${bg}`}>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{count}</div>
      <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function FilterPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active ? 'bg-gradient-brand text-white' : 'bg-bg-2 border border-border text-text-2 hover:text-text-1 hover:border-border-strong'
      }`}
    >
      {label} <span className="opacity-70 font-mono">({count})</span>
    </button>
  );
}

function CaseCard({ case: c, onClick }: { case: PhoenixCase; onClick: () => void }) {
  const statusLabel: Record<CaseStatus, { label: string; color: string; bg: string; icon: string }> = {
    NEW_REFERRAL:     { label: 'Nuevo referido',     color: 'text-rose',    bg: 'bg-rose/10 border-rose/30',       icon: '🔴' },
    INTAKE_PENDING:   { label: 'Intake pendiente',   color: 'text-amber',   bg: 'bg-amber/10 border-amber/30',     icon: '🟡' },
    INTAKE_COMPLETED: { label: 'Por confirmar (24h)', color: 'text-cyan',    bg: 'bg-cyan/10 border-cyan/30',       icon: '🔵' },
    CONFIRMED:        { label: 'Confirmado',          color: 'text-emerald', bg: 'bg-emerald/10 border-emerald/30', icon: '🟢' },
  };
  const st = statusLabel[c.status];

  const age = ageInHours(c.createdAt);
  const ageLabel = age < 1 ? 'hace minutos' : age < 24 ? `hace ${Math.floor(age)}h` : `hace ${Math.floor(age / 24)}d`;

  return (
    <div
      onClick={onClick}
      className="group rounded-lg border border-border bg-bg-1 p-5 hover:border-border-strong hover:bg-bg-1/80 cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Patient avatar */}
          <div className="w-12 h-12 rounded-lg bg-gradient-cyan flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-glow">
            {(c.patient.firstName[0] ?? '?') + (c.patient.lastName[0] ?? '')}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <div className="text-text-1 font-bold text-base">
                {c.patient.firstName} {c.patient.lastName}
              </div>
              <code className="text-text-muted text-xs font-mono">{c.caseCode}</code>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${st.bg} ${st.color}`}>
                <span>{st.icon}</span> {st.label}
              </span>
            </div>

            {/* Sub-info */}
            <div className="flex items-center gap-x-4 gap-y-1 text-xs text-text-2 flex-wrap mt-1">
              {c.patient.phone && (
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3 h-3 text-text-muted" /> {c.patient.phone}
                </span>
              )}
              {c.accidentDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-text-muted" /> DOL: {formatDate(c.accidentDate)}
                </span>
              )}
              {c.accidentLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-text-muted" /> {c.accidentLocation}
                </span>
              )}
            </div>

            {/* Pills row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {c.specialty && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-2 text-text-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.specialty.color }} />
                  {c.specialty.name}
                </span>
              )}
              {c.lawFirm && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-2 text-text-2">
                  ⚖️ {c.lawFirm.firmName}
                  {c.lawFirm.paymentSpeed === 'SLOW' && <span className="text-amber" title="Pago lento">⚠</span>}
                </span>
              )}
              {c.primaryInsurance && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-2 text-text-2">
                  <span className="w-3 h-3 rounded flex items-center justify-center text-white text-[7px] font-bold" style={{ background: c.primaryInsurance.color }}>
                    {c.primaryInsurance.shortCode}
                  </span>
                  {c.primaryInsurance.name}
                  {c.primaryInsurance.responseSpeed === 'SLOW' && <span className="text-amber">⚠</span>}
                </span>
              )}
              <span className="text-text-muted text-[10px] ml-auto">{ageLabel}</span>
            </div>

            {/* Action prompt by status */}
            {c.status === 'NEW_REFERRAL' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-rose">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="font-semibold">Acción: contactar paciente + enviar portal SMS</span>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); alert('B.3 viene a continuación · enviar magic link'); }}>
                  <Send className="w-3 h-3 mr-1" /> Enviar portal
                </Button>
              </div>
            )}
            {c.status === 'INTAKE_PENDING' && c.intakeFormSentAt && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber">
                <Mail className="w-3.5 h-3.5" />
                <span>Portal {c.intakeFormSentVia} enviado {formatRelative(c.intakeFormSentAt)} · Esperando paciente complete</span>
              </div>
            )}
            {c.status === 'INTAKE_COMPLETED' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-cyan">
                <Phone className="w-3.5 h-3.5" />
                <span className="font-semibold">Acción: llamar 24h antes para confirmar cita</span>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); alert('B.4: workflow de confirmación'); }}>
                  Confirmar
                </Button>
              </div>
            )}
            {c.status === 'CONFIRMED' && c.firstAppointmentConfirmedAt && (
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald">
                <span>✅ Confirmado {formatRelative(c.firstAppointmentConfirmedAt)} · Listo para venir</span>
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-text-1 transition-colors shrink-0 self-center" />
      </div>
    </div>
  );
}

function ageInHours(date: Date): number {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(d: Date): string {
  const h = ageInHours(d);
  if (h < 1) return 'hace minutos';
  if (h < 24) return `hace ${Math.floor(h)}h`;
  return `hace ${Math.floor(h / 24)}d`;
}
