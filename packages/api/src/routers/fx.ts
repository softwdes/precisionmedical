import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

export const fxRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
    }))
    .query(async ({ input }) => {
      const { page, pageSize } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabaseAdmin
        .from('fx_operations')
        .select(
          'id, amountFrom, amountTo, rate, fee, exchangeHouse, notes, receiptUrl, performedAt, reversedById, fromWalletId, toWalletId, fromWallet:wallets!fx_operations_fromWalletId_fkey(id,name,currency), toWallet:wallets!fx_operations_toWalletId_fkey(id,name,currency)',
          { count: 'exact' },
        )
        .range(from, to)
        .order('performedAt', { ascending: false });

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return {
        items: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  create: adminProcedure
    .input(z.object({
      fromWalletId: z.string(),
      toWalletId: z.string(),
      amountFrom: z.number().positive(),
      amountTo: z.number().positive(),
      rate: z.number().positive(),
      fee: z.number().min(0).default(0),
      exchangeHouse: z.string().optional(),
      receiptUrl: z.string().url().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('fx_operations')
        .insert({
          fromWalletId: input.fromWalletId,
          toWalletId: input.toWalletId,
          amountFrom: input.amountFrom,
          amountTo: input.amountTo,
          rate: input.rate,
          fee: input.fee,
          exchangeHouse: input.exchangeHouse,
          receiptUrl: input.receiptUrl,
          notes: input.notes,
          performedById: ctx.user.id,
          performedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  reverse: adminProcedure
    .input(z.object({
      id: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { data: original } = await supabaseAdmin
        .from('fx_operations')
        .select('*')
        .eq('id', input.id)
        .single();
      if (!original) throw new TRPCError({ code: 'NOT_FOUND' });

      const { data, error } = await supabaseAdmin
        .from('fx_operations')
        .insert({
          fromWalletId: original.toWalletId,
          toWalletId: original.fromWalletId,
          amountFrom: original.amountTo,
          amountTo: original.amountFrom,
          rate: Number(original.rate) !== 0 ? (1 / Number(original.rate)) : 1,
          fee: 0,
          notes: `REVERSAL: ${input.notes ?? original.notes ?? ''}`,
          performedById: ctx.user.id,
          performedAt: new Date().toISOString(),
          reversedById: input.id,
          createdAt: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin
        .from('fx_operations')
        .update({ reversedById: data.id })
        .eq('id', input.id);

      return data;
    }),
});
