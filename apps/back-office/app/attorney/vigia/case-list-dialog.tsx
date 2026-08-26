'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@precision/ui';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import { AlertCircle } from 'lucide-react';

/**
 * Portal Legal · Vigía · la lista que abre un botón de la respuesta.
 *
 * Existe para que NINGÚN botón de Vigía te saque de la pantalla. Antes "Abrir la
 * lista de casos" te mandaba a `/attorney/cases` y perdías la respuesta que
 * habías pedido; ahora la lista se muestra encima y al elegir un caso se abre el
 * expediente, que ya trae la firma adentro.
 *
 * Los datos se piden al abrir, no antes: la mayoría de las respuestas se leen y
 * se cierran sin tocar el botón, y traer la lista siempre sería pagar por algo
 * que casi nunca se mira.
 */

export type ListKind = 'stalled' | 'unsigned' | 'active';

interface Row {
  id: string;
  caseCode: string;
  motivo?: string;
  dias?: number;
  sinFirma?: boolean;
  estado?: string;
  pacienteFirmo?: boolean;
}

const TITULO: Record<ListKind, string> = {
  stalled:  'vigiaListStalledTitle',
  unsigned: 'vigiaListUnsignedTitle',
  active:   'vigiaListActiveTitle',
};

export function CaseListDialog({ kind, onClose }: {
  kind: ListKind | null;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!kind) return undefined;
    let vivo = true;
    setRows(null);
    setError(false);

    fetch(`/api/attorney/vigia/cases?kind=${kind}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fallo'))))
      .then((d: { total: number; rows: Row[] }) => {
        if (!vivo) return;
        setRows(d.rows);
        setTotal(d.total);
      })
      .catch(() => { if (vivo) setError(true); });

    return () => { vivo = false; };
  }, [kind]);

  /** Abrir un caso cierra la lista: el expediente ocupa la pantalla entera. */
  function abrirCaso(id: string): void {
    onClose();
    router.push(`/attorney/vigia?case=${id}`);
  }

  return (
    <Dialog open={!!kind} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kind ? t(TITULO[kind]) : ''}</DialogTitle>
          <DialogDescription>
            {rows ? t('vigiaListCount', { n: total, mostrando: rows.length }) : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto -mx-6">
          {!rows && !error && (
            <div className="flex items-center justify-center gap-2 py-12 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
              {t('vigiaAsking')}
            </div>
          )}

          {error && (
            <div className="py-10">
              <EmptyState.Rich icon={AlertCircle} title={t('vigiaError')} />
            </div>
          )}

          {rows?.length === 0 && (
            <div className="py-10">
              <EmptyState.Rich icon={AlertCircle} title={t('vigiaQueueClearTitle')} />
            </div>
          )}

          {rows?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => abrirCaso(r.id)}
              className="w-full flex items-center gap-3 px-6 py-2.5 border-b border-row-sep last:border-0 hover:bg-white/[0.02] transition-colors text-left group"
            >
              <span className="text-sm font-semibold text-text-1 shrink-0 min-w-[104px]">
                {r.caseCode}
              </span>
              <span className="text-[12.5px] text-text-muted flex-1 min-w-0 truncate">
                {typeof r.dias === 'number' ? t('vigiaListDays', { dias: r.dias }) : r.estado}
                {r.sinFirma && <span className="text-amber"> · {t('vigiaAlsoUnsigned')}</span>}
                {r.pacienteFirmo && <span className="text-emerald"> · {t('vigiaListPatientSigned')}</span>}
              </span>
              {r.pacienteFirmo === false && (
                <TagPill
                  label={t('vigiaListNoSignatures')}
                  colorClass="bg-bg-2/60 text-text-muted border-transparent"
                  compact
                />
              )}
              <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
