'use client';

/**
 * B.12 — Grilla de tracking de Edson.
 *
 * Réplica del Excel: una fila por caso MVA con SOLO su primera cita, agrupada
 * por día. Incluye citas pasadas (no-show, canceladas) — son las que persigue.
 *
 * Reparto de la edición (decidido con Erick sobre el mockup):
 *  · Un clic en la celda para lo rápido: PIP, completado y una entrada nueva de
 *    observaciones. Nada de doble clic: es invisible y no existe en móvil.
 *  · Modal para lo pesado (abogado, seguro, claim, adjuster, quiropráctico).
 *    Modal y NO panel lateral: todo el sistema es modal y un Sheet rompería el
 *    patrón. Como el modal tapa la fila, su encabezado repite paciente, caso,
 *    clínica y hora.
 *
 * Ver docs/plan-vista-edson.md
 */

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Search as SearchIcon, Check, ChevronLeft, ChevronRight, Pencil,
  Archive, ArchiveRestore, X, Loader2, MessageSquarePlus, AlertTriangle, Trash2, Users,
} from 'lucide-react';
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle,
         DialogDescription, DialogFooter, Label } from '@precision/ui';
import {
  PageHeader, FilterPill, IconAction, DataTable,
  TableFooter, EmptyState, Autocomplete, type AutoResult,
} from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { localeApp } from '@/lib/fechas';
import { ManagersPopover, ManagersSection, type SectionHandle } from './case-managers';
import { type AnchorRect } from './anchored-panel';
import { AdjustersPopover, AdjustersSection } from './case-adjusters';
import { apptVisual, apptRowBg, APPT_COLORS, MVA_FIRST_GLOW } from '@/lib/appointment-colors';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Row {
  caseId: string;
  caseCode: string;
  patient: { id: string; firstName: string; lastName: string; dateOfBirth: string | null; phone: string | null };
  appointment: {
    id: string; scheduledFor: string; status: string;
    /**
     * Estado de la cita mas RECIENTE del caso — de aca sale el color de la
     * franja. `status` es el de la primera, que es la que muestran las columnas.
     */
    latestStatus: string;
    clinicName: string | null; clinicColor: string | null; providerName: string | null;
    /**
     * Quien agendo la cita. NULL en las migradas del v2 — nunca pasaron por
     * este sistema y no hay a quien atribuirlas; el guion es la respuesta
     * correcta, no un hueco.
     */
    createdBy: string | null;
  };
  lawFirmId: string | null;
  attorneyId: string | null;
  firmName: string | null;
  attorneyName: string | null;
  attorneyEmail: string | null;
  chiropractor: string | null;
  carrierName: string | null;
  lossDate: string | null;
  claimNum: string | null;
  /**
   * Comentario del seguro. Es donde Edson escribe "PIP EXHAUSTED! Send lien
   * to…" cuando el caso no va por seguro sino por lien del abogado.
   */
  insComments: string | null;
  pipAvailable: 'YES' | 'NO' | 'UNKNOWN';
  adjusterName: string | null;
  adjusterPhone: string | null;
  adjusterExt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  lastNote: string | null;
  lastNoteAt: string | null;
  noteCount: number;
  /** Encargados del caso ACTIVOS — el badge de la columna Attorney. */
  managerCount: number;
  /** Adjusters ACTIVOS — el badge de la columna Adjuster. */
  adjusterCount: number;
}

interface Stats { total: number; no_pip: number; no_adjuster: number; completed: number; archivable: number }

interface Props {
  clinics:   { id: string; name: string; color: string | null }[];
  providers: { id: string; name: string }[];
  carriers:  { id: string; name: string; shortCode: string; color: string }[];
}

/**
 * Estados posibles y su clave de traducción.
 *
 * El selector mostraba el enum crudo (`SCHEDULED`, `NO_SHOW`), sin traducir y
 * en mayúsculas. Las etiquetas salen del namespace del calendario para que sea
 * el MISMO vocabulario en las dos pantallas: si acá dijera "Cancelada" y allá
 * "Anulada", Edson tendría que aprender dos.
 */
const APPT_STATUSES: Array<[value: string, tKey: string]> = [
  ['SCHEDULED',   'statusScheduled'],
  ['CONFIRMED',   'statusConfirmed'],
  ['CHECKED_IN',  'statusCheckedIn'],
  ['IN_PROGRESS', 'statusInProgress'],
  ['COMPLETED',   'statusCompleted'],
  ['PENDING',     'statusPending'],
  ['CANCELLED',   'statusCancelled'],
  ['NO_SHOW',     'statusNoShow'],
];

const PIP_CYCLE: Record<string, 'YES' | 'NO' | 'UNKNOWN'> = {
  UNKNOWN: 'YES', YES: 'NO', NO: 'UNKNOWN',
};

const DENVER = 'America/Denver';

/**
 * Verde de "listo para Brunella".
 *
 * Es fuerte a proposito: Edson escanea la grilla de un vistazo y necesita ver
 * cuales ya solto sin leer fila por fila.
 *
 * Va como valor y no como clase de Tailwind porque hay que aplicarlo TAMBIEN a
 * las celdas fijas. `DataTable.Td` les pone un fondo opaco (`STICKY_BODY_BG`)
 * para que el contenido no se transparente al scrollear en horizontal, y ese
 * fondo pisa el resaltado de la fila — justo en la columna del paciente, que es
 * la que mas se mira. El `color-mix` sobre `--bg-1` da el mismo tono en las dos.
 */
const READY_BG = 'var(--row-ready)';

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString(localeApp(), { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: DENVER });
}
function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit', timeZone: DENVER });
}
function fmtDayHeader(d: string): string {
  return new Date(d).toLocaleDateString(localeApp(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: DENVER });
}
/** Clave de agrupación: el día calendario en la zona de la clínica. */
function dayKey(d: string): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: DENVER });
}

function Empty() { return <span className="text-text-muted italic">—</span>; }

// ─── Componente ──────────────────────────────────────────────────────────────

