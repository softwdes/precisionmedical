/**
 * Métricas por doctor (Provider) — fuente única de verdad.
 *
 * Consumida por:
 *   - /doctor/stats            (el doctor ve SUS números)
 *   - /api/metrics/providers   (Métricas del Admin — mismos números, todos los doctores)
 *
 * Rangos rodantes terminando hoy (Denver): week=7d · month=30d · year=365d.
 */

import { db } from '@precision-medical/database';

export type MetricsRange = 'week' | 'month' | 'year';

export interface MetricsBucket {
  label: string;   // "Lun 21" · "Sem 12/05" · "Ene"
  completed: number;
  total: number;
}

export interface ProviderMetrics {
  range: MetricsRange;
  from: string;
  to: string;
  totalAppointments: number;   // no cancelados
  completed: number;
  noShows: number;
  cancelled: number;
  uniquePatients: number;
  avgDurationMin: number;      // duración programada promedio de las atendidas
  notesSigned: number;
  notesDraft: number;
  notesSignedWithin24hPct: number | null; // null si no hay notas firmadas
  labsOrdered: number;
  rxIssued: number;
  buckets: MetricsBucket[];
}

const RANGE_DAYS: Record<MetricsRange, number> = { week: 7, month: 30, year: 365 };

/** Inicio del día actual en America/Denver (DST-aware). */
function denverToday(): Date {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'shortOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const m = /GMT([+-]\d+)/.exec(offsetPart);
  const hours = m?.[1] ? parseInt(m[1], 10) : -6;
  const hh = String(Math.abs(hours)).padStart(2, '0');
  return new Date(`${day}T00:00:00${hours <= 0 ? '-' : '+'}${hh}:00`);
}

const denverDayKey = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export async function getProviderMetrics(providerId: string, range: MetricsRange, locale = 'es'): Promise<ProviderMetrics> {
  const todayStart = denverToday();
  const to = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000); // fin de hoy
  const from = new Date(todayStart.getTime() - (RANGE_DAYS[range] - 1) * 24 * 60 * 60 * 1000);

  const [appts, notes, labsOrdered, rxIssued] = await Promise.all([
    db.appointment.findMany({
      where: { providerId, scheduledFor: { gte: from, lt: to } },
      select: { scheduledFor: true, status: true, durationMinutes: true, patientId: true },
    }),
    db.visitNote.findMany({
      where: { appointment: { providerId, scheduledFor: { gte: from, lt: to } } },
      select: { status: true, signedAt: true, appointment: { select: { scheduledFor: true } } },
    }),
    db.labOrder.count({
      where: { appointment: { providerId, scheduledFor: { gte: from, lt: to } } },
    }),
    db.prescription.count({
      where: { appointment: { providerId, scheduledFor: { gte: from, lt: to } } },
    }),
  ]);

  const nonCancelled = appts.filter((a) => a.status !== 'CANCELLED');
  const completedList = appts.filter((a) => a.status === 'COMPLETED');
  const noShows = appts.filter((a) => a.status === 'NO_SHOW').length;
  const cancelled = appts.length - nonCancelled.length;
  const uniquePatients = new Set(nonCancelled.map((a) => a.patientId)).size;
  const avgDurationMin = completedList.length
    ? Math.round(completedList.reduce((s, a) => s + a.durationMinutes, 0) / completedList.length)
    : 0;

  const signed = notes.filter((n) => n.status === 'SIGNED');
  const notesDraft = notes.filter((n) => n.status === 'DRAFT').length;
  const signedWithin24h = signed.filter((n) =>
    n.signedAt && n.signedAt.getTime() - n.appointment.scheduledFor.getTime() <= 24 * 60 * 60 * 1000,
  ).length;

  // ── Buckets para el chart ──────────────────────────────────────────────────
  const buckets: MetricsBucket[] = [];
  const bucketIndex = new Map<string, number>();

  if (range === 'year') {
    // 12 meses móviles
    for (let i = 11; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setMonth(d.getMonth() - i);
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit' }).format(d);
      bucketIndex.set(key, buckets.length);
      buckets.push({
        label: new Intl.DateTimeFormat(locale, { timeZone: 'America/Denver', month: 'short' }).format(d),
        completed: 0, total: 0,
      });
    }
  } else {
    const days = RANGE_DAYS[range];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      bucketIndex.set(denverDayKey(d), buckets.length);
      buckets.push({
        label: range === 'week'
          ? new Intl.DateTimeFormat(locale, { timeZone: 'America/Denver', weekday: 'short', day: 'numeric' }).format(d)
          : new Intl.DateTimeFormat(locale, { timeZone: 'America/Denver', day: 'numeric', month: 'numeric' }).format(d),
        completed: 0, total: 0,
      });
    }
  }

  for (const a of nonCancelled) {
    const key = range === 'year'
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit' }).format(a.scheduledFor)
      : denverDayKey(a.scheduledFor);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    buckets[idx]!.total += 1;
    if (a.status === 'COMPLETED') buckets[idx]!.completed += 1;
  }

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    totalAppointments: nonCancelled.length,
    completed: completedList.length,
    noShows,
    cancelled,
    uniquePatients,
    avgDurationMin,
    notesSigned: signed.length,
    notesDraft,
    notesSignedWithin24hPct: signed.length ? Math.round((signedWithin24h / signed.length) * 100) : null,
    labsOrdered,
    rxIssued,
    buckets,
  };
}
