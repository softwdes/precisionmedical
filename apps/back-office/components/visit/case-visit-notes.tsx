'use client';

/**
 * Notas de las visitas de un caso — el archivo de lo que escribió el doctor.
 *
 * Cierra el ciclo de la nota: nace abierta, solo el doctor la cierra con su
 * botón, y al cerrarse queda como documento inmutable. Hasta ahora, una vez
 * terminada la cita la nota no se veía en ninguna parte.
 *
 * Vive en el tab Citas del caso, al lado de las citas que las produjeron
 * (decisión de Erick, 2026-08-13). Estuvo una tarde dentro del Historial Médico
 * y era un error de premisa: el Historial Médico es la FICHA del paciente
 * —alergias, problemas, medicamentos—, permanente y editable; la nota es el
 * documento de UNA cita, y una cita pertenece a un caso.
 *
 * La más reciente primero. Los borradores se muestran también, marcados: un
 * borrador es parte del registro de esa visita, y verlo le recuerda al doctor lo
 * que dejó sin cerrar.
 *
 * Solo lectura para todos. Una nota cerrada es inmutable (solo un Super Admin la
 * anula) y una abierta se edita donde se escribe, en la consulta.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Loader2, Printer, Lock } from 'lucide-react';
import { TagPill } from '@/components/ui-phoenix';
import { safeHtml, hasText } from '@/lib/safe-html';
import type { CaseVisitNote } from '@/app/api/admin/cases/[id]/visit-notes/route';

/**
 * Las 6 secciones, en el orden de la nota SOAP. Los títulos salen de las MISMAS
 * claves `sec_*` que usa el editor — si mañana se renombra una sección, cambia en
 * los dos lados sola.
 */
const SECTIONS: Array<{ key: keyof CaseVisitNote; labelKey: string }> = [
  { key: 'chiefComplaint', labelKey: 'sec_QUEJA_PRINCIPAL' },
  { key: 'hpi', labelKey: 'sec_HPI' },
  { key: 'ros', labelKey: 'sec_ROS' },
  { key: 'physicalExam', labelKey: 'sec_EXAMEN_FISICO' },
  { key: 'assessment', labelKey: 'sec_EVALUACIONES' },
  { key: 'plan', labelKey: 'sec_PLAN' },
];

export function CaseVisitNotes({ caseId }: { caseId: string }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [notes, setNotes] = React.useState<CaseVisitNote[] | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/cases/${caseId}/visit-notes`);
        const d = (await res.json()) as { notes?: CaseVisitNote[] };
        if (alive) setNotes(d.notes ?? []);
      } catch {
        if (alive) setNotes([]);
      }
    })();
    return () => { alive = false; };
  }, [caseId]);

  if (notes === null) {
    return (
      <div className="py-4 flex items-center gap-2 text-[12px] text-text-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </div>
    );
  }

  if (notes.length === 0) {
    return <div className="text-[12px] text-text-muted py-2">{t('visitNotesEmpty')}</div>;
  }

  return (
    <div className="space-y-1.5">
      {notes.map((n) => {
        const isOpen = openId === n.appointmentId;
        const date = new Date(n.scheduledFor).toLocaleDateString(undefined, {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Denver',
        });
        const filled = SECTIONS.filter((s) => hasText(n[s.key] as string | null));

        return (
          <div key={n.appointmentId} className="rounded-md bg-bg-2/40">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : n.appointmentId)}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-white/[0.02] transition-colors rounded-md"
            >
              {isOpen
                ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
              <span className="text-[12.5px] text-text-1 font-medium shrink-0 tabular-nums">{date}</span>
              {n.providerName && (
                <span className="text-[11.5px] text-text-2 truncate">{n.providerName}</span>
              )}
              <span className="ml-auto shrink-0 flex items-center gap-1.5">
                {/* Cuántas secciones tienen texto — se ve de un vistazo si la nota
                    quedó a medias sin tener que abrirla. */}
                <span className="text-[10.5px] text-text-muted tabular-nums">{filled.length}/6</span>
                {n.status === 'SIGNED'
                  ? <TagPill label={t('noteSigned')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
                  : <TagPill label={t('visitNoteOpen')} colorClass="bg-amber/15 text-amber border-amber/30" />}
              </span>
            </button>

            {isOpen && (
              <div className="px-3 pb-3">
                {/* 2 de 7 notas firmadas de la base no tienen firmante (migración /
                    firmas viejas): sin la guarda quedaba un candado suelto sin texto. */}
                {n.status === 'SIGNED' && (n.signedByName || n.signedAt) && (
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-2">
                    <Lock className="w-3 h-3 shrink-0" />
                    {n.signedByName}
                    {n.signedAt && ` · ${new Date(n.signedAt).toLocaleString(undefined, {
                      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                      timeZone: 'America/Denver',
                    })}`}
                  </div>
                )}

                {n.diagnoses.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {n.diagnoses.map((d, i) => (
                      <span key={i} className="text-[11px] text-text-2">
                        <span className="font-mono text-cyan">{d.icd10Code}</span>
                        {d.icd10Label && ` ${d.icd10Label}`}
                      </span>
                    ))}
                  </div>
                )}

                {filled.length === 0 ? (
                  <div className="text-[11.5px] text-text-muted italic">{t('visitNoteBlank')}</div>
                ) : (
                  <div className="space-y-2.5">
                    {filled.map((s) => (
                      <div key={String(s.key)}>
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                          {t(s.labelKey)}
                        </div>
                        {/* HTML del editor, saneado en lib/safe-html (mismo filtro
                            que la vista de impresión — una sola verdad). */}
                        <div
                          className="text-[12.5px] text-text-2 leading-relaxed [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:text-text-1"
                          dangerouslySetInnerHTML={{ __html: safeHtml(n[s.key] as string | null) }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {n.status === 'SIGNED' && (
                  <a
                    href={`/doctor-print/visit-note/${n.appointmentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-[11.5px] font-semibold text-violet hover:underline"
                  >
                    <Printer className="w-3.5 h-3.5" /> {t('sumPrintNote')}
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
