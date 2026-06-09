import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * B.27 — Reporte mensual consolidado (Screen 3)
 * GET /api/admin/billing/report?month=2026-06
 *
 * Devuelve:
 * - KPIs del mes (facturado, cobrado PIP, pendiente, lien acumulado)
 * - Desglose por proveedor con progress bars
 * - Desglose por clínica
 * - Lien aging buckets (<90d, 90-180d, >180d)
 * - Top 5 bufetes por monto facturado
 * - Casos críticos >180d
 *
 * Phase 1A: sin ERA — payments derivados de notas 💰 + CPT totals de visit_service_codes
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyTotalsRow {
  provider_id:       string;
  provider_name:     string;
  clinic_name:       string;
  visit_count:       bigint;
  total_charged:     number;
}

interface PaymentTotalsRow {
  total_payments: number;
}

interface LienAgingRow {
  case_id:         string;
  patient_name:    string;
  firm_name:       string | null;
  days_since_dol:  bigint;
  total_charged:   number;
}

interface FirmTotalsRow {
  firm_id:       string | null;
  firm_name:     string | null;
  case_count:    bigint;
  total_charged: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtMoneyFull(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const monthParam = searchParams.get('month'); // e.g. "2026-06"

  // Default to current month (MDT = UTC-6)
  let monthStart: Date;
  let monthEnd:   Date;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split('-').map(Number);
    // Month start at MDT midnight = UTC 06:00
    monthStart = new Date(Date.UTC(year!, month! - 1, 1, 6, 0, 0));
    monthEnd   = new Date(Date.UTC(year!, month!, 1, 6, 0, 0));
  } else {
    // Current month from server date
    const now   = new Date();
    const y     = now.getUTCFullYear();
    const m     = now.getUTCMonth();
    monthStart  = new Date(Date.UTC(y, m, 1, 6, 0, 0));
    monthEnd    = new Date(Date.UTC(y, m + 1, 1, 6, 0, 0));
  }

  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setUTCMonth(prevMonthStart.getUTCMonth() - 1);

  // ─── 1. Monthly CPT totals by provider + clinic ───────────────────────────

  const monthlyRows = await db.$queryRaw<MonthlyTotalsRow[]>`
    SELECT
      p.id                                                         AS provider_id,
      CONCAT(p."lastName", ', ', p."firstName")                    AS provider_name,
      COALESCE(c.name, 'Sin clínica')                              AS clinic_name,
      COUNT(DISTINCT a.id)::bigint                                 AS visit_count,
      COALESCE(SUM(
        COALESCE(vsc.fee_override, vsc.fee_catalog)::float * vsc.units::float
      ), 0)::float                                                 AS total_charged
    FROM appointments a
    JOIN providers p    ON p.id  = a."providerId"
    LEFT JOIN clinics c ON c.id  = a."clinicId"
    JOIN visit_notes vn  ON vn."appointmentId" = a.id AND vn.status = 'SIGNED'
    JOIN visit_service_codes vsc ON vsc.visit_note_id = vn.id
    WHERE a."scheduledFor" >= ${monthStart}
      AND a."scheduledFor" <  ${monthEnd}
      AND a.status = 'COMPLETED'
    GROUP BY p.id, p."lastName", p."firstName", c.name
    ORDER BY total_charged DESC
  `;

  // Previous month totals for % change
  const prevRows = await db.$queryRaw<{ total_charged: number }[]>`
    SELECT COALESCE(SUM(
      COALESCE(vsc.fee_override, vsc.fee_catalog)::float * vsc.units::float
    ), 0)::float AS total_charged
    FROM appointments a
    JOIN visit_notes vn  ON vn."appointmentId" = a.id AND vn.status = 'SIGNED'
    JOIN visit_service_codes vsc ON vsc.visit_note_id = vn.id
    WHERE a."scheduledFor" >= ${prevMonthStart}
      AND a."scheduledFor" <  ${monthStart}
      AND a.status = 'COMPLETED'
  `;

  const totalBilled       = monthlyRows.reduce((s, r) => s + (r.total_charged ?? 0), 0);
  const prevTotalBilled   = prevRows[0]?.total_charged ?? 0;
  const billedChangePct   = prevTotalBilled > 0
    ? Math.round(((totalBilled - prevTotalBilled) / prevTotalBilled) * 100)
    : 0;

