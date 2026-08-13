'use client';
import { localeApp } from '@/lib/fechas';

/**
 * VisitNoteEditor — nota clínica del doctor (B.18 · N1).
 *
 * Misma estructura que las plantillas: 6 secciones en editor rich text +
 * diagnósticos ICD-10 ↔ SNOMED. Los signos vitales NO están aquí (viven en el
 * nodo Triaje).
 *
 * Diferencias intencionales frente al v2:
 *   - Botón "Cargar plantilla completa" además del de cada sección.
 *   - Autoguardado cada 30 s (el v2 depende del botón manual).
 *   - Al firmar, la nota queda en solo lectura (inmutable, HIPAA).
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import {
  FileStack, Plus, X, Loader2, Check, ShieldCheck, Lock, Printer, AlertTriangle,
} from 'lucide-react';
import { RichTextEditor, TagPill } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { DiagnosisPicker, type DiagnosisRow } from './diagnosis-picker';
import { TemplatePicker, type PickableTemplate } from './template-picker';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface NoteDx {
  icd10Code: string | null;
  icd10Label: string | null;
  snomedCode: string | null;
  snomedLabel: string | null;
  diagnosisId?: string | null;
}

export interface VisitNoteData {
  status: string;                 // DRAFT | SIGNED | VOIDED
  signedAt: string | null;
  signedByName: string | null;
  templateId: string | null;
  chiefComplaint: string | null;
  hpi: string | null;
  ros: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
  diagnoses: NoteDx[];
}

interface Props {
  appointmentId: string;
  note: VisitNoteData | null;
  templates: PickableTemplate[];
  userId: string | null;
  /**
   * false para el asistente en Day Admission: puede escribir el borrador (flujo
   * de escriba) pero NO firmar — la firma es del médico y el servidor también
   * la rechaza. Default true (portal médico).
   */
  canSign?: boolean;
  /** Aviso al padre tras guardar, para que recargue la nota */
  onSaved?: () => void;
  /**
   * Avisa cuando hay cambios sin guardar. Lo usa Day Admission para NO recargar
   * la nota mientras el asistente escribe: el refresco en vivo le pisaría el
   * texto a mitad de una frase.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Campo de la nota ↔ sectionKey de la plantilla */
const SECTIONS = [
  { field: 'chiefComplaint', key: 'QUEJA_PRINCIPAL' },
  { field: 'hpi',            key: 'HPI' },
  { field: 'ros',            key: 'ROS' },
  { field: 'physicalExam',   key: 'EXAMEN_FISICO' },
  { field: 'assessment',     key: 'EVALUACIONES' },
  { field: 'plan',           key: 'PLAN' },
] as const;

type SectionField = typeof SECTIONS[number]['field'];

/**
 * Debounce del autoguardado: se guarda 2,5 s después de la ÚLTIMA tecla.
 *
 * Antes eran 30_000 y no era un debounce sino un plazo: el temporizador se
 * armaba cuando `dirty` pasaba a true y no se reiniciaba al seguir escribiendo,
 * así que la nota viajaba a la base 30 s después del primer caracter. Y el
 * editor se DESMONTA al cambiar de tab (`{tab === 'notes' && ...}`), lo que
 * cancelaba ese temporizador sin guardar: el doctor escribía, tocaba
 * "Laboratorios" antes de los 30 s y perdía el texto.
 */
const AUTOSAVE_MS = 2_500;

