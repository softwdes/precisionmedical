import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';
import { sendLowBalanceEmail } from '../email';

const TRANSACTION_CATEGORIES = ['MEDICAL_SUPPLIES', 'TRANSPORT', 'FOOD', 'OFFICE', 'UTILITIES', 'MAINTENANCE', 'OTHER'] as const;

const EEUU_CLINIC_KEYWORDS = ['provo', 'pleasant grove', 'spanish fork', 'west valley', 'south murray'] as const;
function isEEUUName(name: string): boolean {
  const n = name.toLowerCase();
  return (EEUU_CLINIC_KEYWORDS as readonly string[]).some(k => n.includes(k));
}
function inferCountry(name: string): 'EEUU' | 'Bolivia' {
  return isEEUUName(name) ? 'EEUU' : 'Bolivia';
}

export const pettyCashRouter = router({
  listBoxes: protectedProcedure
    .input(
      z
        .object({
          includeInactive: z.boolean().optional().default(false),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      let query = supabaseAdmin
        .from('cash_boxes')
        .select('id, name, currency, balance, lowBalanceThreshold, is_active, clinicId, responsibleUserId, updatedAt')
        .order('name');

      // Default: only active. The management UI passes includeInactive
      // when the user wants to see archived boxes too.
      if (!input?.includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data ?? [];
    }),

  getBox: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('cash_boxes')
        .select('*')
        .eq('id', input.id)
        .single();

      if (error || !data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cash box not found' });
      return data;
    }),

  listTransactions: protectedProcedure
    .input(z.object({
      cashBoxId: z.string(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
      type: z.enum(['DEPOSIT', 'EXPENSE', 'ADJUSTMENT']).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { cashBoxId, page, pageSize, type, dateFrom, dateTo } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('cash_transactions')
        .select('*', { count: 'exact' })
        .eq('cashBoxId', cashBoxId)
        .range(from, to)
        .order('performedAt', { ascending: false });

      if (type) query = query.eq('type', type);
      if (dateFrom) query = query.gte('performedAt', dateFrom);
      if (dateTo) query = query.lte('performedAt', dateTo);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      return {
        items: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  deposit: adminProcedure
    .input(z.object({
      cashBoxId: z.string(),
      amount: z.number().positive(),
      description: z.string().min(1),
      receiptUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { data: box } = await supabaseAdmin.from('cash_boxes').select('balance').eq('id', input.cashBoxId).single();
      if (!box) throw new TRPCError({ code: 'NOT_FOUND' });

      const newBalance = Number(box.balance) + input.amount;

      const { data: tx, error } = await supabaseAdmin
        .from('cash_transactions')
        .insert({
          id: crypto.randomUUID(),
          cashBoxId: input.cashBoxId,
          type: 'DEPOSIT',
          amount: input.amount,
          category: 'OTHER',
          description: input.description,
          receiptUrl: input.receiptUrl,
          performedById: ctx.user.id,
          performedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('cash_boxes').update({ balance: newBalance, updatedAt: new Date().toISOString() }).eq('id', input.cashBoxId);

      return tx;
    }),

  expense: adminProcedure
    .input(z.object({
      cashBoxId: z.string(),
      amount: z.number().positive(),
      category: z.enum(TRANSACTION_CATEGORIES),
      description: z.string().min(1),
      receiptUrl: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { data: box } = await supabaseAdmin.from('cash_boxes').select('balance, lowBalanceThreshold').eq('id', input.cashBoxId).single();
      if (!box) throw new TRPCError({ code: 'NOT_FOUND' });
      if (Number(box.balance) < input.amount) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient balance' });

      const newBalance = Number(box.balance) - input.amount;

      const { data: tx, error } = await supabaseAdmin
        .from('cash_transactions')
        .insert({
          id: crypto.randomUUID(),
          cashBoxId: input.cashBoxId,
          type: 'EXPENSE',
          amount: -input.amount,
          category: input.category,
          description: input.description,
          receiptUrl: input.receiptUrl,
          performedById: ctx.user.id,
          performedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('cash_boxes').update({ balance: newBalance, updatedAt: new Date().toISOString() }).eq('id', input.cashBoxId);

      if (newBalance <= Number(box.lowBalanceThreshold)) {
        const { data: boxFull } = await supabaseAdmin
          .from('cash_boxes')
          .select('name, currency')
          .eq('id', input.cashBoxId)
          .single();

        await supabaseAdmin.from('notifications').insert({
          id: crypto.randomUUID(),
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Saldo bajo en caja chica',
          body: `La caja "${boxFull?.name ?? ''}" tiene un saldo de $${newBalance.toFixed(2)} — por debajo del umbral mínimo`,
          createdAt: new Date().toISOString(),
        });

        const { data: actorUser } = await supabaseAdmin
          .from('users')
          .select('email')
          .eq('id', ctx.user.id)
          .single();

        if (actorUser?.email) {
          void sendLowBalanceEmail({
            to: actorUser.email,
            boxName: boxFull?.name ?? input.cashBoxId,
            balance: newBalance,
            threshold: Number(box.lowBalanceThreshold),
            currency: boxFull?.currency ?? 'USD',
          }).catch(() => null);
        }
      }

      return tx;
    }),

  kpis: protectedProcedure.query(async () => {
    const { data: boxes } = await supabaseAdmin
      .from('cash_boxes')
      .select('id, name, balance, lowBalanceThreshold, currency');
    const safeBoxes = boxes ?? [];
    const eeuuBoxes = safeBoxes.filter(b => isEEUUName(b.name));
    const boliviaBoxes = safeBoxes.filter(b => !isEEUUName(b.name));
    const total = safeBoxes.reduce((s, b) => s + Number(b.balance), 0);
    const eeuu = eeuuBoxes.reduce((s, b) => s + Number(b.balance), 0);
    const bolivia = boliviaBoxes.reduce((s, b) => s + Number(b.balance), 0);

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: expenses } = await supabaseAdmin
      .from('cash_transactions').select('amount, category').eq('type', 'EXPENSE').gte('performedAt', monthStart);
    const monthlyExpenses = (expenses ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const monthlyCount = expenses?.length ?? 0;
    const lowBoxes = safeBoxes
      .filter(b => Number(b.balance) < Number(b.lowBalanceThreshold))
      .map(b => ({ name: b.name, balance: Number(b.balance), threshold: Number(b.lowBalanceThreshold), country: inferCountry(b.name) }));

    return { total, eeuu, bolivia, monthlyExpenses, monthlyCount, lowBoxes, eeuuBoxCount: eeuuBoxes.length, boliviaBoxCount: boliviaBoxes.length };
  }),

  listMovements: protectedProcedure
    .input(z.object({
      country: z.enum(['all', 'EEUU', 'Bolivia']).default('all'),
      clinicName: z.string().optional(),
      type: z.enum(['all', 'DEPOSIT', 'EXPENSE']).default('all'),
      month: z.string().optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
    }))
    .query(async ({ input }) => {
      const { country, clinicName, type, month, page, pageSize } = input;
      const { data: allBoxes } = await supabaseAdmin.from('cash_boxes').select('id, name');
      if (!allBoxes) return { items: [], total: 0, page, pageSize, totalPages: 0 };

      let relevantBoxes = allBoxes;
      if (country === 'EEUU') relevantBoxes = allBoxes.filter(b => isEEUUName(b.name));
      else if (country === 'Bolivia') relevantBoxes = allBoxes.filter(b => !isEEUUName(b.name));
      if (clinicName) relevantBoxes = relevantBoxes.filter(b => b.name === clinicName);

      const boxIds = relevantBoxes.map(b => b.id);
      if (boxIds.length === 0) return { items: [], total: 0, page, pageSize, totalPages: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabaseAdmin.from('cash_transactions').select('*', { count: 'exact' })
        .in('cashBoxId', boxIds).order('performedAt', { ascending: false }).range(from, to);

      if (type !== 'all') q = q.eq('type', type);
      if (month) {
        const [y, m] = month.split('-').map(Number);
        q = q.gte('performedAt', new Date(y, m - 1, 1).toISOString())
             .lte('performedAt', new Date(y, m, 0, 23, 59, 59).toISOString());
      }
      const { data, error, count } = await q;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      const boxMap = Object.fromEntries(allBoxes.map(b => [b.id, b.name]));
      const items = (data ?? []).map(tx => ({
        ...tx,
        clinicName: boxMap[tx.cashBoxId] ?? tx.cashBoxId,
        country: inferCountry(boxMap[tx.cashBoxId] ?? ''),
      }));
      return { items, total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) };
    }),

  createMovement: adminProcedure
    .input(z.object({
      type: z.enum(['DEPOSIT', 'EXPENSE']),
      clinicName: z.string().min(1),
      amount: z.number().positive(),
      currency: z.enum(['USD', 'BOB']),
      category: z.string().min(1),
      description: z.string().min(1),
      date: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      let { data: box } = await supabaseAdmin.from('cash_boxes').select('id, balance, lowBalanceThreshold').eq('name', input.clinicName).single();
      if (!box) {
        const { data: nb, error: ce } = await supabaseAdmin.from('cash_boxes')
          .insert({ id: crypto.randomUUID(), name: input.clinicName, currency: input.currency, balance: 0, lowBalanceThreshold: 100, updatedAt: new Date().toISOString() })
          .select('id, balance, lowBalanceThreshold').single();
        if (ce || !nb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create cash box' });
        box = nb;
      }
      const txAmount = input.type === 'DEPOSIT' ? input.amount : -input.amount;
      const newBalance = Number(box.balance) + txAmount;
      if (input.type === 'EXPENSE' && newBalance < 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Saldo insuficiente' });

      const { data: tx, error } = await supabaseAdmin.from('cash_transactions')
        .insert({ id: crypto.randomUUID(), cashBoxId: box.id, type: input.type, amount: txAmount, category: input.category, description: input.description,
          performedById: ctx.user.id, performedAt: new Date(input.date).toISOString(), createdAt: new Date().toISOString() })
        .select().single();
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('cash_boxes').update({ balance: newBalance, updatedAt: new Date().toISOString() }).eq('id', box.id);

      if (input.type === 'EXPENSE' && newBalance <= Number(box.lowBalanceThreshold)) {
        await supabaseAdmin.from('notifications').insert({
          id: crypto.randomUUID(), userId: ctx.user.id, type: 'SYSTEM', title: 'Saldo bajo en caja chica',
          body: `La caja "${input.clinicName}" tiene un saldo de $${newBalance.toFixed(2)} — por debajo del umbral mínimo`,
          createdAt: new Date().toISOString(),
        });
      }
      return tx;
    }),

  reverse: adminProcedure
    .input(z.object({ transactionId: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { data: original } = await supabaseAdmin.from('cash_transactions').select('*').eq('id', input.transactionId).single();
      if (!original) throw new TRPCError({ code: 'NOT_FOUND' });

      const { data: box } = await supabaseAdmin.from('cash_boxes').select('balance').eq('id', original.cashBoxId).single();
      if (!box) throw new TRPCError({ code: 'NOT_FOUND' });

      const reverseAmount = -Number(original.amount);
      const newBalance = Number(box.balance) + reverseAmount;

      const { data: tx, error } = await supabaseAdmin
        .from('cash_transactions')
        .insert({
          id: crypto.randomUUID(),
          cashBoxId: original.cashBoxId,
          type: original.type,
          amount: reverseAmount,
          category: original.category,
          description: `REVERSAL: ${input.reason}`,
          reversedById: input.transactionId,
          performedById: ctx.user.id,
          performedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('cash_boxes').update({ balance: newBalance, updatedAt: new Date().toISOString() }).eq('id', original.cashBoxId);
      return tx;
    }),

  // ─── CRUD de cash boxes ────────────────────────────────────────────
  // Super Admin only — affects real money flow and accounting.

  createBox: adminProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        clinicId: z.string().optional(),
        currency: z.enum(['USD', 'BOB', 'PEN']),
        // Opening balance: optional, defaults to 0. If > 0, we
        // immediately record an "Apertura" DEPOSIT so the box gets
        // its first transaction (which our alert logic uses to
        // distinguish "never opened" from "fully spent").
        openingBalance: z.number().min(0).default(0),
        lowBalanceThreshold: z.number().positive().default(100),
        responsibleUserId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Name must be unique (enforced by DB but check upfront for
      // better error message).
      const { data: existing } = await supabaseAdmin
        .from('cash_boxes')
        .select('id')
        .eq('name', input.name)
        .maybeSingle();
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ya existe una caja con ese nombre' });
      }

      const newBoxId = crypto.randomUUID();
      const { data: box, error } = await supabaseAdmin
        .from('cash_boxes')
        .insert({
          id: newBoxId,
          name: input.name,
          clinicId: input.clinicId ?? null,
          currency: input.currency,
          balance: input.openingBalance,
          lowBalanceThreshold: input.lowBalanceThreshold,
          responsibleUserId: input.responsibleUserId ?? null,
          is_active: true,
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      // If opening balance > 0, record the apertura transaction so
      // the box is considered "opened" by the alert logic.
      if (input.openingBalance > 0) {
        await supabaseAdmin.from('cash_transactions').insert({
          id: crypto.randomUUID(),
          cashBoxId: newBoxId,
          type: 'DEPOSIT',
          amount: input.openingBalance,
          category: 'OTHER',
          description: 'Apertura de caja',
          performedById: ctx.user.id,
          performedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      }

      return box;
    }),

  updateBox: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).max(80).optional(),
        clinicId: z.string().nullable().optional(),
        lowBalanceThreshold: z.number().positive().optional(),
        responsibleUserId: z.string().nullable().optional(),
        // Intentionally NO `currency` here: changing currency on a
        // box with balance would silently corrupt accounting. NO
        // direct `balance` edit either — that's reserved for
        // DEPOSIT/EXPENSE transactions to preserve audit trail.
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;

      // If renaming, ensure uniqueness.
      if (patch.name) {
        const { data: clash } = await supabaseAdmin
          .from('cash_boxes')
          .select('id')
          .eq('name', patch.name)
          .neq('id', id)
          .maybeSingle();
        if (clash) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Ya existe otra caja con ese nombre' });
        }
      }

      const { data, error } = await supabaseAdmin
        .from('cash_boxes')
        .update({ ...patch, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  toggleBoxActive: adminProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('cash_boxes')
        .update({ is_active: input.isActive, updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  deleteBox: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      // Hard delete allowed ONLY if there are zero transactions.
      // Otherwise the user must deactivate instead — preserves audit.
      const { count } = await supabaseAdmin
        .from('cash_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('cashBoxId', input.id);

      if ((count ?? 0) > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Esta caja tiene transacciones. Usa "Desactivar" en vez de eliminar.',
        });
      }

      const { error } = await supabaseAdmin
        .from('cash_boxes')
        .delete()
        .eq('id', input.id);

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { success: true };
    }),
});
