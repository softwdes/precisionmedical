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
import { ArrowLeft, Bell, Check, Download, FileText, Loader2, Printer, Search } from 'lucide-react';
import { DataTable, EmptyState, TagPill, PersonAvatar, FilterPill } from '@/components/ui-phoenix';
import { VisitNoteEditor, type VisitNoteData } from '@/components/visit/visit-note-editor';
import type { PickableTemplate } from '@/components/visit/template-picker';
import { localeApp } from '@/lib/fechas';
import type { EstadoNota } from '@/lib/notes-audit';
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

export function ProviderNotesDialog({
  provider, categoriaInicial, onClose,
}: {
  provider: ProviderNotesRow;
  /** Con qué categoría se entró. null = las tres (se tocó la fila, no un número). */
  categoriaInicial: Categoria | null;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.notesAudit');

  const [cats, setCats] = React.useState<Set<Categoria>>(
    () => new Set(categoriaInicial ? [categoriaInicial] : CATEGORIAS),
  );
  const [q, setQ] = React.useState('');
  const [visitas, setVisitas] = React.useState<VisitaDelProvider[] | null>(null);
  const [error, setError] = React.useState('');
  /** La visita abierta — nivel 2. null = la lista. */
  const [visita, setVisita] = React.useState<VisitaDelProvider | null>(null);

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
        const d = await res.json() as { visitas: VisitaDelProvider[] };
        if (vivo) setVisitas(d.visitas);
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
            ? <NotaDeLaVisita visita={visita} providerName={provider.providerName} />
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
function NotaDeLaVisita({ visita, providerName }: {
  visita: VisitaDelProvider; providerName: string;
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
        <button type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 hover:text-text-1 transition-colors">
          <Bell className="w-3.5 h-3.5" /> {t('remind')}
        </button>
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
