'use client';

/**
 * PriorVisitsDialog — traer texto de una visita anterior a la nota que se está
 * escribiendo.
 *
 * Pedido de Devin (2026-09-17), validado por él contra Medusa el 23-sep:
 * *"very easy/user friendly and very practical. It's quick and it works well."*
 * Este diálogo copia ese flujo, que son dos pasos:
 *
 *   1. **La lista** de visitas anteriores del paciente — de TODOS los providers
 *      (decisión de Erick, 2026-09-18) — con la opción de leer cada nota antes
 *      de elegirla.
 *   2. **Qué traer**, con todas las secciones ya tildadas.
 *
 * ── La columna "Motivo" ─────────────────────────────────────────────────────
 *
 * Es la única objeción que Devin le puso a Medusa: ahí viene vacía, y elegir
 * entre diecisiete fechas sin saber para qué fue cada visita es adivinar. El
 * servidor la resuelve en cascada (motivo de la cita → queja principal →
 * primeras palabras del HPI) y manda de dónde la sacó; acá se dibuja esa marca.
 *
 * Sin la marca, un fragmento de HPI se leería como si alguien lo hubiera escrito
 * a propósito como motivo de la visita.
 *
 * ── Todo pre-tildado, a conciencia ──────────────────────────────────────────
 *
 * Devin lo pidió así y tiene razón en que es rápido. También significa que el
 * gesto por defecto es traer la nota anterior ENTERA — lo que una auditoría
 * llama nota clonada. La defensa no es agregar fricción: es que cada traído
 * queda en el audit log con su visita de origen, sus secciones y su autor
 * (`PULL_FROM_PRIOR_VISIT`). Ver el docblock de `../../api/.../pull`.
 *
 * ── Agrega, nunca reemplaza ─────────────────────────────────────────────────
 *
 * El texto traído se suma al final de cada sección. Es la misma regla que los
 * snippets, y la que hace que traer algo nunca pueda costarle a nadie lo que ya
 * había escrito.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Button,
} from '@precision/ui';
import { Loader2, Eye, ChevronLeft, FileText } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';
import { useSectionLabels } from '@/lib/use-section-labels';
import { safeHtml } from '@/lib/safe-html';
import type { NotaAnterior } from '@/app/api/admin/patients/[id]/visit-notes/route';

/** Las seis secciones, con el campo del editor y la clave de su rótulo. */
const SECCIONES = [
  { field: 'chiefComplaint', key: 'QUEJA_PRINCIPAL' },
  { field: 'hpi',            key: 'HPI' },
  { field: 'ros',            key: 'ROS' },
  { field: 'physicalExam',   key: 'EXAMEN_FISICO' },
  { field: 'assessment',     key: 'EVALUACIONES' },
  { field: 'plan',           key: 'PLAN' },
] as const;

export type SeccionTraible = typeof SECCIONES[number]['field'];

export interface TraidoDeVisita {
  desde: NotaAnterior;
  /** Qué secciones traer, con el HTML ya resuelto. */
  secciones: Array<{ field: SeccionTraible; html: string }>;
  /** Los diagnósticos, si se tildó esa casilla. */
  diagnosticos: NotaAnterior['diagnoses'];
}

export interface PriorVisitsDialogProps {
  appointmentId: string;
  patientId: string;
  caseId: string | null;
  onClose: () => void;
  onTraer: (t: TraidoDeVisita) => void;
}

