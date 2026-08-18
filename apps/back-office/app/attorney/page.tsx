import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FileSignature, Activity, CheckCircle2, Users, Briefcase, FileDown, ChevronRight } from 'lucide-react';
import { db } from '@precision-medical/database';
import {
  PageHeader, KpiCard, DataTable, TagPill, StatusPill, EmptyState,
} from '@/components/ui-phoenix';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter, lawyerMemberFilter, canSeeMenu } from '@/lib/attorney-portal';
import { fecha } from '@/lib/fechas';

/**
 * Portal Legal · Panel (B.22 — identidad brand, Regla #5)
 *
 * Server Component que consulta la base directamente con el filtro de sesión.
 * No pasa por una API con `firmId` en la URL a propósito: acá el alcance no
 * puede venir de nada que el cliente escriba.
 */

const ACTIVE_STATUSES = ['NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED', 'ACTIVE', 'MMI'] as const;
const CLOSED_STATUSES = ['CLOSED', 'SETTLED', 'ARCHIVED'] as const;

/** Estados del caso → tono del StatusPill. */
const STATUS_STATE: Record<string, 'active' | 'info' | 'warning' | 'success' | 'neutral'> = {
  NEW_REFERRAL: 'info', INTAKE_PENDING: 'info', INTAKE_COMPLETED: 'info',
  CONFIRMED: 'active', ACTIVE: 'active', MMI: 'warning',
  CLOSED: 'neutral', SETTLED: 'success', ARCHIVED: 'neutral', CANCELLED: 'neutral',
};

