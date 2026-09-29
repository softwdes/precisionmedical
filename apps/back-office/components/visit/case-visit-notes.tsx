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
 * El CUERPO es solo lectura para todos. Una nota cerrada es inmutable (solo un
 * Super Admin la anula) y una abierta se edita donde se escribe, en la consulta.
 *
 * El ADDENDUM es la excepción, y no rompe esa regla: no toca el cuerpo, se
 * agrega al pie firmado y fechado aparte, con el nombre de quien lo escribe. Se
 * ofrece acá porque acá es donde la gente lo busca — Devin abrió el caso, fue a
 * la nota y no encontró dónde (2026-09-29). Mandarlo a otra pantalla era
 * esconder una acción que el servidor sí le permite.
 *
 * Los addenda que ya existen se MUESTRAN siempre, se pueda agregar o no.
 * Faltaban, y esa era la falla más seria de esta pantalla: quien venía a leer
 * una visita corregida veía la versión sin la corrección, en un archivo que
 * parecía completo.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronDown, ChevronRight, Loader2, Printer, Lock, Plus, FilePlus2, Clock,
  Unlock, Stethoscope,
} from 'lucide-react';
import { AgregarAddendumDialog } from './agregar-addendum-dialog';
import { TagPill } from '@/components/ui-phoenix';
import { safeHtml, hasText } from '@/lib/safe-html';
import type { CaseVisitNote } from '@/app/api/admin/cases/[id]/visit-notes/route';
import { VisitNotePrintDialog } from './visit-note-print-dialog';

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

/** La fecha como la escribe el resto de esta pantalla. */
const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Denver',
  });

