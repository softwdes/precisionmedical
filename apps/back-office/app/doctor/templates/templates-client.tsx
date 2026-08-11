'use client';

/**
 * Portal Médico · Plantillas clínicas — client (B.17.7 · T3+T4)
 *
 * Lista con favoritos personales + modal crear/editar con las 6 secciones en
 * editor rich text y el bloque de Diagnósticos (pares ICD-10 ↔ SNOMED).
 *
 * Reglas: plantillas globales · doctor crea y edita · solo admin elimina.
 * Los diagnósticos se guardan como JSON en el content de la sección
 * DIAGNOSTICOS (el resto de secciones guarda HTML).
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Label, Input,
} from '@precision/ui';
import {
  Plus, Search, Star, Pencil, Trash2, FileText, Loader2, X, Stethoscope, Eye,
} from 'lucide-react';
import {
  PageHeader, DataTable, TableFooter, EmptyState, IconAction, TagPill, RichTextEditor, useToast,
} from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { DiagnosisPicker, type DiagnosisRow } from '@/components/visit/diagnosis-picker';
import { useTransitionProgress } from '@/components/layout/navigation-progress';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TemplateSectionData {
  sectionKey: string;
  content: string;
  enabledByDefault: boolean;
  orderIndex: number;
}

export interface DoctorTemplate {
  id: string;
  title: string;
  description: string | null;
  encounterType: string;
  caseType: string;
  scope: string;
  isActive: boolean;
  usageCount: number;
  notesCount: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  sections: TemplateSectionData[];
}

/** Diagnóstico asociado a la plantilla (par ICD-10 ↔ SNOMED) */
interface TemplateDx {
  icd10Code: string;
  icd10Description: string;
  snomedCode: string | null;
  snomedDescription: string | null;
}

const PAGE_SIZE = 10;

/** Secciones de texto en el orden del formulario (Diagnósticos aparte) */
const TEXT_SECTIONS = ['QUEJA_PRINCIPAL', 'HPI', 'ROS', 'EXAMEN_FISICO', 'EVALUACIONES', 'PLAN'] as const;

const ENCOUNTER_TYPES = ['FOLLOW_UP', 'NEW_PATIENT', 'RE_EVAL', 'URI', 'PHYSICAL', 'NURSING_HOME', 'CLOSING', 'OTHER'] as const;
const CASE_TYPES = ['MVA', 'GENERAL', 'NURSING_HOME'] as const;

