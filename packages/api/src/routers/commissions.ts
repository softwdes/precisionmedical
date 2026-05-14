import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const COMMISSION_SELECT = 'id, lawyerId, providerId, patientId, amount, currency, status, earnedAt, paidAt, paidProofUrl, reversedById, notes, createdAt, lawyer:lawyers!commissions_lawyerId_fkey(id, firstName, lastName, firmName), provider:providers!commissions_providerId_fkey(id, firstName, lastName), patient:patients(id, patientCode, firstName, lastName)';

export const commissionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
      lawyerId: z.string().optional(),
      providerId: z.string().optional(),
      patientId: z.string().optional(),
      status: z.enum(['EARNED', 'APPROVED', 'PAID', 'CANCELLED', 'REVERSED']).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { page = 1, pageSize = 25, lawyerId, providerId, patientId, status } = input ?? {};
      const from = (page - 1) * pageSize;

      let q = supabaseAdmin.from('commissions').select(COMMISSION_SELECT, { count: 'exact' });
      if (lawyerId) q = q.eq('lawyerId', lawyerId);
      if (providerId) q = q.eq('providerId', providerId);
      if (patientId) q = q.eq('patientId', patientId);
      if (status) q = q.eq('status', status);

      const { data, error, count } = await q.order('earnedAt', { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { items: data ?? [], total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  create: adminProcedure
    .input(z.object({
      lawyerId: z.string().optional(),
      providerId: z.string().optional(),
      patientId: z.string(),
      amount: z.number().positive(),
      currency: z.enum(['USD', 'BOB', 'PEN']).default('USD'),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.lawyerId && !input.providerId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Either lawyerId or providerId is required' });
      }
      const { data, error } = await supabaseAdmin
        .from('commissions')
        .insert({
          ...input,
          status: 'EARNED',
          earnedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select(COMMISSION_SELECT)
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  approve: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('commissions')
        .update({ status: 'APPROVED', updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .eq('status', 'EARNED')
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  markPaid: adminProcedure
    .input(z.object({
      id: z.string(),
      paidProofUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('commissions')
        .update({
          status: 'PAID',
          paidAt: new Date().toISOString(),
          paidProofUrl: input.paidProofUrl,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  reverse: adminProcedure
    .input(z.object({
      id: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: original, error: fetchErr } = await supabaseAdmin
        .from('commissions')
        .select(COMMISSION_SELECT)
        .eq('id', input.id)
        .single();
      if (fetchErr || !original) throw new TRPCError({ code: 'NOT_FOUND', message: 'Commission not found' });

      const { data: reversal, error } = await supabaseAdmin
        .from('commissions')
        .insert({
          lawyerId: original.lawyerId,
          providerId: original.providerId,
          patientId: original.patientId,
          amount: -Math.abs(Number(original.amount)),
          currency: original.currency,
          status: 'REVERSED',
          reversedById: ctx.user.id,
          notes: input.notes ?? `Reversal of ${original.id}`,
          earnedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select('id, status')
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin
        .from('commissions')
        .update({ status: 'REVERSED', updatedAt: new Date().toISOString() })
        .eq('id', input.id);

      return reversal;
    }),
});
