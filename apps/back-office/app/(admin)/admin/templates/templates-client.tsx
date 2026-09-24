'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  FileText, Plus, Search as SearchIcon, Pencil, Trash2,
  ChevronDown, ChevronUp, CheckCircle2, Circle,
} from 'lucide-react';
import {
  Button,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  FilterPill,
  IconAction,
  StatusPill,
  TagPill,
  DataTable,
  TableFooter,
  EmptyState,
} from '@/components/ui-phoenix';

// Catálogo de plantillas de notas clínicas

interface TemplateSection {
  id: string;
  sectionKey: string;
  content: string;
  enabledByDefault: boolean;
  orderIndex: number;
}

interface Template {
  id: string;
  title: string;
  description: string | null;
  encounterType: string;
  caseType: string;
  scope: string;
  specialty: string | null;
  isActive: boolean;
  usageCount: number;
  sections: TemplateSection[];
  visitNoteCount: number;
}

interface Props {
  templates: Template[];
  stats: {
    total: number;
    active: number;
    shared: number;
    personal: number;
    byEncounter: Record<string, number>;
  };
}

/**
 * Solo el ORDEN de cada selector: la etiqueta vive en el diccionario
 * (`enc*`, `case*`, `scope*`, `sec*`) y se resuelve al dibujar, que es el
 * único momento que conoce el idioma.
 */
const ENCOUNTERS = [
  'FOLLOW_UP', 'NEW_PATIENT', 'RE_EVAL', 'URI',
  'PHYSICAL', 'NURSING_HOME', 'CLOSING', 'OTHER',
] as const;

const CASE_TYPES = ['MVA', 'GENERAL', 'NURSING_HOME'] as const;

const SCOPES = ['PERSONAL', 'SHARED', 'SPECIALTY'] as const;

const SECTION_KEYS = [
  'QUEJA_PRINCIPAL', 'HPI', 'ROS', 'EXAMEN_FISICO',
  'EVALUACIONES', 'PLAN', 'DIAGNOSTICOS',
] as const;


const EMPTY_SECTION = (key: string, index: number) => ({
  sectionKey: key,
  content: '',
  enabledByDefault: true,
  orderIndex: index,
});

const EMPTY_FORM = {
  title: '',
  description: '',
  encounterType: 'FOLLOW_UP' as string,
  caseType: 'GENERAL' as string,
  scope: 'SHARED' as string,
  specialty: '',
  isActive: true,
  sections: SECTION_KEYS.map((k, i) => EMPTY_SECTION(k, i)),
};

type FormType = typeof EMPTY_FORM;

