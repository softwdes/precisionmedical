'use client';

/**
 * TemplatePicker — modal para elegir una plantilla clínica y autollenar la nota.
 *
 * Dos modos:
 *   - 'full'    → carga las 6 secciones + diagnósticos de la plantilla
 *   - sección   → carga solo el contenido de esa sección (mezcla de plantillas)
 *
 * Los favoritos del doctor aparecen primero (estrella ámbar).
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Search, Star, FileText, Check } from 'lucide-react';

export interface PickableTemplate {
  id: string;
  title: string;
  description: string | null;
  encounterType: string;
  isFavorite: boolean;
  sections: Array<{ sectionKey: string; content: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  templates: PickableTemplate[];
  /** null = plantilla completa; con sectionKey = solo esa sección */
  targetSection: string | null;
  onPick: (tpl: PickableTemplate) => void;
}

export function TemplatePicker({ open, onClose, templates, targetSection, onPick }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [q, setQ] = React.useState('');

  const filtered = templates
    .filter((tpl) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return tpl.title.toLowerCase().includes(s) || (tpl.description ?? '').toLowerCase().includes(s);
    })
    // Favoritos primero, luego alfabético
    .sort((a, b) => (Number(b.isFavorite) - Number(a.isFavorite)) || a.title.localeCompare(b.title));

  /** Vista previa: cuánto contenido aporta la plantilla al destino */
  const preview = (tpl: PickableTemplate): string => {
    if (targetSection) {
      const html = tpl.sections.find((s) => s.sectionKey === targetSection)?.content ?? '';
      const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return text ? text.slice(0, 110) + (text.length > 110 ? '…' : '') : t('tplPickNoContent');
    }
    const filled = tpl.sections.filter((s) => s.sectionKey !== 'DIAGNOSTICOS' && s.content.trim()).length;
    const dx = tpl.sections.find((s) => s.sectionKey === 'DIAGNOSTICOS')?.content;
    let dxCount = 0;
    try { dxCount = dx ? (JSON.parse(dx) as unknown[]).length : 0; } catch { dxCount = 0; }
    return t('tplPickSummary', { sections: filled, dx: dxCount });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="px-5 pt-5 pb-2 shrink-0">
          <DialogTitle className="text-[15px]">
            {targetSection ? t('tplPickForSection', { section: t(`sec_${targetSection}`) }) : t('tplPickFull')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('tplSearch')}
              autoFocus
              className="w-full h-9 rounded-md border border-border bg-bg-2 pl-8 pr-3 text-[13px] text-text-1 placeholder:text-text-muted outline-none focus:border-violet/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-text-muted text-sm">{t('tplNoResults')}</div>
          ) : filtered.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => { onPick(tpl); onClose(); }}
              className="w-full text-left rounded-lg bg-bg-2/40 hover:bg-bg-2/70 border border-transparent hover:border-violet/30 px-3 py-2.5 transition-colors group"
            >
              <div className="flex items-center gap-2">
                {tpl.isFavorite
                  ? <Star className="w-3.5 h-3.5 fill-amber text-amber shrink-0" />
                  : <FileText className="w-3.5 h-3.5 text-violet shrink-0" />}
                <span className="font-semibold text-text-1 text-[13px]">{tpl.title}</span>
                {tpl.description && (
                  <span className="text-[11px] text-text-muted truncate">· {tpl.description}</span>
                )}
                <Check className="w-3.5 h-3.5 text-violet ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <div className="text-[11px] text-text-2 mt-1 line-clamp-2">{preview(tpl)}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
