'use client';

/**
 * El detalle de UN provider, sobre la lista.
 *
 * Dos niveles adentro del mismo modal:
 *   1. sus números + sus visitas, con los filtros por categoría
 *   2. la nota de una visita — se lee, o se edita si es borrador
 *
 * Va como modal y no como página porque el supervisor está recorriendo la
 * lista: entrar y salir de una ruta por cada provider le haría perder el lugar
 * (Erick, 2-sep-2026).
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTitle } from '@precision/ui';
import { AlertTriangle, ArrowLeft, Ban, Bell, Check, Download, FileText, Loader2, Printer, Search, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { ChargePickerDialog, type BillableItem } from '@/components/visit/charge-picker-dialog';
import { agregarCargo, leerCargos, type PlannedService } from '@/lib/charges';
import { DataTable, EmptyState, TagPill, PersonAvatar, FilterPill } from '@/components/ui-phoenix';
import { VisitNoteEditor, type VisitNoteData } from '@/components/visit/visit-note-editor';
import type { PickableTemplate } from '@/components/visit/template-picker';
import { localeApp } from '@/lib/fechas';
import type { EstadoNota, EtapaVisita } from '@/lib/notes-audit';
import type { ProviderNotesRow } from '@/lib/notes-summary';
import type { VisitaDelProvider } from '@/app/api/admin/notes/provider/[providerId]/route';

const CATEGORIAS = ['none', 'draft', 'signed'] as const;
type Categoria = typeof CATEGORIAS[number];

const ESTADO_STYLE: Record<EstadoNota, string> = {
  none:   'bg-rose/15 text-rose border-rose/30',
  draft:  'bg-amber/15 text-amber border-amber/30',
  signed: 'bg-emerald/15 text-emerald border-emerald/30',
  voided: 'bg-bg-3 text-text-muted border-border',
};

/**
 * El desenlace, con el MISMO vocabulario que Mi Día y Day Admission — y las
 * mismas claves de i18n (`phoenix.admission`). Tres pantallas que sellan el
 * estado de una cita no pueden llamarlo de tres maneras.
 */
type Desenlace = 'noShow' | 'cancel' | 'cancelSameDay';

/** Consumió el horario → corresponde penalidad (ver lib/appointment-outcome). */
const cobraPenalidad = (tipo: Desenlace): boolean => tipo !== 'cancel';

/**
 * Dónde SE OFRECE sellar el desenlace: solo donde hay duda de que el paciente
 * llegara a atenderse.
 *
 * `enSala` y `atendida` quedan afuera a propósito. Si la cita tiene
 * `admittedAt`, el paciente estuvo en el consultorio: ofrecer ahí "no vino"
 * sería ofrecer registrar algo falso —y cobrarle una penalidad por una visita
 * que sí ocurrió—. Lo que falta en esas es cerrar la visita y firmar, no
 * cambiarle el estado.
 */
const ETAPAS_EN_DUDA = new Set<EtapaVisita>(['llegoSinSala', 'sinLlegada']);

/**
 * Hasta dónde llegó la visita.
 *
 * "Sin nota" a secas acusa al médico y esconde lo que de verdad pasó: de las 37
 * sin nota que hay hoy, 31 son visitas cuyo flujo quedó trabado a mitad de
 * camino —el paciente llegó y nadie lo pasó a sala, o la consulta se abrió y no
 * se cerró— y solo 6 son el caso clásico de "falta escribirla". Cada una le
 * habla a una persona distinta, y sin esto las tres se leen igual.
 *
 * `atendida` NO se dibuja: es el camino feliz, y repetirlo en cada fila sería
 * ruido sobre la mitad de la tabla. Acá se muestra la ANOMALÍA; adentro, al
 * abrir una visita sin nota, se explican las cuatro.
 */
const ETAPA_STYLE: Record<EtapaVisita, string> = {
  sinLlegada:   'text-amber',
  llegoSinSala: 'text-amber',
  enSala:       'text-cyan',
  atendida:     'text-text-muted',
};

