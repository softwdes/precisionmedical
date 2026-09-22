'use client';
import { fechaCalendario, edad, anioOFecha } from '@/lib/fechas';

/**
 * PatientContextPanel — contexto clínico del paciente junto a la nota (N2).
 *
 * Equivalente al panel izquierdo del v2: datos personales, contacto, emergencia,
 * seguros y el historial clínico (alergias, problemas, medicamentos activos,
 * cirugías, antecedentes familiares e historia social).
 *
 * Lo ven los DOS portales: la consulta del doctor y el paso 3 de Day Admission
 * (Erick, 2026-08-13: "el asistente debe ver lo mismo que el doctor"). Vivía
 * dentro de la carpeta de la consulta y por eso el asistente no lo tenía.
 *
 * Con `editable`, cada sección del historial lleva un lápiz que abre la ficha
 * completa —el MISMO diálogo del botón "Historial médico" de la barra—. Devin,
 * 2026-09-17: pidió "access to sidebar history from note to edit these things".
 * La función ya existía; lo que faltaba era que se notara, porque el panel
 * mostraba el dato en gris y nada decía que el botón de arriba lo editaba.
 *
 * Sin `editable` el panel es de solo lectura, como nació. Day Admission lo deja
 * así a propósito: que el asistente VEA lo mismo que el doctor (Erick,
 * 2026-08-13) no dice que edite la ficha clínica desde ahí, y eso es una
 * decisión aparte.
 *
 * "Datos del seguro" lleva lápiz APARTE: no es historial médico, vive en el
 * caso (Erick, 2026-09-22), así que su destino es el expediente y no la ficha.
 * Lo trae el que monta el panel con `onVerSeguro` — el panel no sabe navegar.
 *
 * El payload lo arma `lib/patient-context.ts`, compartido por las dos pantallas.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronDown, User, ShieldCheck, Activity, HeartPulse, Pill, Stethoscope,
  Users, MessageSquare, Pencil,
} from 'lucide-react';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';
import { useMedicalHistoryDialog } from '@/components/patients/medical-history-button';
import type { PatientContext } from '@/lib/patient-context';

export type { PatientContext };

// ─── Átomos ──────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-start justify-between gap-2 py-[3px]">
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      <span className={`text-[11.5px] text-right ${empty ? 'text-text-muted' : 'text-text-1 font-medium'}`}>
        {empty ? 'N/D' : value}
      </span>
    </div>
  );
}

/**
 * El comentario de un campo del historial social.
 *
 * Cursiva y gris, debajo del valor: lo que el provider compara de un vistazo es
 * el estado ("Actual"), y esto es el matiz. Con el mismo peso volvería a leerse
 * como un párrafo.
 */
function Nota({ texto }: { texto?: string | null }): React.ReactElement | null {
  if (!texto) return null;
  return <p className="text-[10.5px] italic text-text-muted leading-snug pb-[3px]">{texto}</p>;
}

