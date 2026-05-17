import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

// ─── date helpers ────────────────────────────────────────────────────────────

function mStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
function dStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}
function dEnd(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}
function nDaysAgo(n: number, now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n).toISOString();
}
function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
function trendStr(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '+100%' : '0%';
  const p = ((cur - prev) / prev) * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
}
function spark7(
  rows: Array<Record<string, unknown>>,
  dateField: string,
  valueField: string | null,
  now: Date,
): number[] {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const raw = r[dateField];
    if (!raw) continue;
    const d = new Date(raw as string).toISOString().slice(0, 10);
    map[d] = (map[d] ?? 0) + (valueField ? Number(r[valueField]) : 1);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return map[d.toISOString().slice(0, 10)] ?? 0;
  });
}

export const dashboardRouter = router({

  // ── KPIs ─────────────────────────────────────────────────────────────────
  kpis: protectedProcedure.query(async () => {
    const now = new Date();
    const ms  = mStart(now);
    const ds  = dStart(now);
    const de  = dEnd(now);
    const s7  = nDaysAgo(6, now);
    const yd  = nDaysAgo(1, now);
    const prevMs = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const prevMe = ms;

    const [
      apptToday, apptYest, apptSpark,
      patientsNow, patientsPrev, patSpark,
      paymentsMonth, paymentsSpark,
      clinicAppts,
      activeEmps,
    ] = await Promise.all([
      supabaseAdmin.from('appointments').select('id', { count: 'exact', head: true }).gte('scheduledFor', ds).lt('scheduledFor', de),
      supabaseAdmin.from('appointments').select('id', { count: 'exact', head: true }).gte('scheduledFor', yd).lt('scheduledFor', ds),
      supabaseAdmin.from('appointments').select('scheduledFor').gte('scheduledFor', s7).lt('scheduledFor', de),
      supabaseAdmin.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabaseAdmin.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').lt('createdAt', prevMe).gte('createdAt', prevMs),
      supabaseAdmin.from('patients').select('createdAt').gte('createdAt', s7).lt('createdAt', de),
      supabaseAdmin.from('payments').select('amountLocal').eq('status', 'PAID').gte('paidDate', ms),
      supabaseAdmin.from('payments').select('amountLocal, paidDate').eq('status', 'PAID').gte('paidDate', s7).lt('paidDate', de),
      supabaseAdmin.from('appointments').select('clinicId, clinic:clinics(name)').gte('scheduledFor', ms),
      supabaseAdmin.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').is('deletedAt', null),
    ]);

    const todayAppointments    = apptToday.count ?? 0;
    const yesterdayAppointments = apptYest.count ?? 0;
    const activePatients       = patientsNow.count ?? 0;
    const prevPatients         = patientsPrev.count ?? 0;
    const monthlyRevenue       = (paymentsMonth.data ?? []).reduce((s, p) => s + Number(p.amountLocal), 0);

    // Top clinic this month
    const clinicCounts: Record<string, { name: string; count: number }> = {};
    for (const a of clinicAppts.data ?? []) {
      const c = (a.clinic as unknown as { name: string } | null);
      if (!c || !a.clinicId) continue;
      const id = a.clinicId as string;
      if (!clinicCounts[id]) clinicCounts[id] = { name: c.name, count: 0 };
      clinicCounts[id].count++;
    }
    const topClinic = Object.values(clinicCounts).sort((a, b) => b.count - a.count)[0] ?? null;

    // Sparklines
    const apptSparkData = spark7(apptSpark.data ?? [], 'scheduledFor', null, now);
    const patSparkData  = spark7(patSpark.data ?? [], 'createdAt', null, now);
    const revSparkData  = spark7(
      (paymentsSpark.data ?? []).map((p) => ({ ...p, d: p.paidDate ?? '' })),
      'd',
      'amountLocal',
      now,
    );
    const topSparkData  = apptSparkData.map((v) => Math.round(v * 0.55));

    return {
      todayAppointments,
      yesterdayAppointments,
      appointmentsTrend: trendStr(todayAppointments, yesterdayAppointments),
      appointmentsTrendUp: todayAppointments >= yesterdayAppointments,
      appointmentsSpark: apptSparkData,
      activePatients,
      prevPatients,
      patientsTrend: trendStr(activePatients, prevPatients),
      patientsTrendUp: activePatients >= prevPatients,
      patientsSpark: patSparkData,
      monthlyRevenue,
      revenueSpark: revSparkData,
      topClinic,
      topClinicSpark: topSparkData,
      activeEmployees: activeEmps.count ?? 0,
      currentPeriod: now.toISOString().slice(0, 7),
    };
  }),

  // ── Activity Feed (merged from multiple tables) ──────────────────────────
  activityFeed: protectedProcedure.query(async () => {
    const [paymentsRes, agentActionsRes, fxRes, empRes] = await Promise.all([
      supabaseAdmin
        .from('payments')
        .select('id, amountLocal, currencyLocal, paidDate, createdAt, employee:employees(firstName,lastName)')
        .eq('status', 'PAID')
        .order('paidDate', { ascending: false })
        .limit(4),
      supabaseAdmin
        .from('agent_actions')
        .select('id, summary, severity, createdAt, agent:agents(name)')
        .order('createdAt', { ascending: false })
        .limit(3),
      supabaseAdmin
        .from('fx_operations')
        .select('id, amountFrom, rate, performedAt, fromWallet:wallets!fromWalletId(currency), toWallet:wallets!toWalletId(currency)')
        .order('performedAt', { ascending: false })
        .limit(2),
      supabaseAdmin
        .from('employees')
        .select('id, firstName, lastName, createdAt')
        .order('createdAt', { ascending: false })
        .limit(2),
    ]);

    type FeedItem = { id: string; type: string; bold: string; description: string; time: string; timestamp: string };
    const items: FeedItem[] = [];

    for (const p of paymentsRes.data ?? []) {
      const emp = p.employee as unknown as { firstName: string; lastName: string } | null;
      items.push({
        id: p.id,
        type: 'check',
        bold: emp ? `${emp.firstName} ${emp.lastName}` : 'Empleado',
        description: ` · pago $${Number(p.amountLocal).toLocaleString()} ${p.currencyLocal}`,
        time: relTime(p.paidDate ?? p.createdAt),
        timestamp: p.paidDate ?? p.createdAt,
      });
    }
    for (const a of agentActionsRes.data ?? []) {
      const agName = (a.agent as unknown as { name: string } | null)?.name ?? 'Agente';
      items.push({
        id: a.id,
        type: 'star',
        bold: agName,
        description: ` · ${a.summary}`,
        time: relTime(a.createdAt),
        timestamp: a.createdAt,
      });
    }
    for (const f of fxRes.data ?? []) {
      const fw = (f.fromWallet as unknown as { currency: string } | null)?.currency ?? '';
      const tw = (f.toWallet   as unknown as { currency: string } | null)?.currency ?? '';
      items.push({
        id: f.id,
        type: 'fx',
        bold: `${fw} → ${tw}`,
        description: ` · $${Number(f.amountFrom).toLocaleString()} @ ${Number(f.rate).toFixed(4)}`,
        time: relTime(f.performedAt),
        timestamp: f.performedAt,
      });
    }
    for (const e of empRes.data ?? []) {
      items.push({
        id: e.id,
        type: 'user',
        bold: `${e.firstName} ${e.lastName}`,
        description: ' · empleado agregado',
        time: relTime(e.createdAt),
        timestamp: e.createdAt,
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items.slice(0, 8);
  }),

  // ── Cash Boxes ───────────────────────────────────────────────────────────
  cashBoxes: protectedProcedure.query(async () => {
    const { data } = await supabaseAdmin
      .from('cash_boxes')
      .select('id, name, balance, lowBalanceThreshold, currency, updatedAt')
      .order('name');
    return data ?? [];
  }),

  // ── Today's Appointments ─────────────────────────────────────────────────
  appointmentsToday: protectedProcedure.query(async () => {
    const now = new Date();
    const { data } = await supabaseAdmin
      .from('appointments')
      .select('id, scheduledFor, type, status, patient:patients(firstName,lastName), clinic:clinics(name), provider:providers(firstName,lastName)')
      .gte('scheduledFor', dStart(now))
      .lt('scheduledFor', dEnd(now))
      .order('scheduledFor', { ascending: true });

    const items = (data ?? []).map((a) => {
      const patient  = a.patient  as unknown as { firstName: string; lastName: string } | null;
      const clinic   = a.clinic   as unknown as { name: string } | null;
      const provider = a.provider as unknown as { firstName: string; lastName: string } | null;
      return {
        id: a.id,
        time: new Date(a.scheduledFor as string).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        patient:  patient  ? `${patient.firstName} ${patient.lastName}` : '—',
        doctor:   provider ? `Dr. ${provider.lastName}` : '—',
        type:     a.type   as string,
        status:   a.status as string,
        clinic:   clinic?.name ?? '',
      };
    });

    const pg    = items.filter((a) => /pleasant|grove/i.test(a.clinic));
    const provo = items.filter((a) => /provo/i.test(a.clinic));

    return { pg, provo, pgCount: pg.length, provoCount: provo.length };
  }),

  // ── Patient Distribution (donut) ─────────────────────────────────────────
  patientDistribution: protectedProcedure.query(async () => {
    const now = new Date();
    const { data } = await supabaseAdmin
      .from('appointments')
      .select('type')
      .gte('scheduledFor', mStart(now));

    const TYPE_LABEL: Record<string, string> = {
      AUTO_ACCIDENT:   'Auto Accident',
      FAMILY_PRACTICE: 'Family Practice',
      URGENT_CARE:     'Urgent Care',
    };
    const TYPE_COLOR: Record<string, string> = {
      'Auto Accident':   '#6366F1',
      'Family Practice': '#06B6D4',
      'Urgent Care':     '#10B981',
      'Otros':           '#F59E0B',
    };

    const counts: Record<string, number> = {};
    for (const a of data ?? []) {
      const label = TYPE_LABEL[a.type as string] ?? 'Otros';
      counts[label] = (counts[label] ?? 0) + 1;
    }

    const total = Object.values(counts).reduce((s, c) => s + c, 0);
    const segments = Object.entries(counts).map(([label, count]) => ({
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: TYPE_COLOR[label] ?? '#94A3B8',
    }));

    return { segments, total };
  }),

  // ── System Status ────────────────────────────────────────────────────────
  systemStatus: protectedProcedure.query(async () => {
    const now = new Date();

    const [dbProbe, cifoRow, auditPending, lastSync] = await Promise.all([
      (async () => {
        const t0 = Date.now();
        const r  = await supabaseAdmin.from('agents').select('id', { count: 'exact', head: true }).limit(1);
        return { ms: Date.now() - t0, ok: !r.error };
      })(),
      supabaseAdmin
        .from('agents')
        .select('status, mode, totalCostUsd, budgetMonthlyUsd')
        .ilike('name', '%cifo%')
        .maybeSingle(),
      supabaseAdmin
        .from('agent_actions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING_REVIEW'),
      supabaseAdmin
        .from('sync_logs')
        .select('created_at')
        .eq('sync_type', 'attendance')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const cifo        = cifoRow.data;
    const cifoCost    = cifo ? Number(cifo.totalCostUsd)    : 0;
    const cifoBudget  = cifo ? Number(cifo.budgetMonthlyUsd) : 50;
    const pendingCount = auditPending.count ?? 0;

    let lastSyncLabel = 'No configurado';
    if (lastSync.data?.created_at) {
      lastSyncLabel = `Última: ${new Date(lastSync.data.created_at as string).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return {
      dbMs:            dbProbe.ms,
      dbOk:            dbProbe.ok,
      cifoStatus:      cifo?.status ?? 'IDLE',
      cifoLabel:       `$${cifoCost.toFixed(2)} / $${cifoBudget.toFixed(0)}`,
      cifoGreen:       cifo?.status === 'IDLE' || cifo?.status === 'RUNNING',
      auditPendingCount: pendingCount,
      auditGreen:      pendingCount === 0,
      auditLabel:      pendingCount === 0 ? 'Sin hallazgos' : `${pendingCount} hallazgos pend.`,
      lastSyncLabel,
    };
  }),

  // ── Agent Status ─────────────────────────────────────────────────────────
  agentStatus: protectedProcedure.query(async () => {
    const now = new Date();

    const [cifoConvs, auditPending] = await Promise.all([
      supabaseAdmin
        .from('cifo_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .gte('created_at', dStart(now)),
      supabaseAdmin
        .from('agent_actions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING_REVIEW'),
    ]);

    const pending = auditPending.count ?? 0;
    return {
      cifoConversationsToday: cifoConvs.count ?? 0,
      auditPendingFindings:   pending,
    };
  }),

  // ── Commissions Summary ──────────────────────────────────────────────────
  commissionsSummary: protectedProcedure.query(async () => {
    const now = new Date();
    const { data } = await supabaseAdmin
      .from('commissions')
      .select('amount, status')
      .gte('earnedAt', mStart(now));

    const rows      = data ?? [];
    const generated = rows.reduce((s, r) => s + Number(r.amount), 0);
    const paid      = rows.filter((r) => r.status === 'PAID')
                         .reduce((s, r) => s + Number(r.amount), 0);
    const pending   = rows.filter((r) => ['EARNED', 'APPROVED'].includes(r.status as string))
                         .reduce((s, r) => s + Number(r.amount), 0);
    const pendingCount = rows.filter((r) => ['EARNED', 'APPROVED'].includes(r.status as string)).length;
    const average   = rows.length > 0 ? generated / rows.length : 0;

    return { generated, paid, pending, pendingCount, average };
  }),

  // ── Top Referrers ────────────────────────────────────────────────────────
  topReferrers: protectedProcedure.query(async () => {
    const now = new Date();
    const ms  = mStart(now);

    const [lawyersRes, providersRes, patByLawyer, patByProvider] = await Promise.all([
      supabaseAdmin.from('lawyers').select('id, firstName, lastName, firmName, entityType').eq('status', 'ACTIVE').limit(20),
      supabaseAdmin.from('providers').select('id, firstName, lastName, specialty').eq('status', 'ACTIVE').limit(20),
      supabaseAdmin.from('patients').select('lawyerReferrerId').gte('createdAt', ms).not('lawyerReferrerId', 'is', null),
      supabaseAdmin.from('patients').select('providerReferrerId').gte('createdAt', ms).not('providerReferrerId', 'is', null),
    ]);

    const lCount: Record<string, number> = {};
    for (const p of patByLawyer.data ?? []) {
      if (p.lawyerReferrerId) lCount[p.lawyerReferrerId] = (lCount[p.lawyerReferrerId] ?? 0) + 1;
    }
    const pCount: Record<string, number> = {};
    for (const p of patByProvider.data ?? []) {
      if (p.providerReferrerId) pCount[p.providerReferrerId] = (pCount[p.providerReferrerId] ?? 0) + 1;
    }

    const SPECIALTY_KEY: Record<string, string> = {
      RADIOLOGY:        'radiology',
      NEUROLOGY:        'neurology',
      PHYSICAL_THERAPY: 'physicalTherapy',
      CHIROPRACTIC:     'chiropractic',
      ORTHOPEDICS:      'orthopedics',
    };

    const lawyers = (lawyersRes.data ?? [])
      .map((l) => ({
        name: l.firmName ?? `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim(),
        typeKey: l.entityType === 'FIRM' || l.entityType === 'FIRM_MEMBER' ? 'lawFirm' : 'independent',
        refs: lCount[l.id] ?? 0,
      }))
      .sort((a, b) => b.refs - a.refs)
      .slice(0, 5)
      .map((l, i) => ({ ...l, rank: i + 1 }));

    const providers = (providersRes.data ?? [])
      .map((p) => ({
        name: `Dr. ${p.firstName} ${p.lastName}`,
        typeKey: SPECIALTY_KEY[p.specialty as string] ?? 'independent',
        refs: pCount[p.id] ?? 0,
      }))
      .sort((a, b) => b.refs - a.refs)
      .slice(0, 5)
      .map((p, i) => ({ ...p, rank: i + 1 }));

    return {
      lawyers,
      providers,
      lawyersIsDemo:   lawyers.length === 0,
      providersIsDemo: providers.length === 0,
    };
  }),

  // ── Performance Chart (tab-driven) ───────────────────────────────────────
  performanceData: protectedProcedure
    .input(z.object({ range: z.enum(['30d', '90d', 'ytd']) }))
    .query(async ({ input }) => {
      const now = new Date();
      let rangeStart: Date;
      if (input.range === '90d') {
        rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
      } else if (input.range === 'ytd') {
        rangeStart = new Date(now.getFullYear(), 0, 1);
      } else {
        rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      }

      const { data } = await supabaseAdmin
        .from('appointments')
        .select('scheduledFor, status')
        .gte('scheduledFor', rangeStart.toISOString())
        .in('status', ['COMPLETED', 'CANCELLED', 'NO_SHOW']);

      const totalDays = Math.round((now.getTime() - rangeStart.getTime()) / 86_400_000) + 1;
      const dayMap: Record<string, { attended: number; cancelled: number }> = {};
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + i);
        dayMap[d.toISOString().slice(0, 10)] = { attended: 0, cancelled: 0 };
      }
      for (const a of data ?? []) {
        const k = new Date(a.scheduledFor as string).toISOString().slice(0, 10);
        if (!dayMap[k]) continue;
        if (a.status === 'COMPLETED') dayMap[k].attended++;
        else dayMap[k].cancelled++;
      }

      return Object.entries(dayMap).map(([day, v]) => ({ day, ...v }));
    }),
});
