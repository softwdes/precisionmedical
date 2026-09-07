'use client';

/**
 * Snippets de una sección — lista + modal.
 *
 * Copia la pantalla de Medusa ("History of Presenting Illness Snippets": Título
 * · Descripción · editar · borrar) con el estándar de tablas del back-office
 * (`!py-1`, row-sep) y los favoritos personales de las plantillas.
 *
 * El snippet es solo HTML con formato: lo que se guarda acá es lo que cae en
 * la nota al hacer clic, y el provider lo edita ahí. Sin casillas ni campos del
 * paciente todavía — llegan en F2/F3 del plan.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Label, Input,
} from '@precision/ui';
import { Plus, Search, Star, Pencil, Trash2, Eye, Loader2, Scissors } from 'lucide-react';
import {
  PageHeader, DataTable, TableFooter, EmptyState, IconAction, RichTextEditor, HoverPreview, useToast,
} from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { useTransitionProgress } from '@/components/layout/navigation-progress';
import type { SnippetSection } from '@/lib/snippet-sections';
import { useSectionLabels, invalidateSectionLabels } from '@/lib/use-section-labels';
import { MERGE_FIELDS } from '@/lib/snippet-merge';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface SnippetRow {
  id: string;
  sectionKey: string;
  title: string;
  description: string | null;
  content: string;
  isActive: boolean;
  usageCount: number;
  isFavorite: boolean;
  updatedAt: string;
}

const PAGE_SIZE = 10;

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Cuánto texto trae el snippet, sin etiquetas, para la vista previa de la fila. */
function plainPreview(html: string, max = 90): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function SnippetsClient({
  section, snippets, canDelete,
}: {
  section: SnippetSection;
  snippets: SnippetRow[];
  canDelete: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const { label: secLabel } = useSectionLabels();
  const router = useRouter();
  const toast = useToast();

  // El refresh después de guardar/borrar va en una transición y deshabilita las
  // acciones de la fila mientras tanto — mismo motivo que en plantillas: que no
  // se pueda reabrir Editar con datos viejos antes de que llegue el refetch.
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);

  const [search, setSearch] = React.useState('');
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [favIds, setFavIds] = React.useState<Set<string>>(
    () => new Set(snippets.filter((x) => x.isFavorite).map((x) => x.id)),
  );

  const [editing, setEditing] = React.useState<SnippetRow | null>(null);
  const [viewing, setViewing] = React.useState<SnippetRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<SnippetRow | null>(null);

  React.useEffect(() => { setPage(1); }, [search, onlyFavorites, section]);

  // Al cambiar de sección llegan snippets nuevos: la estrella se rearma con ellos.
  React.useEffect(() => {
    setFavIds(new Set(snippets.filter((x) => x.isFavorite).map((x) => x.id)));
  }, [snippets]);

  const filtered = snippets.filter((x) => {
    if (onlyFavorites && !favIds.has(x.id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return x.title.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q);
  });
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const toggleFavorite = async (row: SnippetRow): Promise<void> => {
    const isFav = favIds.has(row.id);
    setFavIds((s) => {
      const next = new Set(s);
      if (isFav) next.delete(row.id); else next.add(row.id);
      return next;
    });
    try {
      await fetch(`/api/admin/snippets/${row.id}/favorite`, { method: isFav ? 'DELETE' : 'POST' });
    } catch { /* estado optimista; el refresh trae la verdad */ }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleting) return;
    const res = await fetch(`/api/admin/snippets?id=${deleting.id}`, { method: 'DELETE' });
    setDeleting(null);
    if (!res.ok) { toast.error(t('snpErrDelete')); return; }
    toast.success(t('snpDeletedSuccess'));
    startTransition(() => { router.refresh(); });
  };

  const sectionLabel = secLabel(section);
  /** Renombrar la sección — solo admin (misma condición que eliminar). */
  const [renaming, setRenaming] = React.useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t('snpTitle', { section: sectionLabel })}
            {/* El nombre de la categoría lo cambia el admin: los providers vienen
                de Medusa y la conocen como "HPI" o "PE Other". Se ve en el índice,
                en los títulos de la nota y en la impresión. */}
            {canDelete && (
              <IconAction icon={Pencil} label={t('secRename')} onClick={() => setRenaming(true)} />
            )}
          </span>
        }
        subtitle={
          <>
            {t('snpSubtitleCount', { count: snippets.length })}
            {/* Los de mensajería no caen en "la nota": el hint lo dice bien. */}
            <span className="text-text-muted"> · {t(section.startsWith('MENSAJE_') ? 'snpSubtitleHintMsg' : 'snpSubtitleHint')}</span>
          </>
        }
        action={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> {t('snpNew')}
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
            placeholder={t('snpSearch')}
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
              <DataTable.Th sticky="left">{t('snpColTitle')}</DataTable.Th>
              <DataTable.Th>{t('snpColDescription')}</DataTable.Th>
              <DataTable.Th>{t('snpColFavorite')}</DataTable.Th>
              <DataTable.Th align="right">{t('snpColUses')}</DataTable.Th>
              <DataTable.Th>{t('snpColUpdated')}</DataTable.Th>
              <DataTable.Th align="right" sticky="right">{t('snpColActions')}</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState.Inline message={search || onlyFavorites ? t('snpNoResults') : t('snpEmpty')} />
                  </td>
                </tr>
              ) : paginated.map((row) => {
                const isFav = favIds.has(row.id);
                return (
                  <DataTable.Row key={row.id} muted={!row.isActive}>
                    <DataTable.Td sticky="left" className="!py-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Scissors className="w-3.5 h-3.5 text-violet-text shrink-0" />
                        <span className="font-medium text-text-1 text-sm truncate">{row.title}</span>
                      </div>
                    </DataTable.Td>
                    <DataTable.Td className="!py-1">
                      {/* Mouse encima → el contenido completo con formato, sin
                          abrir el ojo. Con 32 snippets por sección, la única
                          forma de encontrar el correcto rápido. */}
                      <HoverPreview html={row.content} title={row.title}>
                        <span className="text-[12.5px] text-text-2 cursor-help">
                          {row.description || <span className="text-text-muted">{plainPreview(row.content) || '—'}</span>}
                        </span>
                      </HoverPreview>
                    </DataTable.Td>
                    <DataTable.Td className="!py-1">
                      <button type="button" onClick={() => void toggleFavorite(row)} aria-label={t('pickFavorites')}>
                        <Star className={`w-4 h-4 transition-colors ${isFav ? 'fill-amber text-amber' : 'text-text-muted hover:text-amber'}`} />
                      </button>
                    </DataTable.Td>
                    <DataTable.Td align="right" className="!py-1">
                      <span className="text-[12px] text-text-muted tabular-nums">{row.usageCount}</span>
                    </DataTable.Td>
                    <DataTable.Td className="!py-1">
                      <span className="text-[12px] text-text-muted">{fmtDate(row.updatedAt, 'es-US')}</span>
                    </DataTable.Td>
                    <DataTable.Td align="right" sticky="right" className="!py-1">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction icon={Eye} label={t('snpView')} onClick={() => setViewing(row)} disabled={isPending} />
                        <IconAction icon={Pencil} label={t('snpEdit')} onClick={() => setEditing(row)} disabled={isPending} />
                        {/* Eliminar: solo admin (el provider no puede) */}
                        {canDelete && (
                          <IconAction icon={Trash2} label={t('snpDelete')} variant="danger" onClick={() => setDeleting(row)} disabled={isPending} />
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
          left={t('snpFooter', { shown: paginated.length, total: filtered.length })}
          right={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-muted">{t('snpPage', { page, pages: totalPages })}</span>
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
        <SnippetDialog
          section={section}
          snippet={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            toast.success(editing ? t('snpSavedSuccess') : t('snpCreatedSuccess'));
            setCreating(false);
            setEditing(null);
            startTransition(() => { router.refresh(); });
          }}
        />
      )}

      {/* Modal ver (solo lectura) */}
      {viewing && (
        <SnippetDialog
          section={section}
          snippet={viewing}
          readOnly
          onClose={() => setViewing(null)}
          onSaved={() => setViewing(null)}
        />
      )}

      {renaming && (
        <RenameSectionDialog
          section={section}
          onClose={() => setRenaming(false)}
          onSaved={() => {
            setRenaming(false);
            toast.success(t('secRenameSaved'));
            // El nombre vive en el hook compartido (índice, nota, plantillas) y
            // en el <title> del servidor: se avisa a los dos.
            invalidateSectionLabels();
            startTransition(() => { router.refresh(); });
          }}
        />
      )}

      {/* Confirmar eliminación (solo admin llega acá) */}
      {deleting && (
        <ConfirmDialog
          open
          variant="danger"
          title={t('snpDeleteTitle')}
          description={t('snpDeleteConfirm', { title: deleting.title })}
          confirmLabel={t('snpDelete')}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ─── Renombrar la sección ────────────────────────────────────────────────────

function RenameSectionDialog({
  section, onClose, onSaved,
}: {
  section: SnippetSection;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const { overrides } = useSectionLabels();
  const [es, setEs] = React.useState(overrides[section]?.es ?? '');
  const [en, setEn] = React.useState(overrides[section]?.en ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const save = async (): Promise<void> => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/snippets/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey: section, es: es.trim(), en: en.trim() }),
      });
      if (!res.ok) { setError(t('secRenameError')); setSaving(false); return; }
      onSaved();
    } catch {
      setError(t('secRenameError'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t('secRenameTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('secRenameEs')}</Label>
            <Input value={es} onChange={(e) => setEs(e.target.value)} placeholder={t(`sec_${section}`)} maxLength={60} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{t('secRenameEn')}</Label>
            <Input value={en} onChange={(e) => setEn(e.target.value)} placeholder={t(`sec_${section}`)} maxLength={60} />
          </div>
          <p className="text-[11px] text-text-muted">{t('secRenameHint')}</p>
          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">{error}</div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t('snpCancel')}</Button>
          <Button onClick={() => void save()} disabled={saving} className="w-full sm:w-auto gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
            {t('snpSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de snippet ────────────────────────────────────────────────────────

function SnippetDialog({
  section, snippet, onClose, onSaved, readOnly = false,
}: {
  section: SnippetSection;
  snippet: SnippetRow | null;
  onClose: () => void;
  onSaved: () => void;
  readOnly?: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const { label: secLabel } = useSectionLabels();
  const isEdit = !!snippet;

  const [title, setTitle] = React.useState(snippet?.title ?? '');
  const [description, setDescription] = React.useState(snippet?.description ?? '');
  const [content, setContent] = React.useState(snippet?.content ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  // Los campos del paciente de Medusa ([Patient Name], [Age]…) con su rótulo en
  // el idioma de quien edita. El editor los inserta como chips y convierte los
  // que vengan pegados como texto.
  const mergeFields = React.useMemo(
    () => MERGE_FIELDS.map((field) => ({ field, label: t(`merge_${field.split('.')[1]}`) })),
    [t],
  );

  const save = async (): Promise<void> => {
    if (!title.trim()) { setError(t('snpErrTitle')); return; }
    // Un snippet sin texto no le agrega nada a la nota: se rechaza acá y no
    // cuando el provider hace clic y "no pasa nada".
    if (!content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim()) { setError(t('snpErrContent')); return; }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/snippets', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: snippet!.id } : {}),
          sectionKey: section,
          title: title.trim(),
          description: description.trim() || null,
          content,
          isActive: true,
        }),
      });
      if (!res.ok) {
        // `.catch` porque un 500 devuelve HTML, no JSON.
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error === 'USER_NOT_LINKED' ? t('tplErrNoUser') : t('snpErrSave'));
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError(t('snpErrSave'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[92vh]">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-[15px]">
            {readOnly ? t('snpViewTitle') : isEdit ? t('snpEditTitle') : t('snpNewTitle')}
            <span className="ml-2 text-[12px] font-normal text-text-muted">· {secLabel(section)}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('snpFieldTitle')} *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('snpTitlePlaceholder')} disabled={readOnly} autoFocus={!readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('snpFieldDescription')}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('snpDescPlaceholder')} disabled={readOnly} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('snpFieldContent')} *</Label>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder={t('tplWriteHere')}
              minHeight={260}
              disabled={readOnly}
              mergeFields={mergeFields}
              mergeFieldsLabel={t('mergePicker')}
            />
            {!readOnly && <p className="text-[11px] text-text-muted">{t('snpContentHint')}</p>}
          </div>

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">{error}</div>
          )}
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border flex-col sm:flex-row gap-2 shrink-0">
          {readOnly ? (
            <Button onClick={onClose} className="w-full sm:w-auto">{t('snpClose')}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">{t('snpCancel')}</Button>
              <Button onClick={() => void save()} disabled={saving} className="w-full sm:w-auto gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
                {isEdit ? t('snpSave') : t('snpCreate')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