const fecha = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function PriorVisitsDialog({
  appointmentId, patientId, caseId, onClose, onTraer,
}: PriorVisitsDialogProps): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const { label: secLabel } = useSectionLabels();

  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [notas, setNotas] = React.useState<NotaAnterior[]>([]);
  const [hayMas, setHayMas] = React.useState(false);
  const [todas, setTodas] = React.useState(false);

  const [elegida, setElegida] = React.useState<string | null>(null);
  /** La visita cuya nota se está leyendo en el visor. */
  const [viendo, setViendo] = React.useState<NotaAnterior | null>(null);
  /** `null` mientras se elige la visita; el set cuando se eligen secciones. */
  const [marcadas, setMarcadas] = React.useState<Set<string> | null>(null);

  React.useEffect(() => {
    const c = new AbortController();
    setCargando(true);
    const params = new URLSearchParams({ excludeAppointment: appointmentId });
    if (caseId) params.set('caseId', caseId);
    if (todas) params.set('all', '1');
    fetch(`/api/admin/patients/${patientId}/visit-notes?${params}`, { signal: c.signal })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d: { notas: NotaAnterior[]; hayMas: boolean }) => {
        setNotas(d.notas); setHayMas(d.hayMas); setCargando(false);
      })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { setError(true); setCargando(false); } });
    return () => c.abort();
  }, [patientId, appointmentId, caseId, todas]);

  const nota = notas.find((n) => n.appointmentId === elegida) ?? null;

  /** Las secciones de la visita elegida que de verdad tienen texto. */
  const conTexto = React.useMemo(
    () => (nota ? SECCIONES.filter((s) => {
      const v = nota[s.field];
      return !!v && v.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
    }) : []),
    [nota],
  );

  /** Pasar al paso 2 con TODO tildado, que es lo que pidió Devin. */
  const elegirQueTraer = (): void => {
    if (!nota) return;
    const todo = new Set<string>(conTexto.map((s) => s.field));
    if (nota.diagnoses.length > 0) todo.add('DIAGNOSTICOS');
    setMarcadas(todo);
  };

  const alternar = (k: string): void => setMarcadas((prev) => {
    const next = new Set(prev ?? []);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const todoMarcado = !!marcadas
    && conTexto.every((s) => marcadas.has(s.field))
    && (nota?.diagnoses.length ? marcadas.has('DIAGNOSTICOS') : true);

  const alternarTodo = (): void => {
    if (!nota) return;
    if (todoMarcado) { setMarcadas(new Set()); return; }
    const todo = new Set<string>(conTexto.map((s) => s.field));
    if (nota.diagnoses.length > 0) todo.add('DIAGNOSTICOS');
    setMarcadas(todo);
  };

  const cuantas = marcadas ? marcadas.size : 0;

  const confirmar = (): void => {
    if (!nota || !marcadas) return;
    const secciones = conTexto
      .filter((s) => marcadas.has(s.field))
      .map((s) => ({ field: s.field, html: nota[s.field] ?? '' }));
    onTraer({
      desde: nota,
      secciones,
      diagnosticos: marcadas.has('DIAGNOSTICOS') ? nota.diagnoses : [],
    });
  };

  /** La marca de dónde salió el motivo. Sin marca cuando lo escribió una persona. */
  const marcaMotivo = (n: NotaAnterior): React.ReactNode => {
    if (n.motivoOrigen === 'queja') {
      return <TagPill label={t('pvFromComplaint')} colorClass="bg-emerald/15 text-emerald border-emerald/30" compact />;
    }
    if (n.motivoOrigen === 'hpi') {
      return <TagPill label={t('pvFromHpi')} colorClass="bg-amber/15 text-amber border-amber/30" compact />;
    }
    return null;
  };

  // ── El visor: leer la nota antes de traerla ────────────────────────────────
  if (viendo) {
    return (
      <Dialog open onOpenChange={(v) => { if (!v) setViendo(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="text-[15px]">
              {t('pvViewTitle', { date: fecha(viendo.scheduledFor) })}
            </DialogTitle>
            <p className="text-[11.5px] text-text-muted mt-0.5">
              {[viendo.providerName, viendo.caseCode].filter(Boolean).join(' · ')}
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
            {SECCIONES.map((s) => {
              const html = viendo[s.field];
              if (!html || html.replace(/<[^>]*>/g, '').trim().length === 0) return null;
              return (
                <div key={s.field}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                    {secLabel(s.key)}
                  </div>
                  <div
                    className="rte-content text-[13px] text-text-1"
                    dangerouslySetInnerHTML={{ __html: safeHtml(html) }}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter className="px-5 py-3 border-t border-border">
            <Button variant="ghost" className="gap-1.5" onClick={() => setViendo(null)}>
              <ChevronLeft className="w-3.5 h-3.5" /> {t('pvBackToList')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Paso 2: qué traer ──────────────────────────────────────────────────────
  if (marcadas && nota) {
    return (
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              {t('pvWhatTitle', { date: fecha(nota.scheduledFor) })}
            </DialogTitle>
            <p className="text-[11.5px] text-text-muted mt-0.5">
              {[nota.providerName, nota.motivo].filter(Boolean).join(' · ')}
            </p>
          </DialogHeader>

          <div className="space-y-0.5">
            <label className="flex items-center gap-2.5 py-2 border-b border-row-sep cursor-pointer">
              <input type="checkbox" checked={todoMarcado} onChange={alternarTodo} className="accent-violet w-3.5 h-3.5" />
              <span className="text-[13px] font-semibold text-text-1">{t('pvAll')}</span>
            </label>

            {conTexto.map((s) => (
              <label key={s.field} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marcadas.has(s.field)}
                  onChange={() => alternar(s.field)}
                  className="accent-violet w-3.5 h-3.5"
                />
                <span className="text-[12.5px] text-text-2">{secLabel(s.key)}</span>
              </label>
            ))}

            {nota.diagnoses.length > 0 && (
              <>
                <label className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marcadas.has('DIAGNOSTICOS')}
                    onChange={() => alternar('DIAGNOSTICOS')}
                    className="accent-violet w-3.5 h-3.5"
                  />
                  <span className="text-[12.5px] text-text-2">
                    {t('sec_DIAGNOSTICOS')}{' '}
                    <span className="text-text-muted">({nota.diagnoses.length})</span>
                  </span>
                </label>
                {/* Se dice qué pasa con los que ya tiene la nota: es la duda de
                    cualquiera que ya cargó uno a mano. */}
                <p className="text-[10.5px] text-text-muted ml-6 leading-snug">{t('pvDxHint')}</p>
              </>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" className="w-full sm:w-auto gap-1.5" onClick={() => setMarcadas(null)}>
              <ChevronLeft className="w-3.5 h-3.5" /> {t('pvBackToList')}
            </Button>
            <Button className="w-full sm:w-auto" disabled={cuantas === 0} onClick={confirmar}>
              {t('pvBring', { count: cuantas })}
            </Button>
          </DialogFooter>

          <p className="text-[11px] text-text-muted text-center sm:text-right">{t('pvAppendHint')}</p>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Paso 1: la lista ───────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-[15px]">{t('pvListTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5">
          {cargando ? (
            <div className="py-12 text-center text-text-muted"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
          ) : error ? (
            <div className="py-12 text-center text-[12.5px] text-rose">{t('pvError')}</div>
          ) : notas.length === 0 ? (
            <div className="py-12 text-center text-[12.5px] text-text-muted">{t('pvEmpty')}</div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-bg-1">
                <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                  <th className="w-8 py-2" />
                  <th className="py-2 w-[110px]">{t('pvColDate')}</th>
                  <th className="py-2 w-[130px] hidden sm:table-cell">{t('pvColWho')}</th>
                  <th className="py-2">{t('pvColReason')}</th>
                  <th className="py-2 w-[90px]" />
                  <th className="py-2 w-[80px] text-right" />
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => (
                  <tr
                    key={n.appointmentId}
                    onClick={() => setElegida(n.appointmentId)}
                    className={`border-t border-row-sep cursor-pointer transition-colors ${
                      elegida === n.appointmentId ? 'bg-violet/10' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-2.5">
                      <input
                        type="radio"
                        checked={elegida === n.appointmentId}
                        onChange={() => setElegida(n.appointmentId)}
                        className="accent-violet w-3.5 h-3.5"
                        aria-label={fecha(n.scheduledFor)}
                      />
                    </td>
                    <td className="py-2.5 font-semibold text-text-1 tabular-nums whitespace-nowrap">
                      {fecha(n.scheduledFor)}
                    </td>
                    <td className="py-2.5 text-text-2 hidden sm:table-cell">{n.providerName ?? '—'}</td>
                    <td className="py-2.5 text-text-2">
                      <span className="flex items-start gap-1.5 flex-wrap">
                        {marcaMotivo(n)}
                        <span className="min-w-0">{n.motivo ?? '—'}</span>
                      </span>
                    </td>
                    <td className="py-2.5">
                      {n.status === 'SIGNED'
                        ? <TagPill label={t('noteSigned')} colorClass="bg-emerald/15 text-emerald border-emerald/30" compact />
                        : n.status === 'ARCHIVED'
                          ? <TagPill label={t('noteArchived')} colorClass="bg-bg-2 text-text-muted border-border" compact />
                          : <TagPill label={t('visitNoteOpen')} colorClass="bg-amber/15 text-amber border-amber/30" compact />}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setViendo(n); }}
                        className="text-[11.5px] font-semibold text-violet-text hover:underline inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> {t('pvView')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border flex-col sm:flex-row gap-2 sm:justify-between">
          {/* Cuántas hay y de cuántas: la lista es más corta que el historial del
              paciente —solo las visitas CON nota— y sin decirlo parece que falta. */}
          <span className="text-[11px] text-text-muted flex items-center gap-1.5">
            <FileText className="w-3 h-3 shrink-0" />
            {t('pvCount', { n: notas.length })}
            {hayMas && (
              <button type="button" onClick={() => setTodas(true)} className="font-semibold text-violet-text hover:underline">
                {t('pvSeeAll')}
              </button>
            )}
          </span>
          <Button className="w-full sm:w-auto" disabled={!nota} onClick={elegirQueTraer}>
            {t('pvChoose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
