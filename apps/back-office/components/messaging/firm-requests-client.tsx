'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, Scale, Clock, CheckCircle2, MessageSquareWarning } from 'lucide-react';
import { PageHeader, KpiCard, DataTable, TagPill, StatusPill, EmptyState, IconAction, TableFooter } from '@/components/ui-phoenix';
import { useToast } from '@/components/ui-phoenix/toast';
import { CASE_PARAM, conCasoAbierto } from '@/lib/case-modal-url';
import { fechaHora } from '@/lib/fechas';
import { ESCRITORIOS, ESCRITORIOS_DE_PEDIDO, type Escritorio } from '@/lib/mensajeria/escritorios';
import { ThreadViewDialog } from './thread-view-dialog';

/**
 * Pedidos de bufetes — la vista del ADMIN sobre todo lo que pidieron los
 * abogados desde su portal, con filtros por bufete, escritorio, estado,
 * urgencia y fechas.
 *
 * Tres números arriba y nada más: cuántos siguen sin responder, qué porcentaje
 * se respondió en 24 h y la mediana de horas a la primera respuesta. Es la
 * única métrica que a un bufete le importa de nosotros.
 *
 * "Sin responder" lo deriva el servidor (la última palabra la tiene el lado del
 * bufete); acá solo se pinta. Reasignar el escritorio va inline en la fila:
 * un select chico, y el servidor suma a la gente del escritorio nuevo.
 */

interface Row {
  id: string;
  subject: string;
  type: 'REQUEST' | 'REFERRAL' | string;
  referral: { id: string; status: string; convertedByName: string | null } | null;
  desk: Escritorio | null;
  topic: string | null;
  priority: 'NORMAL' | 'URGENT';
  firm: { id: string; name: string };
  case: { id: string; caseCode: string } | null;
  /** Sede del paciente (la de su cita más reciente). */
  clinic: { id: string; name: string } | null;
  patientName: string | null;
  /** Quién respondió por la clínica por última vez, cuándo y qué dijo. */
  lastReply: { by: string; at: string; text: string | null } | null;
  from: string;
  to: string[];
  createdAt: string;
  lastEntryAt: string;
  lastAuthor: string;
  entries: number;
  sealed: boolean;
  estado: 'PENDING' | 'ANSWERED' | 'CREATED';
  horasPrimeraRespuesta: number | null;
}

interface Respuesta {
  total: number;
  page: number;
  pageSize: number;
  rows: Row[];
  kpis: { total: number; pendientes: number; pctEn24h: number | null; medianaHoras: number | null };
  firms: Array<{ id: string; name: string }>;
  truncado: boolean;
}

const DESK_PILL: Record<Escritorio, string> = {
  CLINICAL:  'bg-violet/15 text-violet border-violet/30',
  INTAKE:    'bg-cyan/15 text-cyan border-cyan/30',
  BILLING:   'bg-amber/15 text-amber border-amber/30',
  REFERRALS: 'bg-emerald/15 text-emerald border-emerald/30',
};

const selectCls =
  'bg-bg-2 border border-border rounded-md px-2.5 py-1.5 text-sm text-text-1 outline-none focus:border-brand transition-colors appearance-none [color-scheme:dark]';
const labelCls = 'text-[10px] uppercase tracking-wider font-semibold text-text-muted';

