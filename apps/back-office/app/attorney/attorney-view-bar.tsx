'use client';

/**
 * AttorneyViewBar — barra "viendo como" del Portal Legal.
 *
 * Espejo de `DoctorViewBar`. Aparece solo para admins, que entran al portal sin
 * ficha de abogado propia (soporte, demos, QA). Al elegir un despacho, todo el
 * portal se muestra tal como lo ve ese bufete: la elección vive en una cookie
 * que lee `getSessionLawyer`.
 *
 * Se deja bien visible que NO es la vista propia, para que nadie confunda la
 * pantalla de soporte con la del abogado real.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Loader2, X } from 'lucide-react';
import { useTransitionProgress } from '@/components/layout/navigation-progress';

export interface FirmOption {
  id: string;
  label: string;
}

interface Props {
  firms: FirmOption[];
  /** Bufete elegido ('' si todavía no eligió) */
  currentId: string;
}

export function AttorneyViewBar({ firms, currentId }: Props): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);
  const [saving, setSaving] = React.useState(false);

  async function select(id: string): Promise<void> {
    if (id === currentId) return;
    setSaving(true);
    try {
      const res = id
        ? await fetch('/api/attorney/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lawyerId: id }),
          })
        : await fetch('/api/attorney/view', { method: 'DELETE' });
      if (!res.ok) return;
      startTransition(() => { router.refresh(); });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber/30 bg-amber/[0.07] px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 shrink-0">
        {saving || isPending
          ? <Loader2 className="w-4 h-4 text-amber animate-spin" />
          : <Eye className="w-4 h-4 text-amber" />}
        <span className="text-[12px] font-semibold text-amber">{t('viewAsLabel')}</span>
      </div>

      <div className="flex-1 min-w-[240px]">
        <select
          value={currentId}
          onChange={(e) => void select(e.target.value)}
          className="w-full rounded-md border border-border bg-bg-1 px-3 py-1.5 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-amber/40"
        >
          <option value="">{t('viewAsPlaceholder')}</option>
          {firms.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </div>

      {currentId && (
        <button
          onClick={() => void select('')}
          className="shrink-0 text-text-muted hover:text-text-1 rounded-md p-1"
          title={t('viewAsExit')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
