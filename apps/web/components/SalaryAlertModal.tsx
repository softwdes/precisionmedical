'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api as trpc } from '@/lib/trpc/client';
import { AlertCircle, Calendar, X, ArrowRight } from 'lucide-react';
import { useRole } from '@/contexts/role-context';

const DISMISS_KEY_PREFIX = 'pm-salary-modal-dismissed-';

function utahToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

function wasDismissedToday(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(DISMISS_KEY_PREFIX + utahToday()) === '1';
  } catch {
    return false;
  }
}

function markDismissedToday(): void {
  try {
    // Diagnostic trace — temp, hasta confirmar quien llama esto en
    // page load. Si nadie deberia llamarlo y aparece en el stack,
    // ahi esta el bug.
    // eslint-disable-next-line no-console
    console.warn('[SalaryAlertModal] markDismissedToday() called', new Error('trace').stack);
    localStorage.setItem(DISMISS_KEY_PREFIX + utahToday(), '1');
  } catch {
    /* localStorage may be blocked; modal will reappear, acceptable */
  }
}

type BucketVariant = 'overdue' | 'today' | 'tomorrow' | 'two-days' | 'three-days';

interface BucketProps {
  variant: BucketVariant;
  count: number;
  totalAmount: number;
  currency: string;
  rows: Array<{
    paymentId: string;
    employeeName: string;
    amount: number;
    currency: string;
    /** Only present for overdue rows. Positive = days past due. */
    daysOverdue?: number;
  }>;
}

// Visual hierarchy: deeper/redder = more urgent. Overdue most urgent
// (deep red with glow), then today (rose), then a graduated amber
// scale for 1/2/3 days out.
const VARIANT_STYLE: Record<BucketVariant, { label: string; color: string; bg: string; border: string }> = {
  overdue:      { label: 'Vencidos',         color: '#DC2626', bg: 'rgba(220,38,38,0.13)',  border: 'rgba(220,38,38,0.40)'  },
  today:        { label: 'Vence hoy',        color: '#F43F5E', bg: 'rgba(244,63,94,0.10)',  border: 'rgba(244,63,94,0.30)'  },
  tomorrow:     { label: 'Vence mañana',     color: '#FB923C', bg: 'rgba(251,146,60,0.10)', border: 'rgba(251,146,60,0.30)' },
  'two-days':   { label: 'Vence en 2 días',  color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)' },
  'three-days': { label: 'Vence en 3 días',  color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)' },
};

