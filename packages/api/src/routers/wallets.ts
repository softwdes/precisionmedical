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

  getFxStats: protectedProcedure.query(async () => {
    const [opsRes, walletsRes] = await Promise.all([
      supabaseAdmin
        .from('fx_operations')
        .select('fromWalletId, toWalletId, amountFrom, amountTo, performedAt'),
      supabaseAdmin
        .from('wallets')
        .select('id, lastReconciledAt'),
    ]);
    if (opsRes.error)     throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: opsRes.error.message });
    if (walletsRes.error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: walletsRes.error.message });

    // Punto de corte por wallet: el saldo reconciliado ya incluye el efecto de
    // las operaciones FX anteriores, así que solo contamos las posteriores a
    // `lastReconciledAt`. Evita el doble conteo (restar/sumar dos veces lo
    // mismo) al reconciliar. Si nunca se reconcilió, se cuentan todas.
    // Las marcas de tiempo son ISO-UTC, comparables como string.
    const reconciledAt: Record<string, string | null> = {};
    for (const w of (walletsRes.data ?? []) as { id: string; lastReconciledAt: string | null }[]) {
      reconciledAt[w.id] = w.lastReconciledAt;
    }
    const countsFor = (walletId: string, at: string): boolean => {
      const cutoff = reconciledAt[walletId];
      return !cutoff || at > cutoff;
    };

    type Row = { fromWalletId: string; toWalletId: string; amountFrom: unknown; amountTo: unknown; performedAt: string };
    const ops = (opsRes.data ?? []) as Row[];
    const stats: Record<string, { entradas: number; salidas: number; lastAt: string | null }> = {};

    const touch = (id: string, at: string): void => {
      stats[id] ??= { entradas: 0, salidas: 0, lastAt: null };
      if (!stats[id]!.lastAt || at > stats[id]!.lastAt!) stats[id]!.lastAt = at;
    };

    for (const op of ops) {
      if (countsFor(op.fromWalletId, op.performedAt)) {
        touch(op.fromWalletId, op.performedAt);
        stats[op.fromWalletId]!.salidas += Number(op.amountFrom);
      }
      if (countsFor(op.toWalletId, op.performedAt)) {
        touch(op.toWalletId, op.performedAt);
        stats[op.toWalletId]!.entradas += Number(op.amountTo);
      }
    }

    return stats;
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
