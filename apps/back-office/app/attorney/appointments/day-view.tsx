'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState, StatusPill, TagPill } from '@/components/ui-phoenix';
import { ZONA_CLINICA, localeApp } from '@/lib/fechas';

/**
 * Portal Legal · agenda del día — la forma de v2: proveedores en filas, horas en
 * columnas, con flechas y "Hoy".
 *
 * Dos diferencias con v2, deliberadas:
 *  · Solo aparecen las citas de los pacientes DEL BUFETE. v2 muestra la jornada
 *    completa de todos los médicos, con pacientes de todos los despachos.
 *  · Solo se listan los proveedores que ESE DÍA atienden a alguien suyo. Pintar
 *    nueve filas vacías no informa nada y hace parecer que falta algo.
 *
 * El día viaja en la URL (`?date=`), así que un refresh o un link compartido
 * reproducen la misma jornada.
 */

export interface DayAppointment {
  id: string;
  scheduledFor: string;
  status: string;
  patientName: string;
  providerId: string;
  providerName: string;
  clinicId: string | null;
  clinicName: string | null;
  caseCode: string | null;
}

export interface ClinicOption { id: string; name: string }

const APPT_STATE: Record<string, 'active' | 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  SCHEDULED: 'info', CONFIRMED: 'active', CHECKED_IN: 'active',
  IN_PROGRESS: 'active', COMPLETED: 'success',
  NO_SHOW: 'warning', CANCELLED: 'danger',
};

/** Franja visible, igual que v2: de 8 a 19. */
const FIRST_HOUR = 8;
const LAST_HOUR = 19;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

/** `YYYY-MM-DD` en la zona de la clínica — no en la del navegador del abogado. */
function isoDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function shiftDay(iso: string, days: number): string {
  // Mediodía y no medianoche: sumar 24 h sobre las 00:00 cae en el día anterior
  // cuando hay cambio de horario de verano.
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AppointmentsDayView({
  date, appointments, clinics, clinicId,
}: {
  date: string;
  appointments: DayAppointment[];
  clinics: ClinicOption[];
  clinicId: string;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: { date?: string; clinic?: string }): void {
    const q = new URLSearchParams(params.toString());
    if (next.date !== undefined) q.set('date', next.date);
    if (next.clinic !== undefined) {
      if (next.clinic) q.set('clinic', next.clinic);
      else q.delete('clinic');
    }
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  }

  const title = new Date(`${date}T12:00:00Z`).toLocaleDateString(localeApp(), {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

  // Una fila por proveedor que atiende a alguien del bufete ESE día.
  const byProvider = new Map<string, { name: string; items: DayAppointment[] }>();
  for (const a of appointments) {
    const row = byProvider.get(a.providerId) ?? { name: a.providerName, items: [] };
    row.items.push(a);
    byProvider.set(a.providerId, row);
  }
  const rows = [...byProvider.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  /** Hora de la cita en la zona de la clínica, para ubicarla en la columna. */
  const hourOf = (iso: string): number =>
    Number(new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit',
    }).format(new Date(iso))) % 24;

  const timeOf = (iso: string): string =>
    new Date(iso).toLocaleTimeString(localeApp(), {
      hour: 'numeric', minute: '2-digit', timeZone: ZONA_CLINICA,
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => go({ date: shiftDay(date, -1) })} aria-label={t('apptPrevDay')}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => go({ date: shiftDay(date, 1) })} aria-label={t('apptNextDay')}>
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => go({ date: isoDay(new Date()) })}>
          <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
          {t('apptToday')}
        </Button>

        <span className="text-text-1 font-semibold text-sm mx-2">{title}</span>

        <div className="flex-1" />

        <select
          value={clinicId}
          onChange={(e) => go({ clinic: e.target.value })}
          className="rounded-md border border-border bg-bg-1 px-3 py-1.5 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-brand/40"
        >
          <option value="">{t('apptAllClinics')}</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState.Inline message={t('apptNoneThisDay')} />
      ) : (
        <div className="rounded-lg border border-border bg-bg-1 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-bg-1 z-10 text-left px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                  {t('colProviders')}
                </th>
                {HOURS.map((h) => (
                  <th key={h} className="px-1 py-2 text-[10px] font-semibold text-text-muted text-center whitespace-nowrap">
                    {String(h).padStart(2, '0')}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([providerId, row]) => (
                <tr key={providerId} className="border-b border-row-sep last:border-0">
                  <td className="sticky left-0 bg-bg-1 z-10 px-4 py-2 align-top">
                    <span className="text-text-1 text-[12.5px] whitespace-nowrap">{row.name}</span>
                  </td>
                  {HOURS.map((h) => {
                    const enEsaHora = row.items.filter((a) => hourOf(a.scheduledFor) === h);
                    return (
                      <td key={h} className="px-1 py-1 align-top border-l border-row-sep">
                        {enEsaHora.map((a) => (
                          <div key={a.id} className="rounded-md bg-brand/10 px-1.5 py-1 mb-1 last:mb-0 min-w-[110px]">
                            <div className="text-text-1 text-[11px] font-semibold truncate">{a.patientName}</div>
                            <div className="text-text-2 text-[10px]">{timeOf(a.scheduledFor)}</div>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <StatusPill state={APPT_STATE[a.status] ?? 'neutral'} label={a.status.replace(/_/g, ' ')} />
                              {a.caseCode && (
                                <TagPill label={a.caseCode} mono compact colorClass="bg-white/5 text-text-muted border-border" />
                              )}
                            </div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