function Bucket({ variant, count, totalAmount, currency, rows }: BucketProps): React.ReactElement {
  const isOverdue = variant === 'overdue';
  const isToday = variant === 'today';
  const accent = VARIANT_STYLE[variant];
  const label = accent.label;
  const overflow = count - rows.length;

  return (
    <div
      style={{
        padding: '14px',
        borderRadius: 12,
        background: accent.bg,
        border: `1px solid ${accent.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent.color,
              // Glow the dot for the two most urgent buckets so they
              // stand out at a glance.
              boxShadow: isOverdue || isToday ? `0 0 8px ${accent.color}` : 'none',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: accent.color,
            }}
          >
            {label}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {count} pago{count === 1 ? '' : 's'} ·{' '}
          <span style={{ fontFamily: 'monospace', color: 'var(--text-1)' }}>
            ${totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} {currency}
          </span>
        </span>
      </div>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
        {rows.map((r) => (
          <li
            key={r.paymentId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              padding: '4px 0',
            }}
          >
            <span style={{ color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {r.employeeName}
              {r.daysOverdue != null && r.daysOverdue > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: accent.color,
                    background: accent.bg,
                    border: `1px solid ${accent.border}`,
                    borderRadius: 4,
                    padding: '1px 5px',
                  }}
                >
                  hace {r.daysOverdue}d
                </span>
              )}
            </span>
            <span style={{ fontFamily: 'monospace', color: 'var(--text-1)', fontWeight: 500 }}>
              ${r.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} {r.currency}
            </span>
          </li>
        ))}
        {overflow > 0 && (
          <li
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              paddingTop: 4,
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            y {overflow} más...
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Dashboard alert that prompts the Super Admin to review pending
 * salary payments. Appears once per Utah-local day; closing it (X
 * button or "Recordar más tarde") sets a localStorage flag that
 * suppresses re-show until tomorrow. Clicking "Ver pagos" also
 * marks as dismissed and navigates to the payments tab.
 */
export function SalaryAlertModal(): React.ReactElement | null {
  const role = useRole();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true); // assume dismissed to avoid SSR flash
  const [readyToShow, setReadyToShow] = useState(false);

  const isSuperAdmin = role === 'super_admin';

  useEffect(() => {
    setDismissed(wasDismissedToday());
    setReadyToShow(true);
  }, []);

  // Only fetch the alerts when the user is super admin and not dismissed
  const { data, isLoading } = trpc.dashboard.salaryAlerts.useQuery(undefined, {
    enabled: isSuperAdmin && !dismissed && readyToShow,
    staleTime: 5 * 60 * 1000, // 5 min — data doesn't change often within a session
  });

  if (!isSuperAdmin) return null;
  if (!readyToShow) return null;
  if (dismissed) return null;
  if (isLoading) return null;
  if (!data) return null;

  // Visibility gate across all 5 buckets — modal appears if ANY has
  // payments to surface.
  const totalCount =
    (data.overdue?.count ?? 0) +
    data.dueToday.count +
    (data.dueTomorrow?.count ?? 0) +
    (data.dueInTwoDays?.count ?? 0) +
    data.dueInThreeDays.count;
  if (totalCount === 0) return null;

  function close(): void {
    markDismissedToday();
    setDismissed(true);
  }

  function goToPayments(): void {
    markDismissedToday();
    setDismissed(true);
    router.push('/dashboard/employees?tab=pagos');
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 9999,
          animation: 'pmSalaryFade 200ms ease both',
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Salarios pendientes"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '92vw',
          maxWidth: 480,
          zIndex: 10000,
          animation: 'pmSalaryUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <style>{`
          @keyframes pmSalaryFade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes pmSalaryUp {
            from { opacity: 0; transform: translate(-50%, -42%); }
            to   { opacity: 1; transform: translate(-50%, -50%); }
          }
        `}</style>

        {/* Gradient border layer */}
        <div
          style={{
            position: 'absolute',
            inset: -1,
            borderRadius: 17,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.50), rgba(139,92,246,0.25) 50%, rgba(6,182,212,0.40) 100%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Card */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            background: 'linear-gradient(135deg, rgba(10,14,26,0.97), rgba(15,20,38,0.97))',
            borderRadius: 16,
            padding: '20px 22px',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.55), 0 0 32px rgba(99,102,241,0.20)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                background: 'rgba(99,102,241,0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.30)',
              }}
            >
              <AlertCircle size={19} color="#A5B4FC" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#F5F7FB',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                Salarios pendientes
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: '#8B95B5',
                  margin: '2px 0 0',
                  lineHeight: 1.4,
                }}
              >
                Tienes pagos próximos a vencer. Procesalos a tiempo.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: '#4A5474',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Buckets — ordered by urgency: overdue > today > tomorrow >
              +2d > +3d. Each bucket only renders if it has payments.
              The outer max-height + overflow keeps the modal usable
              even if 5 full buckets stack up. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: '55vh',
              overflowY: 'auto',
            }}
          >
            {data.overdue && data.overdue.count > 0 && (
              <Bucket
                variant="overdue"
                count={data.overdue.count}
                totalAmount={data.overdue.totalAmount}
                currency={data.overdue.currency}
                rows={data.overdue.rows}
              />
            )}
            {data.dueToday.count > 0 && (
              <Bucket
                variant="today"
                count={data.dueToday.count}
                totalAmount={data.dueToday.totalAmount}
                currency={data.dueToday.currency}
                rows={data.dueToday.rows}
              />
            )}
            {data.dueTomorrow && data.dueTomorrow.count > 0 && (
              <Bucket
                variant="tomorrow"
                count={data.dueTomorrow.count}
                totalAmount={data.dueTomorrow.totalAmount}
                currency={data.dueTomorrow.currency}
                rows={data.dueTomorrow.rows}
              />
            )}
            {data.dueInTwoDays && data.dueInTwoDays.count > 0 && (
              <Bucket
                variant="two-days"
                count={data.dueInTwoDays.count}
                totalAmount={data.dueInTwoDays.totalAmount}
                currency={data.dueInTwoDays.currency}
                rows={data.dueInTwoDays.rows}
              />
            )}
            {data.dueInThreeDays.count > 0 && (
              <Bucket
                variant="three-days"
                count={data.dueInThreeDays.count}
                totalAmount={data.dueInThreeDays.totalAmount}
                currency={data.dueInThreeDays.currency}
                rows={data.dueInThreeDays.rows}
              />
            )}
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={goToPayments}
            style={{
              marginTop: 18,
              width: '100%',
              padding: '11px 16px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 6px 18px rgba(99,102,241,0.40)',
              letterSpacing: '0.01em',
            }}
          >
            <Calendar size={14} />
            Ver pagos pendientes
            <ArrowRight size={14} />
          </button>

          <button
            type="button"
            onClick={close}
            style={{
              marginTop: 8,
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#6B7592',
              fontSize: 12,
              padding: '6px 0',
              cursor: 'pointer',
            }}
          >
            Recordar más tarde
          </button>
        </div>
      </div>
    </>
  );
}