function parseDx(content: string): TemplateDx[] {
  if (!content?.trim()) return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as TemplateDx[]) : [];
  } catch { return []; }
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function TemplatesClient({
  templates, userId, canDelete,
}: {
  templates: DoctorTemplate[];
  userId: string | null;
  canDelete: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const toast = useToast();

  // El refresh de la lista después de guardar/borrar va en una transición:
  // con isPending activo se deshabilitan las acciones de la fila para que no
  // se pueda reabrir Ver/Editar con datos viejos antes de que llegue el
  // refetch — si no, "guarda pero no se ve al toque" (hay que cerrar y
  // volver a abrir para que aparezca el cambio).
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);

  const [search, setSearch] = React.useState('');
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [favIds, setFavIds] = React.useState<Set<string>>(
    () => new Set(templates.filter((x) => x.isFavorite).map((x) => x.id)),
  );

  // Modal de plantilla
  const [editing, setEditing] = React.useState<DoctorTemplate | null>(null);
  const [viewing, setViewing] = React.useState<DoctorTemplate | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<DoctorTemplate | null>(null);

  React.useEffect(() => { setPage(1); }, [search, onlyFavorites]);

  const filtered = templates.filter((x) => {
    if (onlyFavorites && !favIds.has(x.id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return x.title.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q);
  });
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const toggleFavorite = async (tpl: DoctorTemplate): Promise<void> => {
    const isFav = favIds.has(tpl.id);
    setFavIds((s) => {
      const next = new Set(s);
      if (isFav) next.delete(tpl.id); else next.add(tpl.id);
      return next;
    });
    try {
      await fetch(`/api/admin/templates/${tpl.id}/favorite`, { method: isFav ? 'DELETE' : 'POST' });
    } catch { /* estado optimista; el refresh trae la verdad */ }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleting) return;
    const res = await fetch(`/api/admin/templates?id=${deleting.id}`, { method: 'DELETE' });
    setDeleting(null);
    if (!res.ok) { toast.error(t('tplErrDelete')); return; }
    toast.success(t('tplDeletedSuccess'));
    startTransition(() => { router.refresh(); });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('templatesTitle')}
        subtitle={t('templatesSubtitleCount', { count: templates.length })}
        action={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> {t('tplNew')}
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tplSearch')}
            className="w-full h-9 rounded-md border border-border bg-bg-2 pl-8 pr-3 text-[13px] text-text-1 placeholder:text-text-muted outline-none focus:border-violet/50"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyFavorites((v) => !v)}
          className={`h-9 px-3 rounded-md border text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
            onlyFavorites ? 'border-amber/50 bg-amber/10 text-amber' : 'border-border text-text-2 hover:bg-white/5'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-amber' : ''}`} />
          {t('pickFavorites')}
        </button>
      </div>

      {/* Tabla */}
      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>{t('tplColTitle')}</DataTable.Th>
              <DataTable.Th>{t('tplColDescription')}</DataTable.Th>
              <DataTable.Th>{t('tplColType')}</DataTable.Th>
              <DataTable.Th>{t('tplColFavorite')}</DataTable.Th>
              <DataTable.Th>{t('tplColUpdated')}</DataTable.Th>
              <DataTable.Th align="right">{t('tplColActions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState.Inline message={search || onlyFavorites ? t('tplNoResults') : t('tplEmpty')} />
                  </td>
                </tr>
              ) : paginated.map((tpl) => {
                const isFav = favIds.has(tpl.id);
                return (
                  <DataTable.Row key={tpl.id} muted={!tpl.isActive}>
                    <DataTable.Td className="!py-1">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-violet-text shrink-0" />
                        <span className="font-medium text-text-1 text-sm">{tpl.title}</span>
                      </div>
                    </DataTable.Td>
                    <DataTable.Td className="!py-1">
                      <span className="text-[12.5px] text-text-2">{tpl.description ?? '—'}</span>
                    </DataTable.Td>
                    <DataTable.Td className="!py-1">
                      <TagPill
                        label={t(`enc_${tpl.encounterType}`)}
                        colorClass="bg-violet/15 text-violet-text border-violet/30"
                      />
                    </DataTable.Td>
                    <DataTable.Td className="!py-1">
                      <button type="button" onClick={() => void toggleFavorite(tpl)} aria-label={t('pickFavorites')}>
                        <Star className={`w-4 h-4 transition-colors ${isFav ? 'fill-amber text-amber' : 'text-text-muted hover:text-amber'}`} />
                      </button>
                    </DataTable.Td>
                    <DataTable.Td className="!py-1">
                      <span className="text-[12px] text-text-muted">{fmtDate(tpl.updatedAt, 'es-US')}</span>
                    </DataTable.Td>
                    <DataTable.Td align="right" className="!py-1">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction icon={Eye} label={t('tplView')} onClick={() => setViewing(tpl)} disabled={isPending} />
                        <IconAction icon={Pencil} label={t('tplEdit')} onClick={() => setEditing(tpl)} disabled={isPending} />
                        {/* Eliminar: solo admin (el doctor no puede) */}
                        {canDelete && (
                          <IconAction icon={Trash2} label={t('tplDelete')} variant="danger" onClick={() => setDeleting(tpl)} disabled={isPending} />
                        )}
                      </div>
                    </DataTable.Td>
                  </DataTable.Row>
                );
              })}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter
          left={t('tplFooter', { shown: paginated.length, total: filtered.length })}
          right={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-muted">{t('tplPage', { page, pages: totalPages })}</span>
              <button
                type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="h-7 px-2 rounded border border-border text-[11px] text-text-2 hover:bg-white/5 disabled:opacity-40"
              >{t('pickPrev')}</button>
              <button
                type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="h-7 px-2 rounded border border-border text-[11px] text-text-2 hover:bg-white/5 disabled:opacity-40"
              >{t('pickNext')}</button>
            </div>
          }
        />
      </DataTable.Card>

      {/* Modal crear / editar */}
      {(creating || editing) && (
        <TemplateDialog
          template={editing}
          userId={userId}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            toast.success(editing ? t('tplSavedSuccess') : t('tplCreatedSuccess'));
            setCreating(false);
            setEditing(null);
            startTransition(() => { router.refresh(); });
          }}
        />
      )}

      {/* Modal ver (solo lectura) */}
      {viewing && (
        <TemplateDialog
          template={viewing}
          userId={userId}
          readOnly
          onClose={() => setViewing(null)}
          onSaved={() => setViewing(null)}
        />
      )}

      {/* Confirmar eliminación (solo admin llega acá) */}
      {deleting && (
        <ConfirmDialog
          open
          variant="danger"
          title={t('tplDeleteTitle')}
          description={t('tplDeleteConfirm', { title: deleting.title })}
          confirmLabel={t('tplDelete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ─── Modal de plantilla ──────────────────────────────────────────────────────

function TemplateDialog({
  template, userId, onClose, onSaved, readOnly = false,
}: {
  template: DoctorTemplate | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
  readOnly?: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const isEdit = !!template;

  const [title, setTitle] = React.useState(template?.title ?? '');
  const [description, setDescription] = React.useState(template?.description ?? '');
  const [encounterType, setEncounterType] = React.useState(template?.encounterType ?? 'FOLLOW_UP');
  const [caseType, setCaseType] = React.useState(template?.caseType ?? 'GENERAL');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  // Contenido HTML por sección de texto
  const [content, setContent] = React.useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const key of TEXT_SECTIONS) {
      map[key] = template?.sections.find((s) => s.sectionKey === key)?.content ?? '';
    }
    return map;
  });

  // Diagnósticos (JSON en la sección DIAGNOSTICOS)
  const [dx, setDx] = React.useState<TemplateDx[]>(
    () => parseDx(template?.sections.find((s) => s.sectionKey === 'DIAGNOSTICOS')?.content ?? ''),
  );
  const [dxMode, setDxMode] = React.useState<'ICD10' | 'SNOMED'>('ICD10');
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const addDx = (row: DiagnosisRow): void => {
    setDx((list) => {
      if (list.some((d) => d.icd10Code === row.icd10Code)) return list;
      return [...list, {
        icd10Code: row.icd10Code,
        icd10Description: row.icd10Description,
        snomedCode: row.snomedCode,
        snomedDescription: row.snomedDescription,
      }];
    });
  };

  const save = async (): Promise<void> => {
    if (!title.trim()) { setError(t('tplErrTitle')); return; }
    setSaving(true);
    setError('');

    const sections = [
      ...TEXT_SECTIONS.map((key, i) => ({
        sectionKey: key,
        content: content[key] ?? '',
        enabledByDefault: true,
        orderIndex: i,
      })),
      {
        sectionKey: 'DIAGNOSTICOS' as const,
        content: dx.length ? JSON.stringify(dx) : '',
        enabledByDefault: true,
        orderIndex: 6,
      },
    ];

    try {
      const res = await fetch('/api/admin/templates', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: template!.id } : {}),
          title: title.trim(),
          description: description.trim() || null,
          encounterType,
          caseType,
          scope: 'SHARED', // plantillas globales
          isActive: true,
          sections,
        }),
      });
      if (!res.ok) {
        // `.catch` porque un 500 devuelve HTML, no JSON: sin esto el error real
        // se perdía en el catch de abajo y siempre se veía el mensaje genérico.
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error === 'USER_NOT_LINKED' ? t('tplErrNoUser') : t('tplErrSave'));
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError(t('tplErrSave'));
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[92vh]">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="text-[15px]">
              {readOnly ? t('tplViewTitle') : isEdit ? t('tplEditTitle') : t('tplNewTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">
            {/* Cabecera */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('tplFieldTitle')} *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('tplTitlePlaceholder')} disabled={readOnly} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('tplFieldDescription')}</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('tplDescPlaceholder')} disabled={readOnly} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('tplFieldEncounter')}</Label>
                <select
                  value={encounterType}
                  onChange={(e) => setEncounterType(e.target.value)}
                  disabled={readOnly}
                  className="w-full h-9 rounded-md border border-border bg-bg-2 px-2 text-[13px] text-text-1 outline-none focus:border-violet/50 disabled:opacity-60"
                >
                  {ENCOUNTER_TYPES.map((v) => <option key={v} value={v}>{t(`enc_${v}`)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('tplFieldCase')}</Label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  disabled={readOnly}
                  className="w-full h-9 rounded-md border border-border bg-bg-2 px-2 text-[13px] text-text-1 outline-none focus:border-violet/50 disabled:opacity-60"
                >
                  {CASE_TYPES.map((v) => <option key={v} value={v}>{t(`case_${v}`)}</option>)}
                </select>
              </div>
            </div>

            {/* Secciones con editor rich text */}
            {TEXT_SECTIONS.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label>{t(`sec_${key}`)}</Label>
                <RichTextEditor
                  value={content[key] ?? ''}
                  onChange={(html) => setContent((c) => ({ ...c, [key]: html }))}
                  placeholder={t('tplWriteHere')}
                  minHeight={140}
                  disabled={readOnly}
                />
              </div>
            ))}

            {/* Diagnósticos */}
            <div className="space-y-1.5">
              <Label>{t('sec_DIAGNOSTICOS')}</Label>
              <div className="rounded-lg bg-bg-2/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[13px] font-semibold text-text-1">
                      {t('dxAdded', { count: dx.length })}
                    </div>
                    <div className="text-[11px] text-text-muted">{t('dxHint')}</div>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={dxMode}
                        onChange={(e) => setDxMode(e.target.value as 'ICD10' | 'SNOMED')}
                        className="h-9 rounded-md border border-border bg-bg-2 px-2 text-[12px] text-text-1 outline-none focus:border-violet/50"
                      >
                        <option value="ICD10">ICD-10</option>
                        <option value="SNOMED">SNOMED</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="h-9 px-3 rounded-md text-white text-[12px] font-semibold flex items-center gap-1.5"
                        style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {dxMode === 'ICD10' ? t('dxAddIcd') : t('dxAddSnomed')}
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
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {dx.length === 0 ? (
                        <tr><td colSpan={3} className="px-3 py-6 text-center text-text-muted">{t('dxEmpty')}</td></tr>
                      ) : dx.map((d, i) => (
                        <tr key={`${d.icd10Code}-${i}`} className="border-t border-row-sep">
                          <td className="px-3 py-2">
                            <span className="font-mono text-[11px] text-violet-text">{d.icd10Code}</span>
                            <span className="text-text-2 ml-2">{d.icd10Description}</span>
                          </td>
                          <td className="px-3 py-2">
                            {d.snomedCode ? (
                              <>
                                <span className="font-mono text-[11px] text-cyan">{d.snomedCode}</span>
                                <span className="text-text-muted ml-2">{d.snomedDescription}</span>
                              </>
                            ) : <span className="text-text-muted">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => setDx((list) => list.filter((_, idx) => idx !== i))}
                                className="text-text-muted hover:text-rose transition-colors"
                                aria-label={t('dxRemove')}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">{error}</div>
            )}
          </div>

          <DialogFooter className="px-5 py-4 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
            {readOnly ? (
              <Button onClick={onClose} className="w-full sm:w-auto">{t('tplClose')}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t('tplCancel')}</Button>
                <Button onClick={() => void save()} disabled={saving} className="w-full sm:w-auto gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
                  {isEdit ? t('tplSave') : t('tplCreate')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiagnosisPicker
        open={pickerOpen}
        mode={dxMode}
        userId={userId}
        onClose={() => setPickerOpen(false)}
        onPick={addDx}
      />
    </>
  );
}
