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

  /**
   * Desglose de saldo por wallet (modelo "Opción A": saldo derivado de eventos).
   *
   * El saldo real de una wallet se calcula como:
   *   base (último valor reconciliado, o saldo inicial)
   *   + entradas FX        (operaciones de cambio donde es destino)
   *   − salidas FX         (operaciones de cambio donde es origen)
   *   − salarios pagados   (payments PAID que salieron de esta wallet)
   *   − financiamiento a caja chica (depósitos financiados desde esta wallet)
   *
   * Todos los eventos se cuentan SOLO si son posteriores a `lastReconciledAt`
   * (la base reconciliada ya incluye lo anterior → evita doble conteo).
   * Las marcas de tiempo son ISO-UTC, comparables como string.
   *
   * `salariesPending` es informativo (comprometido): pagos PENDING/SCHEDULED de
   * esta wallet, de cualquier período. NO afecta el saldo.
   */
  getBreakdown: protectedProcedure.query(async () => {
    const [walletsRes, fxRes, payRes, cashRes] = await Promise.all([
      supabaseAdmin.from('wallets').select('id, currency, balance, lastReconciledAt'),
      supabaseAdmin.from('fx_operations').select('fromWalletId, toWalletId, amountFrom, amountTo, performedAt'),
      supabaseAdmin.from('payments').select('walletId, amountLocal, status, paidDate'),
      // Resiliente: si la columna sourceWalletId aún no existe (migración no
      // aplicada), Supabase devuelve error y tratamos el financiamiento como 0.
      supabaseAdmin.from('cash_transactions').select('sourceWalletId, amount, performedAt').not('sourceWalletId', 'is', null),
    ]);
    if (walletsRes.error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: walletsRes.error.message });
    if (fxRes.error)      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fxRes.error.message });
    if (payRes.error)     throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: payRes.error.message });

    type WalletRow = { id: string; currency: string; balance: unknown; lastReconciledAt: string | null };
    const walletRows = (walletsRes.data ?? []) as WalletRow[];

    const reconciledAt: Record<string, string | null> = {};
    type Acc = {
      base: number; fxIn: number; fxOut: number; salariesPaid: number;
      pettyCashOut: number; salariesPending: number; lastAt: string | null;
      reconciledAt: string | null;
    };
    const out: Record<string, Acc> = {};
    for (const w of walletRows) {
      reconciledAt[w.id] = w.lastReconciledAt;
      out[w.id] = {
        base: Number(w.balance), fxIn: 0, fxOut: 0, salariesPaid: 0,
        pettyCashOut: 0, salariesPending: 0, lastAt: null,
        reconciledAt: w.lastReconciledAt,
      };
    }

    const afterCutoff = (walletId: string, at: string): boolean => {
      const cutoff = reconciledAt[walletId];
      return !cutoff || at > cutoff;
    };
    const touch = (id: string, at: string): void => {
      const a = out[id];
      if (a && (!a.lastAt || at > a.lastAt)) a.lastAt = at;
    };

    // ── FX
    type FxRow = { fromWalletId: string; toWalletId: string; amountFrom: unknown; amountTo: unknown; performedAt: string };
    for (const op of (fxRes.data ?? []) as FxRow[]) {
      if (out[op.fromWalletId] && afterCutoff(op.fromWalletId, op.performedAt)) {
        out[op.fromWalletId]!.fxOut += Number(op.amountFrom);
        touch(op.fromWalletId, op.performedAt);
      }
      if (out[op.toWalletId] && afterCutoff(op.toWalletId, op.performedAt)) {
        out[op.toWalletId]!.fxIn += Number(op.amountTo);
        touch(op.toWalletId, op.performedAt);
      }
    }

    // ── Salarios. PAID (paidDate > corte) descuentan el saldo; los reversals
    // vienen con amountLocal negativo y netean. PENDING/SCHEDULED solo informan.
    type PayRow = { walletId: string | null; amountLocal: unknown; status: string; paidDate: string | null };
    for (const p of (payRes.data ?? []) as PayRow[]) {
      if (!p.walletId || !out[p.walletId]) continue;
      if (p.status === 'PAID') {
        const at = p.paidDate ?? '';
        if (afterCutoff(p.walletId, at)) {
          out[p.walletId]!.salariesPaid += Number(p.amountLocal);
          if (at) touch(p.walletId, at);
        }
      } else if (p.status === 'PENDING' || p.status === 'SCHEDULED') {
        out[p.walletId]!.salariesPending += Number(p.amountLocal);
      }
    }

    // ── Financiamiento a caja chica (Fase 4). Depósitos con sourceWalletId:
    // amount positivo = salida de la wallet; los reversals heredan el mismo
    // sourceWalletId con amount negativo y netean. Resiliente si no hay columna.
    if (!cashRes.error) {
      type CashRow = { sourceWalletId: string | null; amount: unknown; performedAt: string };
      for (const c of (cashRes.data ?? []) as CashRow[]) {
        if (!c.sourceWalletId || !out[c.sourceWalletId]) continue;
        if (afterCutoff(c.sourceWalletId, c.performedAt)) {
          out[c.sourceWalletId]!.pettyCashOut += Number(c.amount);
          touch(c.sourceWalletId, c.performedAt);
        }
      }
    }

    // ── Saldo derivado
    return Object.fromEntries(
      Object.entries(out).map(([id, a]) => [id, {
        ...a,
        balance: a.base + a.fxIn - a.fxOut - a.salariesPaid - a.pettyCashOut,
      }]),
    );
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