export function FirmRequestsClient({ currentUserId, clinics = [] }: {
  currentUserId: string;
  /** Sedes para el filtro; sin lista, el filtro no se dibuja. */
  clinics?: Array<{ id: string; name: string }>;
}): React.ReactElement {
  const t = useTranslations('phoenix.messaging');
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [firmId, setFirmId] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [tipo, setTipo] = useState('');
  const [desk, setDesk] = useState('');
  const [estado, setEstado] = useState('');
  const [priority, setPriority] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Respuesta | null>(null);
  const [loading, setLoading] = useState(true);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);

  const caseModalOpen = !!searchParams.get(CASE_PARAM);
  const openCase = useCallback((caseId: string) => {
    router.push(conCasoAbierto(pathname, searchParams, caseId), { scroll: false });
  }, [router, pathname, searchParams]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (firmId) sp.set('firmId', firmId);
    if (clinicId) sp.set('clinicId', clinicId);
    if (tipo) sp.set('type', tipo);
    if (desk) sp.set('desk', desk);
    if (estado) sp.set('estado', estado);
    if (priority) sp.set('priority', priority);
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    if (q.trim()) sp.set('q', q.trim());
    sp.set('page', String(page));
    try {
      const r = await fetch(`/api/messages/firm-requests?${sp.toString()}`);
      if (r.ok) setData((await r.json()) as Respuesta);
    } finally {
      setLoading(false);
    }
  }, [firmId, clinicId, tipo, desk, estado, priority, from, to, q, page]);

  // El buscador espera a que dejen de tipear; el resto dispara al instante.
  useEffect(() => {
    const id = setTimeout(() => { void cargar(); }, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [cargar, q]);

  async function reasignar(row: Row, nuevo: string): Promise<void> {
    if (!nuevo || nuevo === row.desk) return;
    setMoviendo(row.id);
    try {
      const r = await fetch(`/api/messages/${row.id}/desk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desk: nuevo }),
      });
      if (r.status === 409) { toast.error(t('frReassignEmpty')); return; }
      if (!r.ok) { toast.error(t('frReassignError')); return; }
      toast.success(t('frReassigned', { desk: t(`desk${nuevo}`) }));
      await cargar();
    } finally {
      setMoviendo(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title={t('frTitle')} subtitle={t('frSubtitle')} />

      {/* Los tres números que importan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          compact
          label={t('frKpiPending')}
          value={data?.kpis.pendientes ?? '—'}
          sub={t('frKpiPendingSub')}
          color={data && data.kpis.pendientes > 0 ? 'text-amber' : 'text-text-1'}
          icon={MessageSquareWarning} iconBg="bg-amber/10" iconColor="text-amber"
        />
        <KpiCard
          compact
          label={t('frKpiIn24h')}
          value={data?.kpis.pctEn24h === null || data?.kpis.pctEn24h === undefined ? '—' : `${data.kpis.pctEn24h}%`}
          sub={t('frKpiIn24hSub')}
          color="text-emerald"
          icon={CheckCircle2} iconBg="bg-emerald/10" iconColor="text-emerald"
        />
        <KpiCard
          compact
          label={t('frKpiMedian')}
          value={data?.kpis.medianaHoras === null || data?.kpis.medianaHoras === undefined ? '—' : t('frHours', { h: data.kpis.medianaHoras })}
          sub={t('frKpiMedianSub')}
          color="text-cyan"
          icon={Clock} iconBg="bg-cyan/10" iconColor="text-cyan"
        />
      </div>

      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className={labelCls}>{t('frFilterFirm')}</label>
          <select className={selectCls} value={firmId} onChange={(e) => { setFirmId(e.target.value); setPage(1); }}>
            <option value="">{t('frAll')}</option>
            {(data?.firms ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        {clinics.length > 0 && (
          <div className="space-y-1">
            <label className={labelCls}>{t('frFilterClinic')}</label>
            <select className={selectCls} value={clinicId} onChange={(e) => { setClinicId(e.target.value); setPage(1); }}>
              <option value="">{t('frAll')}</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label className={labelCls}>{t('frFilterType')}</label>
          <select className={selectCls} value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(1); }}>
            <option value="">{t('frAll')}</option>
            <option value="REQUEST">{t('originFirmRequest')}</option>
            <option value="REFERRAL">{t('originReferral')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>{t('frFilterDesk')}</label>
          <select className={selectCls} value={desk} onChange={(e) => { setDesk(e.target.value); setPage(1); }}>
            <option value="">{t('frAll')}</option>
            {ESCRITORIOS.map((d) => <option key={d} value={d}>{t(`desk${d}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>{t('frFilterState')}</label>
          <select className={selectCls} value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}>
            <option value="">{t('frAll')}</option>
            <option value="PENDING">{t('frStatePENDING')}</option>
            <option value="ANSWERED">{t('frStateANSWERED')}</option>
            <option value="CREATED">{t('frStateCREATED')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>{t('frFilterPriority')}</label>
          <select className={selectCls} value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
            <option value="">{t('frAll')}</option>
            <option value="URGENT">{t('priorityURGENT')}</option>
            <option value="NORMAL">{t('priorityNORMAL')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>{t('frFilterFrom')}</label>
          <input type="date" className={selectCls} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>{t('frFilterTo')}</label>
          <input type="date" className={selectCls} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className={labelCls}>{t('frColSubject')}</label>
          <input
            type="search"
            className={`${selectCls} w-full`}
            placeholder={t('frSearch')}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Tabla */}
      {data && data.rows.length === 0 && !loading ? (
        <div className="rounded-lg bg-bg-1 py-10">
          <EmptyState.Rich icon={Scale} title={t('frEmptyTitle')} subtitle={t('frEmptySub')} />
        </div>
      ) : (
        <DataTable.Card>
          <DataTable.Scroll>
            <DataTable.Table>
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('frColFirm')}</DataTable.Th>
                <DataTable.Th>{t('frColCase')}</DataTable.Th>
                <DataTable.Th>{t('frColClinic')}</DataTable.Th>
                <DataTable.Th>{t('frColDesk')}</DataTable.Th>
                <DataTable.Th>{t('frColSubject')}</DataTable.Th>
                <DataTable.Th>{t('frColTo')}</DataTable.Th>
                <DataTable.Th>{t('frColState')}</DataTable.Th>
                <DataTable.Th>{t('frColLastReply')}</DataTable.Th>
                <DataTable.Th align="right">{t('frColResponse')}</DataTable.Th>
                <DataTable.Th>{t('frColDate')}</DataTable.Th>
                <DataTable.Th align="right" sticky="right"><span className="sr-only">{t('frOpen')}</span></DataTable.Th>
              </DataTable.Head>
              <tbody className={loading ? 'opacity-50' : ''}>
                {(data?.rows ?? []).map((r) => (
                  <DataTable.Row key={r.id} onClick={() => setOpenThreadId(r.id)} muted={r.sealed}>
                    <DataTable.Td sticky="left">
                      <span className="text-sm text-text-1 whitespace-nowrap">{r.firm.name}</span>
                      <span className="block text-[10.5px] text-text-muted truncate max-w-[180px]">{r.from}</span>
                    </DataTable.Td>
                    <DataTable.Td>
                      {r.case ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openCase(r.case!.id); }}
                          className="text-left"
                          title={r.case.caseCode}
                        >
                          <TagPill label={r.case.caseCode} mono compact colorClass="bg-brand/10 text-brand-text border-brand/20" />
                        </button>
                      ) : '—'}
                      {r.patientName && (
                        <span className="block text-[10.5px] text-text-muted truncate max-w-[160px]">{r.patientName}</span>
                      )}
                    </DataTable.Td>
                    <DataTable.Td>
                      <span className="text-[12.5px] text-text-2 whitespace-nowrap">{r.clinic?.name ?? '—'}</span>
                    </DataTable.Td>
                    <DataTable.Td onClick={(e) => e.stopPropagation()}>
                      {r.type === 'REFERRAL' ? (
                        /* Un referido no se reasigna: tiene su escritorio y su
                           flujo (crear el caso). Pastilla fija. */
                        <TagPill label={t('originReferral')} colorClass="bg-violet/15 text-violet border-violet/30" />
                      ) : (
                        /* Reasignar inline: el select se ve como la pastilla. */
                        <select
                          aria-label={t('frReassign')}
                          title={t('frReassign')}
                          disabled={moviendo === r.id}
                          value={r.desk ?? ''}
                          onChange={(e) => { void reasignar(r, e.target.value); }}
                          className={`text-[10px] uppercase tracking-wider font-semibold rounded-full border px-2 py-0.5 outline-none appearance-none cursor-pointer [color-scheme:dark] ${
                            r.desk ? DESK_PILL[r.desk] : 'bg-white/5 text-text-muted border-border'
                          }`}
                        >
                          {!r.desk && <option value="">—</option>}
                          {ESCRITORIOS_DE_PEDIDO.map((d) => <option key={d} value={d}>{t(`desk${d}`)}</option>)}
                        </select>
                      )}
                    </DataTable.Td>
                    <DataTable.Td>
                      <span className={`block text-[12.5px] truncate max-w-[320px] ${r.priority === 'URGENT' ? 'text-rose' : 'text-text-1'}`} title={r.subject}>
                        {r.subject}
                      </span>
                      <span className="block text-[10.5px] text-text-muted">
                        {r.entries > 1 ? `${r.entries} · ${r.lastAuthor}` : r.lastAuthor}
                      </span>
                    </DataTable.Td>
                    <DataTable.Td>
                      <span className="text-[12.5px] text-text-2 whitespace-nowrap">
                        {r.to.length > 0 ? r.to.join(', ') : <span className="text-text-muted">{t('frNoOne')}</span>}
                      </span>
                    </DataTable.Td>
                    <DataTable.Td>
                      <StatusPill
                        state={r.estado === 'PENDING' ? 'warning' : r.estado === 'CREATED' ? 'info' : 'success'}
                        label={t(`frState${r.estado}`)}
                        showDot
                      />
                      {r.estado === 'CREATED' && r.referral?.convertedByName && (
                        <span className="block text-[10.5px] text-text-muted mt-0.5">{r.referral.convertedByName}</span>
                      )}
                    </DataTable.Td>
                    <DataTable.Td>
                      {/* Quién respondió, cuándo y qué: el control de que el
                          pedido no quedó en el aire. El texto va recortado; el
                          hilo completo se abre con la fila. */}
                      {r.lastReply ? (
                        <div className="max-w-[300px]">
                          <span className="block text-[12px] text-text-1 whitespace-nowrap">
                            {r.lastReply.by}
                            <span className="text-text-muted font-mono text-[10.5px]"> · {fechaHora(r.lastReply.at, locale as 'es' | 'en')}</span>
                          </span>
                          {r.lastReply.text && (
                            <span className="block text-[11.5px] text-text-2 truncate" title={r.lastReply.text}>{r.lastReply.text}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11.5px] text-text-muted">{t('frNoReplyYet')}</span>
                      )}
                    </DataTable.Td>
                    <DataTable.Td align="right">
                      <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">
                        {r.horasPrimeraRespuesta === null ? '—' : t('frHours', { h: r.horasPrimeraRespuesta })}
                      </span>
                    </DataTable.Td>
                    <DataTable.Td>
                      <span className="font-mono text-[11.5px] text-text-muted whitespace-nowrap">
                        {fechaHora(r.lastEntryAt, locale as 'es' | 'en')}
                      </span>
                    </DataTable.Td>
                    <DataTable.Td align="right" sticky="right">
                      <IconAction icon={Eye} label={t('frOpen')} onClick={() => setOpenThreadId(r.id)} stopPropagation />
                    </DataTable.Td>
                  </DataTable.Row>
                ))}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
          <TableFooter
            left={
              <span className="text-[11px] text-text-muted">
                {data ? t('frCount', { count: data.total }) : ''}
                {data?.truncado ? ` · ${t('frTruncated')}` : ''}
              </span>
            }
            right={
              <div className="flex items-center gap-2 text-[11px] text-text-muted">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="px-2 py-1 rounded-md border border-border bg-bg-2 text-text-2 hover:text-text-1 disabled:opacity-40">
                  {t('frPrev')}
                </button>
                <span>{t('frPage', { page, pages })}</span>
                <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded-md border border-border bg-bg-2 text-text-2 hover:text-text-1 disabled:opacity-40">
                  {t('frNext')}
                </button>
              </div>
            }
          />
        </DataTable.Card>
      )}

      <ThreadViewDialog
        open={openThreadId !== null}
        onClose={() => setOpenThreadId(null)}
        threadId={openThreadId}
        currentUserId={currentUserId}
        isAdmin
        onChanged={() => { void cargar(); }}
        onOpenCase={openCase}
        suspended={caseModalOpen}
      />
    </div>
  );
}
