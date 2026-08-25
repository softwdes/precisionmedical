import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FileSignature, Activity, CheckCircle2, Users, UserPlus, Briefcase, FileDown } from 'lucide-react';
import { db } from '@precision-medical/database';
import {
  PageHeader, KpiCard, DataTable, TagPill, StatusPill, EmptyState,
} from '@/components/ui-phoenix';
import { CaseUrlModal } from '@/components/cases/case-url-modal';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import {
  lawyerCaseFilter, lawyerMemberFilter, canSeeMenu, canSignLien,
  ACTIVE_STATUSES, CLOSED_STATUSES,
} from '@/lib/attorney-portal';
import { CaseRowIcons } from './cases/case-actions';
import { fecha } from '@/lib/fechas';

/**
 * Portal Legal · Panel (B.22 — identidad brand, Regla #5)
 *
 * Server Component que consulta la base directamente con el filtro de sesión.
 * No pasa por una API con `firmId` en la URL a propósito: acá el alcance no
 * puede venir de nada que el cliente escriba.
 */

/**
 * Columnas de la fila de accesos rápidos, por cantidad.
 *
 * El mapa existe porque Tailwind necesita la clase COMPLETA en el código para
 * generarla: `lg:grid-cols-${n}` se compila a nada y la grilla cae a una sola
 * columna sin ningún error.
 */
const QUICK_GRID: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
};

/** Estados del caso → tono del StatusPill. */
const STATUS_STATE: Record<string, 'active' | 'info' | 'warning' | 'success' | 'neutral'> = {
  NEW_REFERRAL: 'info', INTAKE_PENDING: 'info', INTAKE_COMPLETED: 'info',
  CONFIRMED: 'active', ACTIVE: 'active', MMI: 'warning',
  CLOSED: 'neutral', SETTLED: 'success', ARCHIVED: 'neutral', CANCELLED: 'neutral',
};

