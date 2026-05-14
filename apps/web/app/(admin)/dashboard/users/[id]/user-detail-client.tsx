'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, cn,
} from '@precision-medical/ui';
import {
  ArrowLeft, Mail, Phone, Shield, Clock, Monitor, Key,
  CheckCircle, XCircle, Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type User = inferRouterOutputs<AppRouter>['users']['getById'];
type ActivityItem = inferRouterOutputs<AppRouter>['users']['listActivity'][number];

const ROLE_VARIANTS: Record<string, 'info' | 'warning' | 'secondary'> = {
  SUPER_ADMIN: 'info',
  ADMIN: 'warning',
  EMPLOYEE: 'secondary',
  LAWYER: 'secondary',
  PROVIDER: 'secondary',
  AUDITOR_AI: 'info',
};

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  INACTIVE: 'destructive',
  SUSPENDED: 'warning',
  PENDING_VERIFICATION: 'secondary',
};

const TABS = ['profile', 'security', 'activity'] as const;
type Tab = typeof TABS[number];

export function UserDetailClient({ user }: { user: User }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>('profile');
  const router = useRouter();

  const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: t('users.roles.SUPER_ADMIN'),
    ADMIN: t('users.roles.ADMIN'),
    EMPLOYEE: t('users.roles.EMPLOYEE'),
    LAWYER: t('users.roles.LAWYER'),
    PROVIDER: t('users.roles.PROVIDER'),
    AUDITOR_AI: t('users.roles.AUDITOR_AI'),
  };

  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t('users.statuses.ACTIVE'),
    INACTIVE: t('users.statuses.INACTIVE'),
    SUSPENDED: t('users.statuses.SUSPENDED'),
    PENDING_VERIFICATION: t('users.statuses.PENDING_VERIFICATION'),
  };

  const ACTION_LABELS: Record<string, string> = {
    'user.created': t('users.activityActions.userCreated'),
    'user.updated': t('users.activityActions.userUpdated'),
    'user.suspended': t('users.activityActions.userSuspended'),
    'employee.created': t('users.activityActions.employeeCreated'),
    'employee.updated': t('users.activityActions.employeeUpdated'),
    'payment.created': t('users.activityActions.paymentCreated'),
    'payment.paid': t('users.activityActions.paymentPaid'),
  };

  const TAB_LABELS: Record<Tab, string> = {
    profile: t('users.profile'),
    security: t('users.security'),
    activity: t('users.activityTab'),
  };

  const { data: activity = [] } = trpc.users.listActivity.useQuery(
    { userId: user.id },
    { enabled: tab === 'activity' },
  );

  const suspend = trpc.users.suspend.useMutation({
    onSuccess: () => { toast.success(t('users.suspended')); router.refresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/dashboard/users" className="flex h-8 w-8 items-center justify-center rounded border border-border bg-surface text-text-3 hover:text-text-1 transition-colors shrink-0 mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-brand text-base font-bold text-white shrink-0">
              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-1">{user.firstName} {user.lastName}</h1>
              <p className="text-small text-text-3 truncate max-w-[220px] sm:max-w-none">{user.email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant={ROLE_VARIANTS[user.role] ?? 'secondary'}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </Badge>
                <Badge variant={STATUS_VARIANTS[user.status] ?? 'secondary'}>
                  {STATUS_LABELS[user.status] ?? user.status}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        {user.status === 'ACTIVE' && (
          <Button
            variant="destructive"
            size="sm"
            loading={suspend.isPending}
            className="w-full sm:w-auto"
            onClick={() => {
              if (confirm(t('users.suspendConfirm'))) suspend.mutate({ id: user.id });
            }}
          >
            {t('users.suspend')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'px-4 py-2 text-small font-medium transition-colors',
              tab === tabKey
                ? 'border-b-2 border-brand text-brand -mb-px'
                : 'text-text-3 hover:text-text-2',
            )}
          >
            {TAB_LABELS[tabKey]}
          </button>
        ))}
      </div>

      {/* Profile */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-text-3" />{t('users.contact')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={Mail} label={t('auth.email')} value={user.email} />
              <InfoRow icon={Phone} label={t('employees.phone')} value={(user as { phone?: string }).phone ?? '—'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4 text-text-3" />{t('users.preferences')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={Monitor} label={t('settings.theme')} value={(user as { preferredTheme?: string }).preferredTheme === 'dark' ? t('users.dark') : t('users.light')} />
              <InfoRow icon={Monitor} label={t('settings.language')} value={(user as { preferredLocale?: string }).preferredLocale === 'es' ? t('users.spanish') : t('users.english')} />
              <InfoRow icon={Clock} label={t('users.createdAt')} value={new Date(user.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES')} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Security */}
      {tab === 'security' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Key className="h-4 w-4 text-text-3" />{t('users.security')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2 text-small text-text-3">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                {t('users.mfa')}
              </div>
              <div className="flex items-center gap-1.5">
                {(user as { mfaEnabled?: boolean }).mfaEnabled ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-emerald" />
                    <span className="text-small text-emerald">{t('users.mfaEnabled')}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-text-muted" />
                    <span className="text-small text-text-muted">{t('users.mfaDisabled')}</span>
                  </>
                )}
              </div>
            </div>
            <InfoRow
              icon={Clock}
              label={t('users.lastAccess')}
              value={(user as { lastLoginAt?: string }).lastLoginAt
                ? new Date((user as { lastLoginAt: string }).lastLoginAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES')
                : '—'}
            />
            <InfoRow
              icon={Monitor}
              label={t('users.lastLoginIp')}
              value={(user as { lastLoginIp?: string }).lastLoginIp ?? '—'}
            />
          </CardContent>
        </Card>
      )}

      {/* Activity */}
      {tab === 'activity' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-text-3" />{t('users.recentActivity')}</CardTitle></CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <div className="py-8 text-center text-small text-text-muted">{t('users.noActivity')}</div>
            ) : (
              <ul className="space-y-0">
                {activity.map((item, i) => (
                  <ActivityRow key={item.id} item={item} isLast={i === activity.length - 1} actionLabels={ACTION_LABELS} systemLabel={t('users.system')} locale={locale} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-small text-text-3 shrink-0">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </div>
      <span className="text-small text-text-1 text-right min-w-0 truncate">{value}</span>
    </div>
  );
}

function ActivityRow({ item, isLast, actionLabels, systemLabel, locale }: { item: ActivityItem; isLast: boolean; actionLabels: Record<string, string>; systemLabel: string; locale: string }): React.ReactElement {
  const actor = (item.actorUser as unknown) as { firstName: string; lastName: string } | null;

  return (
    <li className={cn('flex items-start gap-3 py-3', !isLast && 'border-b border-border/50')}>
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-tiny font-bold text-brand shrink-0 mt-0.5">
        {actor ? `${actor.firstName.charAt(0)}${actor.lastName.charAt(0)}` : '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-small text-text-1">{actionLabels[item.action] ?? item.action}</p>
        <p className="text-tiny text-text-3">
          {actor ? `${actor.firstName} ${actor.lastName}` : systemLabel} ·{' '}
          {new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
    </li>
  );
}