function Section({
  title, icon: Icon, children, defaultOpen = true, count, onEdit, editLabel,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  /** Con esto la sección muestra el lápiz que abre la ficha completa. */
  onEdit?: () => void;
  editLabel?: string;
}): React.ReactElement {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-lg bg-bg-2/30 overflow-hidden">
      {/* El lápiz es HERMANO del botón de plegar, no va adentro: un <button>
          dentro de otro es HTML inválido y el navegador desarma el marcado. */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
        >
          <Icon className="w-3.5 h-3.5 text-violet-text shrink-0" />
          <span className="text-[12px] font-semibold text-text-1 flex-1 text-left truncate">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-[10px] font-bold text-violet-text bg-violet/15 rounded px-1.5 py-0.5">{count}</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title={editLabel}
            aria-label={editLabel}
            className="shrink-0 px-2.5 flex items-center text-text-muted hover:text-violet-text hover:bg-white/[0.03] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function EmptyNote({ text }: { text: string }): React.ReactElement {
  return (
    <div className="rounded-md bg-bg-2/40 px-3 py-2.5 text-center text-[11px] text-text-muted">{text}</div>
  );
}

/**
 * Envoltorio de `fechaCalendario` que devuelve `null` —no `'—'`— cuando no hay
 * fecha: las tres llamadas de acá viven en `.filter(Boolean)` o detrás de un
 * guard, y un guión suelto se colaría en el medio ("Activo · —").
 *
 * Las tres son fechas de CALENDARIO (nacimiento, diagnóstico, cirugía), así que
 * van sin zona. Ver el comentario en lib/fechas.ts.
 */
function fmtDate(iso: string | null | undefined): string | null {
  return iso ? fechaCalendario(iso) : null;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function PatientContextPanel({
  patient: p, editable = false, onVerSeguro,
}: {
  patient: PatientContext;
  /** Dibuja el lápiz de "editar" en las secciones del historial. */
  editable?: boolean;
  /**
   * Abre el expediente en el tab del caso, que es donde se cargan los seguros.
   * Sin esto, "Datos del seguro" no lleva lápiz: el panel no navega solo.
   */
  onVerSeguro?: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const age = edad(p.dateOfBirth);
  const { abrir, dialogo } = useMedicalHistoryDialog(p.id);
  /**
   * Las seis secciones del historial comparten el mismo destino: la ficha
   * completa. Deep-link a la sección exacta pediría tocar el diálogo de 2.800
   * líneas; abrirlo ya resuelve el problema que Devin reportó, que era no tener
   * por dónde entrar.
   */
  const editarFicha = editable
    ? { onEdit: () => void abrir(), editLabel: t('ctxEdit') }
    : {};
  const h = p.history;
  const activeMeds = h.medications.filter((m) => m.status === 'IN_USE');
  const social = h.socialHistory;
  // Plegado SOLO en mobile/iPad vertical: el panel mide ~1100px y empujaba las
  // tabs de trabajo del doctor 1.4 pantallas abajo. Desde lg: siempre abierto.
  const [mobileOpen, setMobileOpen] = React.useState(false);

  /**
   * Las dos fuentes de alergias, separadas. Ver el bloque de la sección Alergias
   * más abajo y `allergiesDeclared` en lib/patient-context.
   */
  const alergiasFicha = h.allergies?.trim() ?? '';
  const alergiasDeclaradas = h.allergiesDeclared?.text?.trim() ?? '';
  /** El paciente contestó que NO tiene alergias: es una confirmación, no un hueco. */
  const negadaPorPaciente = !!h.allergiesDeclared && !h.allergiesDeclared.has;

  /**
   * El aviso de la cabecera plegada en mobile. Incluye lo declarado por el
   * paciente: si solo mirara el historial, la alergia que el paciente cargó en
   * su formulario quedaría escondida detrás de un tap — que es justo lo que la
   * cabecera existe para evitar.
   */
  const hasAllergies = !!alergiasFicha || !!alergiasDeclaradas;

  return (
    <div className="space-y-2">
      {/* Cabecera plegable (solo mobile) — deja las tabs visibles de entrada.
          Las alergias se muestran acá aunque esté cerrado: es dato de seguridad
          clínica y no puede quedar escondido detrás de un tap. */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        className="lg:hidden w-full rounded-lg bg-bg-2/30 px-3 py-2 min-h-11 flex items-center gap-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={8} photoUrl={p.photoUrl} gradientClass="bg-gradient-to-br from-violet to-[#a78bfa]" />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[12px] font-bold text-text-1 truncate">{p.lastName}, {p.firstName}</div>
          <div className="text-[10px] text-text-muted truncate">{t('ctxToggle')}</div>
        </div>
        {hasAllergies && (
          // Rose = registrada en el historial · amber = solo declarada por el
          // paciente y sin confirmar. Mismo código de color que la sección.
          <TagPill
            label={t('ctxAllergies')}
            colorClass={alergiasFicha
              ? 'bg-rose/15 text-rose border-rose/30'
              : 'bg-amber/15 text-amber border-amber/30'}
            compact
          />
        )}
        <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${mobileOpen ? '' : '-rotate-90'}`} />
      </button>

      <div className={`space-y-2 ${mobileOpen ? '' : 'hidden lg:block'}`}>
      {/* Identidad + datos personales */}
      <div className="rounded-lg bg-bg-2/30 p-3 space-y-3">
        <div className="flex items-center gap-2.5">
          <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={10} photoUrl={p.photoUrl} gradientClass="bg-gradient-to-br from-violet to-[#a78bfa]" />
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
      <Section
        title={t('ctxInsurance')}
        icon={ShieldCheck}
        {...(onVerSeguro ? { onEdit: onVerSeguro, editLabel: t('ctxEditInsurance') } : {})}
      >
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

      {/*
        Alergias — destacadas si existen (dato de seguridad clínica).

        DOS fuentes, y se muestran separadas a propósito: lo que registró el
        staff en el historial (rose) y lo que declaró el paciente en su
        formulario de intake (amber, "sin confirmar"). Lo segundo no se veía en
        ninguna pantalla —solo lo imprimía el PDF del intake—, así que un
        paciente podía declarar una alergia y acá seguía diciendo "sin alergias
        conocidas". Ver `allergiesDeclared` en lib/patient-context.

        No se fusionan: confirmar lo que dijo el paciente es un acto del staff,
        y presentarlo ya confirmado sería inventar esa revisión.
      */}
      <Section title={t('ctxAllergies')} icon={Activity} {...editarFicha}>
        {!alergiasFicha && !alergiasDeclaradas ? (
          // Sin nada cargado. Si el paciente contestó que NO tiene, eso es una
          // confirmación y no un hueco de información — se dice cuál de las dos.
          <EmptyNote text={negadaPorPaciente ? t('ctxAllergiesDenied') : t('ctxNoAllergies')} />
        ) : (
          <div className="space-y-1.5">
            {alergiasFicha && (
              <div className="rounded-md border border-rose/25 bg-rose/[0.07] px-3 py-2 text-[11.5px] text-rose">
                {alergiasFicha}
              </div>
            )}
            {alergiasDeclaradas && (
              <div className="rounded-md border border-amber/25 bg-amber/[0.07] px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wider font-semibold text-amber">
                  {t('ctxAllergiesDeclared')}
                </div>
                <div className="text-[11.5px] text-amber mt-0.5">{alergiasDeclaradas}</div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Lista de problemas */}
      <Section title={t('ctxProblems')} icon={HeartPulse} count={h.problems.length} {...editarFicha}>
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
      <Section title={t('ctxMedications')} icon={Pill} count={activeMeds.length} {...editarFicha}>
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
      <Section title={t('ctxSurgeries')} icon={Stethoscope} count={h.surgeries.length} defaultOpen={false} {...editarFicha}>
        {h.surgeries.length === 0 ? <EmptyNote text={t('ctxNoSurgeries')} /> : (
          <div className="space-y-1">
            {h.surgeries.map((s, i) => (
              <div key={i} className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="text-[11.5px] text-text-1 font-medium">{s.procedure}</div>
                {/* `anioOFecha` y no `fmtDate`: el campo del formulario pide el
                    AÑO, y formatear "2018" como fecha lo mostraba como "1 ene
                    2018" — día y mes inventados en un historial clínico. */}
                {s.date && <div className="text-[10px] text-text-muted mt-0.5">{anioOFecha(s.date)}</div>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Antecedentes familiares */}
      <Section title={t('ctxFamilyHistory')} icon={Users} count={h.familyHistory.length} defaultOpen={false} {...editarFicha}>
        {h.familyHistory.length === 0 ? <EmptyNote text={t('ctxNoFamilyHistory')} /> : (
          <div className="space-y-1">
            {h.familyHistory.map((f, i) => (
              <div key={i} className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-text-1">{f.condition}</span>
                  <span className="text-[10px] text-text-muted shrink-0">{f.relation}</span>
                </div>
                {/* El matiz que cargó recepción: "diagnosticada a los 40". Va
                    acá porque es justo lo que el médico quiere leer sin salir
                    de la nota. */}
                {f.notes && <p className="text-[10.5px] text-text-muted mt-1 leading-relaxed">{f.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Historia social */}
      <Section title={t('ctxSocialHistory')} icon={MessageSquare} defaultOpen={false} {...editarFicha}>
        {!social || Object.values(social).every((v) => !v) ? (
          <EmptyNote text={t('ctxNoSocialHistory')} />
        ) : (
          <div className="space-y-1.5">
            {(social.work || social.children) && (
              <div className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">{t('ctxWorkFamily')}</div>
                <Row label={t('ctxWork')} value={social.work} />
                <Nota texto={social.workNote} />
                <Row label={t('ctxChildren')} value={social.children} />
                <Nota texto={social.childrenNote} />
              </div>
            )}
            {[
              { label: t('ctxTobacco'), value: social.tobacco, nota: social.tobaccoNote },
              { label: t('ctxAlcohol'), value: social.alcohol, nota: social.alcoholNote },
              { label: t('ctxDrugs'),   value: social.drugs,   nota: social.drugsNote },
            ].map(({ label, value, nota }) => (
              <div key={label} className="rounded-md bg-bg-2/40 px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">{label}</div>
                <Row label={t('ctxStatus')} value={value} />
                <Nota texto={nota} />
              </div>
            ))}
            {/* El comentario general de la sección. */}
            {social.notes && (
              <div className="rounded-md bg-brand/[0.06] border-l-2 border-brand px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">{t('ctxGeneralComments')}</div>
                <p className="text-[11.5px] text-text-2 leading-snug whitespace-pre-line">{social.notes}</p>
              </div>
            )}
          </div>
        )}
      </Section>
      </div>
      {dialogo}
    </div>
  );
}
