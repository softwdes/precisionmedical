'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageSquare, Settings } from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix';
import { SmsHistoryPanel } from '@/components/sms/sms-history-dialog';

export function SmsPageClient() {
  const t = useTranslations('phoenix.sms');
  /** El panel avisa cuándo se entra al editor, para que el título lo diga. */
  const [editando, setEditando] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        title={(
          <span className="flex items-center gap-2">
            {editando
              ? <Settings className="w-5 h-5 text-brand-text" />
              : <MessageSquare className="w-5 h-5 text-brand-text" />}
            {editando ? t('tplTitle') : t('title')}
          </span>
        )}
        subtitle={editando ? t('tplSubtitle') : t('subtitle')}
      />
      {/* Sin borde ni card: el panel ya trae sus propias fronteras —la línea de
          las pestañas y la de la tabla— y encerrarlo sumaría una tercera. */}
      <SmsHistoryPanel onTitulo={setEditando} />
    </div>
  );
}