  // ─── 2. Payments this month (from 💰 case notes) ─────────────────────────

  const payRows = await db.$queryRaw<PaymentTotalsRow[]>`
    SELECT COALESCE(SUM(
      (regexp_match(cn.content, '\\$([0-9,]+(?:\\.[0-9]{2})?)'))[1]::text::float
    ), 0)::float AS total_payments
    FROM case_notes cn
    WHERE cn."createdAt" >= ${monthStart}
      AND cn."createdAt" <  ${monthEnd}
      AND cn.content LIKE '💰%'
  `;

  const totalCollected       = payRows[0]?.total_payments ?? 0;
  const pendingPip           = Math.max(0, totalBilled - totalCollected);
  const lienAccumulated      = pendingPip; // Phase 1A: lien ≈ balance outstanding

  // ─── 3. Provider breakdown ────────────────────────────────────────────────

  // Dedupe by provider (aggregate across clinics)
  const providerMap = new Map<string, { name: string; amount: number; visits: number; clinics: Set<string> }>();
  for (const r of monthlyRows) {
    const existing = providerMap.get(r.provider_id);
    if (existing) {
      existing.amount += r.total_charged;
      existing.visits += Number(r.visit_count);
      existing.clinics.add(r.clinic_name);
    } else {
      providerMap.set(r.provider_id, {
        name:    r.provider_name,
        amount:  r.total_charged,
        visits:  Number(r.visit_count),
        clinics: new Set([r.clinic_name]),
      });
    }
  }

  const providerMax = Math.max(...Array.from(providerMap.values()).map(p => p.amount), 1);
  const providers = Array.from(providerMap.values())
    .sort((a, b) => b.amount - a.amount)
    .map(p => ({
      name:    p.name,
      amount:  p.amount,
      amountFmt: fmtMoney(p.amount),
      visits:  p.visits,
      clinics: Array.from(p.clinics).join(', '),
      pct:     Math.round((p.amount / providerMax) * 100),
    }));

  // ─── 4. Clinic / facility breakdown ───────────────────────────────────────

  const clinicMap = new Map<string, { amount: number; visits: number }>();
  for (const r of monthlyRows) {
    const existing = clinicMap.get(r.clinic_name);
    if (existing) {
      existing.amount += r.total_charged;
      existing.visits += Number(r.visit_count);
    } else {
      clinicMap.set(r.clinic_name, { amount: r.total_charged, visits: Number(r.visit_count) });
    }
  }

  const facilities = Array.from(clinicMap.entries())
    .sort(([, a], [, b]) => b.amount - a.amount)
    .map(([name, v]) => ({
      name,
      amount:    v.amount,
      amountFmt: fmtMoney(v.amount),
      visits:    v.visits,
    }));

  // ─── 5. Lien aging (all active cases) ────────────────────────────────────

  const agingRows = await db.$queryRaw<LienAgingRow[]>`
    SELECT
      c.id                                                          AS case_id,
      CONCAT(pat."firstName", ' ', pat."lastName")                 AS patient_name,
      lf."firmName"                                                 AS firm_name,
      EXTRACT(DAY FROM NOW() - c."accidentDate")::bigint           AS days_since_dol,
      COALESCE(SUM(
        COALESCE(vsc.fee_override, vsc.fee_catalog)::float * vsc.units::float
      ), 0)::float                                                  AS total_charged
    FROM cases c
    JOIN patients pat ON pat.id = c."patientId"
    LEFT JOIN law_firms lf ON lf.id = c."lawFirmId"
    LEFT JOIN appointments a ON a."caseId" = c.id AND a.status = 'COMPLETED'
    LEFT JOIN visit_notes vn ON vn."appointmentId" = a.id AND vn.status = 'SIGNED'
    LEFT JOIN visit_service_codes vsc ON vsc.visit_note_id = vn.id
    WHERE c.status NOT IN ('SETTLED', 'CLOSED', 'ARCHIVED')
      AND c."accidentDate" IS NOT NULL
    GROUP BY c.id, pat."firstName", pat."lastName", lf."firmName", c."accidentDate"
    HAVING SUM(COALESCE(vsc.fee_override, vsc.fee_catalog)::float * vsc.units::float) > 0
    ORDER BY days_since_dol DESC
  `;