export default async function AttorneyPanelPage({ searchParams }: {
  searchParams: Promise<{ case?: string; tab?: string }>;
}): Promise<React.ReactElement> {
  const [{ case: caseId, tab }, lawyer, t] = await Promise.all([
    searchParams,
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
  ]);
  // El layout ya cortó cuando no hay ficha; esto es solo para el narrowing.
  if (!lawyer) return <></>;

  const scope = lawyerCaseFilter(lawyer);

  const [pendingSignature, activeCases, closedCases, staffCount, recent] = await Promise.all([
    // "Firmas pendientes" = falta la firma del ABOGADO. Ojo con el matiz: antes
    // preguntaba `lienSignatures: { none: {} }` ("sin ninguna firma"), y eso NO
    // es lo mismo — dejaba fuera los casos donde el paciente ya firmó y el
    // abogado no, que son exactamente los que el portal existe para destrabar.
    // En Garcia Law eran 11 casos invisibles: mostraba 74 en vez de 87.
    // Los exentos no cuentan: nunca van a firmarse y engordarían el número.
    db.case.count({
      where: { ...scope, signatureExempt: false, lienSignatures: { none: { signerType: 'ATTORNEY' } } },
    }),
    db.case.count({ where: { ...scope, status: { in: ACTIVE_STATUSES as unknown as never[] } } }),
    db.case.count({ where: { ...scope, status: { in: CLOSED_STATUSES as unknown as never[] } } }),
    db.lawyer.count({ where: lawyerMemberFilter(lawyer) }),
    db.case.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, caseCode: true, status: true, createdAt: true, signatureExempt: true,
        // Solo la del abogado: con cualquier firma, un caso firmado por el
        // paciente saldría como listo y el ícono de firmar se apagaría.
        lienSignatures: { where: { signerType: 'ATTORNEY' }, select: { id: true }, take: 1 },
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
  const sessionName = `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim() || (lawyer.firmName ?? '');

  const quickActions = [
    { href: '/attorney/cases',      icon: Briefcase, title: t('actionCases'),  subtitle: t('actionCasesSub') },
    { href: '/api/attorney/report', icon: FileDown,  title: t('actionReport'), subtitle: t('actionReportSub'), external: true },
    ...(showUsers ? [
      { href: '/attorney/users?new=1', icon: UserPlus, title: t('actionInvite'), subtitle: t('actionInviteSub') },
      { href: '/attorney/users',       icon: Users,    title: t('actionUsers'),  subtitle: t('actionUsersSub') },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { firm: lawyer.firmName ?? '—' })}
      />

      {/* Cada KPI lleva a la lista YA filtrada — el mismo criterio con el que se
          contó, porque el filtro sale de `caseListFilters()` en los dos lados.
          Si el número y la lista se calcularan por separado, dejarían de
          coincidir apenas alguien agregue un estado. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiLink href="/attorney/cases?sig=pending">
          <KpiCard label={t('kpiPendingSignature')} value={pendingSignature} color="text-amber"      icon={FileSignature} iconBg="bg-amber/10"   iconColor="text-amber"      sub={t('kpiPendingSignatureSub')} />
        </KpiLink>
        <KpiLink href="/attorney/cases?status=active">
          <KpiCard label={t('kpiActive')}           value={activeCases}      color="text-brand-text" icon={Activity}      iconBg="bg-brand/10"   iconColor="text-brand-text" sub={t('kpiActiveSub')} />
        </KpiLink>
        <KpiLink href="/attorney/cases?status=completed">
          <KpiCard label={t('kpiClosed')}           value={closedCases}      color="text-emerald"    icon={CheckCircle2}  iconBg="bg-emerald/10" iconColor="text-emerald"    sub={t('kpiClosedSub')} />
        </KpiLink>
        {showUsers && (
          <KpiLink href="/attorney/users">
            <KpiCard label={t('kpiStaff')} value={staffCount} color="text-violet-text" icon={Users} iconBg="bg-violet/10" iconColor="text-violet-text" sub={t('kpiStaffSub')} />
          </KpiLink>
        )}
      </div>

      {/* Las columnas SIGUEN a la cantidad de accesos, no al revés.
          Con `lg:grid-cols-3` fijo y 4 accesos, el cuarto caía solo en una
          segunda fila. Y la cantidad cambia por rol —un gestor de casos no ve
          los dos de Usuarios— así que fijar el número deja hueco o huérfano
          según quién mire. */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${QUICK_GRID[quickActions.length] ?? 'lg:grid-cols-4'}`}>
        {quickActions.map((a) => (
          <QuickAction key={a.href} href={a.href} icon={a.icon} title={a.title} subtitle={a.subtitle} external={a.external} />
        ))}
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
                        {/* Dos íconos, como el panel de v2: ver y firmar. El
                            caso abre COMO MODAL acá mismo (`?case=`), sin salir
                            del Home — ver `lib/case-modal-url.ts`. */}
                        <CaseRowIcons
                          caseRow={{
                            id: c.id,
                            caseCode: c.caseCode,
                            hasSigned: c.lienSignatures.length > 0,
                            signatureExempt: c.signatureExempt,
                            attorneyName: null,
                          }}
                          canSign={canSignLien(lawyer)}
                          sessionName={sessionName}
                          onSigned={() => { /* el refresh lo dispara el diálogo */ }}
                        />
                      </DataTable.Td>
                    </DataTable.Row>
                  ))}
                </tbody>
              </DataTable.Table>
            </DataTable.Scroll>
          </DataTable.Card>
        )}
      </section>

      {/* El caso abre sobre el propio Panel, como en v2: el ojo no te saca de
          la pantalla en la que estabas mirando los números. */}
      <CaseUrlModal caseId={caseId} tab={tab} variant="attorney" />
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

/**
 * Envoltorio que hace clickeable un `KpiCard` sin tocar el primitivo.
 *
 * `KpiCard` es compartido con el resto del back-office, donde los KPIs NO
 * navegan. Agregarle un `href` opcional obligaría a revisar todos sus usos;
 * envolverlo deja el primitivo intacto y el comportamiento acá, que es donde
 * vive la decisión.
 */
function KpiLink({ href, children }: { href: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Link href={href} className="block rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-brand/40">
      {children}
    </Link>
  );
}
