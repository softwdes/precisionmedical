import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { sendAuditAlertEmail } from '../email';

// ─── Type definitions for new tables ───────────────────────

export interface AgentSettings {
  id: string;
  created_at: string;
  updated_at: string;
  agent_name: string;
  mode_surveillance: boolean;
  mode_semi_autonomous: boolean;
  mode_autonomous: boolean;
  scan_frequency: string;
  scheduled_scan_time: string;
  notify_email: boolean;
  surveillance_active_since: string | null;
  monthly_budget: number;
}

interface AuditFindingInsert {
  severity: 'critical' | 'warning' | 'info';
  module: string;
  description: string;
  suggestion: string | null;
  status: 'pending';
  run_id: string;
}

// ─── Existing selectors ─────────────────────────────────────

const AGENT_SELECT = 'id, name, type, description, status, mode, schedule, permissions, budgetMonthlyUsd, llmProvider, llmModel, voiceEnabled, totalActions, totalTokensUsed, totalCostUsd, lastRunAt, nextRunAt, createdAt, updatedAt';

const ACTION_SELECT = 'id, agentId, type, severity, status, payload, summary, appliedAt, appliedResult, reviewedById, reviewedAt, reviewNotes, tokensUsed, costUsd, createdAt';

// ─── Router ────────────────────────────────────────────────