export default async function AttorneyPanelPage(): Promise<React.ReactElement> {
  const [lawyer, t] = await Promise.all([
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
  ]);
  // El layout ya cortó cuando no hay ficha; esto es solo para el narrowing.
  if (!lawyer) return <></>;

  const scope = lawyerCaseFilter(lawyer);

  const [pendingSignature, activeCases, closedCases, staffCount, recent] = await Promise.all([
    // "Firmas pendientes": sin firma de lien y sin exención. Los casos exentos
    // no cuentan — nunca van a firmarse y engordarían el número para siempre.
    db.case.count({ where: { ...scope, signatureExempt: false, lienSignatures: { none: {} } } }),
    db.case.count({ where: { ...scope, status: { in: ACTIVE_STATUSES as unknown as never[] } } }),
    db.case.count({ where: { ...scope, status: { in: CLOSED_STATUSES as unknown as never[] } } }),
    db.lawyer.count({ where: lawyerMemberFilter(lawyer) }),
    db.case.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, caseCode: true, status: true, createdAt: true,
        patient: { select: { firstName: true, lastName: true } },
        attorney:       { select: { firstName: true, lastName: true } },
        paralegal:      { select: { firstName: true, lastName: true } },
        legalAssistant: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const name = (p: { firstName: string | null; lastName: string | null } | null): string =>
    p ? (`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—') : '—';

  const showUsers = canSeeMenu(lawyer, 'users');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { firm: lawyer.firmName ?? '—' })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={t('kpiPendingSignature')} value={pendingSignature} color="text-amber"       icon={FileSignature} iconBg="bg-amber/10"   iconColor="text-amber"       sub={t('kpiPendingSignatureSub')} />
        <KpiCard label={t('kpiActive')}           value={activeCases}      color="text-brand-text"  icon={Activity}      iconBg="bg-brand/10"   iconColor="text-brand-text"  sub={t('kpiActiveSub')} />
        <KpiCard label={t('kpiClosed')}           value={closedCases}      color="text-emerald"     icon={CheckCircle2}  iconBg="bg-emerald/10" iconColor="text-emerald"     sub={t('kpiClosedSub')} />
        {showUsers && (
          <KpiCard label={t('kpiStaff')} value={staffCount} color="text-violet-text" icon={Users} iconBg="bg-violet/10" iconColor="text-violet-text" sub={t('kpiStaffSub')} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <QuickAction href="/attorney/cases"       icon={Briefcase} title={t('actionCases')}  subtitle={t('actionCasesSub')} />
        <QuickAction href="/api/attorney/report"  icon={FileDown}  title={t('actionReport')} subtitle={t('actionReportSub')} external />
        {showUsers && (
          <QuickAction href="/attorney/users" icon={Users} title={t('actionUsers')} subtitle={t('actionUsersSub')} />
        )}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('recentTitle')}</h2>
          <p className="text-text-2 text-xs mt-0.5">{t('recentSubtitle')}</p>
        </div>

        {recent.length === 0 ? (
          <EmptyState.Inline message={t('recentEmpty')} />
        ) : (
          <DataTable.Card>
            <DataTable.Scroll>
              <DataTable.Table>
                <DataTable.Head>
                  <DataTable.Th sticky="left">{t('colCase')}</DataTable.Th>
                  <DataTable.Th>{t('colPatient')}</DataTable.Th>
                  <DataTable.Th>{t('colAttorney')}</DataTable.Th>
                  <DataTable.Th>{t('colParalegal')}</DataTable.Th>
                  <DataTable.Th>{t('colAssistant')}</DataTable.Th>
                  <DataTable.Th>{t('colStatus')}</DataTable.Th>
                  <DataTable.Th>{t('colCreated')}</DataTable.Th>
                  <DataTable.Th align="right" sticky="right"><span className="sr-only">{t('colCase')}</span></DataTable.Th>
                </DataTable.Head>
                <tbody>
                  {recent.map((c) => (
                    <DataTable.Row key={c.id}>
                      <DataTable.Td sticky="left">
                        <TagPill label={c.caseCode} mono compact colorClass="bg-brand/10 text-brand-text border-brand/20" />
                      </DataTable.Td>
                      <DataTable.Td>
                        {c.patient.lastName.toUpperCase()}, {c.patient.firstName}
                      </DataTable.Td>
                      <DataTable.Td>{name(c.attorney)}</DataTable.Td>
                      <DataTable.Td>{name(c.paralegal)}</DataTable.Td>
                      <DataTable.Td>{name(c.legalAssistant)}</DataTable.Td>
                      <DataTable.Td>
                        <StatusPill state={STATUS_STATE[c.status] ?? 'neutral'} label={c.status.replace(/_/g, ' ')} />
                      </DataTable.Td>
                      <DataTable.Td>
                        <span className="whitespace-nowrap">{fecha(c.createdAt)}</span>
                      </DataTable.Td>
                      <DataTable.Td align="right" sticky="right">
                        <Link href={`/attorney/cases/${c.id}`} className="text-text-muted hover:text-brand-text inline-flex">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </DataTable.Td>
                    </DataTable.Row>
                  ))}
                </tbody>
              </DataTable.Table>
            </DataTable.Scroll>
          </DataTable.Card>
        )}
      </section>
    </div>
  );
}

/**
 * Acceso rápido del panel. Átomo local: es el único lugar del portal que lo usa,
 * y no hay un primitivo equivalente en `ui-phoenix` (`InfoCard` es de lectura,
 * no navegable). Si aparece una segunda pantalla que lo necesite, sube al paquete.
 */
function QuickAction({
  href, icon: Icon, title, subtitle, external,
}: {
  href: string; icon: React.ElementType; title: string; subtitle: string; external?: boolean;
}): React.ReactElement {
  return (
    <Link
      href={href}
      {...(external ? { prefetch: false, target: '_blank', rel: 'noopener' } : {})}
      className="rounded-lg bg-bg-1 p-5 hover:bg-brand/[0.04] transition-colors block"
    >
      <Icon className="w-4 h-4 text-brand mb-2" />
      <div className="text-text-1 font-semibold text-sm">{title}</div>
      <div className="text-text-2 text-xs mt-0.5">{subtitle}</div>
    </Link>
  );
}
