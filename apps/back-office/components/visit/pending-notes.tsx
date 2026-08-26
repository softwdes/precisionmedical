'use client';

/**
 * Notas sin cerrar — cola persistente, en los dos portales.
 *
 * Regla de negocio (Erick 2026-08-12): la nota nace abierta y **solo el doctor la
 * cierra** con su botón. El checkout no la cierra ni la condiciona, y ambos —
 * doctor y asistente — se pueden olvidar, así que puede quedar abierta meses. Por
 * eso hace falta una cola que esté siempre a la vista, no un aviso que se pierda.
 *
 * Dos modos, porque los dos roles hacen cosas distintas con la misma lista:
 *   · `canClose` (Mi Día) — el doctor expande la nota y la cierra ahí. Se expande
 *     a propósito: firmar es afirmar que el contenido es correcto, y nadie debería
 *     poder cerrar un documento clínico sin verlo.
 *   · sin `canClose` (Day Admission) — el asistente no firma, pero le manda al
 *     doctor un recordatorio URGENTE por la mensajería interna con el paciente y
 *     la fecha. Deja de depender de acordarse en el pasillo.
 *
 * La cola incluye las visitas atendidas **sin ninguna nota**, no solo los
 * borradores: la fila de la nota se crea al primer guardado, así que el doctor que
 * nunca escribió nada no deja rastro. Al medirlo en la base eran 38 de 53 — el 72%
 * de los pendientes habría sido invisible.
 */

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button } from '@precision/ui';
import {
  FileWarning, ChevronRight, ChevronDown, Loader2, Check, Send, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';

export interface PendingNoteRow {
  appointmentId: string;
  scheduledFor: string;
  patientName: string;
  patientId: string;
  caseId: string | null;
  caseCode: string | null;
  providerName: string | null;
  providerUserId: string | null;
  hasDraft: boolean;
  ageDays: number;
}

interface Props {
  /** `mine` = las del doctor de la sesión · `clinic` = todas (asistente). */
  scope: 'mine' | 'clinic';
  /** Solo el doctor cierra notas. El asistente ve y recuerda. */
  canClose?: boolean;
  /** A dónde llevar al abrir la visita. Cada portal tiene su ruta. */
  hrefFor: (appointmentId: string) => string;
  /**
   * Nombre del parámetro de URL que reabre la cola al volver de la visita.
   *
   * Sin esto, "Abrir" perdía el lugar: la nota se escribe en la página completa
   * —que es donde tiene que escribirse, con el panel del paciente y sus labs al
   * lado— pero el "volver" caía en el portal con la cola cerrada. Con 20
   * pendientes eran 20 idas y vueltas reabriendo la lista a mano.
   *
   * El parámetro se BORRA de la URL en cuanto la cola se abre: si quedara, un
   * refresh o el botón de atrás la volverían a abrir sin que nadie la pidiera.
   */
  reopenParam?: string;
}

/** Antigüedad → color. Lo que importa no es que haya 40, es que haya una de hace meses. */
function ageTone(days: number): string {
  if (days >= 8) return 'bg-rose/15 text-rose border-rose/30';
  if (days >= 3) return 'bg-amber/15 text-amber border-amber/30';
  return 'bg-white/5 text-text-muted border-border';
}

export function PendingNotes({ scope, canClose = false, hrefFor, reopenParam }: Props): React.ReactElement | null {
  const t = useTranslations('phoenix.pendingNotes');
  const [rows, setRows] = React.useState<PendingNoteRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [oldestDays, setOldestDays] = React.useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const volviendo = !!reopenParam && params.get(reopenParam) === '1';
  const [open, setOpen] = React.useState(volviendo);
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/pending-notes?scope=${scope}`);
      if (!res.ok) return;
      const d = (await res.json()) as { notes: PendingNoteRow[]; total: number; oldestDays: number };
      setRows(d.notes);
      setTotal(d.total);
      setOldestDays(d.oldestDays);
    } finally {
      setLoaded(true);
    }
  }, [scope]);

  React.useEffect(() => { void load(); }, [load]);

  // Se limpia el parámetro, no la cola: la lista queda abierta y la URL vuelve a
  // ser la del portal.
  React.useEffect(() => {
    if (!volviendo) return;
    const q = new URLSearchParams(params.toString());
    q.delete(reopenParam as string);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [volviendo, reopenParam, params, pathname, router]);

  // Nada pendiente: no se dibuja nada. Un bloque verde de "todo en orden" es ruido
  // en una pantalla que ya está llena.
  if (!loaded || total === 0) return null;

  const alarming = oldestDays >= 8;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-lg border px-4 py-3 flex items-center gap-3 text-left transition-colors ${
          alarming
            ? 'border-rose/30 bg-rose/[0.07] hover:bg-rose/[0.12]'
            : 'border-amber/30 bg-amber/[0.07] hover:bg-amber/[0.12]'
        }`}
      >
        <FileWarning className={`w-4 h-4 shrink-0 ${alarming ? 'text-rose' : 'text-amber'}`} />
        <span className="min-w-0 flex-1">
          <span className={`block text-[12.5px] font-semibold ${alarming ? 'text-rose' : 'text-amber'}`}>
            {total === 1 ? t('countOne') : t('count', { count: total })}
          </span>
          <span className="block text-[11px] text-text-muted mt-0.5">
            {oldestDays === 0 ? t('oldestToday') : t('oldest', { days: oldestDays })}
          </span>
        </span>
        <span className={`text-[11.5px] font-semibold shrink-0 ${alarming ? 'text-rose' : 'text-amber'}`}>
          {t('viewAll')}
        </span>
        <ChevronRight className={`w-4 h-4 shrink-0 ${alarming ? 'text-rose' : 'text-amber'}`} />
      </button>

      {open && (
        <PendingNotesDialog
          rows={rows}
          total={total}
          scope={scope}
          canClose={canClose}
          hrefFor={hrefFor}
          onClose={() => setOpen(false)}
          onChanged={() => void load()}
        />
      )}
    </>
  );
}