export function TemplatesClient({ templates, stats }: Props) {
  const t = useTranslations('phoenix.noteTemplates');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'active' | 'shared' | 'personal'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]   = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [form, setForm]         = useState<FormType>(EMPTY_FORM);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const setField = (k: keyof Omit<FormType, 'sections'>) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const toggleEnabled = (key: string) => setForm((prev) => ({
    ...prev,
    sections: prev.sections.map((s) =>
      s.sectionKey === key ? { ...s, enabledByDefault: !s.enabledByDefault } : s
    ),
  }));

  const setSectionContent = (key: string, content: string) => setForm((prev) => ({
    ...prev,
    sections: prev.sections.map((s) =>
      s.sectionKey === key ? { ...s, content } : s
    ),
  }));

  const toggleExpand = (key: string) => setExpandedSections((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const filtered = templates.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false;
    }
    if (filter === 'active'   && !t.isActive)           return false;
    if (filter === 'shared'   && t.scope !== 'SHARED')  return false;
    if (filter === 'personal' && t.scope !== 'PERSONAL') return false;
    return true;
  });

  const refresh = () => startTransition(() => router.refresh());

  function openCreate() {
    setForm(EMPTY_FORM);
    setExpandedSections(new Set());
    setError(null);
    setCreateOpen(true);
  }

  function openEdit(t: Template) {
    const sectionMap = Object.fromEntries(t.sections.map((s) => [s.sectionKey, s]));
    setForm({
      title:         t.title,
      description:   t.description ?? '',
      encounterType: t.encounterType,
      caseType:      t.caseType,
      scope:         t.scope,
      specialty:     t.specialty ?? '',
      isActive:      t.isActive,
      sections: SECTION_KEYS.map((k, i) => ({
        sectionKey:       k,
        content:          sectionMap[k]?.content ?? '',
        enabledByDefault: sectionMap[k]?.enabledByDefault ?? true,
        orderIndex:       sectionMap[k]?.orderIndex ?? i,
      })),
    });
    setExpandedSections(new Set());
    setError(null);
    setEditing(t);
  }

  async function handleSave(isEdit: boolean) {
    setSaving(true);
    setError(null);
    try {
      const body = isEdit ? { ...form, id: editing!.id } : form;
      const res = await fetch('/api/admin/templates', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? data.error ?? 'Error al guardar');
      }
      setCreateOpen(false);
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/templates?id=${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('errorDelete'));
      setDeleting(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  const FormFields = () => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      {/* Metadata */}
      <div className="space-y-1.5">
        <Label htmlFor="title">{t('fieldTitle')}</Label>
        <Input id="title" value={form.title} onChange={setField('title')} placeholder={t('phTitle')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">{t('fieldDescription')}</Label>
        <Input id="description" value={form.description} onChange={setField('description')} placeholder={t('phDescription')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="encounterType">{t('fieldEncounter')}</Label>
          <select
            id="encounterType"
            value={form.encounterType}
            onChange={setField('encounterType')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {ENCOUNTERS.map((v) => <option key={v} value={v}>{t(`enc${v}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="caseType">{t('fieldCaseType')}</Label>
          <select
            id="caseType"
            value={form.caseType}
            onChange={setField('caseType')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {CASE_TYPES.map((v) => <option key={v} value={v}>{t(`case${v}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scope">{t('fieldScope')}</Label>
          <select
            id="scope"
            value={form.scope}
            onChange={setField('scope')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {SCOPES.map((v) => <option key={v} value={v}>{t(`scope${v}`)}</option>)}
          </select>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Secciones</p>
        {form.sections.map((section) => {
          const isExpanded = expandedSections.has(section.sectionKey);
          return (
            <div key={section.sectionKey} className="rounded-md border border-border/60 bg-bg-2/30">
              <button
                type="button"
                onClick={() => toggleExpand(section.sectionKey)}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleEnabled(section.sectionKey); }}
                    className="flex-shrink-0"
                    title={section.enabledByDefault ? 'Deshabilitar por defecto' : 'Habilitar por defecto'}
                  >
                    {section.enabledByDefault
                      ? <CheckCircle2 className="w-4 h-4 text-emerald" />
                      : <Circle       className="w-4 h-4 text-text-muted" />
                    }
                  </button>
                  <span className="text-sm font-medium text-text-1">
                    {t(`sec${section.sectionKey}`)}
                  </span>
                  {section.content && (
                    <span className="text-[10px] text-text-muted">{section.content.length} chars</span>
                  )}
                </div>
                {isExpanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
                  : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                }
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-border/40 pt-2">
                  <Textarea
                    value={section.content}
                    onChange={(e) => setSectionContent(section.sectionKey, e.target.value)}
                    placeholder={t('phSection', { seccion: t(`sec${section.sectionKey}`) })}
                    className="text-sm min-h-[80px]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { activas: stats.active, compartidas: stats.shared, total: stats.total })}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Nueva Plantilla
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotal')}    value={stats.total}                         sub={t('kpiTotalSub')}    color="text-text-1" />
        <KpiCard label={t('kpiActive')}   value={stats.active}                        sub={t('kpiActiveSub')}   color="text-emerald" />
        <KpiCard label={t('kpiShared')}   value={stats.shared}                        sub={t('kpiSharedSub')}   color="text-violet-text" />
        <KpiCard label={t('kpiFollowUp')} value={stats.byEncounter['FOLLOW_UP'] ?? 0} sub={t('kpiFollowUpSub')} color="text-cyan" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterPill active={filter === 'all'}      onClick={() => setFilter('all')}      label={t('filterAll')} />
        <FilterPill active={filter === 'active'}   onClick={() => setFilter('active')}   label={t('filterActive')} />
        <FilterPill active={filter === 'shared'}   onClick={() => setFilter('shared')}   label={t('filterShared')} />
        <FilterPill active={filter === 'personal'} onClick={() => setFilter('personal')} label={t('filterPersonal')} />
      </div>

      {/* Table */}
      <DataTable.Card>
        <DataTable.Scroll>
          <DataTable.Table>
            <DataTable.Head>
              <DataTable.Th>Plantilla</DataTable.Th>
              <DataTable.Th>Encuentro</DataTable.Th>
              <DataTable.Th>{t('colCase')}</DataTable.Th>
              <DataTable.Th>Alcance</DataTable.Th>
              <DataTable.Th>Secciones</DataTable.Th>
              <DataTable.Th align="right">Usos</DataTable.Th>
              <DataTable.Th>Estado</DataTable.Th>
              <DataTable.Th align="right">Acciones</DataTable.Th>
            </DataTable.Head>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState.Inline message={search ? `Sin resultados para "${search}"` : 'No hay plantillas aún'} />
                  </td>
                </tr>
              ) : filtered.map((tpl) => (
                <DataTable.Row key={tpl.id} muted={!tpl.isActive}>
                  <DataTable.Td>
                    <div>
                      <p className="text-sm font-medium text-text-1">{tpl.title}</p>
                      {tpl.description && (
                        <p className="text-[11px] text-text-muted truncate max-w-[220px]">{tpl.description}</p>
                      )}
                    </div>
                  </DataTable.Td>
                  <DataTable.Td>
                    <span className="text-sm text-text-2">{t(`enc${tpl.encounterType}`)}</span>
                  </DataTable.Td>
                  <DataTable.Td>
                    <TagPill colorClass="bg-violet/15 text-violet-text border-violet/30" label={t(`case${tpl.caseType}`)} />
                  </DataTable.Td>
                  <DataTable.Td>
                    <TagPill
                      colorClass={
                        tpl.scope === 'SHARED'    ? 'bg-cyan/15 text-cyan border-cyan/30' :
                        tpl.scope === 'SPECIALTY' ? 'bg-amber/15 text-amber border-amber/30' :
                                                  'bg-white/5 text-text-2 border-border'
                      }
                      label={t(`scope${tpl.scope}`)}
                    />
                  </DataTable.Td>
                  <DataTable.Td>
                    <span className="text-sm tabular-nums">{tpl.sections.length}</span>
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <span className="text-sm tabular-nums">{tpl.usageCount}</span>
                  </DataTable.Td>
                  <DataTable.Td>
                    <StatusPill state={tpl.isActive ? 'active' : 'inactive'} label={tpl.isActive ? t('stActive') : t('stInactive')} />
                  </DataTable.Td>
                  <DataTable.Td align="right">
                    <div className="flex items-center gap-1 justify-end">
                      <IconAction icon={Pencil} label={t('actionEdit')}   onClick={() => openEdit(tpl)} />
                      <IconAction icon={Trash2} label={t('actionDelete')} variant="danger" onClick={() => setDeleting(tpl)} />
                    </div>
                  </DataTable.Td>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable.Table>
        </DataTable.Scroll>
        <TableFooter left={`${filtered.length} de ${templates.length} plantillas`} />
      </DataTable.Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>{t('newTitle')}</DialogTitle>
            <DialogDescription>{t('subtitleNew')}</DialogDescription>
          </DialogHeader>
          <FormFields />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCreateOpen(false)} disabled={saving}>{tc('cancel')}</Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? t('saving') : t('btnCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>{t('editTitle')}</DialogTitle>
          </DialogHeader>
          <FormFields />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditing(null)} disabled={saving}>{tc('cancel')}</Button>
            <Button className="w-full sm:w-auto" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? t('saving') : t('btnSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich('deleteDesc', {
                titulo: deleting?.title ?? '',
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</p>}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleting(null)} disabled={saving}>{tc('cancel')}</Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={saving}>
              {saving ? t('deleting') : t('btnDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
