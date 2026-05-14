import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const AGENT_SELECT = 'id, name, type, description, status, mode, schedule, permissions, budgetMonthlyUsd, llmProvider, llmModel, voiceEnabled, totalActions, totalTokensUsed, totalCostUsd, lastRunAt, nextRunAt, createdAt, updatedAt';

const ACTION_SELECT = 'id, agentId, type, severity, status, payload, summary, appliedAt, appliedResult, reviewedById, reviewedAt, reviewNotes, tokensUsed, costUsd, createdAt';

export const aiAgentsRouter = router({
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
});
