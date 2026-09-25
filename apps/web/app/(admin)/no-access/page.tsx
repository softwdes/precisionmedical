'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRole } from '@/contexts/role-context';
import { Lock, ArrowLeft, Clock } from 'lucide-react';
import { TIMECLOCK_URL } from '@/lib/app-urls';

export default function NoAccessPage(): React.ReactElement {
  const t = useTranslations();

  const role = useRole();
  const isEmployee = role === 'employee';

  const handleBack = (): void => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface border border-border mb-6">
        <Lock className="h-7 w-7 text-text-muted" />
      </div>

      {isEmployee ? (
        <>
          <h1 className="text-xl font-bold text-text-1 mb-2">{t('noAccess.employeeAccount')}</h1>
          <p className="text-sm text-text-3 max-w-sm mb-1">
            {t('noAccess.timeclockHere')}
          </p>
          <p className="text-xs text-text-muted max-w-sm mb-8">
            {t('noAccess.contactAdmin')}
          </p>
          <a
            href={TIMECLOCK_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <Clock className="h-4 w-4" />
            {t('noAccess.goToTimeclock')}
          </a>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-text-1 mb-2">{t('noAccess.title')}</h1>
          <p className="text-sm text-text-3 max-w-sm mb-1">
            {t('noAccess.noPermission')}
          </p>
          <p className="text-xs text-text-muted max-w-sm mb-8">
            {t('noAccess.contactAdmin')}
          </p>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text-2 hover:bg-surface/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </button>
        </>
      )}
    </div>
  );
}