export const aiAgentsRouter = router({

  // ── Existing procedures (unchanged) ─────────────────────

  list: protectedProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from('agents')
      .select(AGENT_SELECT)
      .order('createdAt', { ascending: false });
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data ?? [];
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('agents')
        .select(AGENT_SELECT)
        .eq('id', input.id)
        .single();
      if (error) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
      return data;
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.enum(['CONVERSATIONAL', 'AUDITOR', 'METRICS', 'FX_WATCHER', 'REFERRAL_OPTIMIZER', 'ORCHESTRATOR']),
      description: z.string().min(1),
      mode: z.enum(['MANUAL', 'APPROVAL', 'AUTONOMOUS']).default('MANUAL'),
      llmProvider: z.enum(['ANTHROPIC', 'OPENAI', 'CUSTOM']).default('ANTHROPIC'),
      llmModel: z.string().default('claude-sonnet-4-6'),
      budgetMonthlyUsd: z.number().min(0).default(100),
      permissions: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('agents')
        .insert({
          ...input,
          status: 'IDLE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select(AGENT_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  updateConfig: adminProcedure
    .input(z.object({
      id: z.string(),
      description: z.string().min(1).optional(),
      mode: z.enum(['MANUAL', 'APPROVAL', 'AUTONOMOUS']).optional(),
      llmProvider: z.enum(['ANTHROPIC', 'OPENAI', 'CUSTOM']).optional(),
      llmModel: z.string().optional(),
      budgetMonthlyUsd: z.number().min(0).optional(),
      schedule: z.string().optional(),
      permissions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      const { data, error } = await supabaseAdmin
        .from('agents')
        .update({ ...patch, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select(AGENT_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  toggleStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['IDLE', 'PAUSED']),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('agents')
        .update({ status: input.status, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  listActions: protectedProcedure
    .input(z.object({
      agentId: z.string(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'FAILED', 'AUTO_APPLIED']).optional(),
      severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
    }))
    .query(async ({ input }) => {
      const { agentId, page, pageSize, status, severity } = input;
      const from = (page - 1) * pageSize;

      let q = supabaseAdmin
        .from('agent_actions')
        .select(ACTION_SELECT, { count: 'exact' })
        .eq('agentId', agentId);
      if (status) q = q.eq('status', status);
      if (severity) q = q.eq('severity', severity);

      const { data, error, count } = await q.order('createdAt', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { items: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  reviewAction: adminProcedure
    .input(z.object({
      id: z.string(),
      decision: z.enum(['APPROVED', 'REJECTED']),
      reviewNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabaseAdmin
        .from('agent_actions')
        .update({
          status: input.decision,
          reviewedById: ctx.user.id,
          reviewedAt: new Date().toISOString(),
          reviewNotes: input.reviewNotes,
        })
        .eq('id', input.id)
        .eq('status', 'PENDING_REVIEW')
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  listConversations: protectedProcedure
    .input(z.object({
      agentId: z.string(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const { agentId, page, pageSize } = input;
      const from = (page - 1) * pageSize;
      const { data, error, count } = await supabaseAdmin
        .from('agent_conversations')
        .select('id, agentId, userId, messages, startedAt, endedAt', { count: 'exact' })
        .eq('agentId', agentId)
        .order('startedAt', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { items: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  // ── New procedures for the rebuilt module ────────────────

  getAuditSettings: protectedProcedure.query(async () => {
    const { data } = await supabaseAdmin
      .from('agent_settings')
      .select('id, created_at, updated_at, agent_name, mode_surveillance, mode_semi_autonomous, mode_autonomous, scan_frequency, scheduled_scan_time, notify_email, surveillance_active_since, monthly_budget')
      .eq('agent_name', 'audit_agent')
      .maybeSingle();
    if (data) return data;
    return {
      id: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agent_name: 'audit_agent',
      mode_surveillance: true,
      mode_semi_autonomous: false,
      mode_autonomous: false,
      scan_frequency: '30min',
      scheduled_scan_time: '02:00',
      notify_email: true,
      surveillance_active_since: null as string | null,
      monthly_budget: 50,
    };
  }),

  saveAuditSettings: adminProcedure
    .input(z.object({
      modeSurveillance: z.boolean(),
      modeSemiAutonomous: z.boolean(),
      modeAutonomous: z.boolean(),
      scanFrequency: z.enum(['15min', '30min', '1h', 'nightly']),
      scheduledScanTime: z.string(),
      notifyEmail: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const now = new Date().toISOString();

      const { data: current } = await supabaseAdmin
        .from('agent_settings')
        .select('mode_surveillance, surveillance_active_since')
        .eq('agent_name', 'audit_agent')
        .maybeSingle();

      const prev = current as { mode_surveillance: boolean; surveillance_active_since: string | null } | null;
      let surveillance_active_since: string | null = prev?.surveillance_active_since ?? null;
      if (input.modeSurveillance && !prev?.mode_surveillance) {
        surveillance_active_since = now;
      } else if (!input.modeSurveillance) {
        surveillance_active_since = null;
      }

      const { data, error } = await supabaseAdmin
        .from('agent_settings')
        .upsert({
          agent_name: 'audit_agent',
          mode_surveillance: input.modeSurveillance,
          mode_semi_autonomous: input.modeSemiAutonomous,
          mode_autonomous: input.modeAutonomous,
          scan_frequency: input.scanFrequency,
          scheduled_scan_time: input.scheduledScanTime,
          notify_email: input.notifyEmail,
          surveillance_active_since,
          updated_at: now,
        }, { onConflict: 'agent_name' })
        .select('*')
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  saveBudget: adminProcedure
    .input(z.object({ budget: z.number().min(1).max(9999) }))
    .mutation(async ({ input }) => {
      const { error } = await supabaseAdmin
        .from('agent_settings')
        .upsert(
          { agent_name: 'audit_agent', monthly_budget: input.budget, updated_at: new Date().toISOString() },
          { onConflict: 'agent_name' },
        );
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { budget: input.budget };
    }),

  runAuditScan: adminProcedure.mutation(async ({ ctx }) => {
    const now = new Date().toISOString();

    // Block concurrent scans
    const { data: running } = await supabaseAdmin
      .from('audit_runs')
      .select('id')
      .eq('status', 'running')
      .limit(1)
      .maybeSingle();
    if (running) throw new TRPCError({ code: 'CONFLICT', message: 'Ya hay un escaneo en progreso' });

    const { data: run, error: runError } = await supabaseAdmin
      .from('audit_runs')
      .insert({ triggered_by: 'manual', triggered_by_user: ctx.user.id, started_at: now, status: 'running' })
      .select('id')
      .single();

    if (runError ?? !run) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create audit run' });
    }

    const runId = (run as { id: string }).id;
    const findings: AuditFindingInsert[] = [];

    const [cashResult, paymentsResult, fxResult, commissionsResult] = await Promise.allSettled([
      // Audit findings de caja chica: solo cajas activas Y aperturadas
      // (con al menos 1 transaccion). Cajas desactivadas o recien
      // creadas sin uso no son hallazgos validos.
      (async () => {
        const { data: boxes } = await supabaseAdmin
          .from('cash_boxes')
          .select('id, name, currency, balance, lowBalanceThreshold')
          .eq('is_active', true);
        const below = (boxes ?? []).filter(
          (b: { balance: number; lowBalanceThreshold: number }) =>
            Number(b.balance) < Number(b.lowBalanceThreshold),
        );
        if (below.length === 0) return [];
        const ids = below.map((b: { id: string }) => b.id);
        const { data: txData } = await supabaseAdmin
          .from('cash_transactions')
          .select('cashBoxId')
          .in('cashBoxId', ids);
        const seen = new Set((txData ?? []).map((t: { cashBoxId: string }) => t.cashBoxId));
        return below.filter((b: { id: string }) => seen.has(b.id));
      })(),
      supabaseAdmin
        .from('payments')
        .select('id, employeeId, amountLocal, currencyLocal, period, createdAt')
        .neq('status', 'REVERSED')
        .order('createdAt', { ascending: false })
        .limit(500)
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from('fx_operations')
        .select('id, rate, performedAt')
        .gte('performedAt', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from('commissions')
        .select('id, lawyerId, providerId, status')
        .eq('status', 'EARNED')
        .is('lawyerId', null)
        .is('providerId', null)
        .then(({ data }) => data ?? []),
    ]);

    if (cashResult.status === 'fulfilled') {
      for (const box of cashResult.value as Array<{ name: string; currency: string; balance: number; lowBalanceThreshold: number }>) {
        findings.push({
          severity: 'critical',
          module: 'caja_chica',
          description: `Caja "${box.name}" · saldo ${box.currency} ${Number(box.balance).toFixed(2)} por debajo del mínimo (${Number(box.lowBalanceThreshold).toFixed(2)})`,
          suggestion: 'Registrar un depósito para reponer el saldo mínimo requerido',
          status: 'pending',
          run_id: runId,
        });
      }
    }

    if (paymentsResult.status === 'fulfilled') {
      const payments = paymentsResult.value as Array<{
        id: string; employeeId: string; amountLocal: number;
        currencyLocal: string; period: string; createdAt: string;
      }>;
      const seen = new Map<string, (typeof payments)[number]>();
      const reported = new Set<string>();
      for (const p of payments) {
        const key = `${p.employeeId}|${Number(p.amountLocal).toFixed(2)}|${p.period}`;
        const prev = seen.get(key);
        if (prev && !reported.has(key)) {
          const diffMs = Math.abs(new Date(p.createdAt).getTime() - new Date(prev.createdAt).getTime());
          if (diffMs < 24 * 60 * 60 * 1000) {
            reported.add(key);
            findings.push({
              severity: 'critical',
              module: 'empleados',
              description: `Posible pago duplicado: empleado ...${p.employeeId.slice(-6)} · ${p.currencyLocal} ${Number(p.amountLocal).toFixed(2)} · período ${p.period}`,
              suggestion: 'Verificar si ambos pagos son intencionales o si uno debe reversarse',
              status: 'pending',
              run_id: runId,
            });
          }
        } else {
          seen.set(key, p);
        }
      }
    }

    if (fxResult.status === 'fulfilled') {
      const ops = fxResult.value as Array<{ id: string; rate: number }>;
      if (ops.length > 3) {
        const avgRate = ops.reduce((s, o) => s + Number(o.rate), 0) / ops.length;
        const recent = ops.slice(0, 10);
        for (const op of recent) {
          const dev = Math.abs(Number(op.rate) - avgRate) / avgRate;
          if (dev > 0.2) {
            findings.push({
              severity: 'warning',
              module: 'fx',
              description: `Operación FX con tasa ${Number(op.rate).toFixed(4)} · desvío ${(dev * 100).toFixed(1)}% del promedio histórico (${avgRate.toFixed(4)})`,
              suggestion: 'Verificar que la tasa aplicada sea correcta con la casa de cambio',
              status: 'pending',
              run_id: runId,
            });
            break;
          }
        }
      }
    }

    if (commissionsResult.status === 'fulfilled') {
      const count = (commissionsResult.value as unknown[]).length;
      if (count > 0) {
        findings.push({
          severity: 'warning',
          module: 'comisiones',
          description: `${count} comisión(es) devengada(s) sin abogado ni proveedor asignado`,
          suggestion: 'Asignar el abogado o proveedor correspondiente a cada comisión sin referencia',
          status: 'pending',
          run_id: runId,
        });
      }
    }

    if (findings.length > 0) {
      await supabaseAdmin.from('audit_findings').insert(findings);
    }

    const critical_count = findings.filter(f => f.severity === 'critical').length;
    const warning_count = findings.filter(f => f.severity === 'warning').length;
    const info_count = findings.filter(f => f.severity === 'info').length;

    await supabaseAdmin
      .from('audit_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        findings_count: findings.length,
        critical_count,
        warning_count,
        info_count,
      })
      .eq('id', runId);

    if (critical_count > 0) {
      const { data: settings } = await supabaseAdmin
        .from('agent_settings')
        .select('notify_email')
        .eq('agent_name', 'audit_agent')
        .maybeSingle();
      if ((settings as { notify_email: boolean } | null)?.notify_email) {
        try {
          await sendAuditAlertEmail({
            to: process.env.ADMIN_EMAIL ?? 'erick@precisionmedicalcare.com',
            criticalCount: critical_count,
            findings: findings.filter(f => f.severity === 'critical'),
          });
        } catch {
          // Non-fatal
        }
      }
    }

    return { runId, findingsCount: findings.length, criticalCount: critical_count, warningCount: warning_count, infoCount: info_count };
  }),

  listFindings: protectedProcedure
    .input(z.object({
      severity: z.enum(['critical', 'warning', 'info']).optional(),
      module: z.string().optional(),
      status: z.enum(['pending', 'resolved', 'ignored']).optional(),
    }).optional())
    .query(async ({ input }) => {
      let q = supabaseAdmin
        .from('audit_findings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (input?.severity) q = q.eq('severity', input.severity);
      if (input?.module && input.module !== 'all') q = q.eq('module', input.module);
      if (input?.status) q = q.eq('status', input.status);

      const { data } = await q;
      return (data ?? []) as Array<{
        id: string; created_at: string; severity: string; module: string;
        description: string; suggestion: string | null; status: string;
        resolved_at: string | null; resolved_by: string | null; action_taken: string | null; run_id: string | null;
      }>;
    }),

  resolveFinding: adminProcedure
    .input(z.object({
      id: z.string(),
      action: z.enum(['resolved', 'ignored']),
      actionTaken: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabaseAdmin
        .from('audit_findings')
        .update({
          status: input.action,
          resolved_at: new Date().toISOString(),
          resolved_by: ctx.user.id,
          action_taken: input.actionTaken ?? null,
        })
        .eq('id', input.id)
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data as { id: string; status: string };
    }),

  listAuditRuns: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      const { data } = await supabaseAdmin
        .from('audit_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(input?.limit ?? 10);
      return (data ?? []) as Array<{
        id: string; created_at: string; triggered_by: string;
        started_at: string; completed_at: string | null; status: string;
        findings_count: number; critical_count: number; warning_count: number; info_count: number;
      }>;
    }),

  getAgentCosts: protectedProcedure.query(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] as string;
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0] as string;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [costsRes, settingsRes, todayConvsRes, monthConvsRes, runsRes] = await Promise.allSettled([
      supabaseAdmin.from('agent_costs').select('*').gte('month', sixMonthsAgo).order('month', { ascending: false }),
      supabaseAdmin.from('agent_settings').select('monthly_budget').eq('agent_name', 'audit_agent').maybeSingle(),
      supabaseAdmin.from('cifo_conversations').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', todayStart),
      supabaseAdmin.from('cifo_conversations').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', monthStart),
      supabaseAdmin.from('audit_runs').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    ]);

    const costs = costsRes.status === 'fulfilled' ? (costsRes.value.data ?? []) : [];
    const settings = settingsRes.status === 'fulfilled' ? settingsRes.value.data as { monthly_budget: number } | null : null;
    const cifoTodayCount = todayConvsRes.status === 'fulfilled' ? (todayConvsRes.value.count ?? 0) : 0;
    const cifoMonthCount = monthConvsRes.status === 'fulfilled' ? (monthConvsRes.value.count ?? 0) : 0;
    const monthScanCount = runsRes.status === 'fulfilled' ? (runsRes.value.count ?? 0) : 0;

    const cifoCosts = (costs as Array<{ agent_name: string; total_cost: number; operation_count: number; month: string }>)
      .filter(c => c.agent_name === 'cifo');
    const auditCosts = (costs as Array<{ agent_name: string; total_cost: number; operation_count: number; month: string }>)
      .filter(c => c.agent_name === 'audit_agent');

    const cifoMonthCost = cifoCosts.find(c => c.month >= monthStart)?.total_cost ?? 0;
    const auditMonthCost = auditCosts.find(c => c.month >= monthStart)?.total_cost ?? 0;
    const totalMonthCost = Number(cifoMonthCost) + Number(auditMonthCost);

    return {
      costs: costs as Array<{ agent_name: string; month: string; total_cost: number; operation_count: number }>,
      budget: Number(settings?.monthly_budget ?? 50),
      cifoTodayCount,
      cifoMonthCount,
      cifoMonthCost: Number(cifoMonthCost),
      auditMonthCost: Number(auditMonthCost),
      totalMonthCost,
      monthScanCount,
    };
  }),

  getLastAuditRun: protectedProcedure.query(async () => {
    const { data: run } = await supabaseAdmin
      .from('audit_runs')
      .select('*')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return run as {
      id: string; completed_at: string; findings_count: number;
      critical_count: number; warning_count: number; info_count: number;
    } | null;
  }),

  getCifoConversations: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await supabaseAdmin
      .from('cifo_conversations')
      .select('session_id, role, content, created_at')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: true });

    if (!data?.length) return [];

    // Group by session_id
    const sessionMap = new Map<string, Array<{ session_id: string; role: string; content: string; created_at: string }>>();
    for (const row of data) {
      const key = row.session_id as string;
      if (!sessionMap.has(key)) sessionMap.set(key, []);
      sessionMap.get(key)!.push(row as { session_id: string; role: string; content: string; created_at: string });
    }

    const sessions = [...sessionMap.entries()].map(([sid, msgs]) => {
      const firstUser = msgs.find(m => m.role === 'user');
      const lastMsg = msgs[msgs.length - 1]!;
      const title = firstUser?.content ?? '';
      return {
        session_id: sid,
        message_count: msgs.length,
        first_message: title.length > 60 ? `${title.slice(0, 60)}…` : title,
        started_at: msgs[0]!.created_at,
        last_message_at: lastMsg.created_at,
      };
    });

    sessions.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    return sessions.slice(0, 20);
  }),
});
