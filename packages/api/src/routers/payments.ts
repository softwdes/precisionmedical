import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const createPaymentSchema = z.object({
  employeeId: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
  baseSalary: z.number().positive(),
  bonusAmount: z.number().positive().optional(),
  bonusReason: z.string().min(3).optional(),
  currencyLocal: z.enum(['USD', 'BOB', 'PEN']).default('USD'),
  scheduledDate: z.coerce.date(),
  notes: z.string().optional(),
  walletId: z.string().optional(),
});

export const paymentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
      employeeId: z.string().optional(),
      period: z.string().optional(),
      status: z.enum(['PENDING', 'SCHEDULED', 'PAID', 'PARTIAL', 'CANCELLED', 'REVERSED']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, employeeId, period, status } = input;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('payments')
        .select(
          'id, period, amountLocal, base_salary, bonus_amount, bonus_reason, currencyLocal, status, scheduledDate, paidDate, notes, employeeId, walletId, reversedById, employee:employees(id,firstName,lastName,employeeCode)',
          { count: 'exact' },
        )
        .range(from, to)
        .order('createdAt', { ascending: false });

      if (employeeId) query = query.eq('employeeId', employeeId);
      if (period) query = query.eq('period', period);
      if (status) query = query.eq('status', status);

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

  create: adminProcedure
    .input(createPaymentSchema)
    .mutation(async ({ input }) => {
      // Resolve wallet: use provided walletId or look up by currency
      let walletId = input.walletId;
      if (!walletId) {
        const { data: wallet } = await supabaseAdmin
          .from('wallets')
          .select('id')
          .eq('currency', input.currencyLocal)
          .single();
        if (!wallet) throw new TRPCError({ code: 'NOT_FOUND', message: `No wallet found for currency ${input.currencyLocal}` });
        walletId = wallet.id;
      }

      const amountLocal = input.baseSalary + (input.bonusAmount ?? 0);

      const { data, error } = await supabaseAdmin
        .from('payments')
        .insert({
          id: randomUUID(),
          employeeId: input.employeeId,
          walletId,
          period: input.period,
          amountLocal,
          base_salary: input.baseSalary,
          bonus_amount: input.bonusAmount ?? null,
          bonus_reason: input.bonusReason ?? null,
          currencyLocal: input.currencyLocal,
          amountUsdEquiv: amountLocal,
          rateApplied: 1,
          scheduledDate: input.scheduledDate.toISOString(),
          status: 'PENDING',
          notes: input.notes,
          updatedAt: new Date().toISOString(),
        } as never)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      baseSalary: z.number().positive(),
      bonusAmount: z.number().positive().optional(),
      bonusReason: z.string().min(3).optional(),
      scheduledDate: z.coerce.date(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data: existing } = await supabaseAdmin
        .from('payments')
        .select('id, status')
        .eq('id', input.id)
        .single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.status !== 'PENDING') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only PENDING payments can be edited' });

      const amountLocal = input.baseSalary + (input.bonusAmount ?? 0);

      const { data, error } = await supabaseAdmin
        .from('payments')
        .update({
          base_salary: input.baseSalary,
          bonus_amount: input.bonusAmount ?? null,
          bonus_reason: input.bonusReason ?? null,
          amountLocal,
          amountUsdEquiv: amountLocal,
          scheduledDate: input.scheduledDate.toISOString(),
          notes: input.notes ?? null,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data: existing } = await supabaseAdmin
        .from('payments')
        .select('id, status')
        .eq('id', input.id)
        .single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.status !== 'PENDING') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only PENDING payments can be cancelled' });

      const { data, error } = await supabaseAdmin
        .from('payments')
        .update({ status: 'CANCELLED', updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  deletePair: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { data: original } = await supabaseAdmin
        .from('payments')
        .select('id, status')
        .eq('id', input.id)
        .single();

      if (!original) throw new TRPCError({ code: 'NOT_FOUND' });
      if (original.status !== 'REVERSED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only REVERSED payments can be deleted' });

      // Find the reversal record that points to this payment
      const { data: reversal } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('reversedById', input.id)
        .single();

      // Delete reversal record first (it references the original)
      if (reversal) {
        await supabaseAdmin.from('payments').delete().eq('id', reversal.id);
      }

      const { error } = await supabaseAdmin
        .from('payments')
        .delete()
        .eq('id', input.id);

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { deleted: true };
    }),

  markAsPaid: adminProcedure
    .input(z.object({
      id: z.string(),
      paidDate: z.coerce.date().optional(),
      proofUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('payments')
        .update({
          status: 'PAID',
          paidDate: (input.paidDate ?? new Date()).toISOString(),
          proofUrl: input.proofUrl,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data;
    }),

  reverse: adminProcedure
    .input(z.object({ id: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { data: original } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('id', input.id)
        .single();

      if (!original) throw new TRPCError({ code: 'NOT_FOUND' });

      if (!original.walletId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Original payment has no wallet assigned' });

      const reversalData = {
        id: randomUUID(),
        employeeId: original.employeeId,
        walletId: original.walletId,
        period: original.period,
        amountLocal: -Math.abs(Number(original.amountLocal)),
        currencyLocal: original.currencyLocal,
        amountUsdEquiv: -Math.abs(Number(original.amountLocal)),
        rateApplied: 1,
        status: 'PAID',
        scheduledDate: new Date().toISOString(),
        paidDate: new Date().toISOString(),
        notes: `REVERSAL: ${input.reason}`,
        reversedById: input.id,
        updatedAt: new Date().toISOString(),
      };

      const { data: reversal, error } = await supabaseAdmin
        .from('payments')
        .insert(reversalData as never)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin
        .from('payments')
        .update({ status: 'REVERSED', updatedAt: new Date().toISOString() })
        .eq('id', input.id);

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'payment.reversed',
        entityType: 'Payment',
        entityId: input.id,
        after: { reversalId: reversal.id, reason: input.reason },
        createdAt: new Date().toISOString(),
      });

      return reversal;
    }),

  getSummary: protectedProcedure
    .input(z.object({ period: z.string().optional() }))
    .query(async ({ input }) => {
      const period = input.period ?? new Date().toISOString().slice(0, 7);

      const [paidResult, pendingResult, countResult] = await Promise.all([
        // Paid this month only (period-filtered, excludes reversals)
        supabaseAdmin
          .from('payments')
          .select('amountLocal')
          .eq('period', period)
          .eq('status', 'PAID')
          .gt('amountLocal', 0),
        // All pending payments across all periods
        supabaseAdmin
          .from('payments')
          .select('amountLocal')
          .eq('status', 'PENDING'),
        // Total count of all real payments (excludes reversal records)
        supabaseAdmin
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .gt('amountLocal', 0),
      ]);

      const totalPaid = (paidResult.data ?? []).reduce((s, p) => s + Number(p.amountLocal), 0);
      const totalPending = (pendingResult.data ?? []).reduce((s, p) => s + Number(p.amountLocal), 0);
      const count = countResult.count ?? 0;

      return { period, totalPaid, totalPending, count };
    }),
});
