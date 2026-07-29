'use client';

/**
 * VisitSummary — nodo 4 del flujo del doctor (B.18 · S1).
 *
 * Resumen de todo lo que pasó en la consulta + checklist de salida. El botón
 * "Terminé con el paciente" NO cierra la cita: sella `doctorDoneAt` y el
 * asistente sigue viendo al paciente en su cola para cobrar y cerrarla.
 *
 * Guardrail: sin nota FIRMADA no se puede salir (decisión de Erick 2026-07-29).
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import {
  CheckCircle2, AlertTriangle, Clock3, FileText, FlaskConical, Briefcase,
  HeartPulse, Stethoscope, Loader2, LogOut, RotateCcw, Printer, ChevronRight,
} from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';
import type { VisitNoteData } from './visit-note-editor';
import type { LabOrderRow } from './labs-tab';

/** Solo los vitales que el resumen muestra — el triaje completo vive en su nodo */
export interface SummaryTriage {
  systolicMmhg: number | null;
  diastolicMmhg: number | null;
  pulseBpm: number | null;
  respiratoryRate: number | null;
  tempFahrenheit: number | null;
  painScale: number | null;
  o2Saturation: number | null;
  chiefComplaint: string | null;
}

interface ServiceCode {
  id: string;
  code: string;
  description: string;
  category?: string;
}

interface Props {
  appointmentId: string;
  note: VisitNoteData | null;
  triage: SummaryTriage | null;
  services: ServiceCode[];
  checkedInAt: string | null;
  doctorDoneAt: string | null;
  /** Salta al tab que resuelve lo que falta */
  onFix: (tab: 'notes' | 'labs' | 'services') => void;
  /**
   * 'doctor'    — botón "Terminé con el paciente"; la nota sin firmar BLOQUEA.
   * 'assistant' — botón "Checkout" que cierra la cita; nada bloquea (el paciente
   *               se está yendo), solo avisa. Ve el estado del doctor.
   */
  variant?: 'doctor' | 'assistant';
  /** variant assistant: estado actual de la cita */
  appointmentStatus?: string;
  /** variant assistant: nombre del doctor, para "el Dr. X terminó a las…" */
  providerName?: string | null;
  /** variant assistant: se llama al cerrar/reabrir para refrescar la pantalla */
  onStatusChange?: () => void;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Denver',
  });
}