// ─── Lista completa ─────────────────────────────────────────────────────────

interface NotePreview {
  status: string;
  chiefComplaint: string | null;
  hpi: string | null;
  ros: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
  diagnoses: Array<{ icd10Code: string | null; icd10Label: string | null }>;
}

/** Texto plano de un campo HTML del editor. Para revisar antes de cerrar. */
function plain(html: string | null): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function PendingNotesDialog({
  rows, total, scope, canClose, hrefFor, onClose, onChanged,
}: {
  rows: PendingNoteRow[];
  total: number;
  scope: 'mine' | 'clinic';
  canClose: boolean;
  hrefFor: (id: string) => string;
  onClose: () => void;
  onChanged: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.pendingNotes');
  const router = useRouter();

  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Record<string, NotePreview | null>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [reminded, setReminded] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState('');

  const expand = async (row: PendingNoteRow): Promise<void> => {
    if (expanded === row.appointmentId) { setExpanded(null); return; }
    setExpanded(row.appointmentId);
    if (preview[row.appointmentId] !== undefined) return;
    try {
      const res = await fetch(`/api/admin/visit-notes/${row.appointmentId}`);
      const d = (await res.json()) as { note?: NotePreview | null };
      setPreview((p) => ({ ...p, [row.appointmentId]: d.note ?? null }));
    } catch {
      setPreview((p) => ({ ...p, [row.appointmentId]: null }));
    }
  };

  /** Cerrar = firmar. Irreversible: solo un Super Admin puede anularla después. */
  const closeNote = async (row: PendingNoteRow): Promise<void> => {
    setBusy(row.appointmentId); setError('');
    try {
      const res = await fetch(`/api/admin/visit-notes/${row.appointmentId}/sign`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error === 'NOTE_EMPTY' ? t('cantCloseEmpty') : t('errClose'));
        return;
      }
      onChanged();
      router.refresh();
    } catch {
      setError(t('errClose'));
    } finally {
      setBusy(null);
    }
  };

  /** Recordatorio del asistente: mensajería interna en URGENTE. */
  const remind = async (row: PendingNoteRow): Promise<void> => {
    if (!row.providerUserId) { setError(t('noProviderUser')); return; }
    setBusy(row.appointmentId); setError('');
    const date = new Date(row.scheduledFor).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Denver',
    });
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [row.providerUserId],
          type: 'REMINDER',
          category: 'PATIENT_RELATED',
          priority: 'URGENT',
          subject: t('reminderSubject', { patient: row.patientName }),
          body: t('reminderBody', {
            date,
            patient: row.patientName,
            caseCode: row.caseCode ?? '—',
          }),
          patientId: row.patientId,
          caseId: row.caseId,
        }),
      });
      if (!res.ok) { setError(t('errRemind')); return; }
      setReminded((s) => new Set(s).add(row.appointmentId));
    } catch {
      setError(t('errRemind'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-amber shrink-0" />
            {t('title')}
            <span className="text-text-muted font-normal">· {total}</span>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="mx-5 mt-3 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11.5px] text-rose shrink-0">
            {error}
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {rows.length === 0 ? (
            <div className="py-8 text-center text-[12.5px] text-text-muted">{t('empty')}</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {rows.map((r) => {
                const isOpen = expanded === r.appointmentId;
                const p = preview[r.appointmentId];
                return (
                  <div key={r.appointmentId} className="border-b border-row-sep last:border-0">
                    <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap hover:bg-bg-2/30 transition-colors">
                      <span className="font-mono text-[11.5px] text-text-2 w-[74px] shrink-0">
                        {new Date(r.scheduledFor).toLocaleDateString(undefined, {
                          day: 'numeric', month: 'short', timeZone: 'America/Denver',
                        })}
                      </span>
                      <span className="text-[12.5px] text-text-1 flex-1 min-w-[130px] truncate">
                        {r.patientName}
                      </span>
                      {r.caseCode && (
                        <span className="font-mono text-[10.5px] text-cyan shrink-0 hidden sm:inline">{r.caseCode}</span>
                      )}
                      {/* De quién es el pendiente: solo importa en la lista de la clínica */}
                      {scope === 'clinic' && r.providerName && (
                        <span className="text-[11px] text-text-muted shrink-0 hidden md:inline">{r.providerName}</span>
                      )}
                      <TagPill
                        label={r.hasDraft ? t('badgeDraft') : t('badgeNoNote')}
                        colorClass={r.hasDraft
                          ? 'bg-amber/15 text-amber border-amber/30'
                          : 'bg-rose/15 text-rose border-rose/30'}
                      />
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${ageTone(r.ageDays)}`}>
                        {r.ageDays === 0 ? t('today') : t('daysShort', { days: r.ageDays })}
                      </span>

                      <span className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <a
                          href={hrefFor(r.appointmentId)}
                          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet hover:underline"
                        >
                          {t('open')} <ExternalLink className="w-3 h-3" />
                        </a>

                        {canClose && r.hasDraft && (
                          <button
                            type="button"
                            onClick={() => void expand(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-emerald/30 bg-emerald/10 text-emerald hover:bg-emerald/20 transition-colors"
                          >
                            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {t('closeNote')}
                          </button>
                        )}

                        {!canClose && (
                          reminded.has(r.appointmentId) ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald">
                              <Check className="w-3 h-3" /> {t('reminded')}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void remind(r)}
                              disabled={busy === r.appointmentId || !r.providerUserId}
                              title={r.providerUserId ? t('remind') : t('noProviderUser')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-amber/30 bg-amber/10 text-amber hover:bg-amber/20 disabled:opacity-40 transition-colors"
                            >
                              {busy === r.appointmentId
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Send className="w-3 h-3" />}
                              <span className="hidden sm:inline">{t('remind')}</span>
                            </button>
                          )
                        )}
                      </span>
                    </div>

                    {/* Revisión antes de cerrar. El texto va en plano: alcanza para
                        confirmar qué se está firmando, y el editor completo está a
                        un click en "Abrir". */}
                    {isOpen && canClose && (
                      <div className="px-3 pb-3 bg-bg-2/20">
                        {p === undefined ? (
                          <div className="py-3 flex items-center gap-2 text-[11.5px] text-text-muted">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          </div>
                        ) : (
                          <>
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted py-2">
                              {t('preview')}
                            </div>
                            {(() => {
                              const parts = p
                                ? ([p.chiefComplaint, p.hpi, p.ros, p.physicalExam, p.assessment, p.plan]
                                    .map(plain).filter(Boolean))
                                : [];
                              if (parts.length === 0) {
                                return (
                                  /* Las 319 notas migradas del v2 son cascarones
                                     vacíos: tienen fila pero ni una sección escrita.
                                     Acá no alcanza con decir "está vacía", hay que
                                     decir qué hacer — cerrarla es imposible (el
                                     endpoint de firma rechaza notas vacías). */
                                  <div className="text-[11.5px] text-rose flex items-start gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                    <span>{t('previewEmpty')} — {t('cantCloseEmpty')}</span>
                                  </div>
                                );
                              }
                              return (
                                <>
                                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                    {parts.map((txt, i) => (
                                      <p key={i} className="text-[12px] text-text-2 leading-relaxed">{txt}</p>
                                    ))}
                                  </div>
                                  {p && p.diagnoses.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                                      {p.diagnoses.map((d, i) => (
                                        <span key={i} className="font-mono text-[10.5px] text-cyan">
                                          {d.icd10Code}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <p className="text-[11px] text-text-muted mt-2">{t('signWarning')}</p>
                                  <Button
                                    onClick={() => void closeNote(r)}
                                    disabled={busy === r.appointmentId}
                                    className="h-9 gap-1.5 mt-2"
                                  >
                                    {busy === r.appointmentId
                                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('closing')}</>
                                      : <><Check className="w-3.5 h-3.5" /> {t('closeNote')}</>}
                                  </Button>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
