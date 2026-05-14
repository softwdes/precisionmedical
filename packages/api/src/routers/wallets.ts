import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const walletsRouter = router({
  list: protectedProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('id, name, currency, balance, lastReconciledAt, countryId, country:countries(code, name)')
      .order('currency', { ascending: true });
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
    return data ?? [];
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('wallets')
        .select('id, name, currency, balance, lastReconciledAt, countryId, country:countries(code, name)')
        .eq('id', input.id)
        .single();
      if (error) throw new TRPCError({ code: 'NOT_FOUND', message: 'Wallet not found' });
      return data;
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      currency: z.enum(['USD', 'BOB', 'PEN']),
      countryId: z.string(),
      initialBalance: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('wallets')
        .insert({
          name: input.name,
          currency: input.currency,
          countryId: input.countryId,
          balance: input.initialBalance,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  reconcile: adminProcedure
    .input(z.object({
      id: z.string(),
      balance: z.number().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('wallets')
        .update({
          balance: input.balance,
          lastReconciledAt: new Date().toISOString(),
          lastReconciledBy: ctx.user.id,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),
});
