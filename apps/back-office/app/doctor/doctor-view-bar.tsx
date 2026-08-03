'use client';

/**
 * DoctorViewBar — barra "viendo como" del portal médico.
 *
 * Solo aparece para SUPER_ADMIN / ADMIN, que entran al portal sin perfil de
 * doctor propio (soporte, demos, QA). Al elegir un doctor, todo el portal
 * —Mi Día, Mis Pacientes, Estadísticas, Consulta— se muestra tal como lo ve
 * ese médico: la elección vive en una cookie que lee `getSessionProvider`.
 *
 * Deja claro en pantalla que NO estás viendo tu propia agenda, para que nadie
 * confunda la vista de soporte con la del médico real.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Loader2 } from 'lucide-react';
import { DoctorCombobox, type DoctorComboboxProvider } from '@/components/ui-phoenix/doctor-combobox';
import { useTransitionProgress } from '@/components/layout/navigation-progress';

interface Props {
  providers: DoctorComboboxProvider[];
  /** Doctor actualmente elegido ('' si todavía no eligió) */
  currentId: string;
}

export function DoctorViewBar({ providers, currentId }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);
  const [saving, setSaving] = React.useState(false);

  async function select(id: string): Promise<void> {
    if (!id || id === currentId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/doctor-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: id }),
      });
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
      <div className="flex-1 min-w-[220px]">
        <DoctorCombobox
          providers={providers}
          value={currentId}
          onChange={(id) => void select(id)}
          placeholder={t('viewAsPlaceholder')}
        />
      </div>
      <span className="text-[11px] text-text-muted">{t('viewAsHint')}</span>
    </div>
  );
}
