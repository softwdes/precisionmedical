import { getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { Sun, CalendarCheck2, CheckCircle2, Clock3 } from 'lucide-react';
import { PageHeader, KpiCard, EmptyState } from '@/components/ui-phoenix';
import { getSessionProvider } from '@/lib/get-session-provider';

/**
 * Portal Médico · Mi Día (B.17 — placeholder D0)
 *
 * KPIs reales del día del doctor (scoped por providerId de sesión).
 * El dashboard completo (hero "Siguiente paciente" + cola + acciones) llega en D1.
 */

/** Rango [inicio, fin) del día actual en America/Denver, DST-aware. */
function denverDayRange(): { start: Date; end: Date } {
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
  const start = new Date(`${day}T00:00:00${hours <= 0 ? '-' : '+'}${hh}:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export default async function DoctorMyDayPage(): Promise<React.ReactElement> {
  const t = await getTranslations('phoenix.doctor');
  const provider = await getSessionProvider();
  if (!provider) return <></>; // el layout ya renderiza el estado sin perfil

  const { start, end } = denverDayRange();
  const [total, completed] = await Promise.all([
    db.appointment.count({
      where: { providerId: provider.id, scheduledFor: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
    }),
    db.appointment.count({
      where: { providerId: provider.id, scheduledFor: { gte: start, lt: end }, status: 'COMPLETED' },
    }),
  ]);
  const pending = total - completed;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('greeting', { name: `${provider.firstName} ${provider.lastName}` })}
        subtitle={t('myDaySubtitle', { count: total })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label={t('kpiToday')} value={total} color="text-violet" icon={CalendarCheck2} iconBg="bg-violet/10" iconColor="text-violet" />
        <KpiCard label={t('kpiCompleted')} value={completed} color="text-emerald" icon={CheckCircle2} iconBg="bg-emerald/10" iconColor="text-emerald" />
        <KpiCard label={t('kpiPending')} value={pending} color="text-amber" icon={Clock3} iconBg="bg-amber/10" iconColor="text-amber" />
      </div>

      <EmptyState.Rich icon={Sun} title={t('comingSoonTitle')} subtitle={t('comingSoonSubtitle')} />
    </div>
  );
}
