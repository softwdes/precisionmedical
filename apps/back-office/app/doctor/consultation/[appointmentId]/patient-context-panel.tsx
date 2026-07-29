'use client';

/**
 * PatientContextPanel — contexto clínico del paciente junto a la nota (N2).
 *
 * Equivalente al panel izquierdo del v2: datos personales, contacto, emergencia,
 * seguros y el historial clínico (alergias, problemas, medicamentos activos,
 * cirugías, antecedentes familiares e historia social).
 *
 * Solo lectura en esta fase — la edición vive en el módulo de pacientes.
 * Tarjetas colapsables; en mobile/iPad el panel completo se puede plegar.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronDown, User, ShieldCheck, Activity, HeartPulse, Pill, Stethoscope,
  Users, MessageSquare,
} from 'lucide-react';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PatientContext {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  maritalStatus: string | null;
  preferredLanguage: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  guardianName: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  referredBy: string | null;
  preferredPharmacy: string | null;
  employer: string | null;
  providerName: string | null;
  insurance: {
    primaryName: string | null;
    primaryPolicy: string | null;
    primaryType: string | null;
    secondaryName: string | null;
    secondaryPolicy: string | null;
  };
  history: {
    allergies: string | null;
    problems: Array<{ condition: string; status?: string; diagnosedAt?: string }>;
    medications: Array<{
      id?: string; name: string; dose?: string; instructions?: string; status: string;
      prescribedBy?: string; externalPrescriber?: boolean;
    }>;
    surgeries: Array<{ procedure: string; date?: string }>;
    familyHistory: Array<{ relation: string; condition: string }>;
    socialHistory: { work?: string; children?: string; tobacco?: string; alcohol?: string; drugs?: string } | null;
  };
}

// ─── Átomos ──────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-start justify-between gap-2 py-[3px]">
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      <span className={`text-[11.5px] text-right ${empty ? 'text-text-muted/60' : 'text-text-1 font-medium'}`}>
        {empty ? 'N/D' : value}
      </span>
    </div>
  );
}

function Section({
  title, icon: Icon, children, defaultOpen = true, count,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}): React.ReactElement {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-lg bg-bg-2/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-violet shrink-0" />
        <span className="text-[12px] font-semibold text-text-1 flex-1 text-left">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] font-bold text-violet bg-violet/15 rounded px-1.5 py-0.5">{count}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function EmptyNote({ text }: { text: string }): React.ReactElement {
  return (
    <div className="rounded-md bg-bg-2/40 px-3 py-2.5 text-center text-[11px] text-text-muted">{text}</div>
  );
}

function ageOf(dobIso: string | null): number | null {
  if (!dobIso) return null;
  return Math.floor((Date.now() - new Date(dobIso).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function PatientContextPanel({ patient: p }: { patient: PatientContext }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const age = ageOf(p.dateOfBirth);
  const h = p.history;
  const activeMeds = h.medications.filter((m) => m.status === 'IN_USE');
  const social = h.socialHistory;

  return (
    <div className="space-y-2">
      {/* Identidad + datos personales */}
      <div className="rounded-lg bg-bg-2/30 p-3 space-y-3">
        <div className="flex items-center gap-2.5">
          <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={10} gradientClass="bg-gradient-to-br from-violet to-[#a78bfa]" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-text-1 truncate">{p.lastName}, {p.firstName}</div>
            {age !== null && <div className="text-[10.5px] text-text-muted">{age} {t('yearsShort')}</div>}
          </div>
        </div>

        <div>
          <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('ctxPersonal')}</div>
          <Row label={t('ctxDob')} value={fmtDate(p.dateOfBirth)} />
          <Row label={t('ctxSex')} value={p.sex} />
          <Row label={t('ctxMarital')} value={p.maritalStatus} />
          <Row label={t('ctxLanguage')} value={p.preferredLanguage} />
        </div>

        <div className="pt-2 border-t border-border/50">
          <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('ctxContact')}</div>
          <Row label={t('ctxPhone')} value={p.phone} />
          <Row label={t('ctxMobile')} value={p.phone2} />
          <Row label={t('ctxEmail')} value={p.email} />
        </div>

        <div className="pt-2 border-t border-border/50">
          <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('ctxEmergencyExtra')}</div>
          <Row label={t('ctxGuardian')} value={p.guardianName} />
          <Row
            label={t('ctxEmergency')}
            value={p.emergencyContactName
              ? `${p.emergencyContactName}${p.emergencyContactPhone ? ` · ${p.emergencyContactPhone}` : ''}`
              : null}
          />
          <Row label={t('ctxReferredBy')} value={p.referredBy} />
          <Row label={t('ctxPharmacy')} value={p.preferredPharmacy} />
          <Row label={t('ctxEmployer')} value={p.employer} />
          <Row label={t('ctxProvider')} value={p.providerName} />
        </div>
      </div>

      {/* Seguros */}
      <Section title={t('ctxInsurance')} icon={ShieldCheck}>
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted">{t('ctxPrimaryInsurance')}</span>
              {p.insurance.primaryType && (
                <TagPill label={p.insurance.primaryType} colorClass="bg-cyan/15 text-cyan border-cyan/30" compact />
              )}
            </div>
            {p.insurance.primaryName ? (
              <div className="rounded-md bg-bg-2/40 px-3 py-2">
                <Row label={t('ctxCompany')} value={p.insurance.primaryName} />
                <Row label={t('ctxPolicy')} value={p.insurance.primaryPolicy} />
              </div>
            ) : <EmptyNote text={t('ctxNoPrimaryInsurance')} />}
          </div>
          <div>
            <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-1">{t('ctxSecondaryInsurance')}</div>
            {p.insurance.secondaryName ? (
              <div className="rounded-md bg-bg-2/40 px-3 py-2">
                <Row label={t('ctxCompany')} value={p.insurance.secondaryName} />
                <Row label={t('ctxPolicy')} value={p.insurance.secondaryPolicy} />
              </div>
            ) : <EmptyNote text={t('ctxNoSecondaryInsurance')} />}
          </div>
        </div>
      </Section>

      {/* Alergias — destacadas si existen (dato de seguridad clínica) */}
      <Section title={t('ctxAllergies')} icon={Activity}>
        {h.allergies?.trim() ? (
          <div className="rounded-md border border-rose/25 bg-rose/[0.07] px-3 py-2 text-[11.5px] text-rose">
            {h.allergies}
          </div>
        ) : <EmptyNote text={t('ctxNoAllergies')} />}
      </Section>

      {/* Lista de problemas */}
      <Section title={t('ctxProblems')} icon={HeartPulse} count={h.problems.length}>
        {h.problems.length === 0 ? <EmptyNote text={t('ctxNoProblems')} /> : (
          <div className="space-y-1">
            {h.problems.map((pr, i) => (
              <div key={i} className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="text-[11.5px] text-text-1 font-medium">{pr.condition}</div>
                {(pr.status || pr.diagnosedAt) && (
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {[pr.status, fmtDate(pr.diagnosedAt)].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Medicamentos activos */}
      <Section title={t('ctxMedications')} icon={Pill} count={activeMeds.length}>
        {activeMeds.length === 0 ? <EmptyNote text={t('ctxNoMedications')} /> : (
          <div className="space-y-1">
            {activeMeds.map((m, i) => (
              <div key={m.id ?? i} className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11.5px] text-text-1 font-medium">{m.name}</span>
                  {m.externalPrescriber && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-text-muted border border-dashed border-border rounded px-1 py-px shrink-0">
                      {t('ctxNotPrescribedByMe')}
                    </span>
                  )}
                </div>
                {(m.dose || m.instructions) && (
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {[m.dose, m.instructions].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Cirugías y procedimientos */}
      <Section title={t('ctxSurgeries')} icon={Stethoscope} count={h.surgeries.length} defaultOpen={false}>
        {h.surgeries.length === 0 ? <EmptyNote text={t('ctxNoSurgeries')} /> : (
          <div className="space-y-1">
            {h.surgeries.map((s, i) => (
              <div key={i} className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="text-[11.5px] text-text-1 font-medium">{s.procedure}</div>
                {s.date && <div className="text-[10px] text-text-muted mt-0.5">{fmtDate(s.date)}</div>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Antecedentes familiares */}
      <Section title={t('ctxFamilyHistory')} icon={Users} count={h.familyHistory.length} defaultOpen={false}>
        {h.familyHistory.length === 0 ? <EmptyNote text={t('ctxNoFamilyHistory')} /> : (
          <div className="space-y-1">
            {h.familyHistory.map((f, i) => (
              <div key={i} className="rounded-md bg-bg-2/40 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-text-1">{f.condition}</span>
                <span className="text-[10px] text-text-muted shrink-0">{f.relation}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Historia social */}
      <Section title={t('ctxSocialHistory')} icon={MessageSquare} defaultOpen={false}>
        {!social || Object.values(social).every((v) => !v) ? (
          <EmptyNote text={t('ctxNoSocialHistory')} />
        ) : (
          <div className="space-y-1.5">
            {(social.work || social.children) && (
              <div className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">{t('ctxWorkFamily')}</div>
                <Row label={t('ctxWork')} value={social.work} />
                <Row label={t('ctxChildren')} value={social.children} />
              </div>
            )}
            {[
              { label: t('ctxTobacco'), value: social.tobacco },
              { label: t('ctxAlcohol'), value: social.alcohol },
              { label: t('ctxDrugs'), value: social.drugs },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">{label}</div>
                <Row label={t('ctxStatus')} value={value} />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