  // Bucket aging
  const aging = { under90: 0, between90and180: 0, over180: 0 };
  const agingAmount = { under90: 0, between90and180: 0, over180: 0 };
  const criticalCases: { caseId: string; patientName: string; firmName: string | null; daysSinceDol: number; totalCharged: number; totalChargedFmt: string }[] = [];

  for (const r of agingRows) {
    const days = Number(r.days_since_dol);
    const amt  = r.total_charged;
    if (days < 90)       { aging.under90++;           agingAmount.under90 += amt; }
    else if (days < 180) { aging.between90and180++;   agingAmount.between90and180 += amt; }
    else                 { aging.over180++;            agingAmount.over180 += amt;
      criticalCases.push({
        caseId:          r.case_id,
        patientName:     r.patient_name,
        firmName:        r.firm_name,
        daysSinceDol:    days,
        totalCharged:    amt,
        totalChargedFmt: fmtMoney(amt),
      });
    }
  }

  const agingTotal = agingRows.length || 1;
  const agingAmountTotal = Object.values(agingAmount).reduce((a, b) => a + b, 1);

  const lienAging = {
    under90:         { count: aging.under90,         amount: agingAmount.under90,         amountFmt: fmtMoney(agingAmount.under90),         pct: Math.round((aging.under90 / agingTotal) * 100),       pctAmount: Math.round((agingAmount.under90 / agingAmountTotal) * 100) },
    between90and180: { count: aging.between90and180, amount: agingAmount.between90and180, amountFmt: fmtMoney(agingAmount.between90and180), pct: Math.round((aging.between90and180 / agingTotal) * 100), pctAmount: Math.round((agingAmount.between90and180 / agingAmountTotal) * 100) },
    over180:         { count: aging.over180,         amount: agingAmount.over180,         amountFmt: fmtMoney(agingAmount.over180),         pct: Math.round((aging.over180 / agingTotal) * 100),       pctAmount: Math.round((agingAmount.over180 / agingAmountTotal) * 100) },
  };

  // ─── 6. Top law firms ─────────────────────────────────────────────────────

  const firmRows = await db.$queryRaw<FirmTotalsRow[]>`
    SELECT
      lf.id                                                         AS firm_id,
      lf."firmName"                                                 AS firm_name,
      COUNT(DISTINCT c.id)::bigint                                  AS case_count,
      COALESCE(SUM(
        COALESCE(vsc.fee_override, vsc.fee_catalog)::float * vsc.units::float
      ), 0)::float                                                  AS total_charged
    FROM law_firms lf
    JOIN cases c ON c."lawFirmId" = lf.id AND c.status NOT IN ('SETTLED','CLOSED','ARCHIVED')
    LEFT JOIN appointments a ON a."caseId" = c.id AND a.status = 'COMPLETED'
    LEFT JOIN visit_notes vn ON vn."appointmentId" = a.id AND vn.status = 'SIGNED'
    LEFT JOIN visit_service_codes vsc ON vsc.visit_note_id = vn.id
    GROUP BY lf.id, lf."firmName"
    HAVING SUM(COALESCE(vsc.fee_override, vsc.fee_catalog)::float * vsc.units::float) > 0
    ORDER BY total_charged DESC
    LIMIT 5
  `;

  const topFirms = firmRows.map(f => ({
    firmId:       f.firm_id,
    firmName:     f.firm_name ?? 'Sin bufete',
    caseCount:    Number(f.case_count),
    totalCharged: f.total_charged,
    amountFmt:    fmtMoney(f.total_charged),
  }));

  // ─── Response ─────────────────────────────────────────────────────────────

  const monthLabel = monthStart.toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  return NextResponse.json({
    ok: true,
    monthLabel,
    monthParam: monthParam ?? monthStart.toISOString().slice(0, 7),
    kpis: {
      totalBilled,        totalBilledFmt:   fmtMoneyFull(totalBilled),    billedChangePct,
      totalCollected,     totalCollectedFmt: fmtMoneyFull(totalCollected),
      pendingPip,         pendingPipFmt:    fmtMoneyFull(pendingPip),
      lienAccumulated,    lienFmt:          fmtMoneyFull(lienAccumulated),
    },
    providers,
    facilities,
    lienAging,
    criticalCases: criticalCases.slice(0, 20),
    criticalCount: criticalCases.length,
    criticalAmountFmt: fmtMoney(agingAmount.over180),
    topFirms,
  });
}
