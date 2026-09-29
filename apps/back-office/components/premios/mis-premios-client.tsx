'use client';

/**
 * "Mis premios" — cómo va cada participante en el mes.
 *
 * Todo lo que se muestra sale de `/api/premios/mio`, que devuelve SOLO lo de
 * quien pregunta (y el equipo, si es la manager). Los montos y las metas los
 * calcula `calcularPeriodo` en el servidor: esta pantalla no hace cuentas de
 * plata, solo las formatea.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Coins, Plus, Target, Trophy, Trash2, TrendingUp, Users } from 'lucide-react';
import { Button, cn } from '@precision/ui';
import {
  USO_TOPE_DIARIO, type ParticipantResult, type RewardCategory, type RewardGoal,
} from '@precision-medical/database/premios';
import {
  DataTable, EmptyState, IconAction, KpiCard, PageHeader, Skeleton, StatusPill, TagPill, useToast,
} from '@/components/ui-phoenix';
import { fechaCorta } from '@/lib/fechas';
import { RegistrarLogroDialog } from './registrar-logro-dialog';
import { PistaDelPremio } from './pista-del-premio';

interface Entry {
  id: string;
  occurredOn: string;
  categoryCode: string;
  patient: { code: string | null; name: string } | null;
  source: string | null;
  isNewPatient: boolean | null;
  points: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectReason: string | null;
  origin: 'MANUAL' | 'AUTO';
}

interface Data {
  participating: true;
  month: string;
  status: string;
  poolCents: number;
  shareCents: number;
  participantsCount: number;
  me: ParticipantResult;
  goals: RewardGoal[];
  entries: Entry[];
  team: Array<{ userId: string; name: string; result: ParticipantResult }> | null;
  categories: RewardCategory[];
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'fuera' }
  | { tipo: 'listo'; data: Data };

export function MisPremiosClient(): React.ReactElement {
  const t = useTranslations('phoenix.rewards');
  const locale = useLocale();
  const toast = useToast();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [dialogOpen, setDialogOpen] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/premios/mio', { cache: 'no-store' });
      if (!res.ok) { setEstado({ tipo: 'error' }); return; }
      const body = (await res.json()) as Data | { participating: false };
      setEstado(body.participating ? { tipo: 'listo', data: body } : { tipo: 'fuera' });
    } catch {
      setEstado({ tipo: 'error' });
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const mesTexto = (mes: string) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${mes}T00:00:00Z`));
  const labelMeta = (g: RewardGoal) => (locale === 'en' ? g.labelEn : g.labelEs);

  async function borrar(id: string): Promise<void> {
    const res = await fetch(`/api/premios/registros/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success(t('deleted')); void cargar(); }
    else toast.error(t('errors.DELETE_FAILED'));
  }

  if (estado.tipo === 'cargando') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (estado.tipo === 'error') {
    return (
      <EmptyState.Rich
        icon={Trophy}
        title={t('loadFailed')}
        action={<Button variant="secondary" onClick={() => { setEstado({ tipo: 'cargando' }); void cargar(); }}>{t('retry')}</Button>}
      />
    );
  }
  if (estado.tipo === 'fuera') {
    return <EmptyState.Rich icon={Trophy} title={t('notParticipatingTitle')} subtitle={t('notParticipatingSub')} />;
  }

  const d = estado.data;
  const me = d.me;
  const esManager = me.kind === 'MANAGER';
  const porMeta = Math.round(d.shareCents / Math.max(1, me.goalsTotal));
  const faltan = d.goals.filter((g, i) => !me.goals[i]?.hit).map(labelMeta);
  const abierto = d.status === 'OPEN';
  const nombreCat = (code: string) => {
    const c = d.categories.find((x) => x.code === code);
    return c ? (locale === 'en' ? c.nameEn : c.nameEs) : code;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {t('title')}
            {esManager && <TagPill label={t('managerBadge')} colorClass="bg-violet/15 text-violet-text border-violet/30" />}
          </span>
        }
        subtitle={esManager ? `${mesTexto(d.month)} · ${t('managerExplain')}` : mesTexto(d.month)}
        action={abierto ? (
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" /> {t('newEntry')}
          </Button>
        ) : undefined}
      />

      <PistaDelPremio me={me} goals={d.goals} shareCents={d.shareCents} labelMeta={labelMeta} money={money} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiShare')}
          value={money(d.shareCents)}
          sub={t('kpiShareSub', { pool: money(d.poolCents), n: d.participantsCount })}
          icon={Coins} iconBg="bg-brand/10" iconColor="text-brand-text"
        />
        {esManager ? (
          <KpiCard
            label={t('teamProgress')}
            value={`${Math.round(me.progress * 1000) / 10}%`}
            sub={t('teamProgressSub', { hits: (d.team ?? []).reduce((s, m) => s + m.result.goalsHit, 0), total: (d.team ?? []).length * me.goalsTotal })}
            icon={Users} iconBg="bg-violet/10" iconColor="text-violet-text"
          />
        ) : (
          <KpiCard
            label={t('kpiGoals')}
            value={`${me.goalsHit} / ${me.goalsTotal}`}
            sub={faltan.length ? t('kpiGoalsMissing', { list: faltan.join(', ') }) : t('kpiGoalsAll')}
            icon={Target} iconBg="bg-emerald/10" iconColor="text-emerald-text"
          />
        )}
        <KpiCard
          label={t('kpiEarning')}
          value={money(me.payoutCents)}
          sub={t('kpiEarningSub')}
          color="text-emerald-text"
          icon={TrendingUp} iconBg="bg-emerald/10" iconColor="text-emerald-text"
        />
        <KpiCard
          label={t('kpiPoints')}
          value={me.points}
          sub={t('kpiPointsSub', { n: me.pending })}
          icon={Trophy} iconBg="bg-amber/10" iconColor="text-amber-text"
        />
      </div>

      {!esManager && (
        <section className="rounded-lg bg-bg-1 p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
              <Target className="w-4 h-4 text-brand" /> {t('goalsTitle')}
            </h2>
            <span className="text-[11px] text-text-muted">{t('goalEach', { amount: money(porMeta) })}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {d.goals.map((g, i) => {
              const r = me.goals[i];
              const actual = r?.actual ?? 0;
              const hit = !!r?.hit;
              const pct = Math.min(100, Math.round((actual / g.target) * 100));
              return (
                <div key={g.id} className={cn('rounded-md p-3 flex flex-col gap-1.5', hit ? 'bg-emerald/10' : 'bg-bg-2/40')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-text-1">{labelMeta(g)}</span>
                    {hit
                      ? <StatusPill state="success" label={t('goalDone')} />
                      : <StatusPill state="warning" label={t('goalMissing', { n: g.target - actual })} />}
                  </div>
                  <div className="text-lg font-bold text-text-1 tabular-nums">
                    {actual}<span className="text-text-muted text-xs font-semibold"> / {g.target}{g.kind === 'USAGE' ? ` ${t('pts')}` : ''}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden">
                    <div className={cn('h-full rounded-full', hit ? 'bg-emerald' : 'bg-amber')} style={{ width: `${pct}%` }} />
                  </div>
                  {g.kind === 'USAGE' && <span className="text-[10.5px] text-text-muted">{t('goalUsageHint', { cap: USO_TOPE_DIARIO })}</span>}
                  {g.kind === 'CALLS' && <span className="text-[10.5px] text-text-muted">{t('goalAuto')}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {esManager && d.team && (
        <DataTable.Card>
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-violet" /> {t('teamTitle')}
            </h2>
          </div>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('colName')}</DataTable.Th>
                {d.goals.map((g) => <DataTable.Th key={g.id} align="center">{labelMeta(g)}</DataTable.Th>)}
                <DataTable.Th align="right" sticky="right">{t('colGoals')}</DataTable.Th>
              </DataTable.Head>
              <tbody>
                {d.team.map((m) => (
                  <DataTable.Row key={m.userId}>
                    <DataTable.Td sticky="left" className="font-semibold">{m.name}</DataTable.Td>
                    {m.result.goals.map((r) => (
                      <DataTable.Td key={r.goalId} align="center">
                        <span className={cn(
                          'inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                          r.hit ? 'bg-emerald/15 text-emerald-text' : 'bg-amber/15 text-amber-text',
                        )}>{r.actual}/{r.target}</span>
                      </DataTable.Td>
                    ))}
                    <DataTable.Td align="right" sticky="right" className="tabular-nums">{m.result.goalsHit}/{m.result.goalsTotal}</DataTable.Td>
                  </DataTable.Row>
                ))}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
        </DataTable.Card>
      )}

      <DataTable.Card>
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider inline-flex items-center gap-2">
            <Trophy className="w-4 h-4 text-brand" /> {t('entriesTitle')}
          </h2>
        </div>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('colDate')}</DataTable.Th>
              <DataTable.Th>{t('colAchievement')}</DataTable.Th>
              <DataTable.Th>{t('colPatient')}</DataTable.Th>
              <DataTable.Th>{t('colSource')}</DataTable.Th>
              <DataTable.Th>{t('colType')}</DataTable.Th>
              <DataTable.Th align="right">{t('colPoints')}</DataTable.Th>
              <DataTable.Th>{t('colStatus')}</DataTable.Th>
              <DataTable.Th align="right" sticky="right"><span className="sr-only">{t('colActions')}</span></DataTable.Th>
            </DataTable.Head>
            <tbody>
              {d.entries.length === 0 ? (
                <tr><td colSpan={8}><EmptyState.Inline message={t('entriesEmpty')} /></td></tr>
              ) : d.entries.map((e) => (
                <DataTable.Row key={e.id} muted={e.status === 'REJECTED'}>
                  <DataTable.Td sticky="left" className="tabular-nums whitespace-nowrap">{fechaCorta(`${e.occurredOn}T12:00:00Z`)}</DataTable.Td>
                  <DataTable.Td>{nombreCat(e.categoryCode)}</DataTable.Td>
                  <DataTable.Td className="text-[12.5px]">
                    {e.patient ? <>{e.patient.name}{e.patient.code && <span className="text-text-muted"> · {e.patient.code}</span>}</> : <span className="text-text-muted">—</span>}
                  </DataTable.Td>
                  <DataTable.Td className="text-[12.5px]">{e.source ? t(`source.${e.source}`) : <span className="text-text-muted">—</span>}</DataTable.Td>
                  <DataTable.Td className="text-[12.5px]">
                    {e.isNewPatient === null ? <span className="text-text-muted">—</span> : e.isNewPatient ? t('typeNew') : t('typeExisting')}
                  </DataTable.Td>
                  <DataTable.Td align="right" className={cn('tabular-nums', e.status !== 'VERIFIED' && 'text-text-muted')}>
                    {e.status === 'VERIFIED' ? `+${e.points}` : e.points}
                  </DataTable.Td>
                  <DataTable.Td>
                    {e.origin === 'AUTO'
                      ? <StatusPill state="success" label={t('status.AUTO')} />
                      : e.status === 'VERIFIED'
                        ? <StatusPill state="success" label={t('status.VERIFIED')} />
                        : e.status === 'REJECTED'
                          ? <StatusPill state="danger" label={e.rejectReason ? t('rejectedWith', { reason: e.rejectReason }) : t('status.REJECTED')} />
                          : <StatusPill state="warning" label={t('status.PENDING')} />}
                  </DataTable.Td>
                  <DataTable.Td align="right" sticky="right">
                    {e.status === 'PENDING' && e.origin === 'MANUAL' && abierto && (
                      <IconAction icon={Trash2} label={t('delete')} variant="danger" onClick={() => void borrar(e.id)} />
                    )}
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
      </DataTable.Card>

      <RegistrarLogroDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={d.categories}
        month={d.month}
        onSaved={() => void cargar()}
      />
    </div>
  );
}
