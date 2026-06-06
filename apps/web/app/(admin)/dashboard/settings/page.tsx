'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Card, CardContent, CardHeader, CardTitle, Badge, Button, Label, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn,
} from '@precision/ui';
import { CheckCircle, Globe, Database, Mail, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { ClinicsTab } from './clinics-tab';

type Tab = 'general' | 'clinics';

export default function SettingsPage(): React.ReactElement {
  const t = useTranslations();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [general, setGeneral] = useState({ companyName: 'Precision Medical', timezone: 'America/Denver', dateFormat: 'MM/DD/YYYY' });

  const integrations = [
    { name: 'LienMaster Recovery', description: t('settings.supabaseDesc'), status: 'connected', icon: Database },
    { name: 'Resend',              description: t('settings.resendDesc'),   status: 'connected', icon: Mail },
    { name: 'Vercel',              description: t('settings.vercelDesc'),   status: 'connected', icon: Globe },
    { name: 'Sentry',              description: t('settings.sentryDesc'),   status: 'connected', icon: Shield },
  ];

  return (
    <div className="px-3 py-4 sm:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-1">{t('settings.title')}</h1>
        <p className="text-small text-text-3">{t('settings.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border -mx-3 sm:-mx-6 px-3 sm:px-6">
        {([
          { id: 'general' as Tab, label: t('settings.tabs.general') },
          { id: 'clinics' as Tab, label: t('settings.tabs.clinics') },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-brand text-brand'
                : 'border-transparent text-text-3 hover:text-text-2',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'clinics' && <ClinicsTab />}

      {activeTab === 'general' && (
        <div className="space-y-6 max-w-3xl">
          {/* General */}
          <Card>
            <CardHeader><CardTitle>{t('settings.general')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('settings.companyName')}</Label>
                <Input value={general.companyName} onChange={(e) => setGeneral(g => ({ ...g, companyName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('settings.timezoneLabel')}</Label>
                  <Select value={general.timezone} onValueChange={(v) => setGeneral(g => ({ ...g, timezone: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Denver">Mountain Time (UTC-7)</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time (UTC-5)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (UTC-8)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('settings.dateFormat')}</Label>
                  <Select value={general.dateFormat} onValueChange={(v) => setGeneral(g => ({ ...g, dateFormat: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => toast.success(t('settings.saved'))}>{t('settings.saveChanges')}</Button>
              </div>
            </CardContent>
          </Card>

          {/* Integrations */}
          <Card>
            <CardHeader><CardTitle>{t('settings.integrations')}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {integrations.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.name} className="flex items-center justify-between p-3 rounded border border-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-surface border border-border">
                        <Icon className="h-4 w-4 text-text-2" />
                      </div>
                      <div>
                        <p className="text-small font-semibold text-text-1">{item.name}</p>
                        <p className="text-tiny text-text-3">{item.description}</p>
                      </div>
                    </div>
                    <Badge variant={item.status === 'connected' ? 'success' : 'warning'}>
                      {item.status === 'connected' ? t('settings.connected') : t('settings.pendingIntegration')}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Version */}
          <Card>
            <CardHeader><CardTitle>{t('settings.version')}</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Badge variant="info">v1.0.0-phase1</Badge>
                <span className="text-small text-text-3">{t('settings.phase1')}</span>
              </div>
              <p className="mt-2 text-tiny text-text-muted">{t('settings.lastUpdate')} {new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES')}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