export function CaseVisitNotes({ caseId, visitaEnfocada }: {
  caseId: string;
  /**
   * Cita de la que viene el usuario. Su nota arranca ABIERTA.
   *
   * Sin esto, entrar desde el botón "Nota" del calendario aterrizaba en el
   * acordeón colapsado con TODAS las notas del caso y había que adivinar cuál
   * era la de la cita en la que se hizo clic. El botón promete una nota, así
   * que tiene que entregar esa.
   *
   * Si esa visita no dejó nota, no hay nada que abrir y la lista queda como
   * siempre — no se inventa una fila vacía.
   */
  visitaEnfocada?: string | null;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [notes, setNotes] = React.useState<CaseVisitNote[] | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(visitaEnfocada ?? null);
  /** Cita cuya hoja imprimible se está mirando. Es una lista: guarda cuál. */
  const [printId, setPrintId] = React.useState<string | null>(null);
  /** Cita cuya nota está recibiendo un addendum. `null` = diálogo cerrado. */
  const [addendumPara, setAddendumPara] = React.useState<string | null>(null);
  /** Cita que se está reabriendo. Apaga el botón mientras viaja el pedido. */
  const [reabriendo, setReabriendo] = React.useState<string | null>(null);
  /** El rechazo, pegado a SU nota: la lista puede tener varias. */
  const [errorReabrir, setErrorReabrir] = React.useState<{ appointmentId: string; mensaje: string } | null>(null);

  /**
   * Reabre y LLEVA a la consulta, en un solo movimiento.
   *
   * La navegación no es un extra: reabrir convierte una nota firmada en
   * editable, y dejar a la persona en el expediente —donde el cuerpo es solo
   * lectura— sería desfirmar un registro clínico y no darle dónde corregirlo.
   *
   * Se usa `window.location` y no el router: la consulta es una pantalla pesada
   * que arranca de cero y tiene que leer la nota YA reabierta. Un push del
   * cliente podría servirla desde la caché con el estado anterior — que es
   * exactamente el bug del "la nota se veía vacía" del 23-sep.
   */
  const reabrir = async (appointmentId: string): Promise<void> => {
    setReabriendo(appointmentId);
    setErrorReabrir(null);
    try {
      const res = await fetch(`/api/admin/visit-notes/${appointmentId}/reopen`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}) as { motivo?: string });
        /* Los motivos que el servidor distingue se dicen con su nombre; el resto
           cae en el genérico. Que la pantalla se haya adelantado y ofrecido el
           botón igual es posible: la ventana pudo vencer entre la carga y el
           clic. */
        setErrorReabrir({
          appointmentId,
          mensaje:
            d.motivo === 'ventana-vencida' ? t('caseReopenFbExpired')
            : d.motivo === 'no-es-suya'    ? t('caseReopenFbNotYours')
            : d.motivo === 'ya-reabierta'  ? t('caseReopenFbAlready')
            : t('caseReopenFbError'),
        });
        return;
      }
      window.location.href = `/doctor/consultation/${appointmentId}`;
    } catch {
      setErrorReabrir({ appointmentId, mensaje: t('caseReopenFbError') });
    } finally {
      setReabriendo(null);
    }
  };

  /**
   * La carga, en una función propia: además del montaje la necesita el diálogo
   * de addendum, que al firmar tiene que volver a pedir la lista para que el
   * texto recién agregado aparezca en el documento.
   */
  const cargar = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/visit-notes`);
      const d = (await res.json()) as { notes?: CaseVisitNote[] };
      setNotes(d.notes ?? []);
    } catch {
      // Se deja lo último bueno; si nunca hubo nada, lista vacía.
      setNotes((prev) => prev ?? []);
    }
  }, [caseId]);

  React.useEffect(() => { void cargar(); }, [cargar]);

  /**
   * El modal no se desmonta al cambiar de visita dentro del mismo caso, así que
   * el estado inicial no alcanza: sin esto, volver al calendario, abrir otra
   * cita y darle a "Nota" dejaba desplegada la nota anterior.
   */
  React.useEffect(() => {
    if (visitaEnfocada) setOpenId(visitaEnfocada);
  }, [visitaEnfocada]);

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
                {/* La archivada NO es "abierta": vino de Medusa cerrada, y
                    pintarla de ámbar la haría parecer trabajo pendiente — que es
                    justo lo que archivarla vino a resolver. Gris, porque es
                    historia y no una tarea. */}
                {n.status === 'SIGNED'
                  ? <TagPill label={t('noteSigned')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
                  : n.status === 'ARCHIVED'
                    ? <TagPill label={t('noteArchived')} colorClass="bg-bg-2 text-text-muted border-border" />
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

                {/* LA VENTANA DE CORRECCIÓN, dicha en la pantalla donde se
                    pregunta. El botón de reabrir vive en la consulta y se va
                    solo a las 48 h; sin esta línea, quien viene al expediente
                    ve que "desapareció" y no sabe si se rompió algo. Fue
                    literalmente la pregunta de Devin. */}
                {n.ventanaCorreccion && (
                  <div className={`mt-3 rounded-md px-3 py-2 text-[11px] ${
                    n.ventanaCorreccion.abierta
                      ? 'bg-bg-2/40 text-text-muted'
                      : 'border border-amber/30 bg-amber/10 text-amber'
                  }`}>
                    <div className="flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        {n.ventanaCorreccion.abierta
                          ? t('caseReopenOpen', { date: fechaCorta(n.ventanaCorreccion.venceEn) })
                          : t('caseReopenClosed', { date: fechaCorta(n.ventanaCorreccion.venceEn) })}
                      </span>
                    </div>

                    {/* EL BOTÓN, acá mismo. Antes esta línea decía "se hace desde
                        la consulta" y ahí terminaba: Devin fue a buscarla y no la
                        encontró, ni por el calendario (2026-09-29). Una
                        instrucción que no se puede seguir es peor que no decir
                        nada.

                        Reabre Y NAVEGA. Dejarlo en el expediente sin llevarlo a
                        la consulta sería lo peor de los dos mundos: la nota
                        firmada queda editable y la persona sin dónde editarla. */}
                    {n.puedeReabrir && (
                      <button
                        type="button"
                        disabled={reabriendo !== null}
                        onClick={() => void reabrir(n.appointmentId)}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-violet-text hover:underline disabled:opacity-50"
                      >
                        {reabriendo === n.appointmentId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Unlock className="w-3.5 h-3.5" />}
                        {t('caseReopenAction')}
                      </button>
                    )}
                  </div>
                )}

                {errorReabrir?.appointmentId === n.appointmentId && (
                  <div className="mt-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
                    {errorReabrir.mensaje}
                  </div>
                )}

                {/* ── Addenda ────────────────────────────────────────────────
                    Lo agregado después de firmar. Va al pie, que es su lugar en
                    el documento. */}
                {(n.addenda.length > 0 || n.puedeAgregarAddendum) && (
                  <div className="mt-3 pt-3 border-t border-row-sep space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                        {t('caseAddenda')}
                      </span>
                      {n.puedeAgregarAddendum && (
                        <button
                          type="button"
                          onClick={() => setAddendumPara(n.appointmentId)}
                          className="text-[11px] font-semibold text-violet-text hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> {t('caseAddendumAdd')}
                        </button>
                      )}
                    </div>

                    {n.addenda.map((ad) => (
                      <div key={ad.id} className="rounded-md bg-bg-2/40 px-3 py-2.5">
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-violet-text">
                          {t('caseAddendumNumber', { n: ad.numero })}
                        </div>
                        <div className="text-[10.5px] text-text-muted mt-0.5">
                          {t('caseAddendumSignedBy', {
                            name: ad.signedByName ?? '—',
                            date: new Date(ad.signedAt).toLocaleString(undefined, {
                              day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                              timeZone: 'America/Denver',
                            }),
                          })}
                        </div>
                        <div
                          className="text-[12.5px] text-text-2 leading-relaxed mt-1.5 [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5"
                          dangerouslySetInnerHTML={{ __html: safeHtml(ad.texto) }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Por qué NO se puede, cuando la nota está firmada y es de otro
                    provider. Se dice en vez de no mostrar nada: un pie mudo no
                    distingue "la función no existe" de "no es para vos". */}
                {n.status === 'SIGNED' && n.motivoSinAddendum === 'no-es-suya' && n.addenda.length === 0 && (
                  <div className="mt-3 pt-3 border-t border-row-sep text-[11px] text-text-muted flex items-start gap-1.5">
                    <FilePlus2 className="w-3.5 h-3.5 shrink-0 mt-px" /> {t('caseAddendumNotYours')}
                  </div>
                )}

                <div className="flex items-center gap-4 flex-wrap mt-3">
                  {/* LA PUERTA A LA CONSULTA, que no existía en ningún lado para
                      una nota ya firmada.

                      A la consulta se entraba por dos lados: Mi Día del día de
                      la visita —hay que saber la fecha— y la cola de notas sin
                      cerrar, que EXCLUYE las firmadas. O sea que para una nota
                      firmada no había ninguna lista que la ofreciera. El
                      calendario del doctor reusa el del admin y abre el panel de
                      la cita, que tampoco lleva.

                      Va SIEMPRE, no solo dentro de la ventana: la consulta es
                      también donde se ven los cargos, los labs y las recetas de
                      esa visita. Y solo para el dueño (`esMiVisita`), porque la
                      consulta filtra por provider y a otro le daría 404. */}
                  {n.esMiVisita && (
                    <a
                      href={`/doctor/consultation/${n.appointmentId}`}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-violet-text hover:underline"
                    >
                      <Stethoscope className="w-3.5 h-3.5" /> {t('caseOpenVisit')}
                    </a>
                  )}

                  {n.status === 'SIGNED' && (
                    <button
                      type="button"
                      onClick={() => setPrintId(n.appointmentId)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-violet hover:underline"
                    >
                      <Printer className="w-3.5 h-3.5" /> {t('sumPrintNote')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <VisitNotePrintDialog appointmentId={printId} onClose={() => setPrintId(null)} />

      {/* Al firmarlo se recarga la lista: el addendum recién escrito tiene que
          aparecer en el documento, no después de recargar la página. */}
      <AgregarAddendumDialog
        appointmentId={addendumPara}
        onClose={() => setAddendumPara(null)}
        onFirmado={() => { setAddendumPara(null); void cargar(); }}
      />
    </div>
  );
}