/** Minutos entre dos instantes, en texto corto (1 h 20 min) */
function elapsed(from: string | null, to: Date): string | null {
  if (!from) return null;
  const mins = Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Tarjeta de sección del resumen */
function Card({
  icon: Icon, title, action, children,
}: {
  icon: React.ElementType;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-violet shrink-0" />
        <div className="text-text-1 font-semibold text-[12px] uppercase tracking-wider flex-1">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function VisitSummary({
  appointmentId, note, triage, services, checkedInAt, doctorDoneAt, onFix,
  variant = 'doctor', appointmentStatus, providerName, onStatusChange,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const isAssistant = variant === 'assistant';

  const [labs, setLabs] = React.useState<LabOrderRow[]>([]);
  const [loadingLabs, setLoadingLabs] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [doneAt, setDoneAt] = React.useState<string | null>(doctorDoneAt);

  React.useEffect(() => {
    fetch(`/api/admin/lab-orders/${appointmentId}`)
      .then((r) => r.json())
      .then((d: { orders?: LabOrderRow[] }) => setLabs(d.orders ?? []))
      .catch(() => undefined)
      .finally(() => setLoadingLabs(false));
  }, [appointmentId]);

  const isSigned = note?.status === 'SIGNED';
  const dxCount = note?.diagnoses.length ?? 0;
  const timeInRoom = elapsed(checkedInAt, doneAt ? new Date(doneAt) : new Date());

  // Checklist de salida. Al doctor la nota sin firmar lo bloquea; al asistente
  // NUNCA se lo bloquea — el paciente se está yendo, cerrar siempre es posible.
  const checks: Array<{
    key: string; ok: boolean; blocking: boolean; label: string; fix?: 'notes' | 'labs' | 'services';
  }> = [
    { key: 'note', ok: isSigned, blocking: !isAssistant, label: isSigned ? t('sumCheckNoteOk') : t('sumCheckNoteMissing'), fix: 'notes' },
    { key: 'dx', ok: dxCount > 0, blocking: false, label: dxCount > 0 ? t('sumCheckDxOk', { count: dxCount }) : t('sumCheckDxMissing'), fix: 'notes' },
    { key: 'services', ok: services.length > 0, blocking: false, label: services.length > 0 ? t('sumCheckServicesOk', { count: services.length }) : t('sumCheckServicesMissing'), fix: 'services' },
  ];
  const blockers = checks.filter((c) => c.blocking && !c.ok);
  const warnings = checks.filter((c) => !c.ok);
  const canCheckout = blockers.length === 0;
  const isCompleted = appointmentStatus === 'COMPLETED';

  const handleDone = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/doctor-done`, { method: 'POST' });
      const d = await res.json() as { doctorDoneAt?: string; error?: string };
      if (!res.ok) {
        setError(d.error === 'NOTE_NOT_SIGNED' ? t('sumErrNoteNotSigned') : t('sumErrDone'));
        return;
      }
      setDoneAt(d.doctorDoneAt ?? new Date().toISOString());
      router.refresh();
    } catch {
      setError(t('sumErrDone'));
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/doctor-done`, { method: 'DELETE' });
      if (!res.ok) { setError(t('sumErrReopen')); return; }
      setDoneAt(null);
      router.refresh();
    } catch {
      setError(t('sumErrReopen'));
    } finally {
      setSaving(false);
    }
  };

  /** Asistente: cierra la cita (COMPLETED). Nunca bloquea. */
  const handleCheckout = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/checkout`, { method: 'POST' });
      if (!res.ok) { setError(t('sumErrCheckout')); return; }
      onStatusChange?.();
      router.refresh();
    } catch {
      setError(t('sumErrCheckout'));
    } finally {
      setSaving(false);
    }
  };

  /** Asistente: deshace el cierre (se cerró por error). */
  const handleUndoCheckout = async (): Promise<void> => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/checkout`, { method: 'DELETE' });
      if (!res.ok) { setError(t('sumErrReopenAppt')); return; }
      onStatusChange?.();
      router.refresh();
    } catch {
      setError(t('sumErrReopenAppt'));
    } finally {
      setSaving(false);
    }
  };

  const vitalLine = triage
    ? [
        triage.systolicMmhg != null && triage.diastolicMmhg != null ? `${t('vitBP')} ${triage.systolicMmhg}/${triage.diastolicMmhg}` : null,
        triage.pulseBpm != null ? `${t('vitPulse')} ${triage.pulseBpm}` : null,
        triage.respiratoryRate != null ? `${t('vitResp')} ${triage.respiratoryRate}` : null,
        triage.tempFahrenheit != null ? `${t('vitTemp')} ${triage.tempFahrenheit}°F` : null,
        triage.painScale != null ? `${t('vitPain')} ${triage.painScale}/10` : null,
        triage.o2Saturation != null ? `${t('vitO2')} ${triage.o2Saturation}%` : null,
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <div className="space-y-4">

      {/* Asistente: qué hizo el doctor. Cierra el círculo — antes no tenía forma
          de saber si el doctor ya había terminado con el paciente. */}
      {isAssistant && (
        <div className={`rounded-md px-3 py-2 text-[12px] flex items-center gap-2 flex-wrap ${
          doneAt ? 'border border-emerald/25 bg-emerald/[0.06] text-emerald' : 'border border-violet/25 bg-violet/[0.06] text-violet'
        }`}>
          {doneAt ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Stethoscope className="w-3.5 h-3.5 shrink-0" />}
          {doneAt
            ? t('sumDoctorFinishedAt', { name: providerName ?? t('prDoctor'), time: fmtTime(doneAt) })
            : t('sumDoctorStillWorking', { name: providerName ?? t('prDoctor') })}
        </div>
      )}

      {/* Estado de salida */}
      {isAssistant ? (
        isCompleted ? (
          <div className="rounded-lg border border-emerald/30 bg-emerald/[0.07] p-4 flex items-start gap-3 flex-wrap">
            <CheckCircle2 className="w-5 h-5 text-emerald shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[200px]">
              <div className="text-emerald font-semibold text-sm">{t('sumApptClosedTitle')}</div>
              <div className="text-text-2 text-[12px] mt-0.5">{t('sumApptClosedHint')}</div>
            </div>
            <button
              type="button"
              onClick={() => void handleUndoCheckout()}
              disabled={saving}
              className="h-9 px-3 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              {t('sumUndoCheckout')}
            </button>
          </div>
        ) : (
          <div className={`rounded-lg border p-4 ${warnings.length === 0 ? 'border-emerald/30 bg-emerald/[0.06]' : 'border-amber/30 bg-amber/[0.07]'}`}>
            <div className="flex items-center gap-2 mb-3">
              {warnings.length === 0
                ? <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-amber shrink-0" />}
              <div className={`font-semibold text-[12px] uppercase tracking-wider ${warnings.length === 0 ? 'text-emerald' : 'text-amber'}`}>
                {warnings.length === 0 ? t('sumApptReadyTitle') : t('sumApptPendingTitle')}
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              {checks.map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                  {c.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
                    : <Clock3 className="w-3.5 h-3.5 text-amber shrink-0" />}
                  <span className={c.ok ? 'text-text-2' : 'text-amber'}>{c.label}</span>
                  {!c.ok && c.fix && (
                    <button
                      type="button"
                      onClick={() => onFix(c.fix!)}
                      className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-emerald hover:underline"
                    >
                      {t('sumComplete')} <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Button onClick={() => void handleCheckout()} disabled={saving} className="h-10 gap-1.5 w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              {t('sumApptCheckout')}
            </Button>
            <div className="text-[11px] text-text-muted mt-2">
              {warnings.length > 0 ? t('sumApptWarnHint') : t('sumApptCloseHint')}
            </div>
          </div>
        )
      ) : doneAt ? (
        <div className="rounded-lg border border-emerald/30 bg-emerald/[0.07] p-4 flex items-start gap-3 flex-wrap">
          <CheckCircle2 className="w-5 h-5 text-emerald shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-emerald font-semibold text-sm">{t('sumDoneTitle')}</div>
            <div className="text-text-2 text-[12px] mt-0.5">
              {t('sumDoneAt', { time: fmtTime(doneAt) })} · {t('sumDoneHandoff')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleReopen()}
            disabled={saving}
            className="h-9 px-3 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 transition-colors flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {t('sumReopen')}
          </button>
        </div>
      ) : (
        <div className={`rounded-lg border p-4 ${canCheckout ? 'border-violet/30 bg-violet/[0.06]' : 'border-amber/30 bg-amber/[0.07]'}`}>
          <div className="flex items-center gap-2 mb-3">
            {canCheckout
              ? <CheckCircle2 className="w-4 h-4 text-violet shrink-0" />
              : <AlertTriangle className="w-4 h-4 text-amber shrink-0" />}
            <div className={`font-semibold text-[12px] uppercase tracking-wider ${canCheckout ? 'text-violet' : 'text-amber'}`}>
              {canCheckout ? t('sumReadyTitle') : t('sumNotReadyTitle')}
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-1.5 mb-3">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                {c.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
                ) : c.blocking ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose shrink-0" />
                ) : (
                  <Clock3 className="w-3.5 h-3.5 text-amber shrink-0" />
                )}
                <span className={c.ok ? 'text-text-2' : c.blocking ? 'text-rose' : 'text-amber'}>{c.label}</span>
                {!c.ok && c.fix && (
                  <button
                    type="button"
                    onClick={() => onFix(c.fix!)}
                    className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-violet hover:underline"
                  >
                    {t('sumFix')} <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <Button onClick={() => void handleDone()} disabled={!canCheckout || saving} className="h-10 gap-1.5 w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {t('sumCheckout')}
          </Button>
          {!canCheckout && (
            <div className="text-[11px] text-text-muted mt-2">{t('sumBlockedHint')}</div>
          )}
          {warnings.length > 0 && canCheckout && (
            <div className="text-[11px] text-text-muted mt-2">{t('sumWarningsHint')}</div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Tiempos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-bg-1 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sumArrived')}</div>
          <div className="text-text-1 font-semibold text-sm mt-0.5">{fmtTime(checkedInAt)}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-1 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sumTimeInClinic')}</div>
          <div className="text-text-1 font-semibold text-sm mt-0.5">{timeInRoom ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-1 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('sumNoteState')}</div>
          <div className="mt-1">
            {isSigned
              ? <TagPill label={t('noteSigned')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
              : <TagPill label={t('noteDraft')} colorClass="bg-amber/15 text-amber border-amber/30" />}
          </div>
        </div>
      </div>

      {/* Triaje */}
      <Card icon={HeartPulse} title={t('tabTriage')}>
        {vitalLine
          ? <div className="text-[12.5px] text-text-2 tabular-nums">{vitalLine}</div>
          : <div className="text-[12px] text-text-muted">{t('triageEmptyTitle')}</div>}
        {triage?.chiefComplaint && (
          <div className="text-[12px] text-text-2 mt-2">
            <span className="text-text-muted">{t('chiefComplaint')}: </span>{triage.chiefComplaint}
          </div>
        )}
      </Card>

      {/* Diagnósticos */}
      <Card
        icon={Stethoscope}
        title={t('sec_DIAGNOSTICOS')}
        action={
          <button type="button" onClick={() => onFix('notes')} className="text-[11px] font-semibold text-violet hover:underline">
            {t('sumOpenNote')}
          </button>
        }
      >
        {dxCount === 0 ? (
          <div className="text-[12px] text-text-muted">{t('dxEmpty')}</div>
        ) : (
          <div className="space-y-1">
            {note?.diagnoses.map((d, i) => (
              <div key={`${d.icd10Code}-${i}`} className="flex items-start gap-2 text-[12.5px]">
                <span className="font-mono text-[11px] text-violet shrink-0 w-[70px]">{d.icd10Code ?? '—'}</span>
                <span className="text-text-2 flex-1 min-w-0">{d.icd10Label ?? d.snomedLabel ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Laboratorios */}
      <Card
        icon={FlaskConical}
        title={t('tabLabs')}
        action={
          <button type="button" onClick={() => onFix('labs')} className="text-[11px] font-semibold text-violet hover:underline">
            {t('sumOpenLabs')}
          </button>
        }
      >
        {loadingLabs ? (
          <div className="text-[12px] text-text-muted flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> {t('labLoading')}
          </div>
        ) : labs.length === 0 ? (
          <div className="text-[12px] text-text-muted">{t('labNoneThisVisit')}</div>
        ) : (
          <div className="space-y-1">
            {labs.filter((l) => l.status !== 'VOIDED').map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-[12.5px] flex-wrap">
                {l.studyCode && <span className="font-mono text-[11px] text-cyan shrink-0">{l.studyCode}</span>}
                <span className="text-text-2 flex-1 min-w-[120px]">{l.studyName}</span>
                {l.urgency !== 'ROUTINE' && (
                  <TagPill
                    label={t(`labUrgency_${l.urgency}`)}
                    colorClass={l.urgency === 'STAT' ? 'bg-rose/15 text-rose border-rose/30' : 'bg-amber/15 text-amber border-amber/30'}
                  />
                )}
                <span className="text-[11px] text-text-muted">{t(`labCollection_${l.collectionSite}`)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Servicios */}
      <Card
        icon={Briefcase}
        title={t('tabServices')}
        action={
          <button type="button" onClick={() => onFix('services')} className="text-[11px] font-semibold text-violet hover:underline">
            {t('sumOpenServices')}
          </button>
        }
      >
        {services.length === 0 ? (
          <div className="text-[12px] text-text-muted">{t('sumNoServices')}</div>
        ) : (
          <div className="space-y-1">
            {services.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="font-mono text-[11px] text-cyan shrink-0 w-[70px]">{s.code}</span>
                <span className="text-text-2 flex-1 min-w-0">{s.description}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Nota imprimible */}
      {isSigned && (
        <div className="flex justify-end">
          <a
            href={`/doctor-print/visit-note/${appointmentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 transition-colors inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> {t('sumPrintNote')}
          </a>
        </div>
      )}

      {/* Recordatorio de quién cierra la cita — solo al doctor */}
      {!isAssistant && (
        <div className="rounded-md border border-cyan/25 bg-cyan/[0.06] px-3 py-2 text-[11.5px] text-cyan flex items-start gap-1.5">
          <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {t('sumAssistantCloses')}
        </div>
      )}
    </div>
  );
}
