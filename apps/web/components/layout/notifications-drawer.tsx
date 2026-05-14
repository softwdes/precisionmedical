'use client';

import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { Button, cn } from '@precision-medical/ui';

const TYPE_ICONS: Record<string, string> = {
  LOW_BALANCE: '⚠️',
  PAYMENT_DUE: '💰',
  EMPLOYEE_UPDATE: '👤',
  SYSTEM: '🔔',
};

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps): React.ReactElement {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const { data: notifications = [], refetch } = trpc.notifications.list.useQuery(undefined, { enabled: open });

  const markAsRead = trpc.notifications.markAsRead.useMutation({ onSuccess: () => void refetch() });
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({ onSuccess: () => void refetch() });

  const unread = notifications.filter((n) => !n.readAt);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}

      <div
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-[360px] flex-col bg-bg-1 border-l border-border shadow-xl transition-transform duration-300 ease-out-expo',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-text-2" />
            <h2 className="font-semibold text-text-1">{t('title')}</h2>
            {unread.length > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white px-1">
                {unread.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unread.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead.mutate()}
                className="text-tiny text-text-3 gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('markAllRead')}
              </Button>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-text-3 hover:bg-surface hover:text-text-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-text-muted">
              <Bell className="h-8 w-8 opacity-20" />
              <p className="text-small">{t('empty')}</p>
            </div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 cursor-pointer hover:bg-surface transition-colors',
                    !n.readAt && 'bg-brand/5',
                  )}
                  onClick={() => { if (!n.readAt) markAsRead.mutate({ id: n.id }); }}
                >
                  <div className="text-base mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? '🔔'}</div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-small', !n.readAt ? 'font-semibold text-text-1' : 'text-text-2')}>
                      {n.title}
                    </p>
                    <p className="text-tiny text-text-3 mt-0.5">{n.body}</p>
                    <p className="text-tiny text-text-muted mt-1">
                      {new Date(n.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {!n.readAt && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markAsRead.mutate({ id: n.id }); }}
                      className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand/20 text-brand"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
