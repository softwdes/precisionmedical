import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { sendAuditAlertEmail } from '../email';

// ─── Type definitions for new tables ───────────────────────

export interface AgentSettings {
  id: string;
  createdAt: string;
  updatedAt: string;
  agentName: string;
  modeSurveillance: boolean;
  modeSemiAutonomous: boolean;
  modeAutonomous: boolean;
  scanFrequency: string;
  scheduledScanTime: string;
  notifyEmail: boolean;
  surveillanceActiveSince: string | null;
  monthlyBudget: number;
}

interface AuditFindingInsert {
  severity: 'critical' | 'warning' | 'info';
  module: string;
  description: string;
  suggestion: string | null;
  status: 'pending';
  runId: string;
}

const DEFAULT_SETTINGS: Omit<AgentSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  agentName: 'audit_agent',
  modeSurveillance: true,
  modeSemiAutonomous: false,
  modeAutonomous: false,
  scanFrequency: '30min',
  scheduledScanTime: '02:00',
  notifyEmail: true,
  surveillanceActiveSince: null,
  monthlyBudget: 50,
};

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
      .select('id, createdAt, updatedAt, agentName, modeSurveillance, modeSemiAutonomous, modeAutonomous, scanFrequency, scheduledScanTime, notifyEmail, surveillanceActiveSince, monthlyBudget')
      .eq('agentName', 'audit_agent')
      .maybeSingle();
    if (data) return data;
    return {
      id: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentName: 'audit_agent',
      modeSurveillance: true,
      modeSemiAutonomous: false,
      modeAutonomous: false,
      scanFrequency: '30min',
      scheduledScanTime: '02:00',
      notifyEmail: true,
      surveillanceActiveSince: null as string | null,
      monthlyBudget: 50,
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
        .select('modeSurveillance, surveillanceActiveSince')
        .eq('agentName', 'audit_agent')
        .maybeSingle();

      const prev = current as { modeSurveillance: boolean; surveillanceActiveSince: string | null } | null;
      let surveillanceActiveSince: string | null = prev?.surveillanceActiveSince ?? null;
      if (input.modeSurveillance && !prev?.modeSurveillance) {
        surveillanceActiveSince = now;
      } else if (!input.modeSurveillance) {
        surveillanceActiveSince = null;
      }

      const { data, error } = await supabaseAdmin
        .from('agent_settings')
        .upsert({
          agentName: 'audit_agent',
          ...input,
          surveillanceActiveSince,
          updatedAt: now,
        }, { onConflict: 'agentName' })
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
          { agentName: 'audit_agent', monthlyBudget: input.budget, updatedAt: new Date().toISOString() },
          { onConflict: 'agentName' },
        );
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { budget: input.budget };
    }),

  runAuditScan: adminProcedure.mutation(async ({ ctx }) => {
    const now = new Date().toISOString();

    const { data: run, error: runError } = await supabaseAdmin
      .from('audit_runs')
      .insert({ triggeredBy: 'manual', triggeredByUser: ctx.user.id, startedAt: now, status: 'running' })
      .select('id')
      .single();

    if (runError ?? !run) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create audit run' });
    }

    const runId = (run as { id: string }).id;
    const findings: AuditFindingInsert[] = [];

    const [cashResult, paymentsResult, fxResult, commissionsResult] = await Promise.allSettled([
      // CHECK 1: Cash boxes below threshold
      supabaseAdmin
        .from('cash_boxes')
        .select('id, name, currency, balance, lowBalanceThreshold')
        .then(({ data: boxes }) => (boxes ?? []).filter(
          (b: { balance: number; lowBalanceThreshold: number }) => Number(b.balance) < Number(b.lowBalanceThreshold),
        )),

      // CHECK 2 + 3: Payments
      supabaseAdmin
        .from('payments')
        .select('id, employeeId, amountLocal, currencyLocal, period, createdAt')
        .neq('status', 'REVERSED')
        .order('createdAt', { ascending: false })
        .limit(500)
        .then(({ data }) => data ?? []),

      // CHECK 4: FX operations last 90 days
      supabaseAdmin
        .from('fx_operations')
        .select('id, rate, performedAt')
        .gte('performedAt', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .then(({ data }) => data ?? []),

      // CHECK 5: Commissions without reference
      supabaseAdmin
        .from('commissions')
        .select('id, lawyerId, providerId, status')
        .eq('status', 'EARNED')
        .is('lawyerId', null)
        .is('providerId', null)
        .then(({ data }) => data ?? []),
    ]);

    // Process CHECK 1: low balance cash boxes
    if (cashResult.status === 'fulfilled') {
      for (const box of cashResult.value as Array<{ name: string; currency: string; balance: number; lowBalanceThreshold: number }>) {
        findings.push({
          severity: 'critical',
          module: 'caja_chica',
          description: `Caja "${box.name}" · saldo ${box.currency} ${Number(box.balance).toFixed(2)} por debajo del mínimo (${Number(box.lowBalanceThreshold).toFixed(2)})`,
          suggestion: 'Registrar un depósito para reponer el saldo mínimo requerido',
          status: 'pending',
          runId,
        });
      }
    }

    // Process CHECK 2: duplicate payments
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
              runId,
            });
          }
        } else {
          seen.set(key, p);
        }
      }
    }

    // Process CHECK 4: FX rates out of range
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
              runId,
            });
            break;
          }
        }
      }
    }

    // Process CHECK 5: commissions without reference
    if (commissionsResult.status === 'fulfilled') {
      const count = (commissionsResult.value as unknown[]).length;
      if (count > 0) {
        findings.push({
          severity: 'warning',
          module: 'comisiones',
          description: `${count} comisión(es) devengada(s) sin abogado ni proveedor asignado`,
          suggestion: 'Asignar el abogado o proveedor correspondiente a cada comisión sin referencia',
          status: 'pending',
          runId,
        });
      }
    }

    if (findings.length > 0) {
      await supabaseAdmin.from('audit_findings').insert(findings);
    }

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;
    const infoCount = findings.filter(f => f.severity === 'info').length;

    await supabaseAdmin
      .from('audit_runs')
      .update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        findingsCount: findings.length,
        criticalCount,
        warningCount,
        infoCount,
      })
      .eq('id', runId);

    if (criticalCount > 0) {
      const { data: settings } = await supabaseAdmin
        .from('agent_settings')
        .select('notifyEmail')
        .eq('agentName', 'audit_agent')
        .maybeSingle();
      if ((settings as { notifyEmail: boolean } | null)?.notifyEmail) {
        try {
          await sendAuditAlertEmail({
            to: 'erick@precisionmedicalcare.com',
            criticalCount,
            findings: findings.filter(f => f.severity === 'critical'),
          });
        } catch {
          // Non-fatal: scan succeeded even if email fails
        }
      }
    }

    return { runId, findingsCount: findings.length, criticalCount, warningCount, infoCount };
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
        .order('createdAt', { ascending: false })
        .limit(200);

      if (input?.severity) q = q.eq('severity', input.severity);
      if (input?.module && input.module !== 'all') q = q.eq('module', input.module);
      if (input?.status) q = q.eq('status', input.status);

      const { data } = await q;
      return (data ?? []) as Array<{
        id: string; createdAt: string; severity: string; module: string;
        description: string; suggestion: string | null; status: string;
        resolvedAt: string | null; resolvedBy: string | null; actionTaken: string | null; runId: string | null;
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
          resolvedAt: new Date().toISOString(),
          resolvedBy: ctx.user.id,
          actionTaken: input.actionTaken ?? null,
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
        .order('createdAt', { ascending: false })
        .limit(input?.limit ?? 10);
      return (data ?? []) as Array<{
        id: string; createdAt: string; triggeredBy: string;
        startedAt: string; completedAt: string | null; status: string;
        findingsCount: number; criticalCount: number; warningCount: number; infoCount: number;
      }>;
    }),

  getAgentCosts: protectedProcedure.query(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] as string;
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0] as string;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [costsRes, settingsRes, todayConvsRes, monthConvsRes, runsRes] = await Promise.allSettled([
      supabaseAdmin.from('agent_costs').select('*').gte('month', sixMonthsAgo).order('month', { ascending: false }),
      supabaseAdmin.from('agent_settings').select('monthlyBudget').eq('agentName', 'audit_agent').maybeSingle(),
      supabaseAdmin.from('agent_conversations').select('id', { count: 'exact', head: true }).gte('startedAt', todayStart),
      supabaseAdmin.from('agent_conversations').select('id', { count: 'exact', head: true }).gte('startedAt', monthStart),
      supabaseAdmin.from('audit_runs').select('id', { count: 'exact', head: true }).gte('createdAt', monthStart),
    ]);

    const costs = costsRes.status === 'fulfilled' ? (costsRes.value.data ?? []) : [];
    const settings = settingsRes.status === 'fulfilled' ? settingsRes.value.data as { monthlyBudget: number } | null : null;
    const cifoTodayCount = todayConvsRes.status === 'fulfilled' ? (todayConvsRes.value.count ?? 0) : 0;
    const cifoMonthCount = monthConvsRes.status === 'fulfilled' ? (monthConvsRes.value.count ?? 0) : 0;
    const monthScanCount = runsRes.status === 'fulfilled' ? (runsRes.value.count ?? 0) : 0;

    const cifoCosts = (costs as Array<{ agentName: string; totalCost: number; operationCount: number; month: string }>)
      .filter(c => c.agentName === 'cifo');
    const auditCosts = (costs as Array<{ agentName: string; totalCost: number; operationCount: number; month: string }>)
      .filter(c => c.agentName === 'audit_agent');

    const cifoMonthCost = cifoCosts.find(c => c.month >= monthStart)?.totalCost ?? 0;
    const auditMonthCost = auditCosts.find(c => c.month >= monthStart)?.totalCost ?? 0;
    const totalMonthCost = Number(cifoMonthCost) + Number(auditMonthCost);

    return {
      costs: costs as Array<{ agentName: string; month: string; totalCost: number; operationCount: number }>,
      budget: Number(settings?.monthlyBudget ?? 50),
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
      .order('completedAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    return run as {
      id: string; completedAt: string; findingsCount: number;
      criticalCount: number; warningCount: number; infoCount: number;
    } | null;
  }),
});
