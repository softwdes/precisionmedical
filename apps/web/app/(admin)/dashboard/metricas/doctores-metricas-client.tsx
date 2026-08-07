'use client';

/**
 * Métricas → tab Doctores — productividad clínica por doctor (solo admin).
 *
 * Por doctor: tiempo de uso del sistema, consultas realizadas (cerradas por el
 * doctor con "Terminé" o por el asistente con checkout), duración promedio de
 * la consulta (entró a consulta → cierre), recetas, labs, férulas y servicios.
 *
 * Drill-down de dos niveles: click en el doctor → lista de consultas del
 * período con paciente y duración; click en una consulta → el detalle completo
 * (espejo del Resumen de My Day: tiempos, triaje, diagnósticos, nota, labs,
 * recetas, férulas, servicios y pagos).
 *
 * Data: api.metrics.doctorActivity / doctorConsultations / consultationDetail
 * (fns SQL en la DB del back-office, prisma/sql/20260807-doctor-metrics.sql).
 * Identidad violet = módulo Doctor (B.17–B.18).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@precision/ui';
import {
  Activity, ArrowLeft, Clock, FlaskConical, Loader2, Pill,
  Stethoscope, Timer, X, FileText, DollarSign,
} from 'lucide-react';
import { api } from '@/lib/trpc/client';
import {
  KpiCard, Num, PeriodFilter, denverDay, elapsedSeconds, fmtClinicDate,
  fmtClinicTime, fmtMinutes, fmtSeconds, presetRange, type Preset,
} from './metricas-shared';

interface DoctorRow {
  providerId: string;
  name: string;
  specialty: string | null;
  activeMinutes: number;
  consultations: number;
  measuredConsultations: number;
  avgConsultSeconds: number;
  uniquePatients: number;
  rx: number;
  labs: number;
  braces: number;
  services: number;
}

const NOTE_LABEL: Record<string, { label: string; color: string }> = {
  SIGNED: { label: 'Firmada',  color: 'text-emerald bg-emerald/10 border-emerald/20' },
  DRAFT:  { label: 'Borrador', color: 'text-amber bg-amber/10 border-amber/20' },
  VOIDED: { label: 'Anulada',  color: 'text-rose bg-rose/10 border-rose/20' },
};

const money = (v: string | number): string => `$${Number(v).toFixed(2)}`;

export function DoctoresMetricasClient() {
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(() => denverDay());
  const [to, setTo] = useState(() => denverDay());
  const [doctor, setDoctor] = useState<DoctorRow | null>(null);
  const [apptId, setApptId] = useState<string | null>(null);

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    const r = presetRange(p);
    if (r) { setFrom(r.from); setTo(r.to); }
  }, []);

  const validRange = !!from && !!to && from <= to;
  const query = api.metrics.doctorActivity.useQuery({ from, to }, { enabled: validRange, staleTime: 30_000 });
  const rows = (query.data?.doctors ?? null) as DoctorRow[] | null;

  const consultationsQ = api.metrics.doctorConsultations.useQuery(
    { providerId: doctor?.providerId ?? '', from, to },
    { enabled: !!doctor, staleTime: 30_000 },
  );
  const detailQ = api.metrics.consultationDetail.useQuery(
    { appointmentId: apptId ?? '' },
    { enabled: !!apptId, staleTime: 60_000 },
  );

  // Escape: cierra el nivel activo (detalle primero, luego la lista)
  useEffect(() => {
    if (!doctor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (apptId) setApptId(null);
      else setDoctor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doctor, apptId]);

  const totals = useMemo(() => {
    const base = { activeMinutes: 0, consultations: 0, rx: 0, labs: 0, braces: 0, services: 0, dur: 0, durN: 0 };
    for (const r of rows ?? []) {
      base.activeMinutes += r.activeMinutes;
      base.consultations += r.consultations;
      base.rx += r.rx; base.labs += r.labs; base.braces += r.braces; base.services += r.services;
      if (r.measuredConsultations > 0) { base.dur += r.avgConsultSeconds * r.measuredConsultations; base.durN += r.measuredConsultations; }
    }
    return { ...base, avgSeconds: base.durN > 0 ? Math.round(base.dur / base.durN) : 0 };
  }, [rows]);

  const closeAll = () => { setApptId(null); setDoctor(null); };
  const detail = detailQ.data;

  return (
    <div className="p-6 space-y-6">

      {/* KPIs del período */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Clock}        label="Uso del sistema" value={fmtMinutes(totals.activeMinutes)} color="bg-emerald/10 text-emerald" />
        <KpiCard icon={Stethoscope}  label="Consultas"       value={totals.consultations}             color="bg-violet/10 text-violet" />
        <KpiCard icon={Timer}        label="Duración prom."  value={fmtSeconds(totals.avgSeconds)}    color="bg-violet/10 text-violet" />
        <KpiCard icon={Pill}         label="Recetas"         value={totals.rx}                        color="bg-brand/10 text-brand" />
        <KpiCard icon={FlaskConical} label="Labs"            value={totals.labs}                      color="bg-cyan/10 text-cyan" />
        <KpiCard icon={DollarSign}   label="Férulas + serv." value={totals.braces + totals.services}  color="bg-amber/10 text-amber" />
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-3">
        <PeriodFilter preset={preset} from={from} to={to} onPreset={applyPreset} onFrom={setFrom} onTo={setTo} />
        <div className="ml-auto">
          {query.isFetching && <Loader2 className="w-4 h-4 text-text-3 animate-spin" />}
        </div>
      </div>

      {/* Tabla por doctor */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {query.isLoading ? (
          <div className="p-12 text-center"><Loader2 className="w-6 h-6 text-text-3 mx-auto animate-spin" /></div>
        ) : query.error ? (
          <div className="p-12 text-center">
            <Activity className="w-8 h-8 text-text-3 mx-auto mb-3" />
            <p className="text-sm text-text-3">No se pudieron cargar las métricas. Cambia el período o recarga la página.</p>
          </div>
        ) : (rows ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <Stethoscope className="w-8 h-8 text-text-3 mx-auto mb-3" />
            <p className="text-sm text-text-3">No hay doctores activos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-3 sticky left-0 bg-surface-2 z-10">Doctor</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Uso sistema</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Consultas</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Duración prom.</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Pacientes</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Recetas</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Labs</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Férulas</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-3">Servicios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(rows ?? []).map((r) => (
                  <tr
                    key={r.providerId}
                    onClick={() => setDoctor(r)}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 sticky left-0 bg-surface z-10">
                      <div className="min-w-[170px]">
                        <div className="font-medium text-text-1 text-[12.5px]">Dr. {r.name}</div>
                        {r.specialty && <div className="text-[10px] text-text-3 uppercase tracking-wider">{r.specialty}</div>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={cn('font-mono tabular-nums text-[12px]', r.activeMinutes > 0 ? 'text-emerald' : 'text-text-3/40')}>
                        {fmtMinutes(r.activeMinutes)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={cn('font-mono tabular-nums text-[12px] font-semibold', r.consultations > 0 ? 'text-violet' : 'text-text-3/40')}>
                        {r.consultations}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={cn('font-mono tabular-nums text-[12px]', r.measuredConsultations > 0 ? 'text-text-1' : 'text-text-3/40')}>
                        {r.measuredConsultations > 0 ? fmtSeconds(r.avgConsultSeconds) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[12px]"><Num value={r.uniquePatients} /></td>
                    <td className="px-3 py-3 text-right text-[12px]"><Num value={r.rx} /></td>
                    <td className="px-3 py-3 text-right text-[12px]"><Num value={r.labs} /></td>
                    <td className="px-3 py-3 text-right text-[12px]"><Num value={r.braces} /></td>
                    <td className="px-3 py-3 text-right text-[12px]"><Num value={r.services} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(rows ?? []).length > 0 && (
        <p className="text-[11px] text-text-3 text-right">{rows?.length} doctores · {from} → {to}</p>
      )}

      {/* ─── Modal: nivel 1 (consultas) y nivel 2 (detalle) ─── */}
      {doctor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeAll}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header con back cuando estamos en el detalle */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {apptId && (
                  <button
                    onClick={() => setApptId(null)}
                    className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-white/[0.05] transition-colors"
                    aria-label="Volver a la lista"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-text-1 truncate">
                    {apptId && detail?.appointment
                      ? `${detail.appointment.patientName}`
                      : `Dr. ${doctor.name}`}
                  </h3>
                  <p className="text-xs text-text-3 mt-0.5">
                    {apptId && detail?.appointment
                      ? `${detail.appointment.patientCode ?? ''} · ${detail.appointment.caseCode ?? 'sin caso'} · ${fmtClinicDate(detail.appointment.scheduledFor)}`
                      : `Consultas realizadas · ${from} → ${to}`}
                  </p>
                </div>
              </div>
              <button
                onClick={closeAll}
                className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-white/[0.05] transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Nivel 1: lista de consultas ── */}
            {!apptId && (
              consultationsQ.isLoading ? (
                <div className="p-10 text-center"><Loader2 className="w-5 h-5 text-text-3 mx-auto animate-spin" /></div>
              ) : (consultationsQ.data?.consultations ?? []).length === 0 ? (
                <p className="text-sm text-text-3 text-center py-8">
                  Sin consultas cerradas en el período. Una consulta cuenta cuando el doctor marca
                  &quot;Terminé&quot; o el asistente hace el checkout.
                </p>
              ) : (
                <div className="space-y-1">
                  {(consultationsQ.data?.consultations ?? []).map((c) => {
                    const dur = elapsedSeconds(c.admittedAt, c.endedAt);
                    const note = c.noteStatus ? NOTE_LABEL[c.noteStatus] : null;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setApptId(c.id)}
                        className="w-full flex items-center justify-between gap-3 rounded-lg bg-surface-2 border border-border px-3 py-2.5 hover:border-violet/40 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-text-1 text-[12.5px] truncate">{c.patientName}</div>
                          <div className="text-[10px] text-text-3 font-mono">
                            {fmtClinicDate(c.endedAt)} · {fmtClinicTime(c.admittedAt)} → {fmtClinicTime(c.endedAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {note && (
                            <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded border', note.color)}>
                              {note.label}
                            </span>
                          )}
                          {(c.rxCount > 0 || c.labCount > 0 || c.braceCount > 0 || c.serviceCount > 0) && (
                            <span className="text-[10px] text-text-3 font-mono hidden sm:inline">
                              {c.rxCount > 0 && `${c.rxCount}rx `}{c.labCount > 0 && `${c.labCount}lab `}
                              {c.braceCount > 0 && `${c.braceCount}fér `}{c.serviceCount > 0 && `${c.serviceCount}serv`}
                            </span>
                          )}
                          <span className={cn('font-mono tabular-nums text-[12px] font-semibold', dur ? 'text-violet' : 'text-text-3/40')}>
                            {dur ? fmtSeconds(dur) : '—'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Nivel 2: detalle de la consulta ── */}
            {apptId && (
              detailQ.isLoading || !detail ? (
                <div className="p-10 text-center"><Loader2 className="w-5 h-5 text-text-3 mx-auto animate-spin" /></div>
              ) : (
                <div className="space-y-4">
                  {/* Tiempos */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { label: 'Llegó',       v: fmtClinicTime(detail.appointment?.checkedInAt ?? null) },
                      { label: 'A consulta',  v: fmtClinicTime(detail.appointment?.admittedAt ?? null) },
                      { label: 'Dr. terminó', v: fmtClinicTime(detail.appointment?.doctorDoneAt ?? null) },
                      { label: 'Salida',      v: fmtClinicTime(detail.appointment?.checkedOutAt ?? null) },
                      {
                        label: 'Duración',
                        v: (() => {
                          const s = elapsedSeconds(
                            detail.appointment?.admittedAt ?? null,
                            detail.appointment?.doctorDoneAt ?? detail.appointment?.checkedOutAt ?? null,
                          );
                          return s ? fmtSeconds(s) : '—';
                        })(),
                        hl: true,
                      },
                    ].map((t) => (
                      <div key={t.label} className="rounded-lg bg-surface-2 border border-border p-2.5">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-text-3">{t.label}</div>
                        <div className={cn('text-sm font-bold mt-0.5 tabular-nums', t.hl ? 'text-violet' : 'text-text-1')}>{t.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Triaje */}
                  {detail.triage && (
                    <Section title="Triaje">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-2">
                        {detail.triage.systolicMmhg != null && <span>PA {detail.triage.systolicMmhg}/{detail.triage.diastolicMmhg}</span>}
                        {detail.triage.pulseBpm != null && <span>Pulso {detail.triage.pulseBpm}</span>}
                        {detail.triage.tempFahrenheit != null && <span>Temp {detail.triage.tempFahrenheit}°F</span>}
                        {detail.triage.o2Saturation != null && <span>O₂ {detail.triage.o2Saturation}%</span>}
                        {detail.triage.painScale != null && <span>Dolor {detail.triage.painScale}/10</span>}
                        {detail.triage.weightLbs != null && <span>{detail.triage.weightLbs} lbs</span>}
                        {detail.triage.heightFt != null && <span>{detail.triage.heightFt}&apos;{detail.triage.heightIn ?? 0}&quot;</span>}
                      </div>
                      {detail.triage.chiefComplaint && (
                        <p className="text-[11px] text-text-3 italic mt-1.5">&quot;{detail.triage.chiefComplaint}&quot;</p>
                      )}
                    </Section>
                  )}

                  {/* Nota + diagnósticos */}
                  {detail.note && (
                    <Section title="Nota clínica" trailing={
                      <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded border', (NOTE_LABEL[detail.note.status] ?? NOTE_LABEL.DRAFT)?.color)}>
                        {(NOTE_LABEL[detail.note.status] ?? NOTE_LABEL.DRAFT)?.label}
                        {detail.note.signedByName ? ` · ${detail.note.signedByName}` : ''}
                      </span>
                    }>
                      {detail.note.diagnoses.length > 0 && (
                        <div className="space-y-0.5">
                          {detail.note.diagnoses.map((d, i) => (
                            <div key={i} className="text-[12px] text-text-2">
                              <span className="font-mono text-brand">{d.icd10Code}</span> {d.icd10Label}
                            </div>
                          ))}
                        </div>
                      )}
                      {detail.note.serviceCodes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {detail.note.serviceCodes.map((sc, i) => (
                            <span key={i} className="font-mono text-[10px] text-text-2 bg-surface border border-border rounded px-1.5 py-0.5">
                              CPT {sc.cptCode}{sc.units > 1 ? ` ×${sc.units}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </Section>
                  )}

                  {/* Labs */}
                  {detail.labs.length > 0 && (
                    <Section title={`Laboratorios (${detail.labs.length})`}>
                      {detail.labs.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-[12px] text-text-2 py-0.5">
                          <span className="truncate">{l.studyName}</span>
                          <span className="font-mono text-[10px] text-text-3 shrink-0">{l.status}</span>
                        </div>
                      ))}
                    </Section>
                  )}

                  {/* Recetas */}
                  {detail.rx.length > 0 && (
                    <Section title={`Recetas (${detail.rx.length})`}>
                      {detail.rx.map((r, i) => (
                        <div key={i} className="text-[12px] text-text-2 py-0.5">
                          <span className="text-text-1">{r.drugName}</span>
                          {r.dose && <span className="text-text-3"> · {r.dose}</span>}
                          {r.frequency && <span className="text-text-3"> · {r.frequency}</span>}
                        </div>
                      ))}
                    </Section>
                  )}

                  {/* Férulas + servicios */}
                  {(detail.braces.length > 0 || detail.services.length > 0) && (
                    <Section title="Férulas y servicios">
                      {detail.braces.map((b, i) => (
                        <div key={`b${i}`} className="flex items-center justify-between text-[12px] text-text-2 py-0.5">
                          <span className="truncate">{b.name}{b.side ? ` (${b.side})` : ''}{b.quantity > 1 ? ` ×${b.quantity}` : ''}</span>
                          <span className="font-mono shrink-0">{money(Number(b.unitPrice) * b.quantity)}</span>
                        </div>
                      ))}
                      {detail.services.map((s, i) => (
                        <div key={`s${i}`} className="flex items-center justify-between text-[12px] text-text-2 py-0.5">
                          <span className="truncate">{s.name}{s.quantity > 1 ? ` ×${s.quantity}` : ''}</span>
                          <span className="font-mono shrink-0">{money(Number(s.unitPrice) * s.quantity)}</span>
                        </div>
                      ))}
                    </Section>
                  )}

                  {/* Billing */}
                  {detail.billing && Number(detail.billing.totalCost) > 0 && (
                    <Section title="Cobros de la visita">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-3">Total</div>
                          <div className="text-sm font-bold text-text-1 font-mono">{money(detail.billing.totalCost)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-3">Pagado</div>
                          <div className="text-sm font-bold text-emerald font-mono">{money(detail.billing.amountPaid)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-3">Saldo</div>
                          <div className={cn('text-sm font-bold font-mono', Number(detail.billing.balanceDue) > 0 ? 'text-amber' : 'text-text-1')}>
                            {money(detail.billing.balanceDue)}
                          </div>
                        </div>
                      </div>
                    </Section>
                  )}

                  {/* Vacío total */}
                  {!detail.triage && !detail.note && detail.labs.length === 0 && detail.rx.length === 0 &&
                    detail.braces.length === 0 && detail.services.length === 0 && (
                    <p className="text-sm text-text-3 text-center py-4 flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4" /> La consulta no registró documentación clínica.
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, trailing, children }: {
  title: string; trailing?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-surface-2 border border-border p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-3">{title}</div>
        {trailing}
      </div>
      {children}
    </div>
  );
}
