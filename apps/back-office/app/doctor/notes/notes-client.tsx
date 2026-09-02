'use client';

/**
 * Supervisión de notas · pantalla (F1).
 *
 * Los filtros viajan en la URL y cada cambio es una navegación de server: el
 * criterio de "pendiente" vive en `lib/notes-audit.ts` y se resuelve del lado de
 * la base, no filtrando en el cliente una página de 25 filas. Recargar
 * reproduce la vista y el link se puede pasar por chat.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Bell, CalendarDays, Check, CheckCircle2, Clock3, Download, FileText, Search } from 'lucide-react';
import {
  PageHeader, DataTable, TableFooter, EmptyState, TagPill, PersonAvatar, FilterPill, KpiCard,
} from '@/components/ui-phoenix';
import { useTransitionProgress } from '@/components/layout/navigation-progress';
import { localeApp } from '@/lib/fechas';
import { conCasoAbierto } from '@/lib/case-modal-url';
import type { EstadoNota } from '@/lib/notes-audit';
import type { NotesSummary } from '@/lib/notes-summary';

export interface NotesRow {
  appointmentId: string;
  scheduledFor: string;
  patientId: string;
  patientName: string;
  caseId: string | null;
  caseCode: string | null;
  providerId: string | null;
  providerName: string;
  providerUserId: string | null;
  clinicName: string;
  estado: EstadoNota;
  ageDays: number;
  signedAt: string | null;
  signedByName: string | null;
}

interface Props {
  rows: NotesRow[];
  total: number;
  /** Cuántas del filtro actual no tienen NI UNA línea escrita. */
  sinNota: number;
  page: number;
  pageSize: number;
  providers: Array<{ id: string; name: string }>;
  clinics: Array<{ id: string; name: string }>;
  /** KPIs + deuda por provider. Describe el ALCANCE, no el recorte de la lista. */
  resumen: NotesSummary;
}

/**
 * El color del estado dice qué tan grave es, no de qué tipo es: rose para la
 * visita sin ninguna nota (el peor caso), amber para la abierta, emerald para la
 * cerrada. Es la escala semántica del sistema, no la identidad del módulo.
 */
const ESTADO_STYLE: Record<EstadoNota, string> = {
  none:   'bg-rose/15 text-rose border-rose/30',
  draft:  'bg-amber/15 text-amber border-amber/30',
  signed: 'bg-emerald/15 text-emerald border-emerald/30',
  voided: 'bg-bg-3 text-text-muted border-border',
};

const ANTIGUEDADES = [0, 7, 30, 90];

/**
 * El color del "% dentro de 24 h", con un solo umbral para el KPI y la tabla.
 * Sin nada firmado no hay porcentaje: se pinta neutro, porque un 0% diría que
 * las cerró todas tarde y eso es otra cosa.
 */
function pctColor(pct: number | null): string {
  if (pct === null) return 'text-text-muted';
  if (pct >= 80) return 'text-emerald';
  if (pct >= 60) return 'text-amber';
  return 'text-rose';
}

