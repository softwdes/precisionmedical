'use client';

/**
 * DiagnosisPicker — modal selector de diagnósticos ICD-10 / SNOMED (T4).
 *
 * Equivalente al "Select ICD-10" del v2: buscador por código o nombre, filtro
 * de favoritos (estrella por fila), filas por página 10/20/50 y paginación
 * server-side sobre los ~98K diagnósticos migrados.
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { Search, Star, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface DiagnosisRow {
  id: string;
  icd10Code: string;
  icd10Description: string;
  snomedCode: string | null;
  snomedDescription: string | null;
  isFavorite?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 'ICD10' busca/muestra por código ICD-10; 'SNOMED' prioriza el código SNOMED */
  mode: 'ICD10' | 'SNOMED';
  userId: string | null;
  onPick: (row: DiagnosisRow) => void;
}

export function DiagnosisPicker({ open, onClose, mode, userId, onPick }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [q, setQ] = React.useState('');
  const [debouncedQ, setDebouncedQ] = React.useState('');
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);
  const [pageSize, setPageSize] = React.useState(10);
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<DiagnosisRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [favIds, setFavIds] = React.useState<Set<string>>(new Set());

  // Debounce del buscador
  React.useEffect(() => {
    const id = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  React.useEffect(() => { setPage(1); }, [onlyFavorites, pageSize]);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      ...(debouncedQ ? { q: debouncedQ } : {}),
      ...(onlyFavorites ? { filter: 'favorites' } : {}),
      ...(userId ? { userId } : {}),
    });
    fetch(`/api/admin/diagnoses?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { diagnoses?: DiagnosisRow[]; total?: number; pages?: number }) => {
        const list = d.diagnoses ?? [];
        setRows(list);
        setTotal(d.total ?? 0);
        setPages(d.pages ?? 0);
        setFavIds(new Set(list.filter((r) => r.isFavorite).map((r) => r.id)));
        setLoading(false);
      })
      .catch((e) => { if ((e as Error).name !== 'AbortError') setLoading(false); });
    return () => controller.abort();
  }, [open, page, pageSize, debouncedQ, onlyFavorites, userId]);

  const toggleFav = async (row: DiagnosisRow): Promise<void> => {
    const isFav = favIds.has(row.id);
    setFavIds((s) => {
      const next = new Set(s);
      if (isFav) next.delete(row.id); else next.add(row.id);
      return next;
    });
    try {
      await fetch(`/api/admin/diagnoses/${row.id}/favorite`, { method: isFav ? 'DELETE' : 'POST' });
    } catch { /* el próximo fetch trae el estado real */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-[15px]">
            {mode === 'ICD10' ? t('pickIcdTitle') : t('pickSnomedTitle')}
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-5 pb-3 flex items-center gap-2 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={mode === 'ICD10' ? t('pickIcdSearch') : t('pickSnomedSearch')}
              className="w-full h-9 rounded-md border border-border bg-bg-2 pl-8 pr-3 text-[13px] text-text-1 placeholder:text-text-muted outline-none focus:border-violet/50"
              autoFocus
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
          <select
            value={pageSize}
            onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
            className="h-9 rounded-md border border-border bg-bg-2 px-2 text-[12px] text-text-1 outline-none focus:border-violet/50"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>{t('pickRows', { n })}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-y-auto px-5">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-bg-1">
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                <th className="w-8 py-2" />
                <th className="py-2 w-[140px]">{mode === 'ICD10' ? 'ICD-10' : 'SNOMED'}</th>
                <th className="py-2">{t('pickName')}</th>
                <th className="py-2 w-[90px] text-right">{t('pickAction')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-10 text-center text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-text-muted">{t('pickEmpty')}</td></tr>
              ) : rows.map((r) => {
                const isFav = favIds.has(r.id);
                const code = mode === 'ICD10' ? r.icd10Code : (r.snomedCode ?? '—');
                const name = mode === 'ICD10' ? r.icd10Description : (r.snomedDescription ?? r.icd10Description);
                return (
                  <tr key={r.id} className="border-t border-row-sep hover:bg-white/[0.02]">
                    <td className="py-2">
                      <button type="button" onClick={() => void toggleFav(r)} aria-label={t('pickFavorites')}>
                        <Star className={`w-3.5 h-3.5 transition-colors ${isFav ? 'fill-amber text-amber' : 'text-text-muted hover:text-amber'}`} />
                      </button>
                    </td>
                    <td className="py-2">
                      <div className="font-mono text-[12px] text-text-1">{code}</div>
                      {mode === 'ICD10' && r.snomedCode && (
                        <div className="font-mono text-[10px] text-text-muted">SNOMED {r.snomedCode}</div>
                      )}
                    </td>
                    <td className="py-2 text-text-2">{name}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => { onPick(r); onClose(); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-white text-[11px] font-semibold"
                        style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}
                      >
                        <Plus className="w-3 h-3" /> {t('pickAdd')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <span className="text-[11px] text-text-muted">
            {t('pickPageInfo', { page, pages: Math.max(1, pages), total })}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 rounded-md border border-border text-[12px] text-text-2 hover:bg-white/5 disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> {t('pickPrev')}
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 px-2.5 rounded-md border border-border text-[12px] text-text-2 hover:bg-white/5 disabled:opacity-40 flex items-center gap-1"
            >
              {t('pickNext')} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
