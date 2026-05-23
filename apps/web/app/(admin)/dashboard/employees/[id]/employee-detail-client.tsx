'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@precision/ui';
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, Calendar, DollarSign,
  FileText, Activity, Building2, UserCheck, CreditCard, Eye, EyeOff, QrCode, Upload, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Employee = inferRouterOutputs<AppRouter>['employees']['getById'];
type ActivityItem = inferRouterOutputs<AppRouter>['employees']['listActivity'][number];

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  INACTIVE: 'destructive',
  SUSPENDED: 'warning',
  ON_LEAVE: 'secondary',
};

const TABS = ['overview', 'compensation', 'documents', 'activity'] as const;
type Tab = typeof TABS[number];

export function EmployeeDetailClient({ employee }: { employee: Employee }): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>('overview');
  const [showAccount, setShowAccount] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>((employee as { bankQrUrl?: string }).bankQrUrl ?? null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [removingQr, setRemovingQr] = useState(false);
  const router = useRouter();

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingQr(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/employees/${employee.id}/qr`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('upload failed');
      const json = await res.json() as { bankQrUrl: string };
      setQrUrl(json.bankQrUrl);
      toast.success(t('employees.qrUploaded'));
      router.refresh();
    } catch {
      toast.error(t('employees.qrUploadError'));
    } finally {
      setUploadingQr(false);
    }
  }

  async function handleQrRemove() {
    setRemovingQr(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/qr`, { method: 'DELETE' });
      if (!res.ok) throw new Error('remove failed');
      setQrUrl(null);
      toast.success(t('employees.qrRemoved'));
      router.refresh();
    } catch {
      toast.error(t('employees.qrRemoveError'));
    } finally {
      setRemovingQr(false);
    }
  }

  const TYPE_LABELS: Record<string, string> = {
    FULL_TIME: t('employees.types.FULL_TIME'),
    EXTERNAL: t('employees.types.EXTERNAL'),
    CONTRACTOR: t('employees.types.CONTRACTOR'),
  };

  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t('employees.statuses.ACTIVE'),
    INACTIVE: t('employees.statuses.INACTIVE'),
    SUSPENDED: t('employees.statuses.SUSPENDED'),
    ON_LEAVE: t('employees.statuses.ON_LEAVE'),
  };

  const ACTION_LABELS: Record<string, string> = {
    'employee.created': t('employees.activityActions.employeeCreated'),
    'employee.updated': t('employees.activityActions.employeeUpdated'),
    'employee.deactivated': t('employees.activityActions.employeeDeactivated'),
  };

  const TAB_LABELS: Record<Tab, string> = {
    overview: t('employees.overviewTab'),
    compensation: t('employees.compensationTab'),
    documents: t('employees.documentsTab'),
    activity: t('employees.activityTab'),
  };

  const { data: activity = [] } = trpc.employees.listActivity.useQuery(
    { employeeId: employee.id },
    { enabled: tab === 'activity' },
  );

  const deactivate = trpc.employees.deactivate.useMutation({
    onSuccess: () => { toast.success(t('employees.deactivated')); router.push('/dashboard/employees'); },
    onError: (e) => toast.error(e.message),
  });

  const country = employee.country as { code: string; name: string; currency: string } | null;
  const department = employee.department as { name: string } | null;
  const supervisor = employee.supervisor as { id: string; firstName: string; lastName: string } | null;
  const documents = (employee.documents as Array<{ id: string; type: string; url: string; createdAt: string }>) ?? [];

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link href="/dashboard/employees" className="flex h-8 w-8 items-center justify-center rounded border border-border bg-surface text-text-3 hover:text-text-1 transition-colors shrink-0 mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-brand text-base font-bold text-white shrink-0">
              {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-1">{employee.firstName} {employee.lastName}</h1>
              <p className="text-small text-text-3">{employee.position}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="font-mono text-tiny text-text-muted border border-border rounded px-1.5 py-0.5">
                  {employee.employeeCode}
                </span>
                <Badge variant={STATUS_VARIANTS[employee.status] ?? 'secondary'}>
                  {STATUS_LABELS[employee.status] ?? employee.status}
                </Badge>
                <Badge variant="secondary">{TYPE_LABELS[employee.type] ?? employee.type}</Badge>
              </div>
            </div>
          </div>
        </div>
        {employee.status === 'ACTIVE' && (
          <Button
            variant="destructive"
            size="sm"
            loading={deactivate.isPending}
            className="w-full sm:w-auto"
            onClick={() => {
              if (confirm(t('employees.deactivateConfirm'))) deactivate.mutate({ id: employee.id });
            }}
          >
            {t('employees.deactivate')}
          </Button>
        )}
      </div>

      {/* Tabs — 2×2 grid on mobile, horizontal underline on desktop */}
      <div className="grid grid-cols-2 gap-1.5 md:hidden">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'rounded-lg px-3 py-2 text-small font-medium text-center transition-colors border',
              tab === tabKey
                ? 'bg-brand/10 text-brand border-brand/25'
                : 'text-text-3 border-border hover:text-text-2 hover:bg-surface',
            )}
          >
            {TAB_LABELS[tabKey]}
          </button>
        ))}
      </div>
      <div className="hidden md:flex gap-1 border-b border-border">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'px-4 py-2 text-small font-medium transition-colors whitespace-nowrap',
              tab === tabKey
                ? 'border-b-2 border-brand text-brand -mb-px'
                : 'text-text-3 hover:text-text-2',
            )}
          >
            {TAB_LABELS[tabKey]}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-text-3" />{t('employees.personalInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={Mail} label={t('employees.email')} value={employee.email} />
              <InfoRow icon={Phone} label={t('employees.phone')} value={employee.phone ?? '—'} />
              <InfoRow icon={MapPin} label={t('employees.country')} value={country ? `${country.name} (${country.code})` : '—'} />
              <InfoRow icon={MapPin} label={t('employees.city')} value={(employee as { city?: string }).city ?? '—'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-text-3" />{t('employees.workInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={Building2} label={t('employees.department')} value={department?.name ?? '—'} />
              <InfoRow icon={Briefcase} label={t('employees.position')} value={employee.position} />
              <InfoRow icon={Calendar} label={t('employees.startDate')} value={employee.startDate ? new Date(employee.startDate).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES') : '—'} />
              {supervisor && (
                <InfoRow icon={UserCheck} label={t('employees.supervisor')} value={`${supervisor.firstName} ${supervisor.lastName}`} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compensation */}
      {tab === 'compensation' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-text-3" />{t('employees.compensationTab')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={DollarSign} label={t('employees.baseSalary')} value={employee.baseSalary ? `$${Number(employee.baseSalary).toLocaleString()} ${employee.baseCurrency}` : '—'} />
            <InfoRow icon={DollarSign} label={t('employees.hourlyRate')} value={(employee as { hourlyRate?: number }).hourlyRate ? `$${Number((employee as { hourlyRate: number }).hourlyRate).toFixed(2)}/hr` : '—'} />
            <InfoRow icon={CreditCard} label={t('employees.paymentMethod')} value={(employee as { paymentMethod?: string }).paymentMethod ?? '—'} />
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2 text-small text-text-3">
                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                {t('employees.bankAccount')}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-small text-text-2">
                  {(employee as { bankAccount?: string }).bankAccount
                    ? showAccount
                      ? (employee as { bankAccount: string }).bankAccount
                      : '••••••••' + ((employee as { bankAccount: string }).bankAccount ?? '').slice(-4)
                    : '—'}
                </span>
                {(employee as { bankAccount?: string }).bankAccount && (
                  <button onClick={() => setShowAccount(!showAccount)} className="text-text-muted hover:text-text-2">
                    {showAccount ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Bank QR */}
            <div className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2 text-small text-text-3 mb-2">
                <QrCode className="h-3.5 w-3.5 shrink-0" />
                {t('employees.bankQr')}
              </div>
              {qrUrl ? (
                <div className="flex items-start gap-3">
                  <img
                    src={qrUrl}
                    alt="QR bancario"
                    className="h-28 w-28 rounded-lg border border-border object-contain bg-white p-1 shrink-0"
                  />
                  <div className="flex flex-col gap-1.5 pt-1">
                    <label className="cursor-pointer">
                      <Button size="sm" variant="outline" disabled={uploadingQr} asChild>
                        <span>
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {uploadingQr ? t('common.loading') : t('employees.replaceQr')}
                          <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                        </span>
                      </Button>
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive justify-start"
                      loading={removingQr}
                      onClick={handleQrRemove}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {t('employees.removeQr')}
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer inline-block">
                  <Button size="sm" variant="outline" disabled={uploadingQr} asChild>
                    <span>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {uploadingQr ? t('common.loading') : t('employees.uploadQr')}
                      <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                    </span>
                  </Button>
                </label>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-text-3" />{t('employees.documentsTab')}</CardTitle></CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="py-8 text-center text-small text-text-muted">{t('employees.noDocuments')}</div>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between p-3 rounded border border-border">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-text-3 shrink-0" />
                      <div>
                        <p className="text-small font-medium text-text-1">{doc.type}</p>
                        <p className="text-tiny text-text-3">{new Date(doc.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES')}</p>
                      </div>
                    </div>
                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-tiny text-brand hover:underline">
                      {t('common.view')}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity */}
      {tab === 'activity' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-text-3" />{t('employees.activityTab')}</CardTitle></CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <div className="py-8 text-center text-small text-text-muted">{t('employees.noActivity')}</div>
            ) : (
              <ul className="space-y-0">
                {activity.map((item, i) => (
                  <ActivityRow key={item.id} item={item} isLast={i === activity.length - 1} actionLabels={ACTION_LABELS} systemLabel={t('employees.system')} locale={locale} />
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