export function NotesClient({
  rows, total, sinNota, page, pageSize, providers, clinics, resumen,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, startNav] = React.useTransition();
  useTransitionProgress(pendiente); // Regla #1

  /** Escribe un filtro en la URL. Cambiar cualquiera vuelve a la página 1. */
  const setParam = React.useCallback((cambios: Record<string, string | null>): void => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === '') next.delete(k); else next.set(k, v);
    }
    if (!('page' in cambios)) next.delete('page');
    const qs = next.toString();
    startNav(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }, [sp, pathname, router]);

  const estados = React.useMemo(() => {
    const raw = (sp.get('estado') ?? '').split(',').filter(Boolean) as EstadoNota[];
    return raw.length ? raw : (['none', 'draft'] as EstadoNota[]);
  }, [sp]);

  const toggleEstado = (e: EstadoNota): void => {
    const next = estados.includes(e) ? estados.filter((x) => x !== e) : [...estados, e];
    // Sin ningún estado la lista quedaría vacía y parecería rota. Quitar el
    // último devuelve al default (los pendientes), que es lo que se vino a ver.
    setParam({ estado: next.length ? next.join(',') : null });
  };

  /** Búsqueda con debounce: cada tecla es una navegación de server. */
  const [q, setQ] = React.useState(sp.get('q') ?? '');
  React.useEffect(() => { setQ(sp.get('q') ?? ''); }, [sp]);
  React.useEffect(() => {
    const actual = sp.get('q') ?? '';
    if (q === actual) return;
    const id = setTimeout(() => setParam({ q: q || null }), 400);
    return () => clearTimeout(id);
  }, [q, sp, setParam]);

  /**
   * Recordatorio al provider — MISMO envío que la cola de Day Admission
   * (`pending-notes.tsx`) y con las MISMAS claves de `phoenix.pendingNotes`:
   * una sola redacción del mensaje. Si el mostrador y el admin le escribieran
   * cosas distintas por lo mismo, el doctor recibiría dos versiones del pedido.
   */
  const tp = useTranslations('phoenix.pendingNotes');
  const [enviando, setEnviando] = React.useState<string | null>(null);
  const [enviados, setEnviados] = React.useState<Set<string>>(new Set());
  const [errorEnvio, setErrorEnvio] = React.useState('');

  const recordar = async (r: NotesRow): Promise<void> => {
    if (!r.providerUserId) return;
    setEnviando(r.appointmentId);
    setErrorEnvio('');
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [r.providerUserId],
          type: 'REMINDER',
          category: 'PATIENT_RELATED',
          priority: 'URGENT',
          subject: tp('reminderSubject', { patient: r.patientName }),
          body: tp('reminderBody', {
            date: fechaCorta(r.scheduledFor),
            patient: r.patientName,
            caseCode: r.caseCode ?? '—',
          }),
          patientId: r.patientId,
          caseId: r.caseId,
        }),
      });
      if (!res.ok) { setErrorEnvio(tp('errRemind')); return; }
      setEnviados((s) => new Set(s).add(r.appointmentId));
    } catch {
      setErrorEnvio(tp('errRemind'));
    } finally {
      setEnviando(null);
    }
  };

  /**
   * Abre el expediente del paciente SOBRE la lista, con `?case=` en la URL.
   *
   * No pasa por `setParam`: ese borra la página al cambiar un filtro, y abrir un
   * caso no es filtrar — al cerrarlo hay que volver a la misma página de la
   * misma lista. `conCasoAbierto` conserva todo lo demás tal cual.
   */
  const abrirExpediente = (caseId: string): void => {
    startNav(() => router.push(conCasoAbierto(pathname, sp, caseId), { scroll: false }));
  };

  /** Exporta LO QUE SE ESTÁ VIENDO: se le pasan los mismos searchParams. */
  const urlExport = `/api/admin/notes/export?${sp.toString()}`;

  const desde = page * pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Los cuatro KPIs. Responden "¿cómo estamos?" antes de cualquier filtro
          de detalle: describen el ALCANCE (clínica, fechas, provider elegido) y
          no el recorte de la lista — si siguieran al filtro de estado, mirar las
          firmadas mostraría cero pendientes y se leería como que no hay deuda. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          compact
          label={t('kpiPending')}
          value={resumen.totales.pendientes}
          color="text-amber"
          icon={Clock3}
          iconBg="bg-amber/10"
          iconColor="text-amber"
        />
        <KpiCard
          compact
          label={t('kpiNoNote')}
          value={resumen.totales.sinNota}
          color="text-rose"
          icon={AlertTriangle}
          iconBg="bg-rose/10"
          iconColor="text-rose"
        />
        <KpiCard
          compact
          label={t('kpiOldest')}
          value={t('days', { count: resumen.totales.masVieja })}
          color={resumen.totales.masVieja > 30 ? 'text-rose' : 'text-text-1'}
          icon={CalendarDays}
          iconBg="bg-violet/10"
          iconColor="text-violet-text"
        />
        <KpiCard
          compact
          label={t('kpiWithin24')}
          value={resumen.totales.pctDentro24h === null ? '—' : `${resumen.totales.pctDentro24h}%`}
          color={pctColor(resumen.totales.pctDentro24h)}
          icon={CheckCircle2}
          iconBg="bg-cyan/10"
          iconColor="text-cyan"
        />
      </div>

      {/* Deuda por provider. Va ANTES de la lista porque la primera pregunta de
          quien supervisa es "quién", no "cuál". Clic en una fila filtra la lista
          de abajo por ese provider; el segundo clic lo saca. */}
      {resumen.providers.length > 0 && (
        <DataTable.Card>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-text-1 font-semibold text-[12.5px] uppercase tracking-wider">
              {t('byProvider')}
            </span>
            <span className="text-[11px] text-text-muted">{t('byProviderHint')}</span>
          </div>
          <DataTable.Scroll>
            <DataTable.Table className="min-w-[640px]">
              <DataTable.Head>
                <DataTable.Th sticky="left">{t('colProvider')}</DataTable.Th>
                <DataTable.Th align="right">{t('estado_none')}</DataTable.Th>
                <DataTable.Th align="right">{t('estado_draft')}</DataTable.Th>
                <DataTable.Th align="right">{t('estado_signed')}</DataTable.Th>
                <DataTable.Th align="right">{t('colWithin24')}</DataTable.Th>
                <DataTable.Th align="right">{t('colOldest')}</DataTable.Th>
              </DataTable.Head>
              <tbody>
                {resumen.providers.map((p) => {
                  const elegido = sp.get('provider') === p.providerId;
                  const pct = p.firmadas > 0 ? Math.round((p.dentro24h / p.firmadas) * 100) : null;
                  return (
                    <DataTable.Row
                      key={p.providerId}
                      onClick={() => setParam({ provider: elegido ? null : p.providerId })}
                      highlight={elegido}
                      highlightClass="bg-violet/[0.07]"
                    >
                      <DataTable.Td sticky="left">
                        <div className="flex items-center gap-2 min-w-0">
                          <PersonAvatar firstName={p.providerName} lastName="" size={6} />
                          <span className="font-semibold truncate">{p.providerName}</span>
                        </div>
                      </DataTable.Td>
                      <DataTable.Td align="right">
                        <span className={`tabular-nums font-bold ${p.sinNota > 0 ? 'text-rose' : 'text-text-muted'}`}>{p.sinNota}</span>
                      </DataTable.Td>
                      <DataTable.Td align="right">
                        <span className={`tabular-nums font-semibold ${p.borradores > 0 ? 'text-amber' : 'text-text-muted'}`}>{p.borradores}</span>
                      </DataTable.Td>
                      <DataTable.Td align="right">
                        <span className="tabular-nums text-text-2">{p.firmadas}</span>
                      </DataTable.Td>
                      <DataTable.Td align="right">
                        {/* Sin ninguna firmada el porcentaje no existe. Un 0%
                            diría que las cerró todas tarde, que es otra cosa. */}
                        <span className={`tabular-nums font-semibold ${pctColor(pct)}`}>
                          {pct === null ? '—' : `${pct}%`}
                        </span>
                      </DataTable.Td>
                      <DataTable.Td align="right">
                        <span className={`tabular-nums ${p.masVieja > 30 ? 'text-rose font-semibold' : 'text-text-2'}`}>
                          {p.masVieja > 0 ? t('days', { count: p.masVieja }) : '—'}
                        </span>
                      </DataTable.Td>
                    </DataTable.Row>
                  );
                })}
              </tbody>
            </DataTable.Table>
          </DataTable.Scroll>
        </DataTable.Card>
      )}

      {/* ── La lista, con sus filtros ADENTRO ──────────────────────────────
          Los filtros van dentro de esta tarjeta y no sueltos entre las dos
          tablas: ahí quedaban pegados al pie del resumen por provider y se
          leían como si lo filtraran a él, cuando recortan la lista de abajo
          (Erick, 1-sep-2026). Una barra de filtros tiene que estar tocando lo
          que filtra. */}
      <DataTable.Card>
        <div className="px-4 py-3 border-b border-border flex flex-col gap-2.5">
        {/* Filtros. `flex-wrap` obligatorio: son siete controles (Regla #4). */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['none', 'draft', 'signed'] as EstadoNota[]).map((e) => (
            <FilterPill
              key={e}
              label={t(`estado_${e}`)}
              active={estados.includes(e)}
              onClick={() => toggleEstado(e)}
            />
          ))}

          <span className="w-px h-6 bg-border mx-1 hidden sm:block" />

          <select
            value={sp.get('provider') ?? ''}
            onChange={(ev) => setParam({ provider: ev.target.value || null })}
            aria-label={t('filterProvider')}
            className="h-9 rounded-md border border-border bg-bg-2 px-2.5 text-xs font-medium text-text-1"
          >
            <option value="">{t('allProviders')}</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select
            value={sp.get('clinica') ?? ''}
            onChange={(ev) => setParam({ clinica: ev.target.value || null })}
            aria-label={t('filterClinic')}
            className="h-9 rounded-md border border-border bg-bg-2 px-2.5 text-xs font-medium text-text-1"
          >
            <option value="">{t('allClinics')}</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* La antigüedad NO es el rango de fechas: es el filtro de riesgo. Un
              admin pregunta "qué lleva más de un mes", no "qué pasó en julio". */}
          <select
            value={sp.get('antiguedad') ?? '0'}
            onChange={(ev) => setParam({ antiguedad: ev.target.value === '0' ? null : ev.target.value })}
            aria-label={t('filterAge')}
            className="h-9 rounded-md border border-border bg-bg-2 px-2.5 text-xs font-medium text-text-1"
          >
            {ANTIGUEDADES.map((d) => (
              <option key={d} value={d}>{d === 0 ? t('anyAge') : t('olderThan', { days: d })}</option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(ev) => setQ(ev.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="h-9 w-[200px] rounded-md border border-border bg-bg-2 pl-8 pr-2.5 text-xs font-medium text-text-1 placeholder:text-text-muted"
            />
          </div>
        </div>

        {/* El total y, al lado, cuántas no tienen NADA escrito. El segundo número
            es el que distingue un borrador a medio hacer de una visita que nadie
            documentó, y es el que hay que perseguir. */}
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          <span className="text-text-2 font-semibold">{t('countVisits', { count: total })}</span>
          {sinNota > 0 && (
            <TagPill label={t('countNone', { count: sinNota })} colorClass={ESTADO_STYLE.none} />
          )}
          {/* Exportar lo FILTRADO, no todo: el archivo tiene que ser la pantalla.
              Es la única acción que saca datos del sistema, así que la ruta la
              audita — ver el comentario en `notes/export/route.ts`. */}
          {total > 0 && (
            <a
              href={urlExport}
              className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-text-2 text-[11px] font-semibold hover:bg-white/5 hover:text-text-1 transition-colors"
            >
              <Download className="w-3 h-3" />
              {t('export')}
            </a>
          )}
        </div>
        {errorEnvio && (
          <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
            {errorEnvio}
          </div>
        )}
        </div>

        <DataTable.Scroll>
          <DataTable.Table className="min-w-[900px]">
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('colVisit')}</DataTable.Th>
              <DataTable.Th>{t('colPatient')}</DataTable.Th>
              <DataTable.Th>{t('colCase')}</DataTable.Th>
              <DataTable.Th>{t('colProvider')}</DataTable.Th>
              <DataTable.Th>{t('colClinic')}</DataTable.Th>
              <DataTable.Th>{t('colStatus')}</DataTable.Th>
              <DataTable.Th align="right">{t('colAge')}</DataTable.Th>
              <DataTable.Th align="right" sticky="right">{t('colActions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState.Inline message={t('empty')} />
                  </td>
                </tr>
              ) : rows.map((r) => (
                <DataTable.Row
                  key={r.appointmentId}
                  /* La fila entera abre el EXPEDIENTE del paciente: era inerte y
                     en 64 de 120 filas ni siquiera "Ver nota" hacía algo, así
                     que la mayoría no reaccionaba al clic (Erick, 1-sep-2026).
                     Sin caso vinculado no hay expediente que abrir, y ahí la
                     fila se queda quieta en vez de fingir que responde. */
                  onClick={r.caseId ? () => abrirExpediente(r.caseId!) : undefined}
                >
                  <DataTable.Td sticky="left">
                    <div className="whitespace-nowrap font-medium">{fechaCorta(r.scheduledFor)}</div>
                    {r.signedAt && (
                      <div className="text-[10.5px] text-text-muted mt-0.5">
                        {t('signedBy', { date: fechaCorta(r.signedAt), name: r.signedByName ?? '—' })}
                      </div>
                    )}
                  </DataTable.Td>
                  <DataTable.Td>
                    <div className="flex items-center gap-2 min-w-0">
                      <PersonAvatar firstName={r.patientName} lastName="" size={6} />
                      <span className="truncate">{r.patientName || '—'}</span>
                    </div>
                  </DataTable.Td>
                  <DataTable.Td>
                    {r.caseCode
                      ? <span className="font-mono text-[11px] text-cyan group-hover:underline">{r.caseCode}</span>
                      : <span className="text-text-muted">—</span>}
                  </DataTable.Td>
                  <DataTable.Td>
                    {/* El provider filtra la lista por él — el mismo gesto que
                        la fila del resumen de arriba. `stopPropagation` porque
                        la fila ahora abre el expediente: sin eso, filtrar por un
                        provider abriría además el caso de esa visita. */}
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); setParam({ provider: r.providerId }); }}
                      title={t('filterByProvider', { name: r.providerName })}
                      className="text-text-2 whitespace-nowrap hover:text-violet-text hover:underline transition-colors text-left"
                    >
                      {r.providerName}
                    </button>
                  </DataTable.Td>
                  <DataTable.Td>
                    <span className="text-text-muted">{r.clinicName}</span>
                  </DataTable.Td>
                  <DataTable.Td>
                    <TagPill label={t(`estado_${r.estado}`)} colorClass={ESTADO_STYLE[r.estado]} />
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <Antiguedad dias={r.ageDays} label={t('days', { count: r.ageDays })} />
                  </DataTable.Td>
                  <DataTable.Td align="right" sticky="right">
                    <div className="flex items-center gap-1.5 justify-end" onClick={(ev) => ev.stopPropagation()}>
                      {/* Sin nota no hay nada que abrir. Se muestra deshabilitado
                          y con su motivo: escondido parecería que la fila está
                          rota o que a esa visita le falta un permiso. */}
                      {r.estado === 'none' ? (
                        <span
                          title={t('noNoteToOpen')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-text-muted text-[11px] font-semibold opacity-50 cursor-not-allowed"
                        >
                          <FileText className="w-3 h-3" />
                          {t('openNote')}
                        </span>
                      ) : (
                        <Link
                          href={`/doctor-print/visit-note/${r.appointmentId}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-violet/40 text-violet-text text-[11px] font-semibold hover:bg-violet/10 transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          {t('openNote')}
                        </Link>
                      )}
                      {/* Recordar solo tiene sentido si falta algo Y hay a quién
                          escribirle: el provider tiene que existir como usuario
                          de Phoenix para recibir el mensaje. */}
                      {r.estado !== 'signed' && r.providerUserId && (
                        enviados.has(r.appointmentId) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald">
                            <Check className="w-3 h-3" />
                            {tp('reminded')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void recordar(r)}
                            disabled={enviando === r.appointmentId}
                            title={t('remindHint')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-text-2 text-[11px] font-semibold hover:bg-white/5 hover:text-text-1 transition-colors disabled:opacity-50"
                          >
                            <Bell className="w-3 h-3" />
                            {t('remind')}
                          </button>
                        )
                      )}
                    </div>
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>

        <TableFooter
          left={total === 0 ? t('empty') : t('showing', { from: desde + 1, to: Math.min(desde + rows.length, total), total })}
          right={
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setParam({ page: String(page - 1) })}
                className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-white/5 transition-colors"
              >
                {t('prev')}
              </button>
              <span>{t('pageOf', { page: page + 1, total: totalPages })}</span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setParam({ page: String(page + 1) })}
                className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-white/5 transition-colors"
              >
                {t('next')}
              </button>
            </span>
          }
        />
      </DataTable.Card>

      <p className="text-[11px] text-text-muted max-w-2xl">{t('phiNote')}</p>
    </div>
  );
}

/**
 * La antigüedad con barra de severidad.
 *
 * Escaneando una lista larga, "112 d" y "2 d" se leen igual de rápido — el color
 * es lo que hace saltar el atraso antes de leer el número. Verde hasta una
 * semana, ámbar hasta el mes, rose después.
 */
function Antiguedad({ dias, label }: { dias: number; label: string }): React.ReactElement {
  const color = dias > 30 ? 'bg-rose' : dias > 7 ? 'bg-amber' : 'bg-emerald';
  const texto = dias > 30 ? 'text-rose' : dias > 7 ? 'text-amber' : 'text-emerald';
  const ancho = dias > 30 ? 'w-full' : dias > 7 ? 'w-1/2' : 'w-1/5';
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="w-8 h-1 rounded-full bg-bg-3 overflow-hidden shrink-0">
        <span className={`block h-full rounded-full ${color} ${ancho}`} />
      </span>
      <span className={`text-[12px] font-semibold tabular-nums ${texto}`}>{label}</span>
    </span>
  );
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString(localeApp(), {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Denver',
  });
}
