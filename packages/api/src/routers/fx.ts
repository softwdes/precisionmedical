import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const FX_SELECT =
  'id, amountFrom, amountTo, rate, fee, exchangeHouse, notes, receiptUrl, performedAt, reversedById, fromWalletId, toWalletId, ' +
  'fromWallet:wallets!fx_operations_fromWalletId_fkey(id,name,currency), ' +
  'toWallet:wallets!fx_operations_toWalletId_fkey(id,name,currency)';

type WalletSnap = { id: string; name: string; currency: string } | null;
type OpRow = { id: string; rate: unknown; performedAt: string; fromWallet: WalletSnap; toWallet: WalletSnap };

function rows(data: unknown[]): OpRow[] { return data as OpRow[]; }

export const fxRouter = router({
  list: protectedProcedure
    .input(z.object({
      page:          z.number().int().positive().default(1),
      pageSize:      z.number().int().positive().max(100).default(25),
      period:        z.string().optional(),
      exchangeHouse: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, period, exchangeHouse } = input;
      const from = (page - 1) * pageSize;
      const to   = from + pageSize - 1;

      let query = supabaseAdmin
        .from('fx_operations')
        .select(FX_SELECT, { count: 'exact' })
        .range(from, to)
        .order('performedAt', { ascending: false });

      if (period) {
        const [y, m] = period.split('-').map(Number);
        query = query
          .gte('performedAt', new Date(y, m - 1, 1).toISOString())
          .lt('performedAt',  new Date(y, m,     1).toISOString());
      }
      if (exchangeHouse) query = query.eq('exchangeHouse', exchangeHouse);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      return {
        items:      data ?? [],
        total:      count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  getSummary: protectedProcedure
    .input(z.object({ period: z.string().optional() }))
    .query(async ({ input }) => {
      const now    = new Date();
      const period = input.period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [y, m] = period.split('-').map(Number);
      const start  = new Date(y, m - 1, 1).toISOString();
      const end    = new Date(y, m,     1).toISOString();

      const [monthRes, recentRes] = await Promise.all([
        supabaseAdmin
          .from('fx_operations')
          .select('amountFrom, fromWallet:wallets!fx_operations_fromWalletId_fkey(currency)')
          .gte('performedAt', start).lt('performedAt', end),
        supabaseAdmin
          .from('fx_operations')
          .select('rate, performedAt, fromWallet:wallets!fx_operations_fromWalletId_fkey(currency), toWallet:wallets!fx_operations_toWalletId_fkey(currency)')
          .order('performedAt', { ascending: false })
          .limit(200),
      ]);

      type MonthRow = { amountFrom: unknown; fromWallet: WalletSnap };
      const monthItems = (monthRes.data ?? []) as unknown as MonthRow[];
      const opCount        = monthItems.length;
      const totalConverted = monthItems.reduce((s, op) => s + Number(op.amountFrom), 0);

      const recent = rows(recentRes.data ?? []);
      const findLast = (fc: string, tc: string) =>
        recent.find(op => op.fromWallet?.currency === fc && op.toWallet?.currency === tc);

      const lastBob = findLast('USD', 'BOB');
      const lastPen = findLast('USD', 'PEN');

      return {
        period,
        opCount,
        totalConverted,
        lastRateUsdBob: lastBob ? Number(lastBob.rate) : null,
        lastRateUsdPen: lastPen ? Number(lastPen.rate) : null,
      };
    }),

  getLastRate: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input }) => {
      const ago30 = new Date();
      ago30.setDate(ago30.getDate() - 30);

      const { data } = await supabaseAdmin
        .from('fx_operations')
        .select('rate, performedAt, fromWallet:wallets!fx_operations_fromWalletId_fkey(currency), toWallet:wallets!fx_operations_toWalletId_fkey(currency)')
        .order('performedAt', { ascending: false })
        .limit(200);

      const matching = rows(data ?? []).filter(
        op => op.fromWallet?.currency === input.from && op.toWallet?.currency === input.to
      );
      if (matching.length === 0) return null;

      const last    = matching[0]!;
      const daysAgo = Math.floor((Date.now() - new Date(last.performedAt).getTime()) / 86_400_000);
      const r30     = matching.filter(op => new Date(op.performedAt) >= ago30);
      const avg30d  = r30.length > 0
        ? r30.reduce((s, op) => s + Number(op.rate), 0) / r30.length
        : Number(last.rate);

      return { rate: Number(last.rate), daysAgo, avg30d, sampleCount: r30.length };
    }),

  getExchangeHouses: protectedProcedure.query(async () => {
    const { data } = await supabaseAdmin
      .from('fx_operations')
      .select('exchangeHouse')
      .not('exchangeHouse', 'is', null);
    return [...new Set((data ?? []).map(d => d.exchangeHouse as string).filter(Boolean))];
  }),

  create: adminProcedure
    .input(z.object({
      fromWalletId:  z.string(),
      toWalletId:    z.string(),
      amountFrom:    z.number().positive(),
      amountTo:      z.number().positive(),
      rate:          z.number().positive(),
      fee:           z.number().min(0).default(0),
      exchangeHouse: z.string().optional(),
      receiptUrl:    z.string().url().optional(),
      notes:         z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('fx_operations')
        .insert({
          id:            crypto.randomUUID(),
          fromWalletId:  input.fromWalletId,
          toWalletId:    input.toWalletId,
          amountFrom:    input.amountFrom,
          amountTo:      input.amountTo,
          rate:          input.rate,
          fee:           input.fee,
          exchangeHouse: input.exchangeHouse ?? null,
          receiptUrl:    input.receiptUrl ?? null,
          notes:         input.notes ?? null,
          performedById: ctx.user.id,
          performedAt:   new Date().toISOString(),
          createdAt:     new Date().toISOString(),
        } as never)
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  reverse: adminProcedure
    .input(z.object({ id: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const { data: orig } = await supabaseAdmin
        .from('fx_operations')
        .select('*')
        .eq('id', input.id)
        .single();
      if (!orig) throw new TRPCError({ code: 'NOT_FOUND' });

      const { data, error } = await supabaseAdmin
        .from('fx_operations')
        .insert({
          id:            crypto.randomUUID(),
          fromWalletId:  orig.toWalletId,
          toWalletId:    orig.fromWalletId,
          amountFrom:    orig.amountTo,
          amountTo:      orig.amountFrom,
          rate:          Number(orig.rate) !== 0 ? 1 / Number(orig.rate) : 1,
          fee:           0,
          notes:         `REVERSAL: ${input.notes ?? orig.notes ?? ''}`,
          performedById: ctx.user.id,
          performedAt:   new Date().toISOString(),
          reversedById:  input.id,
          createdAt:     new Date().toISOString(),
        } as never)
        .select()
        .single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('fx_operations').update({ reversedById: data.id }).eq('id', input.id);
      return data;
    }),
});