function parseDx(content: string): NoteDx[] {
  try {
    const arr = JSON.parse(content) as Array<{
      icd10Code?: string; icd10Description?: string;
      snomedCode?: string | null; snomedDescription?: string | null;
    }>;
    return Array.isArray(arr)
      ? arr.map((d) => ({
          icd10Code: d.icd10Code ?? null,
          icd10Label: d.icd10Description ?? null,
          snomedCode: d.snomedCode ?? null,
          snomedLabel: d.snomedDescription ?? null,
        }))
      : [];
  } catch { return []; }
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function VisitNoteEditor({
  appointmentId, note, templates, userId, canSign = true, onSaved, onDirtyChange,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();

  const isSigned = note?.status === 'SIGNED';

  const [content, setContent] = React.useState<Record<SectionField, string>>(() => ({
    chiefComplaint: note?.chiefComplaint ?? '',
    hpi:            note?.hpi ?? '',
    ros:            note?.ros ?? '',
    physicalExam:   note?.physicalExam ?? '',
    assessment:     note?.assessment ?? '',
    plan:           note?.plan ?? '',
  }));
  const [dx, setDx] = React.useState<NoteDx[]>(note?.diagnoses ?? []);
  const [templateId, setTemplateId] = React.useState<string | null>(note?.templateId ?? null);

  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState('');

  const [tplTarget, setTplTarget] = React.useState<string | null | undefined>(undefined); // undefined = cerrado
  const [dxPickerMode, setDxPickerMode] = React.useState<'ICD10' | 'SNOMED' | null>(null);
  const [confirmSign, setConfirmSign] = React.useState(false);
  const [signing, setSigning] = React.useState(false);

  // Ref con el estado más reciente para que el autosave no capture valores viejos
  const latest = React.useRef({ content, dx, templateId });
  React.useEffect(() => { latest.current = { content, dx, templateId }; }, [content, dx, templateId]);

  /**
   * Guardado de salida: dispara el PUT sin tocar estado de React.
   *
   * Se usa cuando el componente se va (cambio de tab, pestaña oculta): ahí un
   * `save()` normal no sirve porque sus `setState` caen en un componente que ya
   * no existe, y `keepalive` es lo que hace que el request sobreviva a la
   * navegación.
   */
  const flush = React.useCallback((): void => {
    if (isSigned) return;
    void fetch(`/api/admin/visit-notes/${appointmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        templateId: latest.current.templateId,
        ...latest.current.content,
        diagnoses: latest.current.dx,
      }),
    }).catch(() => undefined);
  }, [appointmentId, isSigned]);

  const save = React.useCallback(async (): Promise<boolean> => {
    if (isSigned) return false;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/visit-notes/${appointmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: latest.current.templateId,
          ...latest.current.content,
          diagnoses: latest.current.dx,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error === 'NOTE_ALREADY_SIGNED' ? t('noteAlreadySigned') : t('noteSaveError'));
        setSaving(false);
        return false;
      }
      setDirty(false);
      setSavedAt(new Date());
      setSaving(false);
      onSaved?.();
      return true;
    } catch {
      setError(t('noteSaveError'));
      setSaving(false);
      return false;
    }
  }, [appointmentId, isSigned, t, onSaved]);

  // Autoguardado con debounce: cada tecla reinicia el reloj (las deps incluyen
  // `content`/`dx`/`templateId`, no solo `dirty`).
  React.useEffect(() => {
    if (isSigned || !dirty) return;
    const id = setTimeout(() => { void save(); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [dirty, isSigned, save, content, dx, templateId]);

  // Salidas: cambio de tab (desmontaje) y pestaña que se oculta. Las dos perdían
  // el texto porque el temporizador del autoguardado se cancelaba sin guardar.
  const dirtyRef = React.useRef(dirty);
  React.useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  React.useEffect(() => {
    const onHide = (): void => { if (document.visibilityState === 'hidden' && dirtyRef.current) flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (dirtyRef.current) flush();
    };
  }, [flush]);

  // Aviso al cerrar la pestaña con cambios sin guardar
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const setSection = (field: SectionField, html: string): void => {
    setContent((c) => ({ ...c, [field]: html }));
    setDirty(true);
  };

  /** Aplica una plantilla: completa (todas las secciones + dx) o una sección */
  const applyTemplate = (tpl: PickableTemplate): void => {
    if (tplTarget) {
      const html = tpl.sections.find((s) => s.sectionKey === tplTarget)?.content ?? '';
      const field = SECTIONS.find((s) => s.key === tplTarget)?.field;
      if (field && html) setSection(field, html);
      return;
    }
    // Plantilla completa
    const next = { ...content };
    for (const { field, key } of SECTIONS) {
      const html = tpl.sections.find((s) => s.sectionKey === key)?.content ?? '';
      if (html) next[field] = html;
    }
    setContent(next);
    const dxSection = tpl.sections.find((s) => s.sectionKey === 'DIAGNOSTICOS')?.content ?? '';
    const tplDx = parseDx(dxSection);
    if (tplDx.length) {
      setDx((cur) => {
        const seen = new Set(cur.map((d) => d.icd10Code));
        return [...cur, ...tplDx.filter((d) => d.icd10Code && !seen.has(d.icd10Code))];
      });
    }
    setTemplateId(tpl.id);
    setDirty(true);
  };

  const addDx = (row: DiagnosisRow): void => {
    setDx((list) => {
      if (list.some((d) => d.icd10Code === row.icd10Code)) return list;
      return [...list, {
        icd10Code: row.icd10Code,
        icd10Label: row.icd10Description,
        snomedCode: row.snomedCode,
        snomedLabel: row.snomedDescription,
        diagnosisId: row.id,
      }];
    });
    setDirty(true);
  };

  const handleSign = async (): Promise<void> => {
    setSigning(true);
    // Guardar antes de firmar para no perder lo último escrito
    const ok = await save();
    if (!ok && dirty) { setSigning(false); setConfirmSign(false); return; }
    try {
      const res = await fetch(`/api/admin/visit-notes/${appointmentId}/sign`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error === 'NOTE_EMPTY' ? t('noteEmptyToSign') : t('noteSignError'));
        setSigning(false);
        setConfirmSign(false);
        return;
      }
      setConfirmSign(false);
      router.refresh();
    } catch {
      setError(t('noteSignError'));
      setSigning(false);
      setConfirmSign(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de estado y acciones */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {isSigned ? (
            <>
              <TagPill label={t('noteSigned')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
              <span className="text-[11px] text-text-muted">
                {t('noteSignedBy', {
                  name: note?.signedByName ?? '',
                  date: note?.signedAt
                    ? new Date(note.signedAt).toLocaleString(localeApp(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver' })
                    : '',
                })}
              </span>
            </>
          ) : (
            <>
              <TagPill label={t('noteDraft')} colorClass="bg-amber/15 text-amber border-amber/30" />
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                {saving ? (<><Loader2 className="w-3 h-3 animate-spin" /> {t('noteSaving')}</>)
                  : dirty ? t('noteUnsaved')
                  : savedAt ? (<><Check className="w-3 h-3 text-emerald" /> {t('noteSavedAt', { time: savedAt.toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit' }) })}</>)
                  : t('noteAutosaveHint')}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isSigned && (
            <>
              <button
                type="button"
                onClick={() => setTplTarget(null)}
                className="h-9 px-3 rounded-md border border-violet/40 text-violet-text text-[12px] font-semibold hover:bg-violet/10 transition-colors flex items-center gap-1.5"
              >
                <FileStack className="w-3.5 h-3.5" /> {t('noteLoadTemplate')}
              </button>
              <Button variant="outline" onClick={() => void save()} disabled={saving || !dirty} className="h-9 gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {t('noteSave')}
              </Button>
              {/* Firmar es del médico: el asistente escribe el borrador y el
                  doctor lo cierra desde su portal (el servidor también lo exige) */}
              {canSign ? (
                <Button onClick={() => setConfirmSign(true)} disabled={signing} className="h-9 gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t('noteFinish')}
                </Button>
              ) : (
                <span className="text-[11px] text-text-muted flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> {t('noteSignDoctorOnly')}
                </span>
              )}
            </>
          )}
          {isSigned && (
            <a
              href={`/doctor-print/visit-note/${appointmentId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> {t('notePrint')}
            </a>
          )}
        </div>
      </div>

      {isSigned && (
        <div className="rounded-md border border-emerald/25 bg-emerald/[0.06] px-3 py-2 text-[11px] text-emerald flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> {t('noteLockedHint')}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Secciones SOAP */}
      {SECTIONS.map(({ field, key }) => (
        <div key={field} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {t(`sec_${key}`)}
            </span>
            {!isSigned && (
              <button
                type="button"
                onClick={() => setTplTarget(key)}
                className="text-[11px] font-semibold text-violet-text hover:underline flex items-center gap-1"
              >
                <FileStack className="w-3 h-3" /> {t('noteTemplatesBtn')}
              </button>
            )}
          </div>
          {isSigned ? (
            <div
              className="rte-content rounded-md border border-border bg-bg-2/40 px-3 py-2.5 text-[13px] text-text-1 min-h-[80px]"
              dangerouslySetInnerHTML={{ __html: content[field] || `<p class="text-text-muted">—</p>` }}
            />
          ) : (
            <RichTextEditor
              value={content[field]}
              onChange={(html) => setSection(field, html)}
              placeholder={t('tplWriteHere')}
              minHeight={150}
            />
          )}
        </div>
      ))}

      {/* Diagnósticos */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
          {t('sec_DIAGNOSTICOS')}
        </span>
        <div className="rounded-lg bg-bg-2/30 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[13px] font-semibold text-text-1">{t('dxAdded', { count: dx.length })}</div>
              <div className="text-[11px] text-text-muted">{t('dxHint')}</div>
            </div>
            {!isSigned && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDxPickerMode('ICD10')}
                  className="h-9 px-3 rounded-md text-white text-[12px] font-semibold flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}
                >
                  <Plus className="w-3.5 h-3.5" /> {t('dxAddIcd')}
                </button>
                <button
                  type="button"
                  onClick={() => setDxPickerMode('SNOMED')}
                  className="h-9 px-3 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('dxAddSnomed')}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg-2/50">
                <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                  <th className="px-3 py-2">ICD-10</th>
                  <th className="px-3 py-2">SNOMED</th>
                  {!isSigned && <th className="px-3 py-2 w-10" />}
                </tr>
              </thead>
              <tbody>
                {dx.length === 0 ? (
                  <tr><td colSpan={isSigned ? 2 : 3} className="px-3 py-6 text-center text-text-muted">{t('dxEmpty')}</td></tr>
                ) : dx.map((d, i) => (
                  <tr key={`${d.icd10Code ?? d.snomedCode}-${i}`} className="border-t border-row-sep">
                    <td className="px-3 py-2">
                      {d.icd10Code ? (
                        <>
                          <span className="font-mono text-[11px] text-violet-text">{d.icd10Code}</span>
                          <span className="text-text-2 ml-2">{d.icd10Label}</span>
                        </>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {d.snomedCode ? (
                        <>
                          <span className="font-mono text-[11px] text-cyan">{d.snomedCode}</span>
                          <span className="text-text-muted ml-2">{d.snomedLabel}</span>
                        </>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    {!isSigned && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => { setDx((l) => l.filter((_, idx) => idx !== i)); setDirty(true); }}
                          className="text-text-muted hover:text-rose transition-colors"
                          aria-label={t('dxRemove')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modales */}
      {tplTarget !== undefined && (
        <TemplatePicker
          open
          templates={templates}
          targetSection={tplTarget}
          onClose={() => setTplTarget(undefined)}
          onPick={applyTemplate}
        />
      )}
      {dxPickerMode && (
        <DiagnosisPicker
          open
          mode={dxPickerMode}
          userId={userId}
          onClose={() => setDxPickerMode(null)}
          onPick={addDx}
        />
      )}
      {confirmSign && (
        <ConfirmDialog
          open
          title={t('noteSignTitle')}
          description={t('noteSignConfirm')}
          confirmLabel={t('noteFinish')}
          onConfirm={() => void handleSign()}
          onCancel={() => setConfirmSign(false)}
        />
      )}
    </div>
  );
}
