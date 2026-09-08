'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserPlus, ArrowRight, Loader2, Mail } from 'lucide-react';
import { DataTable, TagPill, StatusPill, EmptyState } from '@/components/ui-phoenix';
import { CASE_PARAM, conCasoAbierto } from '@/lib/case-modal-url';
import { fecha, fechaHora } from '@/lib/fechas';
import { ReferralDialog } from '../vigia/referral-dialog';

/**
 * Portal Legal · lista de referidos enviados + el botón para mandar otro.
 *
 * El botón va ARRIBA, grande y con degradado: es la acción de la pantalla. La
 * tabla es el historial: cliente, fecha del accidente, cuándo se mandó, estado
 * y el caso cuando ya existe (abre encima, `?case=`). Cada fila también lleva
 * al hilo del mensaje, que es donde la clínica responde.
 */

interface Referido {
  id: string;
  threadId: string;
  status: 'PENDING' | 'CREATED' | 'DISCARDED';
  clientName: string;
  accidentDate: string;
  createdAt: string;
  convertedAt: string | null;
  caseCode: string | null;
  caseId?: string | null;
}

interface Respuesta { referrals: Referido[]; pendientes: number; creados: number }

export function ReferralsClient({ locale, firmName, attorneyName, abrirNuevo = false }: {
  locale: string;
  firmName: string;
  attorneyName: string | null;
  abrirNuevo?: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const loc = locale as 'es' | 'en';
  const [data, setData] = React.useState<Respuesta | null>(null);
  const [abierto, setAbierto] = React.useState(abrirNuevo);

  const cargar = React.useCallback(async () => {
    try {
      const r = await fetch('/api/attorney/referrals');
      if (r.ok) setData((await r.json()) as Respuesta);
      else setData({ referrals: [], pendientes: 0, creados: 0 });
    } catch { setData({ referrals: [], pendientes: 0, creados: 0 }); }
  }, []);
  React.useEffect(() => { void cargar(); }, [cargar]);

  const rows = data?.referrals ?? [];

  return (
    <>
      {/* La acción, primero y grande. */}
      <div className="rounded-lg bg-bg-1 p-5 flex items-center gap-4 flex-wrap">
        <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center shrink-0">
          <UserPlus className="w-5 h-5 text-brand-text" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-text-1 font-semibold">{t('refPanelTitle')}</p>
          <p className="text-[12.5px] text-text-2">{t('refPanelBody')}</p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md bg-gradient-brand text-white font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity w-full sm:w-auto"
        >
          {t('refCtaButton')}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* El historial. */}
      {!data ? (
        <div className="rounded-lg bg-bg-1 flex items-center justify-center py-16">
          <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg bg-bg-1 py-10">
          <EmptyState.Rich icon={UserPlus} title={t('refListEmptyTitle')} subtitle={t('refListEmptySub')} />
        </div>
      ) : (
        <DataTable.Card>
          <div className="px-5 pt-4 pb-2 flex items-baseline gap-4 flex-wrap">
            <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('refListSent')}</h2>
            <span className="text-[12px] text-text-muted">
              {t('refCtaStatus', { pendientes: data.pendientes, creados: data.creados })}
            </span>
          </div>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('refColClient')}</DataTable.Th>
                <DataTable.Th>{t('refColAccident')}</DataTable.Th>
                <DataTable.Th>{t('refColSent')}</DataTable.Th>
                <DataTable.Th>{t('refColStatus')}</DataTable.Th>
                <DataTable.Th>{t('refColCase')}</DataTable.Th>
                <DataTable.Th align="right" sticky="right"><span className="sr-only">{t('refColThread')}</span></DataTable.Th>
              </DataTable.Head>
              <tbody>
                {rows.map((r) => (
                  <DataTable.Row key={r.id} onClick={() => router.push(`/attorney/messages?thread=${r.threadId}`)}>
                    <DataTable.Td sticky="left"><span className="text-sm text-text-1 whitespace-nowrap">{r.clientName}</span></DataTable.Td>
                    <DataTable.Td><span className="whitespace-nowrap">{fecha(r.accidentDate, loc)}</span></DataTable.Td>
                    <DataTable.Td><span className="font-mono text-[11.5px] text-text-muted whitespace-nowrap">{fechaHora(r.createdAt, loc)}</span></DataTable.Td>
                    <DataTable.Td>
                      <StatusPill
                        state={r.status === 'CREATED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'neutral'}
                        label={r.status === 'CREATED' ? t('refStatusCreated') : r.status === 'PENDING' ? t('refStatusPending') : t('refStatusDiscarded')}
                        showDot
                      />
                    </DataTable.Td>
                    <DataTable.Td onClick={(e) => e.stopPropagation()}>
                      {r.caseCode && r.caseId ? (
                        <button
                          type="button"
                          onClick={() => router.push(conCasoAbierto(pathname, sp, r.caseId!), { scroll: false })}
                          title={r.caseCode}
                        >
                          <TagPill label={r.caseCode} mono compact colorClass="bg-brand/10 text-brand-text border-brand/20" />
                        </button>
                      ) : r.caseCode ? (
                        <TagPill label={r.caseCode} mono compact colorClass="bg-brand/10 text-brand-text border-brand/20" />
                      ) : <span className="text-text-muted">—</span>}
                    </DataTable.Td>
                    <DataTable.Td align="right" sticky="right">
                      <span className="inline-flex items-center gap-1 text-[12px] text-text-2"><Mail className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('refColThread')}</span></span>
                    </DataTable.Td>
                  </DataTable.Row>
                ))}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
        </DataTable.Card>
      )}

      <ReferralDialog
        open={abierto && !sp.get(CASE_PARAM)}
        onClose={() => setAbierto(false)}
        firmName={firmName}
        attorneyName={attorneyName}
        onSent={() => { void cargar(); router.refresh(); }}
      />
    </>
  );
}