export function EdsonClient({ clinics, providers, carriers }: Props) {
  const t    = useTranslations('phoenix.edsonTracking');
  const tc   = useTranslations('phoenix.common');
  // Las etiquetas de estado y de la leyenda se comparten con el calendario.
  const tcal = useTranslations('phoenix.calendar');
  const router = useRouter();

  const [archived, setArchived] = useState(false);
  const [q, setQ]               = useState('');
  const [qLive, setQLive]       = useState('');
  const [clinicId, setClinicId]     = useState('');
  const [providerId, setProviderId] = useState('');
  const [apptStatus, setApptStatus] = useState('');
  const [carrierId, setCarrierId]   = useState('');
  const [flag, setFlag]             = useState('');
  const [page, setPage]             = useState(1);

  const [rows, setRows]   = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, no_pip: 0, no_adjuster: 0, completed: 0, archivable: 0 });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [editingFocus, setEditingFocus] = useState<'managers' | 'adjusters' | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  /** Caso cuyo popover de encargados esta abierto. */
  const [managersFor, setManagersFor] = useState<string | null>(null);
  const [adjustersFor, setAdjustersFor] = useState<string | null>(null);
  /*
   * Rectangulo del boton que abrio el panel. El panel se renderiza en un portal
   * —fuera de la tabla, que lo recortaria— asi que necesita coordenadas de
   * viewport para colocarse. Se captura en el clic y no con un ref por fila:
   * solo hay un panel abierto a la vez.
   */
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);

  function openPanel(
    set: (v: string | null) => void, caseId: string, current: string | null, el: HTMLElement,
  ) {
    if (current === caseId) { set(null); return; }
    const r = el.getBoundingClientRect();
    setAnchorRect({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    set(caseId);
  }
  // Archivar saca la fila de la cola de trabajo: se confirma, como el resto de
  // las acciones que mueven algo de sitio en el sistema.
  const [confirmArchive, setConfirmArchive] = useState<Row | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  // Debounce del buscador: sin esto cada tecla dispara una consulta a Supabase.
  useEffect(() => {
    const id = setTimeout(() => { setQ(qLive); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [qLive]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const sp = new URLSearchParams({ page: String(page), size: '25', archived: String(archived) });
      if (q)          sp.set('q', q);
      if (clinicId)   sp.set('clinicId', clinicId);
      if (providerId) sp.set('providerId', providerId);
      if (apptStatus) sp.set('apptStatus', apptStatus);
      if (carrierId)  sp.set('carrierId', carrierId);
      if (flag)       sp.set('flag', flag);
      // La grilla se lee siempre por fecha de cita, más reciente primero —
      // igual que el Excel, que crece hacia abajo por jornada.
      sp.set('sort', 'appointment');
      sp.set('dir', 'desc');
      const res  = await fetch(`/api/admin/edson/tracking?${sp}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(t('errLoad')); return; }
      setRows(json.rows ?? []);
      setStats(json.stats ?? { total: 0, no_pip: 0, no_adjuster: 0, completed: 0, archivable: 0 });
      setTotalPages(json.totalPages ?? 1);
      setTotal(json.total ?? 0);
    } catch { setError(t('errLoad')); }
    finally { setLoading(false); }
  }, [page, archived, q, clinicId, providerId, apptStatus, carrierId, flag, t]);

  useEffect(() => { void load(); }, [load]);

  const anyFilter = !!(q || clinicId || providerId || apptStatus || carrierId || flag);
  function clearFilters() {
    setQLive(''); setQ(''); setClinicId(''); setProviderId('');
    setApptStatus(''); setCarrierId(''); setFlag(''); setPage(1);
  }

  /** Cambia un campo de la fila en pantalla sin recargar toda la tabla. */
  function patchRow(caseId: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => (r.caseId === caseId ? { ...r, ...patch } : r)));
  }

  async function cyclePip(row: Row) {
    const next = PIP_CYCLE[row.pipAvailable] ?? 'YES';
    patchRow(row.caseId, { pipAvailable: next });   // optimista
    const res = await fetch(`/api/admin/cases/${row.caseId}/auto-insurance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipAvailable: next }),
    });
    if (!res.ok) patchRow(row.caseId, { pipAvailable: row.pipAvailable }); // revierte
  }

  async function toggleDone(row: Row) {
    const next = row.completedAt ? null : new Date().toISOString();
    patchRow(row.caseId, { completedAt: next });
    const res = await fetch(`/api/admin/cases/${row.caseId}/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !row.completedAt }),
    });
    if (!res.ok) patchRow(row.caseId, { completedAt: row.completedAt });
  }

  async function setArchivedFlag(caseId: string, value: boolean) {
    const res = await fetch(`/api/admin/cases/${caseId}/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: value }),
    });
    if (res.ok) void load();
  }

  async function archiveReady() {
    // Solo los de la página visible: archivar a ciegas los que Edson no vio
    // sería tomarle una decisión que no tomó.
    const ready = rows.filter(r => r.completedAt && new Date(r.appointment.scheduledFor) < new Date());
    await Promise.all(ready.map(r =>
      fetch(`/api/admin/cases/${r.caseId}/tracking`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      }),
    ));
    void load();
  }

  async function addNote(caseId: string, body: string) {
    const res = await fetch(`/api/admin/cases/${caseId}/tracking/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    patchRow(caseId, {
      lastNote: json.note?.body ?? body,
      lastNoteAt: json.note?.createdAt ?? new Date().toISOString(),
      noteCount: (rows.find(r => r.caseId === caseId)?.noteCount ?? 0) + 1,
    });
    return true;
  }

  // Agrupación por día — como el Excel, que separa cada jornada.
  const groups: { key: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.appointment.scheduledFor);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.rows.push(r);
    else groups.push({ key: k, rows: [r] });
  }

  const readyToArchive = rows.filter(r => r.completedAt && new Date(r.appointment.scheduledFor) < new Date()).length;

  /*
   * El margen negativo cancela el `p-4 sm:p-6 lg:p-8` que el shell del admin le
   * pone a todas las paginas — hasta 32px muertos arriba. Edson pidio no perder
   * nada de alto, asi que se recupera casi todo y quedan 4px para que el titulo
   * no toque la barra superior. Solo el margen SUPERIOR: los laterales siguen
   * alineando con el resto de las pantallas.
   */
  return (
    <div className="space-y-2.5 -mt-3 sm:-mt-5 lg:-mt-7">
      {/*
        * Encabezado propio y no `PageHeader`, y todo en UNA fila: titulo, tabs y
        * leyenda. El primitivo usa `text-2xl` con subtitulo —bien en un catalogo,
        * aca eran ~90px antes de la primera fila— y esto eran tres renglones
        * para tres cosas cortas. Cada renglon que se va es una fila mas de la
        * tabla a la vista, que es lo unico que Edson mira.
        *
        * El subtitulo se retiro: decia "una fila por caso, solo la primera
        * cita", que el ya sabe.
        */}
      <div className="flex items-end gap-4 flex-wrap border-b border-border">
        <h1 className="text-lg font-bold text-text-1 leading-none pb-2">{t('title')}</h1>

        <div className="flex gap-1">
        {[false, true].map((isArch) => (
          <button
            key={String(isArch)}
            type="button"
            onClick={() => { setArchived(isArch); setPage(1); }}
            className={`px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              archived === isArch
                ? 'border-amber text-amber'
                : 'border-transparent text-text-3 hover:text-text-1'
            }`}
          >
            {isArch ? t('tabArchived') : t('tabTracking')}
          </button>
        ))}
        </div>

        {/*
          * La leyenda va JUNTO a los tabs y no en el borde opuesto: suelta a la
          * derecha se leia como un bloque aparte, sin relacion con la tabla.
          * Pegada al titulo se entiende que describe lo que viene abajo.
          */}
        <div className="pb-1.5">
          <StatusLegend />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5 items-center flex-wrap">
        <div className="relative flex-1 min-w-[190px] max-w-[260px]">
          <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input className="pl-8 !h-8 !text-[13px]" placeholder={t('searchPlaceholder')} value={qLive} onChange={e => setQLive(e.target.value)} />
        </div>
        <select value={clinicId} onChange={e => { setClinicId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allClinics')}</option>
          {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={providerId} onChange={e => { setProviderId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allProviders')}</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={apptStatus} onChange={e => { setApptStatus(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allStatuses')}</option>
          {APPT_STATUSES.map(([value, key]) => (
            <option key={value} value={value}>{tcal(key)}</option>
          ))}
        </select>
        <select value={carrierId} onChange={e => { setCarrierId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">{t('allCarriers')}</option>
          {carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {([
          ['noPip', t('flagNoPip')], ['noAdjuster', t('flagNoAdjuster')],
          ['noClaim', t('flagNoClaim')], ['noAttorney', t('flagNoAttorney')],
          ['completed', t('flagCompleted')], ['pending', t('flagPending')],
        ] as const).map(([k, label]) => (
          <FilterPill
            key={k}
            active={flag === k}
            label={label}
            onClick={() => { setFlag(flag === k ? '' : k); setPage(1); }}
          />
        ))}
        {anyFilter && (
          <button type="button" onClick={clearFilters} className="text-xs text-text-muted hover:text-text-1 underline underline-offset-2">
            {t('clearFilters')}
          </button>
        )}

      </div>

      {error && <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>}

      <DataTable.Card>
        {/*
          * Alto acotado para que el encabezado se congele al bajar: Edson
          * pidio verlo siempre, porque con 15 columnas no se acuerda de cual
          * es cual. Ver la nota de `DataTable.Scroll`.
          */}
        <DataTable.Scroll maxHeight="calc(100vh - 240px)">
          {/*
          * `text-[13px]` en vez del `text-sm` (14px) del primitivo: Edson pidio
          * bajar un punto SOLO el texto grande. Los datos secundarios —fecha de
          * nacimiento, telefono, clinica— ya tienen su propio tamaño y no se
          * tocan, si no quedarian ilegibles.
          */}
        <DataTable.Table gridLines className="text-[13px] [&_td]:!py-1.5 [&_th]:!py-2">
            <DataTable.Head>
              <DataTable.Th sticky="left">{t('colPatient')}</DataTable.Th>
              <DataTable.Th>{t('colTime')}</DataTable.Th>
              <DataTable.Th>{t('colProvider')}</DataTable.Th>
              <DataTable.Th>{t('colLossDate')}</DataTable.Th>
              <DataTable.Th>{t('colAttorney')}</DataTable.Th>
              <DataTable.Th>{t('colChiropractor')}</DataTable.Th>
              <DataTable.Th>{t('colCarrier')}</DataTable.Th>
              <DataTable.Th>{t('colClaim')}</DataTable.Th>
              <DataTable.Th align="center">{t('colPip')}</DataTable.Th>
              <DataTable.Th>{t('colAdjuster')}</DataTable.Th>
              <DataTable.Th>{t('colObservations')}</DataTable.Th>
              <DataTable.Th align="center">{t('colDone')}</DataTable.Th>
              {archived && <DataTable.Th>{t('colArchivedAt')}</DataTable.Th>}
              <DataTable.Th align="right" sticky="right">{tc('actions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><DataTable.Td colSpan={archived ? 14 : 13}>
                  <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
                  </div>
                </DataTable.Td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><DataTable.Td colSpan={archived ? 14 : 13}>
                  <EmptyState.Inline message={archived ? t('emptyArchived') : t('empty')} />
                </DataTable.Td></tr>
              )}

              {groups.map(group => (
                <Fragment key={group.key}>
                  <DataTable.GroupRow colSpan={archived ? 14 : 13}>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-text-3 whitespace-nowrap">
                      <span>{fmtDayHeader(group.rows[0].appointment.scheduledFor)}</span>
                      <span className="text-text-muted">
                        — {t('apptCount', { count: group.rows.length })}
                      </span>
                    </div>
                  </DataTable.GroupRow>

                  {group.rows.map(row => {
                    const done = !!row.completedAt;
                    // El color mira la cita mas reciente, no la primera: un no-show
                    // en la segunda visita tiene que pintar la fila igual.
                    const status = row.appointment.latestStatus ?? row.appointment.status;
                    const vis    = apptVisual(status);
                    /*
                     * Precedencia decidida con Erick: si la cita no ocurrio, ese
                     * fondo gana sobre el verde de "listo para Brunella". El
                     * hecho objetivo (no vino) pesa mas que el estado del trabajo
                     * de Edson, y el check verde sigue visible en su columna, asi
                     * que no se pierde nada.
                     */
                    const rowBg = apptRowBg(status) ?? (done ? READY_BG : undefined);
                    return (
                      <Fragment key={row.caseId}>
                      <DataTable.Row style={rowBg ? { background: rowBg } : undefined}>
                        <DataTable.Td sticky="left" style={rowBg ? { background: rowBg } : undefined}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-1 h-8 rounded-full shrink-0"
                              style={{
                                background: vis.background,
                                boxShadow: vis.glow ? MVA_FIRST_GLOW : undefined,
                              }}
                              title={row.appointment.latestStatus ?? row.appointment.status}
                            />
                            <div className="min-w-0">
                              <div
                                className="text-text-1 font-semibold truncate"
                                style={{ textDecoration: vis.strike ? 'line-through' : undefined }}
                              >
                                {row.patient.lastName}, {row.patient.firstName}
                              </div>
                              <div className="text-text-muted text-[11px] truncate font-mono">
                                {fmtDate(row.patient.dateOfBirth)}{row.patient.phone ? ` · ${row.patient.phone}` : ''}
                              </div>
                            </div>
                          </div>
                        </DataTable.Td>
                        <DataTable.Td>
                          <div className="whitespace-nowrap">
                            <span className="text-text-2">{fmtTime(row.appointment.scheduledFor)}</span>
                            {row.appointment.clinicName && (
                              <span className="flex items-center gap-1 text-[11px] text-text-muted mt-0.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ background: row.appointment.clinicColor ?? 'var(--text-muted)' }}
                                />
                                {row.appointment.clinicName}
                              </span>
                            )}
                          </div>
                        </DataTable.Td>
                        <DataTable.Td>
                          {/*
                            * "Creada por" baja como segunda linea del provider en
                            * vez de ocupar columna propia. Mismo recurso que ya
                            * usan paciente (DOB + telefono) y hora (+ clinica):
                            * es la unica forma real de bajar de 15 columnas sin
                            * perder dato.
                            */}
                          <div className="min-w-0">
                            <Txt v={row.appointment.providerName} />
                            {row.appointment.createdBy && (
                              <div className="text-[10.5px] text-text-muted truncate" title={t('colCreatedBy')}>
                                {t('createdByShort', { name: row.appointment.createdBy })}
                              </div>
                            )}
                          </div>
                        </DataTable.Td>
                        <DataTable.Td><span className="text-text-2 whitespace-nowrap">{row.lossDate ? fmtDate(row.lossDate) : <Empty />}</span></DataTable.Td>
                        <DataTable.Td>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => openPanel(setManagersFor, row.caseId, managersFor, e.currentTarget)}
                              title={t('managersOpen')}
                              className="text-left max-w-[170px] flex items-center gap-1.5 hover:text-text-1"
                            >
                              <Txt v={row.attorneyName ?? row.firmName} />
                              {/*
                                * El badge sale SIEMPRE, tambien en 0. Antes solo
                                * aparecia con datos, asi que una celda vacia no
                                * daba ninguna pista de que ahi se podia hacer
                                * clic — Edson reporto estos pedidos como "no
                                * implementados" justo por eso.
                                */}
                              <span className={`shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 rounded-full ${
                                row.managerCount > 0
                                  ? 'bg-brand/15 text-brand-text'
                                  : 'border border-dashed border-border-strong text-text-muted'
                              }`}>
                                <Users className="w-2.5 h-2.5" />{row.managerCount}
                              </span>
                            </button>
                            {managersFor === row.caseId && anchorRect && (
                              <ManagersPopover
                                caseId={row.caseId}
                                rect={anchorRect}
                                attorneyName={row.attorneyName}
                                firmName={row.firmName}
                                attorneyEmail={row.attorneyEmail}
                                onClose={() => setManagersFor(null)}
                                onAdd={() => { setEditingFocus('managers'); setEditing(row); }}
                              />
                            )}
                          </div>
                        </DataTable.Td>
                        <DataTable.Td><Txt v={row.chiropractor} /></DataTable.Td>
                        <DataTable.Td><Txt v={row.carrierName} /></DataTable.Td>
                        <DataTable.Td>{row.claimNum ? <span className="font-mono text-xs text-text-2">{row.claimNum}</span> : <Empty />}</DataTable.Td>
                        <DataTable.Td align="center">
                          <PipChip row={row} readOnly={archived} onCycle={() => void cyclePip(row)} />
                        </DataTable.Td>
                        <DataTable.Td>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => openPanel(setAdjustersFor, row.caseId, adjustersFor, e.currentTarget)}
                              title={t('adjustersOpen')}
                              className="text-left max-w-[150px] flex items-center gap-1.5 hover:text-text-1"
                            >
                              {/*
                                * El telefono baja como segunda linea en vez de
                                * ocupar columna propia. Mismo recurso que ya usan
                                * paciente (DOB + telefono) y hora (+ clinica): es
                                * la unica forma real de bajar de 15 columnas sin
                                * perder dato.
                                */}
                              <span className="min-w-0">
                                <Txt v={row.adjusterName} />
                                {row.adjusterPhone && (
                                  <span className="block text-[10.5px] text-text-muted font-mono truncate">
                                    {row.adjusterPhone}{row.adjusterExt ? ` ext. ${row.adjusterExt}` : ''}
                                  </span>
                                )}
                              </span>
                              <span className={`shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 rounded-full ${
                                row.adjusterCount > 0
                                  ? 'bg-brand/15 text-brand-text'
                                  : 'border border-dashed border-border-strong text-text-muted'
                              }`}>
                                <Users className="w-2.5 h-2.5" />{row.adjusterCount}
                              </span>
                            </button>
                            {adjustersFor === row.caseId && anchorRect && (
                              <AdjustersPopover
                                caseId={row.caseId}
                                rect={anchorRect}
                                onClose={() => setAdjustersFor(null)}
                                onAdd={() => { setEditingFocus('adjusters'); setEditing(row); }}
                              />
                            )}
                          </div>
                        </DataTable.Td>
                        <DataTable.Td>
                          <div className="relative">
                            <NoteCell row={row} onOpen={() => setNoteFor(row.caseId)} />
                            {noteFor === row.caseId && (
                              <NotesPopover
                                caseId={row.caseId}
                                readOnly={archived}
                                onClose={() => setNoteFor(null)}
                                onAdded={(body, count) => patchRow(row.caseId, {
                                  lastNote: body, lastNoteAt: new Date().toISOString(), noteCount: count,
                                })}
                              />
                            )}
                          </div>
                        </DataTable.Td>
                        <DataTable.Td align="center">
                          {archived ? (
                            done
                              ? <Check className="w-3.5 h-3.5 text-emerald inline" strokeWidth={3} />
                              : <Empty />
                          ) : (
                            <button
                              type="button"
                              onClick={() => void toggleDone(row)}
                              title={done ? t('markUndone') : t('markDone')}
                              aria-pressed={done}
                              className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] grid place-items-center transition-colors ${
                                done ? 'bg-emerald border-emerald' : 'border-border-strong hover:border-text-3'
                              }`}
                            >
                              {done && <Check className="w-3 h-3 text-bg-0" strokeWidth={3.4} />}
                            </button>
                          )}
                        </DataTable.Td>
                        {archived && (
                          <DataTable.Td>
                            <span className="text-text-muted text-xs whitespace-nowrap">
                              {row.archivedAt ? fmtDate(row.archivedAt) : <Empty />}
                            </span>
                          </DataTable.Td>
                        )}
                        <DataTable.Td align="right" sticky="right" style={rowBg ? { background: rowBg } : undefined}>
                          <div className="flex items-center justify-end gap-1">
                            {archived ? (
                              <IconAction icon={ArchiveRestore} label={t('restore')} onClick={() => void setArchivedFlag(row.caseId, false)} />
                            ) : (
                              <>
                                <IconAction icon={Pencil} label={t('openCase')} onClick={() => setEditing(row)} />
                                <IconAction icon={Archive} label={t('archiveOne')} onClick={() => setConfirmArchive(row)} />
                              </>
                            )}
                          </div>
                        </DataTable.Td>
                      </DataTable.Row>

                      {/*
                        * Banda del comentario del seguro, a todo lo ancho.
                        *
                        * Es donde Edson escribe "PIP EXHAUSTED! Send lien to…"
                        * cuando el caso no va por seguro sino por lien del
                        * abogado. En su Excel ocupa el renglón entero para que
                        * no se pierda entre las columnas, y acá hace lo mismo:
                        * esconderlo tras un icono sería quitarle justo lo que
                        * lo hace útil.
                        */}
                      {row.insComments && (
                        <tr>
                          <DataTable.Td
                            colSpan={archived ? 14 : 13}
                            className="!py-1.5"
                            style={rowBg ? { background: rowBg } : undefined}
                          >
                            {/*
                              * `sticky left-4` por lo mismo que la fila de
                              * grupo: el <td> ocupa todo el ancho de la tabla,
                              * asi que al scrollear en horizontal el texto se
                              * iba de pantalla y la banda quedaba vacia — justo
                              * el aviso que tiene que verse siempre.
                              */}
                            <div className="sticky left-4 w-fit flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                              <span className="text-[12.5px] text-text-1 font-medium whitespace-pre-wrap">
                                {row.insComments}
                              </span>
                            </div>
                          </DataTable.Td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>

        <TableFooter
          left={t('showing', { shown: rows.length, total })}
          right={
            <span className="flex items-center gap-3">
              <span className="text-text-muted">{t('page', { page, pages: totalPages })}</span>
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                      className="p-1 rounded disabled:opacity-30 hover:text-text-1"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                      className="p-1 rounded disabled:opacity-30 hover:text-text-1"><ChevronRight className="w-4 h-4" /></button>
            </span>
          }
        />
      </DataTable.Card>

      {!archived && readyToArchive > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg bg-bg-1 px-4 py-3">
          <span className="text-sm text-text-2">{t('archiveBulkHint', { count: readyToArchive })}</span>
          <span className="flex-1" />
          <Button onClick={() => setConfirmBulk(true)}>
            <Archive className="w-3.5 h-3.5 mr-1" /> {t('archiveBulk', { count: readyToArchive })}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmArchive}
        variant="warning"
        title={t('confirmArchiveTitle')}
        description={t('confirmArchiveBody', {
          name: confirmArchive ? `${confirmArchive.patient.lastName}, ${confirmArchive.patient.firstName}` : '',
        })}
        confirmLabel={t('archiveOne')}
        cancelLabel={tc('cancel')}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={() => {
          const row = confirmArchive;
          setConfirmArchive(null);
          if (row) void setArchivedFlag(row.caseId, true);
        }}
      />

      <ConfirmDialog
        open={confirmBulk}
        variant="warning"
        title={t('confirmArchiveBulkTitle')}
        description={t('confirmArchiveBulkBody', { count: readyToArchive })}
        confirmLabel={t('archiveBulk', { count: readyToArchive })}
        cancelLabel={tc('cancel')}
        onCancel={() => setConfirmBulk(false)}
        onConfirm={() => { setConfirmBulk(false); void archiveReady(); }}
      />

      {editing && (
        <TrackingDialog
          row={editing}
          carriers={carriers}
          focus={editingFocus}
          onCountsChanged={() => void load()}
          onClose={() => { setEditing(null); setEditingFocus(null); }}
          onSaved={() => { setEditing(null); setEditingFocus(null); void load(); router.refresh(); }}
        />
      )}
    </div>
  );
}

