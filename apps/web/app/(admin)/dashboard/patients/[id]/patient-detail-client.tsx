'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision/ui';
import { ArrowLeft, Building2, CalendarDays, BadgeDollarSign } from 'lucide-react';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type Patient = inferRouterOutputs<AppRouter>['patients']['getById'];

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'secondary' | 'warning' | 'destructive'> = {
  NEW: 'info',
  ACTIVE: 'success',
  COMPLETED: 'secondary',
  DISCHARGED: 'warning',
  INACTIVE: 'destructive',
};

const APPT_STATUS_VARIANTS: Record<string, 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  SCHEDULED: 'info',
  CONFIRMED: 'success',
  COMPLETED: 'secondary',
  CANCELLED: 'destructive',
  NO_SHOW: 'warning',
  IN_PROGRESS: 'info',
  PENDING: 'warning',
};

export function PatientDetailClient({ patient: initial }: { patient: Patient }): React.ReactElement {
  const t = useTranslations();
  const [tab, setTab] = useState<'info' | 'appointments' | 'commissions'>('info');

  const { data: patient, refetch } = trpc.patients.getById.useQuery({ id: initial.id }, { initialData: initial });

  const updateStatus = trpc.patients.updateStatus.useMutation({
    onSuccess: () => { toast.success(t('patients.updated')); void refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const STATUS_LABELS: Record<string, string> = {
    NEW: t('patients.statuses.NEW'),
    ACTIVE: t('patients.statuses.ACTIVE'),
    COMPLETED: t('patients.statuses.COMPLETED'),
    DISCHARGED: t('patients.statuses.DISCHARGED'),
    INACTIVE: t('patients.statuses.INACTIVE'),
  };

  const APPT_STATUS_LABELS: Record<string, string> = {
    SCHEDULED: t('appointments.statuses.SCHEDULED'),
    CONFIRMED: t('appointments.statuses.CONFIRMED'),
    IN_PROGRESS: t('appointments.statuses.IN_PROGRESS'),
    COMPLETED: t('appointments.statuses.COMPLETED'),
    CANCELLED: t('appointments.statuses.CANCELLED'),
    NO_SHOW: t('appointments.statuses.NO_SHOW'),
    PENDING: t('appointments.statuses.PENDING'),
  };

  const lawyer = patient.lawyerReferrer as unknown as { id: string; firstName?: string; lastName?: string; firmName?: string } | null;
  const provider = patient.providerReferrer as unknown as { id: string; firstName: string; lastName: string } | null;
  const appointments = (patient.appointments as unknown as Array<{ id: string; scheduledFor: string; type: string; status: string; clinic: { name: string } | null; provider: { firstName: string; lastName: string } | null }>) ?? [];
  const commissions = (patient.commissions as unknown as Array<{ id: string; amount: number; currency: string; status: string; earnedAt: string; paidAt?: string | null }>) ?? [];

  return (
    <div className="px-3 py-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/patients" className="text-text-3 hover:text-text-1 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald/10">
          <Building2 className="h-4 w-4 text-emerald" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-1 truncate">{patient.firstName} {patient.lastName}</h1>
          <p className="text-small font-mono text-text-3">{patient.patientCode}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={patient.status} onValueChange={(v) => updateStatus.mutate({ id: patient.id, status: v as 'NEW' | 'ACTIVE' | 'COMPLETED' | 'DISCHARGED' | 'INACTIVE' })}>
            <SelectTrigger className="w-auto border-none bg-transparent p-0 h-auto">
              <Badge variant={STATUS_VARIANTS[patient.status] ?? 'secondary'}>{STATUS_LABELS[patient.status] ?? patient.status}</Badge>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
        {(['info', 'appointments', 'commissions'] as const).map((tab_) => (
          <button
            key={tab_}
            onClick={() => setTab(tab_)}
            className={`px-4 py-2 text-small transition-colors border-b-2 -mb-px ${tab === tab_ ? 'border-brand text-brand font-semibold' : 'border-transparent text-text-3 hover:text-text-2'}`}
          >
            {tab_ === 'info' ? t('common.view') : tab_ === 'appointments' ? t('nav.appointments') : t('nav.commissions')}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-small">
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.email')}</p>
              <p className="text-text-1">{patient.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.phone')}</p>
              <p className="text-text-1">{patient.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.accidentDate')}</p>
              <p className="text-text-1">{patient.accidentDate ? new Date(patient.accidentDate as string).toLocaleDateString() : '—'}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.accidentType')}</p>
              <p className="text-text-1">{patient.accidentType ? t(`patients.accidentTypes.${patient.accidentType}`) : '—'}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.insuranceCarrier')}</p>
              <p className="text-text-1">{patient.insuranceCarrier ?? '—'}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.policyNumber')}</p>
              <p className="font-mono text-text-1">{patient.policyNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.lawyerReferrer')}</p>
              {lawyer ? (
                <Link href={`/dashboard/lawyers/${lawyer.id}`} className="text-brand hover:underline text-small">
                  {lawyer.firmName ?? `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim()}
                </Link>
              ) : <p className="text-text-1">—</p>}
            </div>
            <div>
              <p className="text-tiny text-text-3 mb-0.5">{t('patients.providerReferrer')}</p>
              {provider ? (
                <Link href={`/dashboard/providers/${provider.id}`} className="text-brand hover:underline text-small">
                  {provider.firstName} {provider.lastName}
                </Link>
              ) : <p className="text-text-1">—</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'appointments' && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-small font-semibold text-text-1">{t('nav.appointments')}</h2>
            <Link href={`/dashboard/appointments?patientId=${patient.id}`}>
              <Button variant="outline" size="sm">
                <CalendarDays className="h-3.5 w-3.5" />
                {t('appointments.addNew')}
              </Button>
            </Link>
          </div>
          {appointments.length === 0 ? (
            <div className="text-center py-10 text-text-3 text-small">{t('appointments.noAppointments')}</div>
          ) : (
            <div className="divide-y divide-border">
              {appointments.map((appt) => (
                <div key={appt.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-small font-medium text-text-1">
                      {new Date(appt.scheduledFor).toLocaleString()}
                    </p>
                    <p className="text-tiny text-text-3">{appt.clinic?.name ?? '—'} · {appt.type}</p>
                  </div>
                  <Badge variant={APPT_STATUS_VARIANTS[appt.status] ?? 'secondary'}>{APPT_STATUS_LABELS[appt.status] ?? appt.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'commissions' && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-small font-semibold text-text-1">{t('nav.commissions')}</h2>
            <Link href={`/dashboard/commissions?patientId=${patient.id}`}>
              <Button variant="outline" size="sm">
                <BadgeDollarSign className="h-3.5 w-3.5" />
                {t('commissions.addNew')}
              </Button>
            </Link>
          </div>
          {commissions.length === 0 ? (
            <div className="text-center py-10 text-text-3 text-small">{t('commissions.noCommissions')}</div>
          ) : (
            <div className="divide-y divide-border">
              {commissions.map((comm) => (
                <div key={comm.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono font-semibold text-text-1">${Number(comm.amount).toFixed(2)} {comm.currency}</p>
                    <p className="text-tiny text-text-3">{new Date(comm.earnedAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={comm.status === 'PAID' ? 'success' : comm.status === 'REVERSED' ? 'destructive' : 'secondary'}>
                    {t(`commissions.statuses.${comm.status}`)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