export function ProviderNotesDialog({
  provider, categoriaInicial, onClose,
}: {
  provider: ProviderNotesRow;
  /** Con qué categoría se entró. null = las tres (se tocó la fila, no un número). */
  categoriaInicial: Categoria | null;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');
  const router = useRouter();

  const [cats, setCats] = React.useState<Set<Categoria>>(
    () => new Set(categoriaInicial ? [categoriaInicial] : CATEGORIAS),
  );
  const [q, setQ] = React.useState('');
  const [visitas, setVisitas] = React.useState<VisitaDelProvider[] | null>(null);
  const [error, setError] = React.useState('');
  /** La visita abierta — nivel 2. null = la lista. */
  const [visita, setVisita] = React.useState<VisitaDelProvider | null>(null);
  /** ¿Esta sesión puede sellar el desenlace de una cita ajena? Lo dice el server. */
  const [puedeSellar, setPuedeSellar] = React.useState(false);

  /**
   * Las visitas se piden UNA vez, sin los filtros: son pocas por provider y
   * filtrarlas en el cliente evita un viaje al server por cada chip. El `where`
   * del server sigue siendo el que decide qué cita califica.
   */
  React.useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/notes/provider/${provider.providerId}?estado=none,draft,signed`);
        if (!res.ok) { if (vivo) setError(t('errLoad')); return; }
        const d = await res.json() as { visitas: VisitaDelProvider[]; puedeSellar?: boolean };
        if (vivo) { setVisitas(d.visitas); setPuedeSellar(d.puedeSellar === true); }
      } catch { if (vivo) setError(t('errLoad')); }
    })();
    return () => { vivo = false; };
  }, [provider.providerId, t]);

  const filtradas = React.useMemo(() => {
    if (!visitas) return [];
    const texto = q.trim().toLowerCase();
    return visitas.filter((v) =>
      cats.has(v.estado as Categoria)
      && (!texto || `${v.patientName} ${v.caseCode ?? ''}`.toLowerCase().includes(texto)));
  }, [visitas, cats, q]);

  /**
   * La cita sellada se va de la lista, en el acto.
   *
   * `CITA_CALIFICA` excluye CANCELLED y NO_SHOW, así que después del PATCH esa
   * visita ya no debe nota: dejarla en la tabla mostraría una deuda que acaba
   * de dejar de existir. Se saca del arreglo en vez de volver a pedir todo,
   * para no tirar la búsqueda ni los chips que el supervisor venía usando.
   *
   * El `router.refresh()` es por la pantalla de ATRÁS: los números de la fila
   * del provider y los KPIs salen del server, y sin esto el modal diría 19 y la
   * lista de abajo seguiría diciendo 20.
   */
  const onSellada = React.useCallback((appointmentId: string): void => {
    setVisitas((prev) => prev?.filter((v) => v.appointmentId !== appointmentId) ?? prev);
    setVisita(null);
    router.refresh();
  }, [router]);

  const toggle = (c: Categoria): void => {
    const next = new Set(cats);
    if (next.has(c)) next.delete(c); else next.add(c);
    setCats(next.size ? next : new Set(CATEGORIAS));
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[1180px] w-[95vw] h-[92vh] p-0 overflow-hidden flex flex-col">
        {/* ── Encabezado ── */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap shrink-0">
          {visita ? (
            <>
              <button type="button" onClick={() => setVisita(null)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-text hover:underline">
                <ArrowLeft className="w-3.5 h-3.5" />
                {provider.providerName}
              </button>
              <span className="text-text-muted">/</span>
              <div className="min-w-0">
                <DialogTitle className="text-[15px] font-bold truncate">{visita.patientName}</DialogTitle>
                <div className="text-[11px] text-text-muted">
                  {visita.caseCode && <span className="font-mono text-cyan">{visita.caseCode}</span>}
                  {visita.caseCode && ' · '}{fecha(visita.scheduledFor)} · {visita.clinicName}
                </div>
              </div>
              <TagPill label={t(`estado_${visita.estado}`)} colorClass={ESTADO_STYLE[visita.estado]} />
            </>
          ) : (
            <>
              <PersonAvatar firstName={provider.providerName} lastName="" size={8} />
              <div className="min-w-0">
                <DialogTitle className="text-[15px] font-bold truncate">{provider.providerName}</DialogTitle>
                <div className="text-[11px] text-text-muted">{t('providerSubtitle')}</div>
              </div>
              <div className="flex items-center gap-0 ml-auto flex-wrap">
                <Stat n={provider.sinNota}    label={t('estado_none')}   color="text-rose" />
                <Stat n={provider.borradores} label={t('estado_draft')}  color="text-amber" />
                <Stat n={provider.firmadas}   label={t('estado_signed')} />
              </div>
            </>
          )}
        </div>

        {/* ── Filtros (solo en la lista) ── */}
        {!visita && (
          <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap shrink-0">
            {CATEGORIAS.map((c) => (
              <FilterPill key={c} label={t(`estado_${c as EstadoNota}`)}
                active={cats.has(c)} onClick={() => toggle(c)} />
            ))}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')}
                className="h-8 w-[190px] rounded-md border border-border bg-bg-2 pl-8 pr-2.5 text-xs font-medium text-text-1 placeholder:text-text-muted" />
            </div>
            <span className="ml-auto text-[11.5px] text-text-muted font-semibold">
              {t('countVisits', { count: filtradas.length })}
            </span>
            {/* El CSV, acotado a ESTE provider y a las categorías elegidas. Al
                sacar la tabla global se quedó sin puerta, y su ruta ya existe y
                se audita — es la única acción que saca PHI del sistema. */}
            {filtradas.length > 0 && (
              <a
                href={`/api/admin/notes/export?provider=${provider.providerId}&estado=${[...cats].join(',')}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-text-2 text-[11px] font-semibold hover:bg-white/5 hover:text-text-1 transition-colors"
              >
                <Download className="w-3 h-3" />
                {t('export')}
              </a>
            )}
          </div>
        )}

        {/* ── Cuerpo ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {visita
            ? <NotaDeLaVisita visita={visita} providerName={provider.providerName}
                puedeSellar={puedeSellar} onSellada={onSellada} />
            : <ListaDeVisitas
                visitas={visitas} filtradas={filtradas} error={error}
                onAbrir={setVisita} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ n, label, color = 'text-text-1' }: { n: number; label: string; color?: string }): React.ReactElement {
  return (
    <div className="px-3.5 border-l border-border first:border-l-0">
      <div className={`text-[17px] font-extrabold tabular-nums leading-none ${color}`}>{n}</div>
      <div className="text-[9.5px] uppercase tracking-wider font-bold text-text-muted mt-1">{label}</div>
    </div>
  );
}

function ListaDeVisitas({ visitas, filtradas, error, onAbrir }: {
  visitas: VisitaDelProvider[] | null;
  filtradas: VisitaDelProvider[];
  error: string;
  onAbrir: (v: VisitaDelProvider) => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');

  if (error) return <div className="p-6"><EmptyState.Inline message={error} /></div>;
  if (!visitas) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-text-muted text-[12px]">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
      </div>
    );
  }
  if (!filtradas.length) return <div className="p-6"><EmptyState.Inline message={t('empty')} /></div>;

  return (
    <DataTable.Scroll>
      <DataTable.Table className="min-w-[720px]">
        <DataTable.Head>
          <DataTable.Th sticky="left">{t('colVisit')}</DataTable.Th>
          <DataTable.Th>{t('colPatient')}</DataTable.Th>
          <DataTable.Th>{t('colCase')}</DataTable.Th>
          <DataTable.Th>{t('colClinic')}</DataTable.Th>
          <DataTable.Th>{t('colStatus')}</DataTable.Th>
          <DataTable.Th align="right">{t('colAge')}</DataTable.Th>
          <DataTable.Th align="right" sticky="right">{t('colActions')}</DataTable.Th>
        </DataTable.Head>
        <tbody>
          {filtradas.map((v) => (
            <DataTable.Row key={v.appointmentId} onClick={() => onAbrir(v)}>
              <DataTable.Td sticky="left">
                <div className="whitespace-nowrap font-medium">{fecha(v.scheduledFor)}</div>
                {v.signedAt && (
                  <div className="text-[10.5px] text-text-muted mt-0.5">
                    {t('signedBy', { date: fecha(v.signedAt), name: v.signedByName ?? '—' })}
                  </div>
                )}
              </DataTable.Td>
              <DataTable.Td>
                <div className="flex items-center gap-2 min-w-0">
                  <PersonAvatar firstName={v.patientName} lastName="" size={6} />
                  <span className="truncate">{v.patientName || '—'}</span>
                </div>
              </DataTable.Td>
              <DataTable.Td>
                {v.caseCode
                  ? <span className="font-mono text-[11px] text-cyan">{v.caseCode}</span>
                  : <span className="text-text-muted">—</span>}
              </DataTable.Td>
              <DataTable.Td><span className="text-text-muted">{v.clinicName}</span></DataTable.Td>
              <DataTable.Td>
                <TagPill label={t(`estado_${v.estado}`)} colorClass={ESTADO_STYLE[v.estado]} />
                {v.etapa !== 'atendida' && (
                  <div className={`mt-1 text-[10.5px] whitespace-nowrap ${ETAPA_STYLE[v.etapa]}`}>
                    {t(`etapa_${v.etapa}`)}
                  </div>
                )}
              </DataTable.Td>
              <DataTable.Td align="right"><Antiguedad dias={v.ageDays} label={t('days', { count: v.ageDays })} /></DataTable.Td>
              <DataTable.Td align="right" sticky="right">
                <span className="text-[11px] font-semibold text-violet-text whitespace-nowrap">
                  {v.estado === 'signed' ? t('openNote') : v.estado === 'draft' ? t('openAndEdit') : t('openVisit')} →
                </span>
              </DataTable.Td>
            </DataTable.Row>
          ))}
        </tbody>
      </DataTable.Table>
    </DataTable.Scroll>
  );
}

/**
 * Sellar el desenlace de una visita trabada, desde la supervisión.
 *
 * ─── Por qué acá y no un campo de "motivo" ──────────────────────────────────
 *
 * Erick preguntó si convenía explicar por qué una visita no tiene nota, porque
 * alguien podría estar persiguiendo la nota de una cita a la que el paciente
 * nunca vino. La respuesta NO es un texto libre: para "no vino" el sistema ya
 * tiene un desenlace de verdad, que saca la cita de esta lista y **cobra la
 * penalidad**. Un campo que dijera "no vino" competiría con ese estado y
 * dejaría la plata sin cobrar (2-sep-2026).
 *
 * ─── El mismo camino que las otras dos pantallas ────────────────────────────
 *
 * Pega al MISMO `PATCH /api/admin/appointments/:id` que Mi Día, la fila de Day
 * Admission y el panel del calendario, con las mismas claves de i18n. Un solo
 * camino escribe el estado de una cita; si algún día cambia la regla, cambia en
 * un lugar. Y el picker de la penalidad se encadena igual: sellar sin el cargo
 * es exactamente lo que llena la sección "Falta la penalidad" del asistente.
 *
 * ─── El botón bloqueado se MUESTRA ──────────────────────────────────────────
 *
 * `puedeSellar` lo decide el server con la misma condición del PATCH. Cuando es
 * false el botón sigue visible y explica por qué no se puede: esconderlo haría
 * pensar que la función no existe o que la pantalla está rota.
 */
function SellarDesenlace({ visita, puedeSellar, onSellada }: {
  visita: VisitaDelProvider;
  puedeSellar: boolean;
  onSellada: (appointmentId: string) => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');
  /** Las claves del desenlace son las MISMAS de Mi Día — no se duplican. */
  const ta = useTranslations('phoenix.admission');

  const [tipo, setTipo] = React.useState<Desenlace | null>(null);
  const [sellando, setSellando] = React.useState(false);
  const [fallo, setFallo] = React.useState('');
  /** Abierto el picker = ya se selló y falta elegir el código de la penalidad. */
  const [cobrando, setCobrando] = React.useState(false);
  const [cargosActuales, setCargosActuales] = React.useState<PlannedService[]>([]);
  const [cargoError, setCargoError] = React.useState<string | null>(null);

  const confirmar = async (): Promise<void> => {
    if (!tipo) return;
    setSellando(true);
    setFallo('');
    try {
      const body = tipo === 'noShow'
        ? { status: 'NO_SHOW' }
        : { status: 'CANCELLED', cancelledSameDay: tipo === 'cancelSameDay' };
      const res = await fetch(`/api/admin/appointments/${visita.appointmentId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      // Un 403 acá es el caso de `puedeSellar` falso que igual se intentó (cache
      // vieja, otra pestaña). Se dice; no se deja el clic en la nada.
      if (!res.ok) { setFallo(res.status === 403 ? t('outcomeBlocked') : ta('penaltyFailed')); return; }

      const conPenalidad = cobraPenalidad(tipo);
      setTipo(null);
      if (!conPenalidad) { onSellada(visita.appointmentId); return; }

      // Lo que la cita ya tenía cargado, para no escribir un duplicado encima.
      setCargosActuales(await leerCargos(visita.appointmentId));
      setCargoError(null);
      setCobrando(true);
    } catch {
      setFallo(ta('penaltyFailed'));
    } finally {
      setSellando(false);
    }
  };

  /** Agrega el código elegido y deja la deuda creada (ver lib/charges). */
  const onAgregarCargo = async (item: BillableItem): Promise<void> => {
    const r = await agregarCargo({
      appointmentId: visita.appointmentId,
      caseId:        visita.caseId ?? undefined,
      item,
      actuales:      cargosActuales,
    });
    setCargosActuales(r.servicios);
    // Sin caso no hay dónde colgar la deuda: hay que decirlo, no dejar que el
    // clic parezca que funcionó (`sync-billing` responde `no_case`).
    setCargoError(r.ok ? null : r.error === 'NO_CASE' ? ta('penaltyNoCase') : ta('penaltyFailed'));
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 space-y-2.5">
      <div className="text-[12px] text-text-2 font-semibold">{t('outcomeTitle')}</div>
      <p className="text-[11.5px] text-text-muted leading-relaxed">{t('outcomeHelp')}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={!puedeSellar} onClick={() => setTipo('noShow')}
          className={`${btn} border-border text-text-2 hover:bg-white/5 hover:text-text-1`}>
          <UserX className="w-3.5 h-3.5" /> {ta('noShow')}
        </button>
        <button type="button" disabled={!puedeSellar} onClick={() => setTipo('cancel')}
          className={`${btn} border-border text-text-2 hover:bg-white/5 hover:text-text-1`}>
          <Ban className="w-3.5 h-3.5" /> {ta('cancel')}
        </button>
        <button type="button" disabled={!puedeSellar} onClick={() => setTipo('cancelSameDay')}
          className={`${btn} border-amber/40 text-amber hover:bg-amber/10`}>
          <Ban className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{ta('cancelSameDay')}</span>
          <span className="sm:hidden">{ta('cancelSameDayShort')}</span>
        </button>
      </div>

      {!puedeSellar && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{t('outcomeBlocked')}</span>
        </div>
      )}
      {fallo && (
        <div className="flex items-start gap-1.5 text-[11px] text-rose">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{fallo}</span>
        </div>
      )}

      <ConfirmDialog
        open={!!tipo}
        variant="warning"
        title={tipo ? ta(`desenlaceTitle_${tipo}` as 'desenlaceTitle_noShow') : ''}
        description={tipo
          ? ta(`desenlaceBody_${tipo}` as 'desenlaceBody_noShow', { name: visita.patientName })
          : ''}
        confirmLabel={sellando ? ta('desenlaceSealing') : ta('desenlaceConfirm')}
        cancelLabel={ta('desenlaceCancel')}
        onConfirm={() => { void confirmar(); }}
        onCancel={() => setTipo(null)}
      />

      {/* El picker de servicios, el MISMO del tab de Servicios y de Mi Día. Al
          cerrarlo se saca la visita de la lista: el desenlace ya quedó sellado
          aunque el supervisor no haya elegido ningún código. */}
      {cobrando && (
        <ChargePickerDialog
          coverage={visita.coverage}
          /* El picker indexa por `item.key`, que para el circuito de seguro es
             `s<refId>`. Con la clave mal armada el ítem ya cargado no se marcaría
             y se agregaría dos veces. */
          added={new Map(cargosActuales.map((c) => [`s${c.id}`, 1]))}
          onClose={() => { setCobrando(false); setCargoError(null); onSellada(visita.appointmentId); }}
          onAdd={onAgregarCargo}
        />
      )}
      {cargoError && (
        <div className="flex items-start gap-1.5 text-[11px] text-rose">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{cargoError}</span>
        </div>
      )}
    </div>
  );
}

/**
 * La nota, en sus tres estados. Cada uno es una cosa distinta y por eso no
 * comparten pantalla:
 *
 *  · SIN NOTA  — no hay nada que abrir. El provider atendió y no escribió; lo
 *    que corresponde es pedírsela, no ofrecer un editor en blanco. (Decisión de
 *    Erick: el supervisor no documenta un acto clínico en el que no estuvo.)
 *  · BORRADOR  — el editor real, el mismo del portal. Con la firma apagada:
 *    `canSign={false}`, y el servidor la rechaza igual por rol.
 *  · FIRMADA   — solo lectura. Una nota cerrada es inmutable por HIPAA y el PUT
 *    responde 409; mostrar un editor sería prometer algo que el server niega.
 */
function NotaDeLaVisita({ visita, providerName, puedeSellar, onSellada }: {
  visita: VisitaDelProvider;
  providerName: string;
  puedeSellar: boolean;
  onSellada: (appointmentId: string) => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');
  const [nota, setNota] = React.useState<VisitNoteData | null | undefined>(undefined);
  const [plantillas, setPlantillas] = React.useState<PickableTemplate[]>([]);

  const editable = visita.estado === 'draft';

  React.useEffect(() => {
    if (visita.estado === 'none') { setNota(null); return; }
    let vivo = true;
    (async () => {
      const [rn, rt] = await Promise.all([
        fetch(`/api/admin/visit-notes/${visita.appointmentId}`).then((r) => r.ok ? r.json() : null).catch(() => null),
        editable
          ? fetch('/api/admin/templates').then((r) => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!vivo) return;
      setNota(mapearNota(rn?.note));
      // `isFavorite` en false a propósito: los favoritos son de CADA médico y
      // los del supervisor no dicen nada sobre esta nota.
      setPlantillas((rt?.templates ?? []).map((x: RawTemplate) => ({
        id: x.id, title: x.title, description: x.description ?? null,
        encounterType: x.encounterType, isFavorite: false,
        sections: (x.sections ?? []).map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
      })));
    })();
    return () => { vivo = false; };
  }, [visita.appointmentId, visita.estado, editable]);

  if (visita.estado === 'none') {
    return (
      <div className="p-5 space-y-4 max-w-3xl">
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2.5 text-[12px] text-text-2 flex items-start gap-2">
          <FileText className="w-4 h-4 text-rose shrink-0 mt-px" />
          <span>{t('noNoteBody', { name: providerName })}</span>
        </div>

        {/**
          * Qué pasó con la visita, antes del botón de recordar.
          *
          * Va ARRIBA del recordatorio a propósito: en 31 de cada 37 el problema
          * no es el médico, y perseguirlo por una visita que quedó trabada en
          * recepción es mandar el reclamo a la persona equivocada. Acá sí se
          * muestran las cuatro etapas —incluida `atendida`— porque esta es la
          * pantalla donde se decide qué hacer, y "la visita se completó, solo
          * falta escribirla" es la que justifica el recordatorio.
          */}
        <div className="rounded-md bg-bg-2/40 px-3 py-2.5 space-y-1">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
            {t('whatHappened')}
          </div>
          <div className={`text-[12px] font-semibold ${ETAPA_STYLE[visita.etapa]}`}>
            {t(`etapa_${visita.etapa}`)}
          </div>
          <p className="text-[11.5px] text-text-muted leading-relaxed">
            {t(`etapaHelp_${visita.etapa}`)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 hover:text-text-1 transition-colors">
            <Bell className="w-3.5 h-3.5" /> {t('remind')}
          </button>
        </div>

        {ETAPAS_EN_DUDA.has(visita.etapa) && (
          <SellarDesenlace visita={visita} puedeSellar={puedeSellar} onSellada={onSellada} />
        )}
      </div>
    );
  }

  if (nota === undefined) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-text-muted text-[12px]">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
      </div>
    );
  }

  if (!editable) {
    return (
      <div className="p-5 space-y-4 max-w-3xl">
        <div className="rounded-md border border-emerald/30 bg-emerald/10 px-3 py-2.5 text-[12px] text-text-2 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald shrink-0 mt-px" />
          <span>{t('signedBody')}</span>
        </div>
        <a href={`/doctor-print/visit-note/${visita.appointmentId}`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-violet/40 text-violet-text text-[12px] font-semibold hover:bg-violet/10 transition-colors">
          <Printer className="w-3.5 h-3.5" /> {t('print')}
        </a>
        <SoloLectura nota={nota} />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 text-[12px] text-text-2 flex items-start gap-2 max-w-3xl">
        <FileText className="w-4 h-4 text-amber shrink-0 mt-px" />
        <span>{t('editingBody', { name: providerName })}</span>
      </div>
      <VisitNoteEditor
        key={visita.appointmentId}
        appointmentId={visita.appointmentId}
        patientId={visita.patientId}
        note={nota}
        templates={plantillas}
        userId={null}
        /* Firmar es del médico. El servidor lo rechaza igual por rol; esto es la
           CARA de esa regla, para no ofrecer un botón que va a fallar. */
        canSign={false}
      />
    </div>
  );
}

const SECCIONES: Array<[keyof VisitNoteData, string]> = [
  ['chiefComplaint', 'secChief'], ['hpi', 'secHpi'], ['ros', 'secRos'],
  ['physicalExam', 'secExam'], ['assessment', 'secAssessment'], ['plan', 'secPlan'],
];

function SoloLectura({ nota }: { nota: VisitNoteData | null }): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');
  if (!nota) return <EmptyState.Inline message={t('empty')} />;
  return (
    <div className="space-y-4">
      {SECCIONES.map(([campo, clave]) => (
        <div key={clave}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">{t(clave)}</div>
          <div
            className="rounded-md bg-bg-2/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-text-2 [&_p]:m-0"
            // El contenido es HTML del editor y ya viaja saneado desde el server.
            dangerouslySetInnerHTML={{ __html: (nota[campo] as string) || '—' }}
          />
        </div>
      ))}
    </div>
  );
}

interface RawTemplate {
  id: string; title: string; description: string | null; encounterType: string;
  sections?: Array<{ sectionKey: string; content: string }>;
}

/** La respuesta del GET a la forma que espera el editor. */
function mapearNota(n: unknown): VisitNoteData | null {
  if (!n || typeof n !== 'object') return null;
  const r = n as Record<string, unknown>;
  return {
    status: String(r.status ?? 'DRAFT'),
    signedAt: r.signedAt ? String(r.signedAt) : null,
    signedByName: (r.signedByName as string) ?? null,
    templateId: (r.templateId as string) ?? null,
    chiefComplaint: (r.chiefComplaint as string) ?? null,
    hpi: (r.hpi as string) ?? null,
    ros: (r.ros as string) ?? null,
    physicalExam: (r.physicalExam as string) ?? null,
    assessment: (r.assessment as string) ?? null,
    plan: (r.plan as string) ?? null,
    diagnoses: Array.isArray(r.diagnoses) ? (r.diagnoses as VisitNoteData['diagnoses']) : [],
    // Viaja para el control de versión del PUT: sin esto el guardado va a ciegas
    // y podría pisar lo que el doctor escribió mientras el modal estaba abierto.
    updatedAt: r.updatedAt ? String(r.updatedAt) : null,
  };
}

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

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString(localeApp(), {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Denver',
  });
}