// Compacto a proposito: son cuatro selectores en una fila y Edson pidio
// recuperar ese alto para las filas de la tabla.
const selectCls =
  'bg-bg-2 border border-border rounded-md px-2 py-1 h-8 text-[13px] text-text-1 focus:outline-none focus:border-brand max-w-[160px]';

/**
 * Leyenda de colores de la franja de cada fila.
 *
 * Deliberadamente SIN borde ni fondo, y en `text-muted`: al lado hay una tira de
 * pills que sí filtran, y si la leyenda se pareciera a ellas Edson intentaría
 * hacerle clic. Se lee como rótulo, no como control.
 *
 * Muestra 5 de los 8 colores del calendario. Los otros tres —MVA seguimiento,
 * GM seguimiento y GM 1ra cita— NO pueden aparecer acá: cada fila es, por
 * definición, la PRIMERA cita de un caso MVA. Enseñarlos sería enseñar colores
 * que nunca se van a ver.
 */
function StatusLegend() {
  const t    = useTranslations('phoenix.edsonTracking');
  const tcal = useTranslations('phoenix.calendar');

  const items: Array<{ bg: string; label: string; glow?: boolean; strike?: boolean }> = [
    { bg: APPT_COLORS.mvaFirst,    label: tcal('legendMvaFirst'), glow: true },
    { bg: APPT_COLORS.unconfirmed, label: tcal('legendUnconfirmed') },
    { bg: APPT_COLORS.attended,    label: tcal('legendAttended') },
    // Estas dos NO usan el color del calendario: la fila entera se pinta con el
    // amarillo y el rosa del Excel de Edson, y la leyenda tiene que mostrar lo
    // que el ve. Enseñarle el gris del calendario seria enseñarle algo que no
    // pasa en esta pantalla.
    { bg: 'var(--row-cancelled)',  label: tcal('legendCancelled'), strike: true },
    { bg: 'var(--row-no-show)',    label: tcal('legendNoShow'),    strike: true },
  ];

  return (
    <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap px-0.5">
      <span className="text-[9px] uppercase tracking-wider font-semibold text-text-muted">
        {t('legendTitle')}
      </span>
      {items.map(item => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className="w-3 h-1.5 rounded-sm shrink-0 border border-border-strong"
            style={{ background: item.bg, boxShadow: item.glow ? MVA_FIRST_GLOW : undefined }}
          />
          <span
            className="text-[11px] text-text-muted"
            style={{ textDecoration: item.strike ? 'line-through' : undefined }}
          >
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function PipChip({ row, readOnly, onCycle }: { row: Row; readOnly: boolean; onCycle: () => void }) {
  const t = useTranslations('phoenix.edsonTracking');
  const label = row.pipAvailable === 'YES' ? t('pipYes') : row.pipAvailable === 'NO' ? t('pipNo') : t('pipUnknown');
  const tone =
    row.pipAvailable === 'YES' ? 'bg-emerald/15 text-emerald border-emerald/30'
    : row.pipAvailable === 'NO' ? 'bg-rose/15 text-rose border-rose/30'
    : 'text-text-muted border-dashed border-border-strong';
  const base = `min-w-[38px] inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold border ${tone}`;

  if (readOnly) return <span className={base}>{label}</span>;
  return (
    <button type="button" onClick={onCycle} title={t('pipSet')}
            className={`${base} transition-colors hover:text-text-1`}>
      {label}
    </button>
  );
}

function Txt({ v }: { v: string | null }) {
  if (!v) return <Empty />;
  return <span className="text-text-2 truncate block max-w-[160px]" title={v}>{v}</span>;
}

// ─── Celda de observaciones ──────────────────────────────────────────────────

/**
 * Celda de observaciones — solo muestra y abre.
 *
 * Antes el clic abria un compositor para AGREGAR, y para LEER una nota larga
 * habia que abrir el modal. Edson pregunto justo eso: "si escribo un parrafo,
 * donde lo leo entero". Ahora el clic abre un popover con el texto completo, y
 * agregar es una accion dentro de ese popover.
 */
function NoteCell({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const t = useTranslations('phoenix.edsonTracking');

  return (
    <button
      type="button"
      onClick={onOpen}
      title={row.lastNote ? t('notesOpen') : t('addNote')}
      className="text-left max-w-[240px] w-full hover:text-text-1"
    >
      {row.lastNote ? (
        <>
          <span className="text-[12.5px] text-text-2 line-clamp-2">
            <span className="text-text-muted font-mono">{fmtDate(row.lastNoteAt)} · </span>
            {row.lastNote}
          </span>
          <span className="block text-[10.5px] text-text-muted mt-0.5">
            {t('noteCount', { count: row.noteCount })}
          </span>
        </>
      ) : (
        <span className="text-[12px] text-text-muted italic flex items-center gap-1">
          <MessageSquarePlus className="w-3 h-3" /> {t('addNote')}
        </span>
      )}
    </button>
  );
}

/**
 * Todas las observaciones del caso, completas.
 *
 * El texto va SIN recortar y con `whitespace-pre-wrap`: Edson escribe parrafos
 * enteros explicando la situacion del caso, y en la celda solo caben dos lineas.
 */
function NotesPopover({
  caseId, readOnly, onClose, onAdded,
}: {
  caseId: string;
  readOnly: boolean;
  onClose: () => void;
  onAdded: (body: string, count: number) => void;
}) {
  const t  = useTranslations('phoenix.edsonTracking');
  const tc = useTranslations('phoenix.common');
  const [notes, setNotes]   = useState<{ id: string; body: string; authorName: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`/api/admin/cases/${caseId}/tracking`);
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setNotes(json.notes ?? []);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  async function add() {
    const body = value.trim();
    if (!body) return;
    setSaving(true);
    try {
      const res  = await fetch(`/api/admin/cases/${caseId}/tracking/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      const note = json.note ?? { id: String(Date.now()), body, authorName: null, createdAt: new Date().toISOString() };
      setNotes(prev => [note, ...prev]);
      setValue('');
      onAdded(body, notes.length + 1);
    } finally { setSaving(false); }
  }

  return (
    /*
     * Modal ancho y no panel flotante, por dos razones:
     *
     *  · Dentro de la tabla quedaba RECORTADO — `DataTable.Card` tiene
     *    `overflow-hidden` y el scroll tiene alto acotado, asi que se veia
     *    cortado "por debajo" de la grilla.
     *  · Edson escribe parrafos enteros. En 340px no se lee nada; acá el texto
     *    va completo, sin recortar y respetando los saltos de linea.
     */
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('groupNotes')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[55vh] overflow-y-auto scroll-thin pr-1">
          {loading && (
            <div className="flex items-center gap-2 text-text-muted text-[12px] py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> …
            </div>
          )}
          {!loading && notes.length === 0 && (
            <p className="text-text-muted text-[13px] italic">{t('noNotes')}</p>
          )}
          {notes.map(n => (
            <div key={n.id} className="border-l-2 border-border-strong pl-3">
              <div className="text-[11px] text-text-muted font-mono">
                {fmtDate(n.createdAt)} {fmtTime(n.createdAt)}{n.authorName ? ` · ${n.authorName}` : ''}
              </div>
              <div className="text-[13px] text-text-1 whitespace-pre-wrap break-words leading-relaxed">
                {n.body}
              </div>
            </div>
          ))}
        </div>

        {!readOnly && (
          <div className="pt-2 border-t border-border">
            <textarea
              rows={4}
              value={value}
              disabled={saving}
              onChange={e => setValue(e.target.value)}
              placeholder={t('newNotePlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-[13px] text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-y min-h-[90px]"
            />
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>{tc('close')}</Button>
          {!readOnly && (
            <Button className="w-full sm:w-auto" onClick={() => void add()} disabled={saving || !value.trim()}>
              {saving ? tc('saving') : t('saveNote')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Una entrada de las observaciones, corregible en el sitio (dentro del modal).
 *
 * Edson dijo que reescribe estas notas todo el tiempo. Se mantiene el timeline
 * con fecha y autor: corregir una entrada no la convierte en un campo que se
 * sobrescribe.
 */
function NoteEntry({
  caseId, note, onChanged,
}: {
  caseId: string;
  note: { id: string; body: string; authorName: string | null; createdAt: string };
  /** `null` = la entrada se borró. */
  onChanged: (body: string | null) => void;
}) {
  const t  = useTranslations('phoenix.edsonTracking');
  const tc = useTranslations('phoenix.common');
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(note.body);
  const [busy, setBusy]       = useState(false);

  async function save() {
    const body = value.trim();
    if (!body || body === note.body) { setEditing(false); setValue(note.body); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/tracking/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: note.id, body }),
      });
      if (res.ok) { onChanged(body); setEditing(false); }
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/cases/${caseId}/tracking/notes?noteId=${encodeURIComponent(note.id)}`,
        { method: 'DELETE' },
      );
      if (res.ok) onChanged(null);
    } finally { setBusy(false); }
  }

  return (
    <div className="border-l-2 border-border-strong pl-3 group/note">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-text-muted font-mono">
          {fmtDate(note.createdAt)} {fmtTime(note.createdAt)}{note.authorName ? ` · ${note.authorName}` : ''}
        </span>
        {!editing && (
          <span className="flex items-center gap-0.5 opacity-0 group-hover/note:opacity-100 focus-within:opacity-100">
            <button type="button" onClick={() => setEditing(true)} title={tc('edit')}
                    className="p-0.5 rounded text-text-muted hover:text-text-1">
              <Pencil className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => void remove()} disabled={busy} title={tc('delete')}
                    className="p-0.5 rounded text-text-muted hover:text-rose">
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-1">
          <textarea
            autoFocus
            rows={3}
            value={value}
            disabled={busy}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setValue(note.body); } }}
            className="w-full bg-bg-2 border border-border rounded-md px-2 py-1.5 text-[12.5px] text-text-1 focus:outline-none focus:border-brand resize-none"
          />
          <div className="flex items-center gap-2 mt-1">
            <button type="button" onClick={() => void save()} disabled={busy}
                    className="text-[11px] text-brand-text hover:underline disabled:opacity-50">
              {tc('save')}
            </button>
            <button type="button" onClick={() => { setEditing(false); setValue(note.body); }}
                    className="text-[11px] text-text-muted hover:text-text-1">
              {tc('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[12.5px] text-text-2 whitespace-pre-wrap break-words">{note.body}</div>
      )}
    </div>
  );
}

// ─── Modal de edición ────────────────────────────────────────────────────────

function TrackingDialog({
  row, carriers, focus, onClose, onSaved, onCountsChanged,
}: {
  row: Row;
  carriers: { id: string; name: string }[];
  /** Seccion a la que saltar al abrir, cuando se llega desde un popover. */
  focus?: 'managers' | 'adjusters' | null;
  onClose: () => void;
  onSaved: () => void;
  /**
   * Asignar un encargado o un adjuster guarda al instante, sin pasar por
   * "Guardar cambios" — asi que la grilla tiene que recargar ahi mismo o el
   * badge se queda en 0 aunque la persona ya este asignada.
   */
  onCountsChanged: () => void;
}) {
  const t  = useTranslations('phoenix.edsonTracking');
  const tc = useTranslations('phoenix.common');

  const [carrierId, setCarrierId] = useState('');
  const [claimNum, setClaimNum]   = useState(row.claimNum ?? '');
  const [lossDate, setLossDate]   = useState(row.lossDate ? row.lossDate.slice(0, 10) : '');
  const [pip, setPip]             = useState<'YES' | 'NO' | 'UNKNOWN'>(row.pipAvailable);
  const [chiropractor, setChiro]  = useState(row.chiropractor ?? '');
  const [insComments, setInsComments] = useState(row.insComments ?? '');
  const managersRef  = useRef<HTMLDivElement>(null);
  const adjustersRef = useRef<HTMLDivElement>(null);
  // Handles para que "Guardar cambios" confirme lo que quedo escrito en esas
  // secciones y no solo los campos del caso.
  const managersApi  = useRef<SectionHandle>(null);
  const adjustersApi = useRef<SectionHandle>(null);

  // Al llegar desde "Agregar encargado", el modal salta a esa seccion en vez de
  // dejar al usuario buscandola. El timeout espera a que el dialogo termine de
  // montarse: sin el, el scroll ocurre antes de que haya a donde scrollear.
  useEffect(() => {
    if (!focus) return;
    const target = focus === 'managers' ? managersRef : adjustersRef;
    const id = setTimeout(() => {
      target.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(id);
  }, [focus]);
  // El bufete manda sobre el abogado: los abogados se buscan DENTRO del bufete,
  // que es como estan modelados (`Lawyer.parentFirmId`) y como ya lo hace el
  // wizard de alta de caso. Cambiar de bufete limpia el abogado a proposito.
  const [lawFirm, setLawFirm] = useState<AutoResult | null>(
    row.lawFirmId ? { id: row.lawFirmId, label: row.firmName ?? '—' } : null,
  );
  const [attorney, setAttorney] = useState<AutoResult | null>(
    row.attorneyId ? { id: row.attorneyId, label: row.attorneyName ?? '—' } : null,
  );
  const [firmMembers, setFirmMembers] = useState<{ id: string; label: string; subtitle?: string }[]>([]);
  const [notes, setNotes] = useState<{ id: string; body: string; authorName: string | null; createdAt: string }[]>([]);
  const [newNote, setNewNote] = useState('');
  // Mismo dato que el check de la grilla (`CaseTracking.completedAt`): es el
  // acto de Edson diciendo "ya tengo todo, esto pasa a facturación". No es un
  // tercer estado, es el mismo con el nombre que de verdad tiene.
  const [readyForBrunella, setReadyForBrunella] = useState(!!row.completedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Miembros del bufete, para asignar un encargado sin volver a escribirlo.
  useEffect(() => {
    const firmId = lawFirm?.id;
    if (!firmId) { setFirmMembers([]); return; }
    let cancelled = false;
    (async () => {
      const res  = await fetch(`/api/admin/lawyers/autocomplete?firmId=${encodeURIComponent(firmId)}`);
      const json = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) setFirmMembers(json.results ?? []);
    })();
    return () => { cancelled = true; };
  }, [lawFirm?.id]);

  // Carga el detalle al abrir: la grilla trae solo lo que se ve en la fila.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ai, tr] = await Promise.all([
        fetch(`/api/admin/cases/${row.caseId}/auto-insurance`).then(r => r.json()).catch(() => null),
        fetch(`/api/admin/cases/${row.caseId}/tracking`).then(r => r.json()).catch(() => null),
      ]);
      if (cancelled) return;
      if (ai?.autoInsurance) {
        setCarrierId(ai.autoInsurance.carrierId ?? '');
      }
      if (tr?.notes) setNotes(tr.notes);
    })();
    return () => { cancelled = true; };
  }, [row.caseId]);

  // Miembros del bufete, para elegir un encargado sin escribirlo de nuevo.
  useEffect(() => {
    const firmId = lawFirm?.id;
    if (!firmId) { setFirmMembers([]); return; }
    let cancelled = false;
    (async () => {
      const res  = await fetch(`/api/admin/lawyers/autocomplete?firmId=${encodeURIComponent(firmId)}`);
      const json = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) setFirmMembers(json.results ?? []);
    })();
    return () => { cancelled = true; };
  }, [lawFirm?.id]);

  async function save() {
    setSaving(true); setError('');
    try {
      // Primero lo que quedo escrito en las secciones: si Edson lleno el
      // formulario del encargado y pulso "Guardar cambios" sin tocar el boton
      // de adentro, se guarda igual.
      await managersApi.current?.flush();
      await adjustersApi.current?.flush();

      const r1 = await fetch(`/api/admin/cases/${row.caseId}/auto-insurance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrierId: carrierId || null,
          claimNum: claimNum.trim() || null,
          lossDate: lossDate || null,
          pipAvailable: pip,
          comments: insComments.trim() || null,
        }),
      });
      if (!r1.ok) { setError(t('errSave')); return; }

      // El quiropractico, el bufete y el abogado viven en el caso, no en el
      // seguro — y se mandan en UN solo PATCH para no dejar el caso a medias si
      // la segunda llamada falla.
      const casePatch: Record<string, unknown> = {};
      if ((row.chiropractor ?? '') !== chiropractor) casePatch.chiropractor = chiropractor.trim() || null;
      if ((row.lawFirmId ?? null) !== (lawFirm?.id ?? null)) casePatch.lawFirmId = lawFirm?.id ?? null;
      if ((row.attorneyId ?? null) !== (attorney?.id ?? null)) casePatch.attorneyId = attorney?.id ?? null;
      if (Object.keys(casePatch).length > 0) {
        const r2 = await fetch(`/api/admin/cases/${row.caseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(casePatch),
        });
        if (!r2.ok) { setError(t('errSave')); return; }
      }

      if (newNote.trim()) {
        await fetch(`/api/admin/cases/${row.caseId}/tracking/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: newNote.trim() }),
        });
      }

      if (readyForBrunella !== !!row.completedAt) {
        await fetch(`/api/admin/cases/${row.caseId}/tracking`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: readyForBrunella }),
        });
      }
      onSaved();
    } catch { setError(t('errSave')); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row.patient.lastName}, {row.patient.firstName}</DialogTitle>
          <DialogDescription>
            {t('modalSubtitle', {
              caseCode: row.caseCode,
              clinic: row.appointment.clinicName ?? '—',
              date: `${fmtDate(row.appointment.scheduledFor)} ${fmtTime(row.appointment.scheduledFor)}`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 scroll-thin">
          <div className="text-amber text-[10.5px] uppercase tracking-wider font-semibold">{t('groupLegal')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t('fieldFirm')}</Label>
              <Autocomplete
                endpoint="/api/admin/lawyers/autocomplete"
                placeholder={t('fieldFirmPlaceholder')}
                selected={lawFirm}
                onSelect={(r) => { setLawFirm(r); setAttorney(null); }}
              />
            </div>
            <div>
              <Label>{t('fieldAttorney')}</Label>
              {lawFirm ? (
                <Autocomplete
                  endpoint="/api/admin/lawyers/autocomplete"
                  extraParams={{ firmId: lawFirm.id }}
                  placeholder={t('fieldAttorneyPlaceholder')}
                  selected={attorney}
                  onSelect={setAttorney}
                />
              ) : (
                <div className="bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-muted italic">
                  {t('fieldAttorneyNeedsFirm')}
                </div>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="tr-chiro">{t('fieldChiropractor')}</Label>
            <Input id="tr-chiro" value={chiropractor} onChange={e => setChiro(e.target.value)} />
          </div>

          {/*
            * Los encargados van DENTRO del bloque Legal: son la gente del
            * bufete, no un tema aparte. Estaban al final del modal y desde el
            * popover habia que bajar a buscarlos.
            */}
          <div ref={managersRef} className="text-amber text-[10.5px] uppercase tracking-wider font-semibold pt-2">
            {t('groupManagers')}
          </div>
          <ManagersSection
            caseId={row.caseId}
            lawFirmId={lawFirm?.id ?? null}
            firmMembers={firmMembers}
            autoOpen={focus === 'managers'}
            onChanged={onCountsChanged}
            handleRef={managersApi}
          />

          <div className="text-amber text-[10.5px] uppercase tracking-wider font-semibold pt-2">{t('groupInsurance')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tr-carrier">{t('fieldCarrier')}</Label>
              <select id="tr-carrier" value={carrierId} onChange={e => setCarrierId(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                <option value="">{row.carrierName ? `${row.carrierName} (${t('fromCase')})` : '—'}</option>
                {carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="tr-loss">{t('fieldLossDate')}</Label>
              <input id="tr-loss" type="date" value={lossDate} onChange={e => setLossDate(e.target.value)}
                     className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 [color-scheme:dark] focus:outline-none focus:border-brand" />
            </div>
            <div>
              <Label htmlFor="tr-claim">{t('fieldClaim')}</Label>
              <Input id="tr-claim" value={claimNum} onChange={e => setClaimNum(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tr-pip">{t('fieldPip')}</Label>
              <select id="tr-pip" value={pip} onChange={e => setPip(e.target.value as 'YES' | 'NO' | 'UNKNOWN')}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand">
                <option value="UNKNOWN">— {t('kpiNoPipSub')}</option>
                <option value="YES">Y</option>
                <option value="NO">N</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="tr-ins-comments">{t('insComments')}</Label>
            <textarea
              id="tr-ins-comments"
              rows={2}
              value={insComments}
              onChange={e => setInsComments(e.target.value)}
              placeholder={t('insCommentsPh')}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none"
            />
            <p className="text-[11px] text-text-muted mt-1">{t('insCommentsHint')}</p>
          </div>

          <div ref={adjustersRef} className="text-amber text-[10.5px] uppercase tracking-wider font-semibold pt-2">
            {t('groupAdjusters')}
          </div>
          <AdjustersSection caseId={row.caseId} autoOpen={focus === 'adjusters'} onChanged={onCountsChanged} handleRef={adjustersApi} />

          <div className="text-amber text-[10.5px] uppercase tracking-wider font-semibold pt-2">{t('groupNotes')}</div>
          <div className="space-y-2.5">
            {notes.length === 0 && <p className="text-[12px] text-text-muted italic">{t('noNotes')}</p>}
            {notes.map(n => (
              <NoteEntry
                key={n.id}
                caseId={row.caseId}
                note={n}
                onChanged={(body) => setNotes(prev =>
                  body === null
                    ? prev.filter(x => x.id !== n.id)
                    : prev.map(x => (x.id === n.id ? { ...x, body } : x)))}
              />
            ))}
          </div>
          <div>
            <Label htmlFor="tr-note">{t('newNote')}</Label>
            <textarea id="tr-note" rows={2} value={newNote} onChange={e => setNewNote(e.target.value)}
                      placeholder={t('newNotePlaceholder')}
                      className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none" />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer rounded-lg bg-bg-1 px-3 py-2.5 mt-2">
            <input
              type="checkbox"
              checked={readyForBrunella}
              onChange={e => setReadyForBrunella(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald mt-0.5 shrink-0"
            />
            <span>
              <span className="text-sm text-text-1 font-medium">{t('readyForBrunella')}</span>
              <span className="block text-[11px] text-text-muted">{t('readyForBrunellaHint')}</span>
            </span>
          </label>

          {error && <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>{tc('cancel')}</Button>
          <Button className="w-full sm:w-auto" onClick={() => void save()} disabled={saving}>
            {saving ? tc('saving') : tc('saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
